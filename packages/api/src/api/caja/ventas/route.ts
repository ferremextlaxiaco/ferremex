import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, withFileLock } from "../../../lib/json-store"
import { FERREMEX_CARTERA } from "../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../modules/ferremex-cartera/service"

interface ItemVenta {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  // Si el item forma parte de un paquete vendido, lo marcan (el precio_unitario
  // ya viene prorrateado desde el front). Opcionales y retrocompatibles.
  paquete_id?: string
  paquete_nombre?: string
}

interface VentaBody {
  cajero: string
  turno_id: string
  items: ItemVenta[]
  pago_efectivo: number
  pago_transferencia?: number
  pago_credito?: number
  // Cliente a crédito: si pago_credito > 0, el cargo se registra en su cartera
  // de forma transaccional (dentro del lock de la venta). `cliente_id` es el id
  // del Customer nativo de Medusa.
  cliente_id?: string
  cliente_nombre?: string
  plazo?: number
}

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CONFIG_FILE = path.join(__dirname, "../../../../data/ticket-config.json")
const COUNTER_FILE = path.join(__dirname, "../../../../data/folio-counter.json")

function cargarVentas(): unknown[] {
  return readJson<unknown[]>(VENTAS_FILE, [])
}

interface FormatoFolio { modo: "secuencial" | "fecha"; prefijo: string; digitos: number }

function cargarFormatoFolio(): FormatoFolio | null {
  return readJson<{ formato_folio?: FormatoFolio }>(CONFIG_FILE, {}).formato_folio ?? null
}

/**
 * Genera un folio. En modo secuencial, lee+incrementa el contador y lo guarda
 * de forma atómica. DEBE llamarse dentro del lock de VENTAS_FILE para que el
 * incremento del contador sea atómico respecto a otras ventas concurrentes.
 */
function generarFolio(): string {
  const fmt = cargarFormatoFolio()
  if (!fmt || fmt.modo !== "secuencial") {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const rand = crypto.randomBytes(2).toString("hex").toUpperCase()
    return `POS-${fecha}-${rand}`
  }
  const n = readJson<{ contador: number }>(COUNTER_FILE, { contador: 0 }).contador + 1
  writeJsonAtomic(COUNTER_FILE, { contador: n })
  return `${fmt.prefijo}${n.toString().padStart(fmt.digitos, "0")}`
}

/** GET /caja/ventas — lista todas las ventas (filtrables por ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD) */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { desde, hasta } = req.query as Record<string, string>
  let ventas = cargarVentas() as Record<string, unknown>[]
  if (desde) ventas = ventas.filter((v) => typeof v.fecha === "string" && v.fecha.slice(0, 10) >= desde)
  if (hasta) ventas = ventas.filter((v) => typeof v.fecha === "string" && v.fecha.slice(0, 10) <= hasta)
  ventas = ventas.sort((a, b) => {
    const fa = typeof a.fecha === "string" ? a.fecha : ""
    const fb = typeof b.fecha === "string" ? b.fecha : ""
    return fb.localeCompare(fa)
  })
  res.json(ventas)
}

