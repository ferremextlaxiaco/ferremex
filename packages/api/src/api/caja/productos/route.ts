import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { normalizarFonetico } from "../../../lib/text"
import { amountAPesos } from "../../../lib/precio"

/** Convierte una URL absoluta de thumbnail a ruta relativa /static/... */
function thumbnailPath(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname // http://localhost:9000/static/x.jpg → /static/x.jpg
  } catch {
    return url.startsWith("/") ? url : null
  }
}
// normalizarFonetico canonico vive en lib/text (dedupe API-M3): la busqueda fonetica
// de venta (/caja/productos) y admin (/caja/articulos) comparten la misma normalizacion.

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

  type VarianteBase = { id: string; sku: string | null; title: string | null; thumbnail: string | null; impuesto: boolean; marca: string; departamento: string; categoria: string; especificaciones: { clave: string; valor: string }[]; mayoreoActivo: boolean; mayoreoMin: number; precio2: number; precio3: number; precio4: number }
  const variantesBase: VarianteBase[] = []
  // ¿El match fue un código EXACTO (SKU completo o código de barras)? En ese caso
  // sí cortocircuitamos (escaneo de barras / clave completa = un único resultado).
  // El match PARCIAL de SKU (abajo) NO corta: se fusiona con la búsqueda por nombre.
  let matchExacto = false

  // ── Intento de match exacto por SKU o código de barras ──────────────────
  const codigoCandidato = skuExacto || (q && !q.includes(" ") ? q : "")
  if (codigoCandidato) {
    // Buscar por SKU (original + uppercase para ignorar mayúsculas) y por barcode en paralelo
    const skuCandidatos: string[] = [codigoCandidato]
    const skuUpper = codigoCandidato.toUpperCase()
    if (skuUpper !== codigoCandidato) skuCandidatos.push(skuUpper)

    const [varsPorSku, varsPorBarcode] = await Promise.all([
      productModule.listProductVariants(
        { sku: skuCandidatos },
        { select: ["id", "sku", "title", "product_id"], take: skuCandidatos.length }
      ),
      productModule.listProductVariants(
        // `barcode` es un filtro válido en runtime pero no está en el tipo
        // FilterableProductVariantProps de Medusa 2.x; cast para el build de prod.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { barcode: [codigoCandidato] } as any,
        { select: ["id", "sku", "title", "product_id"], take: 1 }
      ),
    ])
    const varEncontrada = varsPorSku[0] ?? varsPorBarcode[0] ?? null
    if (varEncontrada) {
      let thumbnail: string | null = null
      let impuesto = false
      let marca = ""
      let departamento = ""
      let categoria = ""
      let especificaciones: { clave: string; valor: string }[] = []
      let mayoreoActivo = false
      let mayoreoMin = 0
      let precio2 = 0
      let precio3 = 0
      let precio4 = 0
      if (varEncontrada.product_id) {
        try {
          const prod = await productModule.retrieveProduct(varEncontrada.product_id, { select: ["thumbnail", "metadata"] })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = (prod.metadata ?? {}) as any
          thumbnail = thumbnailPath(prod.thumbnail)
          impuesto = !!meta.impuesto
          marca = meta.marca ?? ""
          departamento = meta.departamento ?? ""
          categoria = meta.categoria ?? ""
          especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
          mayoreoActivo = !!meta.mayoreoActivo
          mayoreoMin = Number(meta.mayoreoMin) || 0
          precio2 = Number(meta.precio2) || 0
          precio3 = Number(meta.precio3) || 0
          precio4 = Number(meta.precio4) || 0
        } catch { /* sin metadata */ }
      }
      variantesBase.push({ id: varEncontrada.id, sku: varEncontrada.sku ?? null, title: varEncontrada.title ?? null, thumbnail, impuesto, marca, departamento, categoria, especificaciones, mayoreoActivo, mayoreoMin, precio2, precio3, precio4 })
      matchExacto = true
    }
  }

  // ── Búsqueda parcial de SKU (case-insensitive) cuando el match exacto falló ──
  // Cubre casos como "gr6x1" → GR6X1, GR6X11/2, GR6X11/4, etc.
  // NO corta la búsqueda por nombre: "pvc" debe traer tanto SKUs con "pvc" como
  // productos cuyo TÍTULO contiene "pvc" (p. ej. "Tubo de PVC" con SKU 3447).
  if (!matchExacto && codigoCandidato && !skuExacto) {
    const qLower = codigoCandidato.toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allVars = await productModule.listProductVariants(
      {},
      { select: ["id", "sku", "product_id"], take: 99999 }
    ) as any[]
    const partialProductIds = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...new Set<string>(
        allVars
          .filter((v: any) => v.sku && v.sku.toLowerCase().includes(qLower) && v.product_id)
          .map((v: any) => v.product_id as string)
      ),
    ]
    if (partialProductIds.length > 0) {
      const prods = await productModule.listProducts(
        { id: partialProductIds },
        { select: ["id", "thumbnail", "metadata"], relations: ["variants"], take: partialProductIds.length + 10 }
      ) as any[]
      for (const p of prods) {
        const meta = (p.metadata ?? {}) as any
        const thumb = thumbnailPath(p.thumbnail)
        for (const v of (p.variants ?? []) as any[]) {
          if (v.sku?.toLowerCase().includes(qLower)) {
            variantesBase.push({
              id: v.id, sku: v.sku ?? null, title: v.title ?? null, thumbnail: thumb,
              impuesto: !!meta.impuesto, marca: meta.marca ?? "",
              departamento: meta.departamento ?? "", categoria: meta.categoria ?? "",
              especificaciones: Array.isArray(meta.especificaciones) ? meta.especificaciones : [],
              mayoreoActivo: !!meta.mayoreoActivo, mayoreoMin: Number(meta.mayoreoMin) || 0,
              precio2: Number(meta.precio2) || 0,
              precio3: Number(meta.precio3) || 0,
              precio4: Number(meta.precio4) || 0,
            })
          }
        }
      }
    }
  }

  if (matchExacto) {
    // Match exacto de SKU/barcode → un único resultado, sin búsqueda por nombre.
  } else if (!skuExacto) {
    // ── Búsqueda por texto / filtros ────────────────────────────────────────
    // Corre SIEMPRE que no haya match exacto (aunque el SKU parcial ya haya
    // aportado variantes): así "pvc" trae SKUs-PVC + títulos que contienen "pvc".
    // Las duplicadas (misma variante por SKU y por nombre) se deduplican al final.

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
      const departamento = meta.departamento ?? ""
      const categoria = meta.categoria ?? ""
      const especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
      const vMayoreoActivo = !!meta.mayoreoActivo
      const vMayoreoMin = Number(meta.mayoreoMin) || 0
      const vPrecio2 = Number(meta.precio2) || 0
      const vPrecio3 = Number(meta.precio3) || 0
      const vPrecio4 = Number(meta.precio4) || 0
      for (const v of p.variants ?? []) {
        variantesBase.push({ id: v.id, sku: v.sku ?? null, title: v.title ?? null, thumbnail: thumb, impuesto, marca, departamento, categoria, especificaciones, mayoreoActivo: vMayoreoActivo, mayoreoMin: vMayoreoMin, precio2: vPrecio2, precio3: vPrecio3, precio4: vPrecio4 })
      }
    }
  }

  if (variantesBase.length === 0) {
    res.json([])
    return
  }

  // ── Deduplicar por id de variante ─────────────────────────────────────────
  // El SKU parcial y la búsqueda fonética pueden aportar la misma variante.
  const vistos = new Set<string>()
  const variantesUnicas = variantesBase.filter((v) => {
    if (vistos.has(v.id)) return false
    vistos.add(v.id)
    return true
  })
  variantesBase.length = 0
  variantesBase.push(...variantesUnicas)

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
      const precioBase = amountAPesos(precioPorVariantId.get(v.id))
      // Si el producto tiene impuesto, el precio base es sin IVA → aplicar 16%
      const precio = v.impuesto ? Math.round(precioBase * 1.16 * 100) / 100 : precioBase
      const precio2 = v.precio2 > 0 && v.impuesto ? Math.round(v.precio2 * 1.16 * 100) / 100 : v.precio2
      const precio3 = v.precio3 > 0 && v.impuesto ? Math.round(v.precio3 * 1.16 * 100) / 100 : v.precio3
      const precio4 = v.precio4 > 0 && v.impuesto ? Math.round(v.precio4 * 1.16 * 100) / 100 : v.precio4
      return {
        sku: v.sku ?? "",
        descripcion: v.title ?? "",
        precio,
        precio2,
        precio3,
        precio4,
        // Si lleva IVA, `precio`/`precio2` ya vienen con el 16% incluido. El POS
        // usa este flag para desglosar base+IVA en el carrito y en el CFDI.
        impuesto: !!v.impuesto,
        existencia: existenciaPorSku.get(v.sku ?? "") ?? 0,
        thumbnail: v.thumbnail,
        marca: v.marca,
        departamento: v.departamento,
        categoria: v.categoria,
        especificaciones: v.especificaciones,
        mayoreoActivo: v.mayoreoActivo,
        mayoreoMin: v.mayoreoMin,
      }
    })
    .filter((r) => r.sku && r.descripcion)

  // ── Ordenar: relevancia LITERAL primero, luego stock ───────────────────────
  // La búsqueda fonética hace muda la "h" (brocha → broca), así que "brocha"
  // matchea cientos de pijas "punta de broca". Para que lo que el usuario
  // escribió LITERALMENTE pese más, puntuamos por coincidencia de texto crudo
  // (sin normalización fonética) antes de desempatar por existencia.
  const qLiteral = q.toLowerCase().trim()
  const relevancia = (descripcion: string, sku: string): number => {
    if (!qLiteral) return 5
    const desc = descripcion.toLowerCase()
    const clave = sku.toLowerCase()
    if (clave === qLiteral || desc === qLiteral) return 0
    if (desc.startsWith(qLiteral)) return 1            // "brocha profesional…"
    if (desc.includes(` ${qLiteral}`)) return 2        // palabra completa dentro del título
    if (desc.includes(qLiteral)) return 3              // subcadena en cualquier parte
    return 4                                           // solo coincidió por fonética (broca↔brocha)
  }

  resultados.sort((a, b) => {
    const ra = relevancia(a.descripcion, a.sku)
    const rb = relevancia(b.descripcion, b.sku)
    if (ra !== rb) return ra - rb
    // Dentro del mismo nivel de relevancia: primero los que tienen stock.
    return b.existencia - a.existencia
  })

  res.json(resultados)
}
