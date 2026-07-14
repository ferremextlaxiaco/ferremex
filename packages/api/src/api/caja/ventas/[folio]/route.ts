import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../lib/json-store"
import { FERREMEX_CARTERA } from "../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../modules/ferremex-cartera/service"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"
import { FERREMEX_SALDO_CAMBIO } from "../../../../modules/ferremex-saldo-cambio"
import type FerremexSaldoCambioService from "../../../../modules/ferremex-saldo-cambio/service"

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")

interface VentaRegistro {
  folio: string
  estado?: string
  motivo_cancelacion?: string
  fecha_cancelacion?: string
  items?: { sku?: string; cantidad: number; descripcion?: string }[]
  pago_credito?: number
  puntos_ganados?: number
  puntos_canjeados?: number
  pago_saldo_cambio?: number
  cliente_id?: string | null
  [k: string]: unknown
}

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

/** GET /caja/ventas/:folio */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const folio = (req.params as Record<string, string>).folio
  if (!folio) {
    res.status(400).json({ error: "Folio requerido" })
    return
  }
  const venta = cargarVentas().find((v) => v.folio === folio)
  if (!venta) {
    res.status(404).json({ error: "Venta no encontrada" })
    return
  }
  res.json(venta)
}

/**
 * PATCH /caja/ventas/:folio — cancela una venta.
 *
 * Marca la venta como cancelada (con motivo y fecha) y reintegra el inventario
 * de sus items. Todo bajo el lock de ventas para que el reintegro y la escritura
 * sean atómicos respecto a otras ventas. Idempotente: cancelar dos veces no
 * reintegra dos veces.
 *
 * Body: { estado: "cancelada", motivo: string }
 * Nota: el reintegro requiere que los items de la venta tengan `sku` guardado.
 * Las ventas registradas antes de este cambio no lo guardan; en ese caso se
 * cancela igual pero sin reintegrar (se advierte en log).
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const folio = (req.params as Record<string, string>).folio
  const { estado, motivo } = (req.body ?? {}) as { estado?: string; motivo?: string }
  if (!folio) {
    res.status(400).json({ error: "Folio requerido" })
    return
  }
  // Este endpoint solo implementa la cancelación. Rechazar otros estados de forma
  // explícita evita cancelar por accidente ante un PATCH con otra intención.
  if (estado !== "cancelada") {
    res.status(400).json({ error: 'Solo se admite estado: "cancelada"' })
    return
  }
  if (!motivo?.trim()) {
    res.status(400).json({ error: "Se requiere un motivo de cancelación" })
    return
  }

  const inventoryModule = req.scope.resolve(Modules.INVENTORY)

  try {
    const resultado = await withFileLock(VENTAS_FILE, async () => {
      const ventas = cargarVentas()
      const idx = ventas.findIndex((v) => v.folio === folio)
      if (idx === -1) return { error: "Venta no encontrada", status: 404 } as const
      if (ventas[idx].estado === "cancelada") {
        return { error: "La venta ya está cancelada", status: 400 } as const
      }

      // Reintegrar inventario de los items que tengan sku. Se EXCLUYEN las líneas
      // de encargo global (no_descontar): nunca descontaron stock, así que
      // reintegrarlas inflaría el inventario.
      const itemsConSku = (ventas[idx].items ?? []).filter(
        (i) => i.sku && !(i as { no_descontar?: boolean }).no_descontar
      )
      if (itemsConSku.length) {
        const skus = itemsConSku.map((i) => i.sku as string)
        const inventoryItems = await inventoryModule.listInventoryItems(
          { sku: skus },
          { select: ["id", "sku"], take: skus.length + 10 }
        )
        const itemPorSku = new Map(inventoryItems.map((i) => [i.sku, i.id]))
        const niveles = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItems.map((i) => i.id) },
          { select: ["inventory_item_id", "location_id"], take: inventoryItems.length + 10 }
        )
        const locPorItemId = new Map(niveles.map((n) => [n.inventory_item_id, n.location_id]))
        for (const it of itemsConSku) {
          const invId = itemPorSku.get(it.sku as string)
          const locId = invId ? locPorItemId.get(invId) : undefined
          if (invId && locId) {
            // GRANEL: se descontó `granel_descuento` (unidad base), no `cantidad`
            // (presentaciones). Reintegramos exactamente lo que se descontó; 0 si la
            // presentación no tenía factor (nunca tocó inventario).
            const g = it as { granel?: boolean; granel_descuento?: number }
            const reintegro = g.granel ? (Number(g.granel_descuento) || 0) : it.cantidad
            if (reintegro > 0) {
              await inventoryModule.adjustInventory(invId, locId, +reintegro)
            }
          }
        }
      } else {
        console.warn(`[caja/ventas PATCH] Venta ${folio} sin sku en items: no se reintegra inventario`)
      }

      // Revertir el cargo a crédito: si la venta fue a crédito y tiene cliente,
      // registramos un "pago" compensatorio por el mismo monto y folio. Así el
      // saldo FIFO del cliente vuelve a su estado previo a la venta.
      const credito = Number(ventas[idx].pago_credito ?? 0)
      const clienteId = ventas[idx].cliente_id
      if (credito > 0 && clienteId) {
        try {
          const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
          await carteraService.agregarMovimiento(clienteId, {
            tipo: "pago",
            monto: credito,
            fecha: new Date().toISOString().slice(0, 10),
            folio,
            descripcion: `Reverso por cancelación de venta ${folio}`,
          })
        } catch (e: any) {
          // No abortamos la cancelación por esto (el inventario ya se reintegró);
          // se registra para conciliación manual.
          console.error(`[caja/ventas PATCH] No se pudo revertir el cargo a crédito de ${folio}:`, e?.message ?? e)
        }
      }

      // Revertir el monedero: si la venta otorgó puntos, se anulan (soft-cancel
      // del movimiento "ganado" por folio); si el cliente canjeó puntos, se le
      // reembolsan con un "ajuste" positivo. Ambos best-effort: la cancelación
      // (inventario ya reintegrado) no se aborta si esto falla.
      const ganados = Number(ventas[idx].puntos_ganados ?? 0)
      const canjeados = Number(ventas[idx].puntos_canjeados ?? 0)
      if (clienteId && (ganados > 0 || canjeados > 0)) {
        try {
          const monederoService: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
          if (ganados > 0) {
            await monederoService.revertirGanadosDeFolio(folio, `Cancelación de venta ${folio}`)
          }
          if (canjeados > 0) {
            await monederoService.agregarMovimiento(clienteId, {
              tipo: "ajuste",
              puntos: canjeados,
              folio,
              descripcion: `Reembolso de puntos por cancelación de venta ${folio}`,
            })
          }
        } catch (e: any) {
          console.error(`[caja/ventas PATCH] No se pudo revertir el monedero de ${folio}:`, e?.message ?? e)
        }
      }

      // Revertir el saldo a favor por cambio: si la venta consumió saldo, se
      // reembolsa con un "ajuste" positivo por el mismo monto. Best-effort (no
      // aborta la cancelación si falla).
      const saldoCambioConsumido = Number(ventas[idx].pago_saldo_cambio ?? 0)
      if (clienteId && saldoCambioConsumido > 0) {
        try {
          const saldoCambioService: FerremexSaldoCambioService = req.scope.resolve(FERREMEX_SALDO_CAMBIO)
          await saldoCambioService.agregarMovimiento(clienteId, {
            tipo: "ajuste",
            monto: saldoCambioConsumido,
            venta_consumo_folio: folio,
            descripcion: `Reembolso por cancelación de venta ${folio}`,
          })
        } catch (e: any) {
          console.error(`[caja/ventas PATCH] No se pudo revertir el saldo a favor de ${folio}:`, e?.message ?? e)
        }
      }

      ventas[idx] = {
        ...ventas[idx],
        estado: "cancelada",
        motivo_cancelacion: motivo.trim(),
        fecha_cancelacion: new Date().toISOString(),
      }
      writeJsonAtomic(VENTAS_FILE, ventas)
      return { venta: ventas[idx] } as const
    })

    if ("error" in resultado) {
      res.status(resultado.status ?? 400).json({ error: resultado.error })
      return
    }
    res.json(resultado.venta)
  } catch (err) {
    console.error("[caja/ventas PATCH] Error cancelando venta:", err)
    res.status(500).json({ error: "No se pudo cancelar la venta" })
  }
}
