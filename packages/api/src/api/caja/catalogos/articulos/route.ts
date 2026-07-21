import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { amountAPesos } from "../../../../lib/precio"
import { productosPublicadosMeta } from "../../../../lib/productos-meta-cache"

// ---------------------------------------------------------------------------
// GET /caja/catalogos/articulos — previsualización PAGINADA de artículos de
// un departamento/categoría/marca (módulo Catálogos → botón "Ver artículos").
//
// A diferencia de /caja/articulos?departamento=, esta ruta NO arma el
// ArticuloPOS completo (relaciones + precio + existencia) para TODO el
// conjunto — eso es lo que hacía tardar minutos en departamentos de 15k+
// artículos. Aquí se resuelven primero los IDs candidatos en memoria (barato,
// solo metadata cacheada) y solo se hidratan con relaciones/precio/existencia
// los IDs de la página pedida.
// ---------------------------------------------------------------------------

interface ArticuloPreview {
  id: string
  clave: string
  descripcion: string
  marca: string
  thumbnail: string | null
  existencia: number
}

function thumbnailPath(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).pathname } catch { return url.startsWith("/") ? url : null }
}

async function existenciasPorSku(inventoryModule: any, skus: string[]): Promise<Map<string, number>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const map = new Map<string, number>()
  if (!skus.length) return map
  const items = await inventoryModule.listInventoryItems(
    { sku: skus },
    { select: ["id", "sku"], take: skus.length + 10 }
  )
  if (!items.length) return map
  const itemIds = items.map((i: any) => i.id) // eslint-disable-line @typescript-eslint/no-explicit-any
  const niveles = await inventoryModule.listInventoryLevels(
    { inventory_item_id: itemIds },
    { select: ["inventory_item_id", "stocked_quantity"], take: itemIds.length + 10 }
  )
  const itemPorId = new Map<string, string>(items.map((i: any) => [i.id, i.sku])) // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const nivel of niveles) {
    const sku = itemPorId.get(nivel.inventory_item_id)
    if (sku) map.set(sku, (map.get(sku) ?? 0) + (nivel.stocked_quantity ?? 0))
  }
  return map
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const departamento = String(req.query["departamento"] ?? "").trim()
  const categoria    = String(req.query["categoria"]    ?? "").trim()
  const marca        = String(req.query["marca"]        ?? "").trim()
  const q            = String(req.query["q"]            ?? "").trim().toLowerCase()
  const limit        = Math.min(Math.max(Number(req.query["limit"]) || 50, 1), 200)
  const offset       = Math.max(Number(req.query["offset"]) || 0, 0)

  if (!departamento && !categoria && !marca) {
    res.json({ items: [], total: 0 })
    return
  }

  // Paso 1: candidatos por categoría (IDs vía relación, barato) o por dept/marca
  // (metadata cacheada, filtrado en memoria — sin relaciones ni precios).
  let candidatos: { id: string; title: string; thumbnail: string | null; metadata: Record<string, unknown> }[]
  if (categoria) {
    const foundCats = await productModule.listProductCategories(
      { name: categoria },
      { select: ["id", "name"], relations: ["products"], take: 10 }
    )
    const ids = (foundCats as any[]).flatMap((c) => // eslint-disable-line @typescript-eslint/no-explicit-any
      ((c.products ?? []) as any[]).map((p: any) => p.id) // eslint-disable-line @typescript-eslint/no-explicit-any
    )
    if (!ids.length) { res.json({ items: [], total: 0 }); return }
    const meta = await productosPublicadosMeta(productModule)
    const metaById = new Map(meta.map((p: any) => [p.id, p])) // eslint-disable-line @typescript-eslint/no-explicit-any
    candidatos = ids.map((id) => metaById.get(id)).filter(Boolean) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  } else {
    const meta = await productosPublicadosMeta(productModule)
    candidatos = meta as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  if (departamento) {
    candidatos = candidatos.filter((p) => (p.metadata?.departamento as string | undefined)?.trim() === departamento)
  }
  if (marca) {
    candidatos = candidatos.filter((p) => (p.metadata?.marca as string | undefined)?.trim() === marca)
  }
  if (q) {
    candidatos = candidatos.filter((p) => (p.title ?? "").toLowerCase().includes(q))
  }

  candidatos.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "es"))

  const total = candidatos.length
  const pagina = candidatos.slice(offset, offset + limit)

  if (!pagina.length) { res.json({ items: [], total }); return }

  // Paso 2: hidratar SOLO la página con relaciones + precio + existencia.
  const pageIds = pagina.map((p) => p.id)
  const withRelations = await productModule.listProducts(
    { id: pageIds },
    { select: ["id", "title", "thumbnail", "metadata"], relations: ["variants"], take: pageIds.length + 10 }
  ) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  const byId = new Map(withRelations.map((p) => [p.id, p]))

  const varIds = withRelations.flatMap((p) => (p.variants as any[])?.map((v: any) => v.id) ?? []) // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: varsPrecios } = await query.graph({
    entity: "product_variant",
    filters: { id: varIds },
    fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
    pagination: { take: varIds.length + 10 },
  })
  const precioPorVarId = new Map<string, number>()
  for (const v of varsPrecios) {
    const mxn = ((v as any).price_set?.prices ?? []).find((p: any) => p.currency_code === "mxn")?.amount // eslint-disable-line @typescript-eslint/no-explicit-any
    if (mxn !== undefined) precioPorVarId.set(v.id, amountAPesos(mxn))
  }
  const skus = withRelations.flatMap((p) => (p.variants as any[])?.map((v: any) => v.sku).filter(Boolean) ?? []) as string[] // eslint-disable-line @typescript-eslint/no-explicit-any
  const stock = await existenciasPorSku(inventoryModule, skus)

  const items: ArticuloPreview[] = pagina.map((cand) => {
    const p = byId.get(cand.id)
    const variant = p ? (p.variants as any[])?.[0] : undefined // eslint-disable-line @typescript-eslint/no-explicit-any
    const meta = (p?.metadata ?? cand.metadata ?? {}) as Record<string, unknown>
    return {
      id: cand.id,
      clave: variant?.sku ?? "",
      descripcion: p?.title ?? cand.title ?? "",
      marca: String(meta.marca ?? ""),
      thumbnail: thumbnailPath(p?.thumbnail ?? cand.thumbnail) ?? null,
      existencia: variant?.sku ? (stock.get(variant.sku) ?? 0) : 0,
    }
  })

  res.json({ items, total })
}
