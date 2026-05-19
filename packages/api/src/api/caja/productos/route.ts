import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/** Convierte una URL absoluta de thumbnail a ruta relativa /static/... */
function thumbnailPath(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname // http://localhost:9000/static/x.jpg → /static/x.jpg
  } catch {
    return url.startsWith("/") ? url : null
  }
}

/**
 * Normalización fonética para español:
 * - quita acentos
 * - qu → k, c[ei] → s, z → s  (ce/ci/za/ze/zi suenan igual que se/si/sa...)
 * - v → b
 * - ll → y
 * - h → "" (muda)
 * - todo carácter no alfanumérico → espacio
 *
 * Así "cierra" y "sierra" quedan iguales, "pvc" y "pbc" quedan iguales, etc.
 */
function normalizarFonetico(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // quitar acentos (á→a, é→e…)
    .replace(/ll/g, "y")              // ll → y  (antes que otras reglas)
    .replace(/qu/g, "k")              // qu → k
    .replace(/c(?=[ei])/g, "s")       // ce → se, ci → si
    .replace(/z/g, "s")               // z → s
    .replace(/v/g, "b")               // v → b
    .replace(/h/g, "")                // h muda
    .replace(/[^a-z0-9]/g, " ")       // todo lo demás → espacio
    .replace(/\s+/g, " ")
    .trim()
}

