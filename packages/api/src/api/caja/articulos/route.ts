import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"

// ---------------------------------------------------------------------------
// Helper — existencias por SKU (misma lógica que /caja/productos)
// ---------------------------------------------------------------------------

async function existenciasPorSku(
  inventoryModule: any,
  skus: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!skus.length) return map
  const items = await inventoryModule.listInventoryItems(
    { sku: skus },
    { select: ["id", "sku"], take: skus.length + 10 }
  )
  if (!items.length) return map
  const itemIds = items.map((i: any) => i.id)
  const niveles = await inventoryModule.listInventoryLevels(
    { inventory_item_id: itemIds },
    { select: ["inventory_item_id", "stocked_quantity"], take: itemIds.length + 10 }
  )
  const itemPorId = new Map(items.map((i: any) => [i.id, i.sku]))
  for (const nivel of niveles) {
    const sku = itemPorId.get(nivel.inventory_item_id)
    if (sku) map.set(sku, (map.get(sku) ?? 0) + (nivel.stocked_quantity ?? 0))
  }
  return map
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
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
    claveSat: metaStr(meta, "claveSat"),
    proveedor: metaStr(meta, "proveedor"),
    inventarioMin: metaNum(meta, "inventarioMin", "invMin"),
    inventarioMax: metaNum(meta, "inventarioMax", "invMax"),
    localizacion: metaStr(meta, "localizacion"),
    peso: product.weight ? product.weight / 1000 : metaNum(meta, "peso"),
    ventaGranel: metaBool(meta, "granel", "ventaGranel"),
    thumbnail: thumb,
    imagenes,
    existencia,
  }
}

// ---------------------------------------------------------------------------
// Búsqueda fonética (igual que /caja/productos)
// ---------------------------------------------------------------------------

function normalizarFonetico(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ll/g, "y")
    .replace(/qu/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/h/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function palabrasQuery(q: string): string[] {
  return normalizarFonetico(q)
    .split(" ")
    .filter((w) => w.length >= 2)
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
      productModule.listProducts(
        { status: ProductStatus.PUBLISHED },
        { select: ["id", "title", "thumbnail", "weight", "metadata"], take: 99999 }
      ),
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
      if (mxn !== undefined) precioPorVarId.set(v.id, mxn / 100)
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
      // Solo filtro de departamento: cargar todos con metadata, filtrar en JS
      allMeta = await productModule.listProducts(
        { status: ProductStatus.PUBLISHED },
        { select: ["id", "title", "thumbnail", "weight", "metadata"], take: 99999 }
      ) as any[]
    }

    // Paso 3: filtrar por departamento en memoria
    const filtered = departamentoFilter
      ? allMeta.filter((p) => {
          const meta = (p.metadata ?? {}) as Record<string, unknown>
          return (meta.departamento as string | undefined)?.trim() === departamentoFilter
        })
      : allMeta

    if (!filtered.length) { res.json([]); return }

    // Paso 4: si vinieron sin relaciones (solo-dept), cargar con relaciones los matching
    let withRelations: any[]
    if (!productIdsDeCat) {
      const matchIds = filtered.map((p: any) => p.id)
      withRelations = await productModule.listProducts(
        { id: matchIds },
        {
          select: ["id", "title", "thumbnail", "weight", "metadata"],
          relations: ["variants", "categories", "images"],
          take: matchIds.length + 10,
        }
      ) as any[]
    } else {
      withRelations = filtered
    }

    if (!withRelations.length) { res.json([]); return }

    // Paso 5: precios y existencias
    const fVarIds = withRelations.flatMap((p: any) => (p.variants as any[])?.map((v: any) => v.id) ?? [])
    const { data: fVarsPrecios } = await query.graph({
      entity: "product_variant",
      filters: { id: fVarIds },
      fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
      pagination: { take: fVarIds.length + 10 },
    })
    const fPrecioMap = new Map<string, number>()
    for (const v of fVarsPrecios) {
      const mxn = ((v as any).price_set?.prices ?? []).find((p: any) => p.currency_code === "mxn")?.amount
      if (mxn !== undefined) fPrecioMap.set(v.id, mxn / 100)
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
    if (mxn !== undefined) precioPorVariantId.set(v.id, mxn / 100)
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

  // Ordenar: primero con existencia > 0, luego alfabético
  result.sort((a: any, b: any) => {
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
        precioNeto: body.precioNeto ?? false,
        precio_compra: body.precioCompra ?? 0,
        precio2: body.precio2 ?? 0,
        precio3: body.precio3 ?? 0,
        precio4: body.precio4 ?? 0,
        claveSat: body.claveSat ?? "",
        proveedor: body.proveedor ?? "",
        inventarioMin: body.inventarioMin ?? 0,
        inventarioMax: body.inventarioMax ?? 0,
        localizacion: body.localizacion ?? "",
        claveAlterna: body.claveAlterna ?? "",
        marca: body.marca ?? "",
        especificaciones: body.especificaciones ?? [],
      },
      variants: [
        {
          title: body.descripcion,
          sku: body.clave,
          barcode: body.claveAlterna || undefined,
          manage_inventory: true,
          allow_backorder: false,
          prices:
            body.precio1 > 0
              ? [{ amount: Math.round(body.precio1 * 100), currency_code: "mxn" }]
              : [],
        },
      ],
    },
  ])

  const full = await productModule.retrieveProduct(product.id, {
    select: ["id", "title", "thumbnail", "weight", "metadata"],
    relations: ["variants", "categories", "images"],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variant = (full.variants as any[])?.[0]
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

  await productModule.updateProducts(body.id, {
    title: body.descripcion,
    weight: body.peso > 0 ? Math.round(body.peso * 1000) : 0,
    category_ids: categoryId ? [categoryId] : [],
    thumbnail: imagenesUpd[0] ?? null,
    images: imagenesUpd.map((url) => ({ url })),   // reemplaza el array completo
    metadata: {
      departamento: body.departamento ?? "",
      unidadCompra: body.unidadCompra ?? "Pieza",
      unidadVenta: body.unidadVenta ?? "Pieza",
      factor: body.factor ?? 1,
      impuesto: body.aplicarIva ?? false,
      granel: body.ventaGranel ?? false,
      precioNeto: body.precioNeto ?? false,
      precio_compra: body.precioCompra ?? 0,
      precio2: body.precio2 ?? 0,
      precio3: body.precio3 ?? 0,
      precio4: body.precio4 ?? 0,
      claveSat: body.claveSat ?? "",
      proveedor: body.proveedor ?? "",
      inventarioMin: body.inventarioMin ?? 0,
      inventarioMax: body.inventarioMax ?? 0,
      localizacion: body.localizacion ?? "",
      claveAlterna: body.claveAlterna ?? "",
      marca: body.marca ?? "",
      especificaciones: body.especificaciones ?? [],
    },
  })

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
          await pricingModule.updatePrices([
            { id: mxnPrice.id, amount: Math.round(body.precio1 * 100) },
          ])
        } else {
          await pricingModule.addPrices([
            {
              priceSetId,
              prices: [
                { amount: Math.round(body.precio1 * 100), currency_code: "mxn" },
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
  res.json(toArticuloPOS(updated, updatedVariant, body.precio1 ?? 0))
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

  await productModule.deleteProducts([id])
  res.json({ ok: true })
}
