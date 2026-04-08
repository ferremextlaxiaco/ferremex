import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * GET /caja/productos?q=<texto>  o  ?sku=<clave>
 * Busca productos para el POS. Sin publishable API key requerida.
 *
 * En Medusa 2.x, los precios están en el módulo Pricing vinculados a variantes.
 * query.graph con entity:"product" no resuelve bien el join cross-módulo hacia prices.
 * Por eso se hace en dos pasos:
 *   1. productModule.listProducts() para buscar por texto / SKU
 *   2. query.graph con entity:"product_variant" para obtener price_set.prices
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const q = String(req.query["q"] ?? "").trim()
  const skuExacto = String(req.query["sku"] ?? "").trim()

  if (!q && !skuExacto) {
    res.json([])
    return
  }

  // ---------------------------------------------------------------------------
  // 1. Obtener variantes que coincidan con la búsqueda
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let variantesBase: { id: string; sku: string | null; title: string | null }[] = []

  if (skuExacto) {
    const vars = await productModule.listProductVariants(
      { sku: [skuExacto] },
      { select: ["id", "sku", "title"], take: 1 }
    )
    variantesBase = vars.map((v) => ({ id: v.id, sku: v.sku ?? null, title: v.title ?? null }))
  } else {
    const productos = await productModule.listProducts(
      { q },
      { select: ["id"], relations: ["variants"], take: 20 }
    )
    for (const p of productos) {
      for (const v of p.variants ?? []) {
        variantesBase.push({ id: v.id, sku: v.sku ?? null, title: v.title ?? null })
      }
    }
  }

  if (variantesBase.length === 0) {
    res.json([])
    return
  }

  // ---------------------------------------------------------------------------
  // 2. Obtener precios vía query.graph (product_variant → price_set → prices)
  // ---------------------------------------------------------------------------

  const variantIds = variantesBase.map((v) => v.id)

  const { data: variantsConPrecios } = await query.graph({
    entity: "product_variant",
    filters: { id: variantIds },
    fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
    pagination: { take: variantIds.length + 10 },
  })

  // Construir mapa variant_id → precio en centavos MXN
  const precioPorVariantId = new Map<string, number>()
  for (const v of variantsConPrecios) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const precios: any[] = (v as any).price_set?.prices ?? []
    const precioMXN = precios.find((p) => p.currency_code === "mxn")?.amount
    if (precioMXN !== undefined) {
      precioPorVariantId.set(v.id, precioMXN)
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Obtener existencias en inventario
  // ---------------------------------------------------------------------------

  const skus = variantesBase.map((v) => v.sku).filter(Boolean) as string[]
  const existenciaPorSku = new Map<string, number>()

  if (skus.length > 0) {
    const inventoryItems = await inventoryModule.listInventoryItems(
      { sku: skus },
      { select: ["id", "sku"], take: skus.length + 10 }
    )
    if (inventoryItems.length > 0) {
      const itemIds = inventoryItems.map((i) => i.id)
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
  }

  // ---------------------------------------------------------------------------
  // 4. Componer respuesta
  // ---------------------------------------------------------------------------

  const resultados = variantesBase
    .map((v) => {
      const precioCents = precioPorVariantId.get(v.id) ?? 0
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