/** Parte la query normalizada en palabras de ≥ 2 caracteres */
function palabrasQuery(q: string): string[] {
  return normalizarFonetico(q)
    .split(" ")
    .filter((w) => w.length >= 2)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const q = String(req.query["q"] ?? "").trim()
  const skuExacto = String(req.query["sku"] ?? "").trim()
  const categoryId = String(req.query["category_id"] ?? "").trim() || null
  const departamento = String(req.query["departamento"] ?? "").trim() || null

  if (!q && !skuExacto && !categoryId && !departamento) {
    res.json([])
    return
  }

  type VarianteBase = { id: string; sku: string | null; title: string | null; thumbnail: string | null; impuesto: boolean; marca: string; especificaciones: { clave: string; valor: string }[] }
  const variantesBase: VarianteBase[] = []

  // ── Intento de match exacto por SKU o código de barras ──────────────────
  const codigoCandidato = skuExacto || (q && !q.includes(" ") ? q : "")
  if (codigoCandidato) {
    // Buscar por SKU y por barcode en paralelo
    const [varsPorSku, varsPorBarcode] = await Promise.all([
      productModule.listProductVariants(
        { sku: [codigoCandidato] },
        { select: ["id", "sku", "title", "product_id"], take: 1 }
      ),
      productModule.listProductVariants(
        { barcode: [codigoCandidato] },
        { select: ["id", "sku", "title", "product_id"], take: 1 }
      ),
    ])
    const varEncontrada = varsPorSku[0] ?? varsPorBarcode[0] ?? null
    if (varEncontrada) {
      let thumbnail: string | null = null
      let impuesto = false
      let marca = ""
      let especificaciones: { clave: string; valor: string }[] = []
      if (varEncontrada.product_id) {
        try {
          const prod = await productModule.retrieveProduct(varEncontrada.product_id, { select: ["thumbnail", "metadata"] })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = (prod.metadata ?? {}) as any
          thumbnail = thumbnailPath(prod.thumbnail)
          impuesto = !!meta.impuesto
          marca = meta.marca ?? ""
          especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
        } catch { /* sin metadata */ }
      }
      variantesBase.push({ id: varEncontrada.id, sku: varEncontrada.sku ?? null, title: varEncontrada.title ?? null, thumbnail, impuesto, marca, especificaciones })
    }
  }

  if (variantesBase.length > 0) {
    // Ya encontramos por SKU exacto — saltar la búsqueda fonética
  } else if (!skuExacto) {
    // ── Búsqueda por texto / filtros ────────────────────────────────────────

    // Paso 1: cargar todos los productos (solo id + title + metadata, sin relaciones → rápido)
    // Si hay categoryId, primero obtenemos los productIds de esa categoría porque
    // listProducts no soporta filtro por category_id en Medusa 2.x.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let idsFiltroCategoria: string[] | null = null
    if (categoryId) {
      const cats = await productModule.listProductCategories(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: [categoryId] } as any,
        { select: ["id"], relations: ["products"], take: 1 }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idsFiltroCategoria = ((cats[0] as any)?.products ?? []).map((p: any) => p.id) as string[]
      if (idsFiltroCategoria.length === 0) {
        res.json([])
        return
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtrosPaso1: any = idsFiltroCategoria ? { id: idsFiltroCategoria } : {}

    const todosLosProductos = await productModule.listProducts(
      filtrosPaso1,
      { select: ["id", "title", "metadata"], take: idsFiltroCategoria ? idsFiltroCategoria.length + 10 : 99999 }
    )

    // Paso 2: filtrar en JS (fonética multi-palabra + departamento)
    const palabras = q ? palabrasQuery(q) : []

    const productosFiltrados = todosLosProductos.filter((p) => {
      // Filtro departamento (metadata)
      if (departamento) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((p.metadata as any)?.departamento !== departamento) return false
      }
      // Filtro fonético multi-palabra
      if (palabras.length > 0) {
        const titleNorm = normalizarFonetico(p.title ?? "")
        if (!palabras.every((pal) => titleNorm.includes(pal))) return false
      }
      return true
    })

    if (productosFiltrados.length === 0) {
      res.json([])
      return
    }

    // Mapa productId → impuesto (para aplicar IVA al precio base)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const impuestoPorProductoId = new Map(productosFiltrados.map((p) => [p.id, !!(p.metadata as any)?.impuesto]))

    // Paso 3: cargar solo los productos que coincidieron, ahora con thumbnail + variants
    const idsMatch = productosFiltrados.map((p) => p.id)
    const productos = await productModule.listProducts(
      { id: idsMatch },
      { select: ["id", "thumbnail", "metadata"], relations: ["variants"], take: idsMatch.length + 10 }
    )

    for (const p of productos) {
      const thumb = thumbnailPath(p.thumbnail)
      const impuesto = impuestoPorProductoId.get(p.id) ?? false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (p.metadata ?? {}) as any
      const marca = meta.marca ?? ""
      const especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
      for (const v of p.variants ?? []) {
        variantesBase.push({ id: v.id, sku: v.sku ?? null, title: v.title ?? null, thumbnail: thumb, impuesto, marca, especificaciones })
      }
    }
  }

  if (variantesBase.length === 0) {
    res.json([])
    return
  }

  // ── Precios via query.graph (cross-módulo: variant → price_set → prices) ──
  const variantIds = variantesBase.map((v) => v.id)
  const { data: variantsConPrecios } = await query.graph({
    entity: "product_variant",
    filters: { id: variantIds },
    fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
    pagination: { take: variantIds.length + 10 },
  })

  const precioPorVariantId = new Map<string, number>()
  for (const v of variantsConPrecios) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const precios: any[] = (v as any).price_set?.prices ?? []
    const mxn = precios.find((p) => p.currency_code === "mxn")?.amount
    if (mxn !== undefined) precioPorVariantId.set(v.id, mxn)
  }

  // ── Existencias en inventario ─────────────────────────────────────────────
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
        if (sku) existenciaPorSku.set(sku, (existenciaPorSku.get(sku) ?? 0) + (nivel.stocked_quantity ?? 0))
      }
    }
  }

  const resultados = variantesBase
    .map((v) => {
      const precioBase = (precioPorVariantId.get(v.id) ?? 0) / 100
      // Si el producto tiene impuesto, el precio base es sin IVA → aplicar 16%
      const precio = v.impuesto ? Math.round(precioBase * 1.16 * 100) / 100 : precioBase
      return {
        sku: v.sku ?? "",
        descripcion: v.title ?? "",
        precio,
        existencia: existenciaPorSku.get(v.sku ?? "") ?? 0,
        thumbnail: v.thumbnail,
        marca: v.marca,
        especificaciones: v.especificaciones,
      }
    })
    .filter((r) => r.sku && r.descripcion)
    // ── Ordenar: primero los que tienen stock ─────────────────────────────
    .sort((a, b) => b.existencia - a.existencia)

  res.json(resultados)
}
