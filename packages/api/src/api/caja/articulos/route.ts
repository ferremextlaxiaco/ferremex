import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { slugify as slugifyText, normalizarFonetico } from "../../../lib/text"
import { pesosAAmount, amountAPesos } from "../../../lib/precio"
import { productosPublicadosMeta, invalidarProductosMetaCache } from "../../../lib/productos-meta-cache"

// Trocea un array de IDs y ejecuta `fn` por lote de forma SECUENCIAL (no
// Promise.all). Un solo listProducts({id: 15000 IDs}, {relations:[...]}) genera
// una consulta con joins que multiplica filas y bloquea el event loop de Node
// varios minutos de corrido mientras MikroORM la hidrata — eso colgaba el POS
// entero (incluida la carga de /pos/) para todos los usuarios mientras corría.
// Lotes chicos + await secuencial reparten el trabajo en operaciones cortas,
// cediendo el control entre una y otra en vez de una sola operación monolítica.
async function porLotes<T, R>(items: T[], tam: number, fn: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += tam) {
    out.push(...(await fn(items.slice(i, i + tam))))
  }
  return out
}

// ---------------------------------------------------------------------------
// Helper — existencias por SKU (misma lógica que /caja/productos)
// ---------------------------------------------------------------------------

async function existenciasPorSku(
  inventoryModule: any,
  skus: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!skus.length) return map
  const LOTE = 500
  const items = await porLotes<string, any>(skus, LOTE, (lote) => // eslint-disable-line @typescript-eslint/no-explicit-any
    inventoryModule.listInventoryItems(
      { sku: lote },
      { select: ["id", "sku"], take: lote.length + 10 }
    )
  )
  if (!items.length) return map
  const itemIds = items.map((i: any) => i.id)
  const niveles = await porLotes<string, any>(itemIds, LOTE, (lote) => // eslint-disable-line @typescript-eslint/no-explicit-any
    inventoryModule.listInventoryLevels(
      { inventory_item_id: lote },
      { select: ["inventory_item_id", "stocked_quantity"], take: lote.length + 10 }
    )
  )
  const itemPorId = new Map<string, string>(items.map((i: any) => [i.id, i.sku] as [string, string]))
  for (const nivel of niveles) {
    const sku = itemPorId.get(nivel.inventory_item_id)
    if (sku) map.set(sku, (map.get(sku) ?? 0) + (nivel.stocked_quantity ?? 0))
  }
  return map
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// slugify canónico de lib/text con la longitud histórica de esta ruta (100).
function slugify(text: string): string {
  return slugifyText(text, 100)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaNum(meta: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = Number(meta[k])
    if (!isNaN(v)) return v
  }
  return 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaStr(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (meta[k] !== undefined && meta[k] !== null) return String(meta[k])
  }
  return ""
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaBool(meta: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    if (meta[k] !== undefined) return Boolean(meta[k])
  }
  return false
}

// Presentaciones del artículo especial (a granel). Se guardan como array JSON en
// metadata. Cada una: { id, nombre, precio (s/IVA), factor (equiv. en unidad base,
// opcional para el descuento informativo), agotado }. Saneamos al leer para tolerar
// datos viejos o corruptos sin romper el mapeo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metaPresentaciones(meta: Record<string, unknown>): any[] {
  const raw = meta["presentaciones"]
  if (!Array.isArray(raw)) return []
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({
      id: String(p?.id ?? ""),
      nombre: String(p?.nombre ?? ""),
      precio: Number(p?.precio) || 0,
      factor: p?.factor === "" || p?.factor == null ? null : Number(p.factor) || 0,
      agotado: Boolean(p?.agotado),
    }))
    .filter((p) => p.nombre !== "")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function thumbnailPath(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname
  } catch {
    return url.startsWith("/") ? url : null
  }
}

