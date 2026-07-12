import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../lib/json-store"
import { FERREMEX_CAMBIOS } from "../../../../modules/ferremex-cambios"
import type FerremexCambiosService from "../../../../modules/ferremex-cambios/service"
import { FERREMEX_SALDO_CAMBIO } from "../../../../modules/ferremex-saldo-cambio"
import type FerremexSaldoCambioService from "../../../../modules/ferremex-saldo-cambio/service"

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")

interface VentaRegistro {
  folio: string
  estado?: string
  cambios?: string[]
  cambio_origen_folio?: string
  [k: string]: unknown
}

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

/** GET /caja/cambios/:id — detalle completo (líneas incluidas). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const cambiosService: FerremexCambiosService = req.scope.resolve(FERREMEX_CAMBIOS)
  const cambio = await cambiosService.getCambioCompleto(id)
  if (!cambio) {
    res.status(404).json({ error: "Cambio no encontrado" })
    return
  }
  res.json(cambio)
}

/**
 * PATCH /caja/cambios/:id — cancela un cambio (soft-cancel, auditable).
 *
 * Revierte AMBOS lados del inventario (descuenta lo que se había reintegrado
 * como devuelto, reintegra lo que se había descontado como nuevo), anula el
 * saldo a favor generado (rechaza si ya se consumió) y cancela la venta de
 * diferencia asociada si existe. Body: { motivo: string }.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const { motivo } = (req.body ?? {}) as { motivo?: string }
  if (!motivo?.trim()) {
    res.status(400).json({ error: "Se requiere un motivo de cancelación" })
    return
  }

  const cambiosService: FerremexCambiosService = req.scope.resolve(FERREMEX_CAMBIOS)
  const saldoCambioService: FerremexSaldoCambioService = req.scope.resolve(FERREMEX_SALDO_CAMBIO)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)

  const cambio = await cambiosService.getCambioCompleto(id)
  if (!cambio) {
    res.status(404).json({ error: "Cambio no encontrado" })
    return
  }
  if (cambio.estado === "cancelado") {
    res.status(400).json({ error: "El cambio ya está cancelado" })
    return
  }

  // Si generó saldo a favor, validar que aún alcance para revertirlo ANTES de
  // tocar inventario (falla barato, sin efectos colaterales).
  if (cambio.saldo_generado > 0 && cambio.customer_id) {
    try {
      const saldoActual = await saldoCambioService.saldoCliente(cambio.customer_id)
      if (saldoActual < Number(cambio.saldo_generado)) {
        res.status(400).json({
          error: "No se puede cancelar: el saldo a favor generado por este cambio ya fue consumido parcial o totalmente.",
        })
        return
      }
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo validar el saldo a favor" })
      return
    }
  }

  try {
    const fecha_cancelacion = new Date().toISOString()

    await withFileLock(VENTAS_FILE, async () => {
      const todosSkus = Array.from(new Set([
        ...cambio.lineasDevueltas.map((l: any) => l.sku),
        ...cambio.lineasNuevas.map((l: any) => l.sku),
      ]))
      const inventoryItems = await inventoryModule.listInventoryItems(
        { sku: todosSkus },
        { select: ["id", "sku"], take: todosSkus.length + 10 }
      )
      const itemPorSku = new Map(inventoryItems.map((i) => [i.sku, i.id]))
      const niveles = await inventoryModule.listInventoryLevels(
        { inventory_item_id: inventoryItems.map((i) => i.id) },
        { select: ["inventory_item_id", "location_id"], take: inventoryItems.length + 10 }
      )
      const locPorItemId = new Map(niveles.map((n) => [n.inventory_item_id, n.location_id]))

      // Reversa exacta: lo devuelto (que se había REINTEGRADO) se vuelve a
      // descontar; lo nuevo (que se había DESCONTADO) se vuelve a reintegrar.
      for (const l of cambio.lineasDevueltas as any[]) {
        const invId = itemPorSku.get(l.sku)
        const locId = invId ? locPorItemId.get(invId) : undefined
        if (invId && locId) await inventoryModule.adjustInventory(invId, locId, -l.cantidad)
      }
      for (const l of cambio.lineasNuevas as any[]) {
        const invId = itemPorSku.get(l.sku)
        const locId = invId ? locPorItemId.get(invId) : undefined
        if (invId && locId) await inventoryModule.adjustInventory(invId, locId, +l.cantidad)
      }

      // Cancelar la venta de diferencia asociada (si existe), reintegrando su
      // propio "inventario" no aplica (esa venta no descontó nada — sus líneas
      // son solo el registro de cobro), pero sí se marca cancelada.
      if (cambio.venta_diferencia_folio) {
        const ventas = cargarVentas()
        const idx = ventas.findIndex((v) => v.folio === cambio.venta_diferencia_folio)
        if (idx !== -1 && ventas[idx].estado !== "cancelada") {
          ventas[idx] = {
            ...ventas[idx],
            estado: "cancelada",
            motivo_cancelacion: `Cancelación del cambio ${cambio.folio_cambio}`,
            fecha_cancelacion,
          }
          writeJsonAtomic(VENTAS_FILE, ventas)
        }
      }

      // Quitar la traza del cambio de la venta original (ya no aplica).
      const ventas = cargarVentas()
      const idxOrigen = ventas.findIndex((v) => v.folio === cambio.venta_origen_folio)
      if (idxOrigen !== -1 && Array.isArray(ventas[idxOrigen].cambios)) {
        ventas[idxOrigen] = {
          ...ventas[idxOrigen],
          cambios: (ventas[idxOrigen].cambios as string[]).filter((f) => f !== cambio.folio_cambio),
        }
        writeJsonAtomic(VENTAS_FILE, ventas)
      }
    })

    // Anular el saldo a favor generado (si aplica) — fuera del lock de ventas
    // (toca otro módulo), best-effort tras la reversión de inventario.
    if (cambio.saldo_generado > 0) {
      try {
        await saldoCambioService.anularMovimientosDeCambio(cambio.folio_cambio, motivo.trim(), fecha_cancelacion)
      } catch (e: any) {
        console.error(`[caja/cambios PATCH] No se pudo anular el saldo a favor de ${cambio.folio_cambio}:`, e?.message ?? e)
      }
    }

    const actualizado = await cambiosService.anularCambio(id, motivo.trim(), fecha_cancelacion)
    res.json(actualizado)
  } catch (err) {
    console.error("[caja/cambios PATCH] Error cancelando cambio:", err)
    res.status(500).json({ error: "No se pudo cancelar el cambio" })
  }
}
