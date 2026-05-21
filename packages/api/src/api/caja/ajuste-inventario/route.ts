import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

interface AjusteItem {
  sku: string
  nueva_cantidad?: number  // cantidad absoluta (ajuste manual)
  delta?: number           // incremento relativo (recepción de compra)
}

// POST /caja/ajuste-inventario
// Body: { ajustes: [{ sku, nueva_cantidad }] }
// Returns: { ok, actualizados, errores }
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const stockLocationModule = req.scope.resolve(Modules.STOCK_LOCATION)

  const body = req.body as { ajustes?: AjusteItem[] }
  if (!Array.isArray(body.ajustes) || body.ajustes.length === 0) {
    res.status(400).json({ error: "Se requiere ajustes[]" })
    return
  }

  // Obtener almacén principal
  const [location] = await stockLocationModule.listStockLocations({}, { take: 1 })
  if (!location) {
    res.status(500).json({ error: "No hay almacén configurado. Ejecuta el seed primero." })
    return
  }

  const skus = [...new Set(body.ajustes.map((a) => a.sku).filter(Boolean))]

  // Buscar inventory items por SKU
  const items = await inventoryModule.listInventoryItems(
    { sku: skus },
    { select: ["id", "sku"], take: skus.length + 10 }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemBySku = new Map<string, any>(items.map((i: any) => [i.sku, i]))

  // Buscar niveles existentes para esos items en el almacén
  const itemIds = items.map((i: any) => i.id)
  const levels = itemIds.length > 0
    ? await inventoryModule.listInventoryLevels(
        { inventory_item_id: itemIds },
        { select: ["id", "inventory_item_id", "stocked_quantity"], take: itemIds.length + 10 }
      )
    : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const levelByItemId = new Map<string, any>(levels.map((l: any) => [l.inventory_item_id, l]))

  let actualizados = 0
  const errores: string[] = []

  for (const ajuste of body.ajustes) {
    if (!ajuste.sku) continue
    const item = itemBySku.get(ajuste.sku)

    if (!item) {
      errores.push(`SKU "${ajuste.sku}" no encontrado en inventario`)
      continue
    }

    const level = levelByItemId.get(item.id)

    // Calcular cantidad final: delta (relativo) o nueva_cantidad (absoluto)
    let qty: number
    if (ajuste.delta !== undefined) {
      qty = Math.max(0, (level?.stocked_quantity ?? 0) + Math.round(ajuste.delta))
    } else {
      qty = Math.round(ajuste.nueva_cantidad ?? 0)
    }

    try {
      if (level) {
        // Medusa 2.x updateInventoryLevels usa inventory_item_id + location_id como selector,
        // NO el campo id de la entidad.
        await inventoryModule.updateInventoryLevels([{
          inventory_item_id: item.id,
          location_id: location.id,
          stocked_quantity: qty,
        }])
      } else {
        // Crear nivel si no existe (artículo sin stock previo)
        await inventoryModule.createInventoryLevels([{
          inventory_item_id: item.id,
          location_id: location.id,
          stocked_quantity: qty,
        }])
      }
      actualizados++
    } catch (err: unknown) {
      errores.push(`SKU "${ajuste.sku}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  res.json({
    ok: errores.length === 0,
    actualizados,
    errores,
  })
}