// Map Medusa product + variant + precio1 + existencia → ArticuloPOS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArticuloPOS(product: any, variant: any, precio1: number, existencia: number = 0): object {
  const meta = (product.metadata ?? {}) as Record<string, unknown>

  // Imágenes desde product.images[] (campo nativo de Medusa — portable a S3/CDN)
  // Convertimos a rutas relativas con thumbnailPath() para que funcionen en LAN y producción
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imagenes: string[] = ((product.images ?? []) as any[])
    .map((img: any) => thumbnailPath(img.url) ?? img.url)
    .filter(Boolean)

  // thumbnail: campo nativo de Medusa (catálogo importado) o primera imagen POS
  const thumb = thumbnailPath(product.thumbnail) ?? imagenes[0] ?? null

  return {
    id: product.id,
    clave: variant?.sku ?? "",
    claveAlterna: variant?.barcode ?? metaStr(meta, "claveAlterna"),
    descripcion: product.title ?? "",
    marca: metaStr(meta, "marca"),
    especificaciones: Array.isArray(meta.especificaciones) ? meta.especificaciones : [],
    categoria: product.categories?.[0]?.name ?? metaStr(meta, "categoria"),
    departamento: metaStr(meta, "departamento"),
    unidadCompra: metaStr(meta, "unidadCompra") || "Pieza",
    unidadVenta: metaStr(meta, "unidadVenta") || "Pieza",
    factor: metaNum(meta, "factor") || 1,
    aplicarIva: metaBool(meta, "impuesto"),
    precioCompra: metaNum(meta, "precio_compra", "precioCompra"),
    precioNeto: metaBool(meta, "precioNeto"),
    precio1,
    precio2: metaNum(meta, "precio2"),
    precio3: metaNum(meta, "precio3"),
    precio4: metaNum(meta, "precio4"),
    // Precios de la UNIDAD DE VENTA (ej. Metro), independientes de los de arriba
    // (unidad de COMPRA, ej. Rollo). Solo tienen sentido cuando unidadVenta !=
    // unidadCompra. Sin relación matemática automática — el admin los captura a
    // mano. `margenVenta` = % que precioVenta1 representa de precio1 al momento
    // de capturarlo, guardado para que una futura precarga de factura (que
    // actualiza precio1..4) pueda recalcular precioVenta1..4 respetando la
    // proporción que el admin ya había fijado, sin recapturar a mano.
    precioVenta1: metaNum(meta, "precioVenta1"),
    precioVenta2: metaNum(meta, "precioVenta2"),
    precioVenta3: metaNum(meta, "precioVenta3"),
    precioVenta4: metaNum(meta, "precioVenta4"),
    margenVenta: metaNum(meta, "margenVenta"),
    claveSat: metaStr(meta, "claveSat"),
    proveedor: metaStr(meta, "proveedor"),
    proveedor_id: metaStr(meta, "proveedor_id"),
    inventarioMin: metaNum(meta, "inventarioMin", "invMin"),
    inventarioMax: metaNum(meta, "inventarioMax", "invMax"),
    localizacion: metaStr(meta, "localizacion"),
    peso: product.weight ? product.weight / 1000 : metaNum(meta, "peso"),
    ventaGranel: metaBool(meta, "granel", "ventaGranel"),
    // Artículo especial (a granel): inventario informativo + presentaciones
    // (padre→hijos) + interruptor manual de disponibilidad. Ver ArticleDrawer.
    esGranel: metaBool(meta, "esGranel"),
    agotado: metaBool(meta, "agotado"),
    // Disponibilidad SOLO de la unidad base (m³ = el Precio 1 del artículo) como
    // forma de venta propia en el modal, independiente de las presentaciones hijas.
    agotadoBase: metaBool(meta, "agotadoBase"),
    unidadBase: metaStr(meta, "unidadBase"),
    presentaciones: metaPresentaciones(meta),
    mayoreoActivo: metaBool(meta, "mayoreoActivo"),
    mayoreoMin: metaNum(meta, "mayoreoMin"),
    thumbnail: thumb,
    imagenes,
    existencia,
  }
}

// ---------------------------------------------------------------------------
// Búsqueda fonética (normalizarFonetico canónico desde lib/text)
// ---------------------------------------------------------------------------

function palabrasQuery(q: string): string[] {
  return normalizarFonetico(q)
    .split(" ")
    .filter((w) => w.length >= 2)
}