/** POST /caja/ventas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const body = req.body as VentaBody
  const { cajero, turno_id, items } = body
  // Castear pagos a Number: si el body los envía como string, la coerción de JS
  // ("500" + 0) rompería la validación de importe más abajo.
  const pago_efectivo = Number(body.pago_efectivo ?? 0)
  const pago_transferencia = Number(body.pago_transferencia ?? 0)
  const pago_credito = Number(body.pago_credito ?? 0)

  if (!cajero || !turno_id || !items?.length) {
    res.status(400).json({ error: "Faltan campos requeridos: cajero, turno_id, items" })
    return
  }
  if (items.some((i) => !i.sku || !(i.cantidad > 0))) {
    res.status(400).json({ error: "Cada item requiere sku y cantidad > 0" })
    return
  }
  if (![pago_efectivo, pago_transferencia, pago_credito].every((n) => Number.isFinite(n))) {
    res.status(400).json({ error: "Montos de pago inválidos" })
    return
  }
  // Si hay pago a crédito, se requiere un cliente para cargarlo en su cartera.
  if (pago_credito > 0 && !body.cliente_id) {
    res.status(400).json({ error: "Una venta a crédito requiere cliente_id" })
    return
  }

  const total = items.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0)
  const total_pagado = pago_efectivo + pago_transferencia + pago_credito

  if (total_pagado < total - 0.01) {
    res.status(400).json({ error: "El pago es menor al total" })
    return
  }

  // Serializamos toda la venta bajo el lock del archivo de ventas. Esto convierte
  // el bloque check → decrement → folio → guardar en una sección crítica atómica
  // respecto a otras ventas concurrentes, eliminando: (a) sobreventa por race
  // check→decrement, (b) folios secuenciales duplicados, (c) pérdida de registros
  // por read-modify-write concurrente.
  const carteraService: FerremexCarteraService | null =
    pago_credito > 0 ? req.scope.resolve(FERREMEX_CARTERA) : null

  try {
    const resultado = await withFileLock(VENTAS_FILE, async () => {
      // Cargar inventario y validar stock
      const skus = items.map((i) => i.sku)
      const inventoryItems = await inventoryModule.listInventoryItems(
        { sku: skus },
        { select: ["id", "sku"], take: skus.length + 10 }
      )
      const itemPorSku = new Map(inventoryItems.map((i) => [i.sku, i.id]))
      const niveles = await inventoryModule.listInventoryLevels(
        { inventory_item_id: inventoryItems.map((i) => i.id) },
        { select: ["id", "inventory_item_id", "location_id", "stocked_quantity"], take: inventoryItems.length + 10 }
      )
      const nivelPorItemId = new Map(niveles.map((n) => [n.inventory_item_id, n]))

      // Validar que ningún item supere el stock disponible
      for (const item of items) {
        const inventoryItemId = itemPorSku.get(item.sku)
        if (!inventoryItemId) {
          // SKU sin inventory item: lo registramos pero advertimos en log en vez
          // de descontarlo en silencio.
          console.warn(`[caja/ventas] SKU sin inventory item, no se descuenta: ${item.sku}`)
          continue
        }
        const nivel = nivelPorItemId.get(inventoryItemId)
        if (!nivel) continue
        if (item.cantidad > nivel.stocked_quantity) {
          return {
            error: `Stock insuficiente para "${item.descripcion}": solicitado ${item.cantidad}, disponible ${nivel.stocked_quantity}`,
          } as const
        }
      }

      // Descontar inventario acumulando lo aplicado para poder revertir ante error.
      const aplicados: { itemId: string; locationId: string; cantidad: number }[] = []
      try {
        for (const item of items) {
          const inventoryItemId = itemPorSku.get(item.sku)
          if (!inventoryItemId) continue
          const nivel = nivelPorItemId.get(inventoryItemId)
          if (!nivel) continue
          await inventoryModule.adjustInventory(inventoryItemId, nivel.location_id, -item.cantidad)
          aplicados.push({ itemId: inventoryItemId, locationId: nivel.location_id, cantidad: item.cantidad })
        }

        // Generar folio (dentro del lock → contador atómico) y persistir la venta.
        const registro = {
          folio: generarFolio(),
          fecha: new Date().toISOString(),
          cajero,
          turno_id,
          items: items.map((i) => ({
            sku: i.sku, // necesario para reintegrar inventario al cancelar la venta
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            subtotal: i.precio_unitario * i.cantidad,
            // Traza del paquete (si aplica) para ticket / historial / corte.
            ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre ?? null } : {}),
          })),
          total,
          pago_efectivo,
          pago_transferencia,
          pago_credito,
          // cliente_id se persiste para poder revertir el cargo a crédito si la
          // venta se cancela (PATCH /caja/ventas/:folio).
          cliente_id: body.cliente_id ?? null,
          cliente_nombre: body.cliente_nombre ?? null,
          cambio: Math.max(0, pago_efectivo - Math.max(0, total - pago_transferencia - pago_credito)),
        }

        // Cargo a crédito: registrar el movimiento en la cartera del cliente.
        // Se hace ANTES de escribir la venta para que, si el cargo falla, el
        // catch revierta el inventario y la venta NO se persista (atomicidad
        // cargo+venta). El orden inverso (venta primero) dejaría como peor caso
        // un cargo huérfano con folio de una venta inexistente; este orden deja
        // como peor caso —solo si writeJsonAtomic fallara tras un cargo OK— un
        // cargo sin venta, detectable y reversible por folio. La escritura JSON
        // local es prácticamente infalible una vez superada la validación.
        if (carteraService && pago_credito > 0 && body.cliente_id) {
          await carteraService.agregarMovimiento(body.cliente_id, {
            tipo: "compra",
            monto: pago_credito,
            fecha: registro.fecha.slice(0, 10),
            folio: registro.folio,
            plazo: body.plazo != null ? Number(body.plazo) : null,
            descripcion: `Venta a crédito ${registro.folio}`,
          })
        }

        const ventas = cargarVentas()
        ventas.push(registro)
        writeJsonAtomic(VENTAS_FILE, ventas)
        return { registro } as const
      } catch (err) {
        // Compensación: revertir los decrementos ya aplicados para no dejar el
        // inventario descontado sin venta registrada.
        for (const a of aplicados) {
          try {
            await inventoryModule.adjustInventory(a.itemId, a.locationId, +a.cantidad)
          } catch (revertErr) {
            console.error(`[caja/ventas] Falló revertir inventario de ${a.itemId}:`, revertErr)
          }
        }
        throw err
      }
    })

    if ("error" in resultado) {
      res.status(400).json({ error: resultado.error })
      return
    }
    res.json(resultado.registro)
  } catch (err) {
    console.error("[caja/ventas] Error registrando venta:", err)
    res.status(500).json({ error: "No se pudo registrar la venta" })
  }
}
