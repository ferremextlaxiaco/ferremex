import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * GET /caja/productos?q=<texto>  o  ?sku=<clave>
 * Busca productos para el POS. Sin publishable API key requerida.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)

  const q = String(req.query["q"] ?? "").trim()
  const skuExacto = String(req.query["sku"] ?? "").trim()

  if (!q && !skuExacto) {
    res.json([])
    return
  }

  let variantes: Awaited<ReturnType<typeof productModule.listProductVariants>> = []

  if (skuExacto) {
    variantes = await productModule.listProductVariants(
      { sku: [skuExacto] },
      { select: ["id", "sku", "title", "prices", "product_id"], take: 1 }
    )
  } else {
    const productos = await productModule.listProducts(
      { q },
      { select: ["id", "title", "variants"], relations: ["variants", "variants.prices"], take: 20 }
    )
    variantes = productos.flatMap((p) => p.variants ?? [])
  }

  const skus = variantes.map((v) => v.sku).filter(Boolean) as string[]
  let inventoryItems: Awaited<ReturnType<typeof inventoryModule.listInventoryItems>> = []
  if (skus.length > 0) {
    inventoryItems = await inventoryModule.listInventoryItems(
      { sku: skus },
      { select: ["id", "sku"], take: skus.length + 10 }
    )
  }

  const itemIds = inventoryItems.map((i) => i.id)
  const existenciaPorSku = new Map<string, number>()
  if (itemIds.length > 0) {
    const niveles = await inventoryModule.listInventoryLevels(
      { inventory_item_id: itemIds },
      { select: ["inventory_item_id", "stocked_quantity"], take: itemIds.length + 10 }
    )
    const itemPorId = new Map(inventoryItems.map((i) => [i.id, i.sku]))
    for (const nivel of niveles) {
      const sku = itemPorId.get(nivel.inventory_item_id)
      if (sku) {
        existenciaPorSku.set(sku, (existenciaPorSku.get(sku) ?? 0) + (nivel.stocked_quantity ?? 0))
      }
    }
  }

  const resultados = variantes
    .map((v) => {
      const precioCents = v.prices?.find((p) => p.currency_code === "mxn")?.amount ?? 0
      return {
        sku: v.sku ?? "",
        descripcion: v.title ?? "",
        precio: precioCents / 100,
        existencia: existenciaPorSku.get(v.sku ?? "") ?? 0,
      }
    })
    .filter((r) => r.sku && r.descripcion)

  res.json(resultados)
}
