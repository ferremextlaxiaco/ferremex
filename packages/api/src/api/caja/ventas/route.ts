import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

interface ItemVenta {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
}

interface VentaBody {
  cajero: string
  turno_id: string
  items: ItemVenta[]
  pago_efectivo: number
  pago_transferencia?: number
  pago_credito?: number
}

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")

function cargarVentas(): unknown[] {
  if (!fs.existsSync(VENTAS_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(VENTAS_FILE, "utf-8")) as unknown[]
  } catch {
    return []
  }
}

function guardarVentas(ventas: unknown[]) {
  const dir = path.dirname(VENTAS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(VENTAS_FILE, JSON.stringify(ventas, null, 2), "utf-8")
}

function generarFolio(): string {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase()
  return `POS-${fecha}-${rand}`
}

/** POST /caja/ventas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const body = req.body as VentaBody
  const { cajero, turno_id, items, pago_efectivo = 0, pago_transferencia = 0, pago_credito = 0 } = body

  if (!cajero || !turno_id || !items?.length) {
    res.status(400).json({ error: "Faltan campos requeridos: cajero, turno_id, items" })
    return
  }

  const total = items.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0)
  const total_pagado = pago_efectivo + pago_transferencia + pago_credito

  if (total_pagado < total - 0.01) {
    res.status(400).json({ error: "El pago es menor al total" })
    return
  }

  // Cargar inventario y validar stock antes de procesar
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
    if (!inventoryItemId) continue
    const nivel = nivelPorItemId.get(inventoryItemId)
    if (!nivel) continue
    if (item.cantidad > nivel.stocked_quantity) {
      res.status(400).json({
        error: `Stock insuficiente para "${item.descripcion}": solicitado ${item.cantidad}, disponible ${nivel.stocked_quantity}`,
      })
      return
    }
  }

  // Descontar inventario
  for (const item of items) {
    const inventoryItemId = itemPorSku.get(item.sku)
    if (!inventoryItemId) continue
    const nivel = nivelPorItemId.get(inventoryItemId)
    if (!nivel) continue
    await inventoryModule.adjustInventory(inventoryItemId, nivel.location_id, -item.cantidad)
  }

  const registro = {
    folio: generarFolio(),
    fecha: new Date().toISOString(),
    cajero,
    turno_id,
    items: items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.precio_unitario * i.cantidad,
    })),
    total,
    pago_efectivo,
    pago_transferencia,
    pago_credito,
    cambio: Math.max(0, pago_efectivo - Math.max(0, total - pago_transferencia - pago_credito)),
  }

  const ventas = cargarVentas()
  ventas.push(registro)
  guardarVentas(ventas)

  res.json(registro)
}