/**
 * Valida los campos críticos de un artículo en POST/PUT. Devuelve un mensaje de
 * error o null si es válido.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validarArticulo(body: any): string | null {
  const clave = typeof body?.clave === "string" ? body.clave.trim() : ""
  if (!clave) return "La clave (SKU) es obligatoria"
  // '/' y '\' se permiten: son parte de medidas fraccionadas en códigos reales
  // (ej. "TTG3/161", "torcoche5/16x2"). El SKU nunca se usa como ruta de archivo
  // en disco (el thumbnail tiene su propio nombre generado), así que no hay
  // riesgo de path traversal aquí. Solo bloqueamos '..' como defensa en profundidad.
  if (clave.includes("..")) return "La clave no puede contener '..'"
  if (typeof body?.descripcion !== "string" || !body.descripcion.trim()) {
    return "La descripción es obligatoria"
  }
  for (const campo of ["precio1", "precio2", "precio3", "precio4", "precioCompra"]) {
    const v = body?.[campo]
    if (v != null && (typeof v !== "number" || v < 0 || Number.isNaN(v))) {
      return `El campo ${campo} no puede ser negativo`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// GET — listar todos los artículos (con búsqueda fonética multi-palabra)
// ---------------------------------------------------------------------------

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const q = String(req.query["q"] ?? "").trim()
  const faltantes = req.query["faltantes"] === "1"

  // ── Modo faltantes: artículos con existencia < inventarioMin ─────────────────
  if (faltantes && !q) {
    const [allProds, allVars] = await Promise.all([
      productosPublicadosMeta(productModule),
      productModule.listProductVariants(
        {},
        { select: ["id", "sku", "product_id"], take: 99999 }
      ),
    ])

    // Primer variant por producto
    const variantByProduct = new Map<string, any>()
    for (const v of allVars as any[]) {
      if (v.product_id && !variantByProduct.has(v.product_id)) {
        variantByProduct.set(v.product_id, v)
      }
    }

    // Inventario de todos los SKUs
    const allSkus = (allVars as any[]).map((v) => v.sku).filter(Boolean) as string[]
    const stockPorSku = await existenciasPorSku(inventoryModule, allSkus)

    // Filtrar productos bajo mínimo
    const faltanteIds: string[] = []
    for (const p of allProds as any[]) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      const invMin = metaNum(meta, "inventarioMin", "invMin")
      if (invMin <= 0) continue
      const variant = variantByProduct.get(p.id)
      const existencia = variant?.sku ? (stockPorSku.get(variant.sku) ?? 0) : 0
      if (existencia < invMin) faltanteIds.push(p.id)
    }

    if (faltanteIds.length === 0) { res.json([]); return }

    const faltantesProds = await productModule.listProducts(
      { id: faltanteIds },
      { select: ["id", "title", "thumbnail", "weight", "metadata"], relations: ["variants", "categories", "images"], take: faltanteIds.length + 10 }
    )

    const fVarIds = (faltantesProds as any[]).flatMap((p) => (p.variants as any[])?.map((v) => v.id) ?? [])
    const { data: fVarsPrecio } = await query.graph({
      entity: "product_variant",
      filters: { id: fVarIds },
      fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
      pagination: { take: fVarIds.length + 10 },
    })

    const precioPorVarId = new Map<string, number>()
    for (const v of fVarsPrecio) {
      const precios: any[] = (v as any).price_set?.prices ?? []
      const mxn = precios.find((p) => p.currency_code === "mxn")?.amount
      if (mxn !== undefined) precioPorVarId.set(v.id, amountAPesos(mxn))
    }

    const result = (faltantesProds as any[]).map((p) => {
      const variant = (p.variants as any[])?.[0]
      const precio1 = variant ? (precioPorVarId.get(variant.id) ?? 0) : 0
      const existencia = variant?.sku ? (stockPorSku.get(variant.sku) ?? 0) : 0
      return toArticuloPOS(p, variant, precio1, existencia)
    })

    result.sort((a: any, b: any) => a.descripcion.localeCompare(b.descripcion, "es"))
    res.json(result)
    return
  }

  // ── Filtro "SIN CLASIFICAR" ──────────────────────────────────────────────────
  // Lista productos a los que les FALTA un campo (departamento / proveedor), para
  // poder alcanzarlos y clasificarlos. Sin esto, un producto sin depto/proveedor
  // sería invisible en los asistentes que filtran por taxonomía. Limitado a
  // MAX_SIN para no traer decenas de miles de golpe (avisa si se recortó).
  const sinCampo = String(req.query["sin"] ?? "").trim() // departamento|categoria|marca|proveedor
  if (!q && !faltantes && sinCampo) {
    const MAX_SIN = 500
    const todos = await productModule.listProducts(
      { status: ProductStatus.PUBLISHED },
      { select: ["id", "title", "metadata"], relations: ["categories"], take: 99999 }
    ) as any[]

    const vacio = (v: unknown) => !(typeof v === "string" && v.trim())
    const faltan = todos.filter((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      if (sinCampo === "departamento") return vacio(meta.departamento)
      if (sinCampo === "marca")        return vacio(meta.marca)
      if (sinCampo === "proveedor")    return vacio(meta.proveedor_id) && vacio(meta.proveedor)
      // Categoría: nativa de Medusa. Sin categoría = sin relación de categorías.
      if (sinCampo === "categoria")    return !((p.categories ?? []) as any[]).length && vacio(meta.categoria)
      return false
    })

    const recortado = faltan.length > MAX_SIN
    const ids = faltan.slice(0, MAX_SIN).map((p) => p.id)
    if (!ids.length) { res.json([]); return }

    const withRel = await productModule.listProducts(
      { id: ids },
      { select: ["id", "title", "thumbnail", "weight", "metadata"],
        relations: ["variants", "categories", "images"], take: ids.length + 10 }
    ) as any[]

    const sVarIds = withRel.flatMap((p) => (p.variants as any[])?.map((v: any) => v.id) ?? [])
    const { data: sVarsPrecios } = await query.graph({
      entity: "product_variant",
      filters: { id: sVarIds },
      fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
      pagination: { take: sVarIds.length + 10 },
    })
    const sPrecioMap = new Map<string, number>()
    for (const v of sVarsPrecios) {
      const mxn = ((v as any).price_set?.prices ?? []).find((p: any) => p.currency_code === "mxn")?.amount
      if (mxn !== undefined) sPrecioMap.set(v.id, amountAPesos(mxn))
    }
    const sSkus = withRel.flatMap((p) => (p.variants as any[])?.map((v: any) => v.sku).filter(Boolean) ?? []) as string[]
    const sStock = await existenciasPorSku(inventoryModule, sSkus)

    const sResult = withRel.map((p) => {
      const variant = (p.variants as any[])?.[0]
      const precio1 = variant ? (sPrecioMap.get(variant.id) ?? 0) : 0
      const existencia = variant?.sku ? (sStock.get(variant.sku) ?? 0) : 0
      return toArticuloPOS(p, variant, precio1, existencia)
    })
    sResult.sort((a: any, b: any) => a.descripcion.localeCompare(b.descripcion, "es"))
    // Header informativo si se recortó (el front lo puede leer para avisar).
    if (recortado) res.setHeader("X-Total-Sin-Clasificar", String(faltan.length))
    res.json(sResult)
    return
  }

  // ── Filtro por departamento y/o categoría (sin búsqueda de texto) ────────────
  // Usado por el módulo Catálogos → panel de Reasignación masiva.
  const departamentoFilter = String(req.query["departamento"] ?? "").trim()
  const categoriaFilter    = String(req.query["categoria"]    ?? "").trim()

  if (!q && !faltantes && (departamentoFilter || categoriaFilter)) {
    // Paso 1: obtener IDs de productos de esa categoría cargando la categoría
    // con sus productos (1 fila de categoría → rápido aunque tenga muchos productos)
    let productIdsDeCat: string[] | null = null
    if (categoriaFilter) {
      const foundCats = await productModule.listProductCategories(
        { name: categoriaFilter },
        { select: ["id", "name"], relations: ["products"], take: 10 }
      )
      if (!(foundCats as any[]).length) { res.json([]); return }
      productIdsDeCat = (foundCats as any[]).flatMap((c) =>
        ((c.products ?? []) as any[]).map((p: any) => p.id)
      )
      if (!productIdsDeCat.length) { res.json([]); return }
    }

    // Paso 2: si solo hay filtro de dept (sin cat), cargar todos los productos
    // con metadata y filtrar en JS. Si hay catIds, cargar solo esos IDs.
    let allMeta: any[]
    if (productIdsDeCat) {
      // Productos de la categoría: conjunto pequeño, podemos cargar con relaciones
      allMeta = await productModule.listProducts(
        { id: productIdsDeCat },
        {
          select: ["id", "title", "thumbnail", "weight", "metadata"],
          relations: ["variants", "categories", "images"],
          take: productIdsDeCat.length + 10,
        }
      ) as any[]
    } else {
      // Solo filtro de departamento: metadata cacheada (ver productos-meta-cache) —
      // esta consulta sin cache tardaba minutos en departamentos grandes (15k+ arts.).
      allMeta = await productosPublicadosMeta(productModule)
    }

    // Paso 3: filtrar por departamento en memoria
    const filtered = departamentoFilter
      ? allMeta.filter((p) => {
          const meta = (p.metadata ?? {}) as Record<string, unknown>
          return (meta.departamento as string | undefined)?.trim() === departamentoFilter
        })
      : allMeta

    if (!filtered.length) { res.json([]); return }

    // Paso 4: si vinieron sin relaciones (solo-dept), cargar con relaciones los
    // matching — EN LOTES (ver porLotes arriba: un solo IN de miles de IDs con
    // joins bloqueaba el event loop varios minutos de corrido).
    const LOTE = 500
    let withRelations: any[]
    if (!productIdsDeCat) {
      const matchIds = filtered.map((p: any) => p.id)
      withRelations = await porLotes(matchIds, LOTE, (lote) =>
        productModule.listProducts(
          { id: lote },
          {
            select: ["id", "title", "thumbnail", "weight", "metadata"],
            relations: ["variants", "categories", "images"],
            take: lote.length + 10,
          }
        )
      )
    } else {
      withRelations = filtered
    }

    if (!withRelations.length) { res.json([]); return }

    // Paso 5: precios y existencias (también en lotes por la misma razón)
    const fVarIds = withRelations.flatMap((p: any) => (p.variants as any[])?.map((v: any) => v.id) ?? [])
    const fVarsPrecios = await porLotes(fVarIds, LOTE, async (lote) => {
      const { data } = await query.graph({
        entity: "product_variant",
        filters: { id: lote },
        fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
        pagination: { take: lote.length + 10 },
      })
      return data
    })
    const fPrecioMap = new Map<string, number>()
    for (const v of fVarsPrecios) {
      const mxn = ((v as any).price_set?.prices ?? []).find((p: any) => p.currency_code === "mxn")?.amount
      if (mxn !== undefined) fPrecioMap.set(v.id, amountAPesos(mxn))
    }
    const fSkus = withRelations.flatMap((p: any) => (p.variants as any[])?.map((v: any) => v.sku).filter(Boolean) ?? []) as string[]
    const fStock = await existenciasPorSku(inventoryModule, fSkus)

    const fResult = withRelations.map((p: any) => {
      const variant = (p.variants as any[])?.[0]
      const precio1 = variant ? (fPrecioMap.get(variant.id) ?? 0) : 0
      const existencia = variant?.sku ? (fStock.get(variant.sku) ?? 0) : 0
      return toArticuloPOS(p, variant, precio1, existencia)
    })
    fResult.sort((a: any, b: any) => a.descripcion.localeCompare(b.descripcion, "es"))
    res.json(fResult)
    return
  }

  if (!q) {
    res.json([])
    return
  }

  const palabras = palabrasQuery(q)
  const qRaw = q.toLowerCase()

  // ── Paso 1: cargar todo sin relaciones (rápido) ─────────────────────────────
  // Queries puramente numéricas (SKU / código de barras) se buscan SOLO por
  // código, sin matching fonético sobre títulos (evita falsos positivos).
  const isNumeric = /^[\d\-\s]+$/.test(q)

  const [allProducts, allVariants] = await Promise.all([
    isNumeric
      ? Promise.resolve([])   // no hace falta cargar todos los productos
      : productModule.listProducts(
          {},
          { select: ["id", "title", "metadata"], take: 99999 }
        ),
    productModule.listProductVariants(
      {},
      // barcode incluido para búsqueda por código de barras
      { select: ["id", "sku", "barcode", "product_id"], take: 99999 }
    ),
  ])

  // Índice SKU → product_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skuToProductId = new Map<string, string>(
    allVariants
      .filter((v: any) => v.sku && v.product_id)
      .map((v: any) => [v.sku.toLowerCase(), v.product_id])
  )

  // Índice barcode → product_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const barcodeToProductId = new Map<string, string>(
    allVariants
      .filter((v: any) => v.barcode && v.product_id)
      .map((v: any) => [v.barcode.toLowerCase(), v.product_id])
  )

  // ── Paso 2: filtrar en JS ───────────────────────────────────────────────────
  const matchIds = new Set<string>()

  // Búsqueda por SKU (partial match)
  for (const [sku, productId] of skuToProductId) {
    if (sku.includes(qRaw)) matchIds.add(productId)
  }

  // Búsqueda por barcode (exact o partial)
  for (const [barcode, productId] of barcodeToProductId) {
    if (barcode === qRaw || barcode.includes(qRaw)) matchIds.add(productId)
  }

  if (!isNumeric) {
    // Búsqueda fonética por título / departamento solo para queries con letras
    for (const p of allProducts) {
      const meta = (p.metadata ?? {}) as Record<string, unknown>
      const titleNorm = normalizarFonetico(p.title ?? "")
      const deptNorm  = normalizarFonetico(String(meta.departamento ?? ""))
      const clavAlt   = String(meta.claveAlterna ?? "").toLowerCase()

      if (palabras.length > 0 && palabras.every((pal) => titleNorm.includes(pal) || deptNorm.includes(pal))) {
        matchIds.add(p.id)
        continue
      }
      if (clavAlt && clavAlt.includes(qRaw)) matchIds.add(p.id)
    }
  }

  if (matchIds.size === 0) {
    res.json([])
    return
  }

  // ── Paso 3: cargar solo los que coinciden, con relaciones ───────────────────
  const ids = [...matchIds]
  const products = await productModule.listProducts(
    { id: ids },
    {
      select: ["id", "title", "thumbnail", "weight", "metadata"],
      relations: ["variants", "categories", "images"],
      take: ids.length + 10,
    }
  )

  // ── Paso 4: precios vía query.graph ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variantIds = products.flatMap((p) => (p.variants as any[])?.map((v) => v.id) ?? [])

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
    if (mxn !== undefined) precioPorVariantId.set(v.id, amountAPesos(mxn))
  }

  // ── Paso 5: existencias por SKU ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skus = products.flatMap((p) => (p.variants as any[])?.map((v) => v.sku).filter(Boolean) ?? []) as string[]
  const stockPorSku = await existenciasPorSku(inventoryModule, skus)

  const result = products.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variant = (p.variants as any[])?.[0]
    const precio1 = variant ? (precioPorVariantId.get(variant.id) ?? 0) : 0
    const existencia = variant?.sku ? (stockPorSku.get(variant.sku) ?? 0) : 0
    return toArticuloPOS(p, variant, precio1, existencia)
  })

  // Relevancia respecto al término LITERAL escrito (qRaw), para que un match
  // exacto gane al match solo fonético. Ej: buscar "brocha" debe rankear las
  // "Brocha…" por encima de las "Broca…" (que solo coinciden por la 'h' muda).
  // Menor puntaje = más relevante.
  const relevancia = (a: any): number => {
    const desc = String(a.descripcion ?? "").toLowerCase()
    const sku = String(a.clave ?? "").toLowerCase()
    if (sku === qRaw || desc === qRaw) return 0           // match exacto
    if (desc.startsWith(qRaw)) return 1                   // empieza con el término
    if (sku.startsWith(qRaw)) return 2                    // SKU empieza con el término
    if (desc.includes(` ${qRaw}`) || desc.includes(qRaw)) return 3 // contiene el término literal
    return 4                                              // solo match fonético
  }

  // Ordenar: 1º relevancia literal, 2º con existencia, 3º alfabético.
  result.sort((a: any, b: any) => {
    const ra = relevancia(a), rb = relevancia(b)
    if (ra !== rb) return ra - rb
    const aStock = a.existencia > 0 ? 1 : 0
    const bStock = b.existencia > 0 ? 1 : 0
    if (bStock !== aStock) return bStock - aStock
    return a.descripcion.localeCompare(b.descripcion, "es")
  })

  res.json(result)
}

// ---------------------------------------------------------------------------
// POST — crear artículo
// ---------------------------------------------------------------------------

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any

  // Validación de campos críticos (API-I6): sin esto se podían crear productos
  // sin SKU (inencontrables por inventario), sin título, o con precio negativo.
  const errorVal = validarArticulo(body)
  if (errorVal) {
    res.status(400).json({ error: errorVal })
    return
  }

  // Buscar o crear categoría
  let categoryId: string | null = null
  if (body.categoria) {
    const cats = await productModule.listProductCategories(
      { name: [body.categoria] },
      { take: 1 }
    )
    if (cats.length > 0) {
      categoryId = cats[0].id
    } else {
      const [newCat] = await productModule.createProductCategories([
        { name: body.categoria, is_active: true },
      ])
      categoryId = newCat.id
    }
  }

  const handle = `${slugify(body.clave ?? "art")}-${Date.now()}`
  // imagenes son URLs absolutas devueltas por /caja/imagen (ya subidas al file module)
  const imagenes: string[] = Array.isArray(body.imagenes) ? body.imagenes : []

  // El tipo CreateProductVariantDTO no incluye `prices`, pero Medusa 2.x lo
  // acepta en runtime (crea el price set del variant). Cast para el build de prod.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [product] = await productModule.createProducts([
    {
      title: body.descripcion,
      handle,
      status: ProductStatus.PUBLISHED,
      category_ids: categoryId ? [categoryId] : [],
      weight: body.peso > 0 ? Math.round(body.peso * 1000) : undefined,
      thumbnail: imagenes[0] ?? undefined,
      images: imagenes.map((url) => ({ url })),   // campo nativo de Medusa
      metadata: {
        departamento: body.departamento ?? "",
        unidadCompra: body.unidadCompra ?? "Pieza",
        unidadVenta: body.unidadVenta ?? "Pieza",
        factor: body.factor ?? 1,
        impuesto: body.aplicarIva ?? false,
        granel: body.ventaGranel ?? false,
        // Artículo especial (a granel): inventario informativo + presentaciones.
        esGranel: body.esGranel ?? false,
        agotado: body.agotado ?? false,
        agotadoBase: body.agotadoBase ?? false,
        unidadBase: body.unidadBase ?? "",
        presentaciones: Array.isArray(body.presentaciones) ? body.presentaciones : [],
        precioNeto: body.precioNeto ?? false,
        precio_compra: body.precioCompra ?? 0,
        precio2: body.precio2 ?? 0,
        precio3: body.precio3 ?? 0,
        precio4: body.precio4 ?? 0,
        precioVenta1: body.precioVenta1 ?? 0,
        precioVenta2: body.precioVenta2 ?? 0,
        precioVenta3: body.precioVenta3 ?? 0,
        precioVenta4: body.precioVenta4 ?? 0,
        margenVenta: body.margenVenta ?? 0,
        claveSat: body.claveSat ?? "",
        proveedor: body.proveedor ?? "",
        proveedor_id: body.proveedor_id ?? "",
        inventarioMin: body.inventarioMin ?? 0,
        inventarioMax: body.inventarioMax ?? 0,
        localizacion: body.localizacion ?? "",
        claveAlterna: body.claveAlterna ?? "",
        marca: body.marca ?? "",
        especificaciones: body.especificaciones ?? [],
        mayoreoActivo: body.mayoreoActivo ?? false,
        mayoreoMin: body.mayoreoMin ?? 0,
      },
      variants: [
        {
          title: body.descripcion,
          sku: body.clave,
          barcode: body.claveAlterna || undefined,
          manage_inventory: true,
          // Granel = inventario informativo: se permite backorder para que el
          // descuento pueda dejar el stock en negativo sin bloquear la venta.
          allow_backorder: body.esGranel ?? false,
          prices:
            body.precio1 > 0
              ? [{ amount: pesosAAmount(body.precio1), currency_code: "mxn" }]
              : [],
        },
      ],
    },
  ] as any)

  const full = await productModule.retrieveProduct(product.id, {
    select: ["id", "title", "thumbnail", "weight", "metadata"],
    relations: ["variants", "categories", "images"],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variant = (full.variants as any[])?.[0]
  invalidarProductosMetaCache()
  res.status(201).json(toArticuloPOS(full, variant, body.precio1 ?? 0))
}

// ---------------------------------------------------------------------------
// PUT — actualizar artículo
// ---------------------------------------------------------------------------

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any

  if (!body.id) {
    res.status(400).json({ error: "Se requiere id" })
    return
  }
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(body.id)) {
    res.status(400).json({ error: "id inválido" })
    return
  }
  // Validar el artículo (el PUT envía el objeto completo desde el Drawer).
  const errorVal = validarArticulo(body)
  if (errorVal) {
    res.status(400).json({ error: errorVal })
    return
  }
  // Verificar existencia antes de actualizar (API-I7): updateProducts sobre un id
  // inexistente lanza un error poco claro; un 404 explícito es más útil.
  try {
    await productModule.retrieveProduct(body.id)
  } catch {
    res.status(404).json({ error: "Artículo no encontrado" })
    return
  }

  // Buscar o crear categoría
  let categoryId: string | null = null
  if (body.categoria) {
    const cats = await productModule.listProductCategories(
      { name: [body.categoria] },
      { take: 1 }
    )
    categoryId =
      cats.length > 0
        ? cats[0].id
        : (
            await productModule.createProductCategories([
              { name: body.categoria, is_active: true },
            ])
          )[0].id
  }

  const imagenesUpd: string[] = Array.isArray(body.imagenes) ? body.imagenes : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    title: body.descripcion,
    weight: body.peso > 0 ? Math.round(body.peso * 1000) : 0,
    category_ids: categoryId ? [categoryId] : [],
    // Si el frontend mandó imágenes nuevas, la primera es el thumbnail.
    // Si no (p.ej. productos importados sin images[]), conservar body.thumbnail para
    // no borrar el thumbnail que asignó attach:imagenes al importar el catálogo.
    thumbnail: imagenesUpd[0] ?? (body.thumbnail || null),
    metadata: {
      departamento: body.departamento ?? "",
      unidadCompra: body.unidadCompra ?? "Pieza",
      unidadVenta: body.unidadVenta ?? "Pieza",
      factor: body.factor ?? 1,
      impuesto: body.aplicarIva ?? false,
      granel: body.ventaGranel ?? false,
      // Artículo especial (a granel): inventario informativo + presentaciones.
      esGranel: body.esGranel ?? false,
      agotado: body.agotado ?? false,
      unidadBase: body.unidadBase ?? "",
      presentaciones: Array.isArray(body.presentaciones) ? body.presentaciones : [],
      precioNeto: body.precioNeto ?? false,
      precio_compra: body.precioCompra ?? 0,
      precio2: body.precio2 ?? 0,
      precio3: body.precio3 ?? 0,
      precio4: body.precio4 ?? 0,
      precioVenta1: body.precioVenta1 ?? 0,
      precioVenta2: body.precioVenta2 ?? 0,
      precioVenta3: body.precioVenta3 ?? 0,
      precioVenta4: body.precioVenta4 ?? 0,
      margenVenta: body.margenVenta ?? 0,
      claveSat: body.claveSat ?? "",
      proveedor: body.proveedor ?? "",
      proveedor_id: body.proveedor_id ?? "",
      inventarioMin: body.inventarioMin ?? 0,
      inventarioMax: body.inventarioMax ?? 0,
      localizacion: body.localizacion ?? "",
      claveAlterna: body.claveAlterna ?? "",
      marca: body.marca ?? "",
      especificaciones: body.especificaciones ?? [],
      mayoreoActivo: body.mayoreoActivo ?? false,
      mayoreoMin: body.mayoreoMin ?? 0,
    },
  }

  // Solo incluir `images` si el frontend mandó imágenes nuevas. Pasar `images: undefined`
  // rompe en @medusajs/product 2.13.5 (MikroORM rechaza un valor undefined en assign),
  // así que omitimos la propiedad para conservar el array existente sin tocarlo.
  if (imagenesUpd.length > 0) {
    updateData.images = imagenesUpd.map((url) => ({ url }))
  }

  await productModule.updateProducts(body.id, updateData)

  // Actualizar variante
  const productWithVariants = await productModule.retrieveProduct(body.id, {
    relations: ["variants"],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variant = (productWithVariants.variants as any[])?.[0]

  if (variant) {
    await productModule.updateProductVariants(variant.id, {
      sku: body.clave,
      barcode: body.claveAlterna || null,
      title: body.descripcion,
      // Granel = inventario informativo: permite backorder (stock negativo) para
      // que el descuento no bloquee la venta. Al volver a artículo normal se apaga.
      allow_backorder: body.esGranel ?? false,
    })

    // Actualizar precio en el price set
    if (body.precio1 > 0) {
      const { data: varData } = await query.graph({
        entity: "product_variant",
        filters: { id: [variant.id] },
        fields: [
          "id",
          "price_set.id",
          "price_set.prices.id",
          "price_set.prices.currency_code",
        ],
        pagination: { take: 1 },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vd = varData[0] as any
      const priceSetId = vd?.price_set?.id
      if (priceSetId) {
        const pricingModule = req.scope.resolve(Modules.PRICING)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mxnPrice = (vd?.price_set?.prices ?? []).find((p: any) => p.currency_code === "mxn")
        if (mxnPrice) {
          // updatePrices existe en runtime pero no en el tipo IPricingModuleService
          // de Medusa 2.x (que expone updatePriceSets); cast del módulo a any.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (pricingModule as any).updatePrices([
            { id: mxnPrice.id, amount: pesosAAmount(body.precio1) },
          ])
        } else {
          await pricingModule.addPrices([
            {
              priceSetId,
              prices: [
                { amount: pesosAAmount(body.precio1), currency_code: "mxn" },
              ],
            },
          ])
        }
      }
    }
  }

  const updated = await productModule.retrieveProduct(body.id, {
    select: ["id", "title", "thumbnail", "weight", "metadata"],
    relations: ["variants", "categories", "images"],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedVariant = (updated.variants as any[])?.[0]

  // Calcular la existencia REAL del artículo para devolverla en la respuesta.
  // Sin esto, toArticuloPOS usaría el default existencia=0 y el frontend
  // (ArticlesModule) pisaría el stock correcto con 0 tras cada edición —
  // el PUT no toca inventario, así que el stock en BD sigue intacto; era un
  // bug puramente de visualización.
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const sku = updatedVariant?.sku
  const existencia = sku
    ? (await existenciasPorSku(inventoryModule, [sku])).get(sku) ?? 0
    : 0

  invalidarProductosMetaCache()
  res.json(toArticuloPOS(updated, updatedVariant, body.precio1 ?? 0, existencia))
}

// ---------------------------------------------------------------------------
// DELETE — eliminar artículo (?id=)
// ---------------------------------------------------------------------------

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  const id = String(req.query["id"] ?? "").trim()

  if (!id) {
    res.status(400).json({ error: "Se requiere ?id=" })
    return
  }
  // Validar formato del id y existencia antes de borrar (API-I7): deleteProducts
  // sobre un id inexistente puede devolver ok silenciosamente.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: "id inválido" })
    return
  }
  try {
    await productModule.retrieveProduct(id)
  } catch {
    res.status(404).json({ error: "Artículo no encontrado" })
    return
  }

  await productModule.deleteProducts([id])
  invalidarProductosMetaCache()
  res.json({ ok: true })
}
