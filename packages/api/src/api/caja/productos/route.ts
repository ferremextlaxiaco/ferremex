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

  type PresentacionGranel = { id: string; nombre: string; precio: number; factor: number | null; agotado: boolean }
  type VarianteBase = { id: string; sku: string | null; title: string | null; thumbnail: string | null; impuesto: boolean; marca: string; departamento: string; categoria: string; proveedor: string; proveedor_id: string; especificaciones: { clave: string; valor: string }[]; mayoreoActivo: boolean; mayoreoMin: number; precio2: number; precio3: number; precio4: number; precioVenta1: number; precioVenta2: number; precioVenta3: number; precioVenta4: number; granel: boolean; unidadVenta: string; unidadCompra: string; factor: number; esGranel: boolean; agotado: boolean; agotadoBase: boolean; unidadBase: string; presentaciones: PresentacionGranel[] }
  const variantesBase: VarianteBase[] = []

  // Sanea el array de presentaciones que viene en metadata (artículo especial).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leerPresentaciones = (meta: any): PresentacionGranel[] => {
    const raw = meta?.presentaciones
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
      .filter((p: PresentacionGranel) => p.nombre !== "")
  }
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
      let proveedor = ""
      let proveedor_id = ""
      let especificaciones: { clave: string; valor: string }[] = []
      let mayoreoActivo = false
      let mayoreoMin = 0
      let precio2 = 0
      let precio3 = 0
      let precio4 = 0
      let precioVenta1 = 0
      let precioVenta2 = 0
      let precioVenta3 = 0
      let precioVenta4 = 0
      let granel = false
      let unidadVenta = ""
      let unidadCompra = ""
      let factor = 1
      let esGranel = false
      let agotado = false
      let agotadoBase = false
      let unidadBase = ""
      let presentaciones: PresentacionGranel[] = []
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
          proveedor = meta.proveedor ?? ""
          proveedor_id = meta.proveedor_id ?? ""
          especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
          mayoreoActivo = !!meta.mayoreoActivo
          mayoreoMin = Number(meta.mayoreoMin) || 0
          precio2 = Number(meta.precio2) || 0
          precio3 = Number(meta.precio3) || 0
          precio4 = Number(meta.precio4) || 0
          precioVenta1 = Number(meta.precioVenta1) || 0
          precioVenta2 = Number(meta.precioVenta2) || 0
          precioVenta3 = Number(meta.precioVenta3) || 0
          precioVenta4 = Number(meta.precioVenta4) || 0
          // Venta fraccionada (granel): permite capturar cantidad/monto decimal.
          granel = !!meta.granel
          unidadVenta = meta.unidadVenta ?? meta.unidad_venta ?? "H87"
          unidadCompra = meta.unidadCompra ?? "H87"
          factor = Number(meta.factor) || 1
          // Artículo especial (a granel): presentaciones + disponibilidad manual.
          esGranel = !!meta.esGranel
          agotado = !!meta.agotado
          agotadoBase = !!meta.agotadoBase
          unidadBase = meta.unidadBase ?? ""
          presentaciones = leerPresentaciones(meta)
        } catch { /* sin metadata */ }
      }
      variantesBase.push({ id: varEncontrada.id, sku: varEncontrada.sku ?? null, title: varEncontrada.title ?? null, thumbnail, impuesto, marca, departamento, categoria, proveedor, proveedor_id, especificaciones, mayoreoActivo, mayoreoMin, precio2, precio3, precio4, precioVenta1, precioVenta2, precioVenta3, precioVenta4, granel, unidadVenta, unidadCompra, factor, esGranel, agotado, agotadoBase, unidadBase, presentaciones })
      // Solo cortocircuitamos (un único resultado, sin búsqueda por nombre) cuando
      // el match vino de un CÓDIGO REAL: un `?sku=` explícito o un código de barras
      // escaneado. Si el match vino del texto `q` que CASUALMENTE coincide con un
      // SKU (ej. escribes "estuco" y existe un producto con SKU "ESTUCO"), NO
      // cortamos: seguimos con la búsqueda por nombre para traer también los demás
      // productos cuyo TÍTULO contiene "estuco". La variante ya encontrada se
      // deduplica al final. (Bug: antes "estuco" traía 1 en vez de 5.)
      const matchPorBarcode = !varsPorSku[0] && !!varsPorBarcode[0]
      if (skuExacto || matchPorBarcode) matchExacto = true
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
      // Si hay filtro de categoría activo, restringimos a los productos de esa
      // categoría (mismo patrón de dos pasos que el bloque de búsqueda por nombre)
      // para que el SKU parcial no se salga del filtro que el usuario ya eligió.
      let idsCandidatos = partialProductIds
      if (categoryId) {
        const cats = await productModule.listProductCategories(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: [categoryId] } as any,
          { select: ["id"], relations: ["products"], take: 1 }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const idsDeCategoria = new Set(((cats[0] as any)?.products ?? []).map((p: any) => p.id as string))
        idsCandidatos = partialProductIds.filter((id) => idsDeCategoria.has(id))
      }

      if (idsCandidatos.length > 0) {
        const prods = await productModule.listProducts(
          { id: idsCandidatos },
          { select: ["id", "thumbnail", "metadata", "variants.id", "variants.sku", "variants.title"], relations: ["variants"], take: idsCandidatos.length + 10 }
        ) as any[]
        for (const p of prods) {
          const meta = (p.metadata ?? {}) as any
          // Filtro departamento (mismo criterio que el bloque de búsqueda por nombre)
          if (departamento && meta.departamento !== departamento) continue
          const thumb = thumbnailPath(p.thumbnail)
          for (const v of (p.variants ?? []) as any[]) {
            if (v.sku?.toLowerCase().includes(qLower)) {
              variantesBase.push({
                id: v.id, sku: v.sku ?? null, title: v.title ?? null, thumbnail: thumb,
                impuesto: !!meta.impuesto, marca: meta.marca ?? "",
                departamento: meta.departamento ?? "", categoria: meta.categoria ?? "",
                proveedor: meta.proveedor ?? "", proveedor_id: meta.proveedor_id ?? "",
                especificaciones: Array.isArray(meta.especificaciones) ? meta.especificaciones : [],
                mayoreoActivo: !!meta.mayoreoActivo, mayoreoMin: Number(meta.mayoreoMin) || 0,
                precio2: Number(meta.precio2) || 0,
                precio3: Number(meta.precio3) || 0,
                precio4: Number(meta.precio4) || 0,
                precioVenta1: Number(meta.precioVenta1) || 0,
                precioVenta2: Number(meta.precioVenta2) || 0,
                precioVenta3: Number(meta.precioVenta3) || 0,
                precioVenta4: Number(meta.precioVenta4) || 0,
                granel: !!meta.granel, unidadVenta: meta.unidadVenta ?? meta.unidad_venta ?? "H87",
                unidadCompra: meta.unidadCompra ?? "H87", factor: Number(meta.factor) || 1,
                esGranel: !!meta.esGranel, agotado: !!meta.agotado, agotadoBase: !!meta.agotadoBase,
                unidadBase: meta.unidadBase ?? "", presentaciones: leerPresentaciones(meta),
              })
            }
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

    // Si la búsqueda por nombre no encontró nada, no cortamos aquí: el bloque de
    // SKU parcial (arriba) puede haber aportado variantes a variantesBase.
    if (productosFiltrados.length > 0) {
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
        const proveedor = meta.proveedor ?? ""
        const proveedor_id = meta.proveedor_id ?? ""
        const especificaciones = Array.isArray(meta.especificaciones) ? meta.especificaciones : []
        const vMayoreoActivo = !!meta.mayoreoActivo
        const vMayoreoMin = Number(meta.mayoreoMin) || 0
        const vPrecio2 = Number(meta.precio2) || 0
        const vPrecio3 = Number(meta.precio3) || 0
        const vPrecio4 = Number(meta.precio4) || 0
        const vPrecioVenta1 = Number(meta.precioVenta1) || 0
        const vPrecioVenta2 = Number(meta.precioVenta2) || 0
        const vPrecioVenta3 = Number(meta.precioVenta3) || 0
        const vPrecioVenta4 = Number(meta.precioVenta4) || 0
        const vGranel = !!meta.granel
        const vUnidadVenta = meta.unidadVenta ?? meta.unidad_venta ?? "H87"
        const vUnidadCompra = meta.unidadCompra ?? "H87"
        const vFactor = Number(meta.factor) || 1
        const vEsGranel = !!meta.esGranel
        const vAgotado = !!meta.agotado
        const vAgotadoBase = !!meta.agotadoBase
        const vUnidadBase = meta.unidadBase ?? ""
        const vPresentaciones = leerPresentaciones(meta)
        for (const v of p.variants ?? []) {
          variantesBase.push({ id: v.id, sku: v.sku ?? null, title: v.title ?? null, thumbnail: thumb, impuesto, marca, departamento, categoria, proveedor, proveedor_id, especificaciones, mayoreoActivo: vMayoreoActivo, mayoreoMin: vMayoreoMin, precio2: vPrecio2, precio3: vPrecio3, precio4: vPrecio4, precioVenta1: vPrecioVenta1, precioVenta2: vPrecioVenta2, precioVenta3: vPrecioVenta3, precioVenta4: vPrecioVenta4, granel: vGranel, unidadVenta: vUnidadVenta, unidadCompra: vUnidadCompra, factor: vFactor, esGranel: vEsGranel, agotado: vAgotado, agotadoBase: vAgotadoBase, unidadBase: vUnidadBase, presentaciones: vPresentaciones })
        }
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
      // Precios de la UNIDAD DE VENTA (ej. Metro), independientes de los de arriba
      // (unidad de COMPRA, ej. Rollo). Capturados a mano en ArticleDrawer — sin
      // relación matemática automática con precio1-4. Ver /caja/articulos.
      const precioVenta1 = v.precioVenta1 > 0 && v.impuesto ? Math.round(v.precioVenta1 * 1.16 * 100) / 100 : v.precioVenta1
      const precioVenta2 = v.precioVenta2 > 0 && v.impuesto ? Math.round(v.precioVenta2 * 1.16 * 100) / 100 : v.precioVenta2
      const precioVenta3 = v.precioVenta3 > 0 && v.impuesto ? Math.round(v.precioVenta3 * 1.16 * 100) / 100 : v.precioVenta3
      const precioVenta4 = v.precioVenta4 > 0 && v.impuesto ? Math.round(v.precioVenta4 * 1.16 * 100) / 100 : v.precioVenta4
      return {
        sku: v.sku ?? "",
        descripcion: v.title ?? "",
        precio,
        precio2,
        precio3,
        precio4,
        precioVenta1,
        precioVenta2,
        precioVenta3,
        precioVenta4,
        // Si lleva IVA, `precio`/`precio2` ya vienen con el 16% incluido. El POS
        // usa este flag para desglosar base+IVA en el carrito y en el CFDI.
        impuesto: !!v.impuesto,
        existencia: existenciaPorSku.get(v.sku ?? "") ?? 0,
        thumbnail: v.thumbnail,
        marca: v.marca,
        departamento: v.departamento,
        categoria: v.categoria,
        // Proveedor del producto — necesario para el pedido automático de una
        // venta por encargo (Fase 3). Vacío si el producto no tiene proveedor.
        proveedor: v.proveedor,
        proveedor_id: v.proveedor_id,
        especificaciones: v.especificaciones,
        mayoreoActivo: v.mayoreoActivo,
        mayoreoMin: v.mayoreoMin,
        // Venta fraccionada (granel): el POS habilita captura de cantidad/monto
        // decimal en el carrito. `unidadVenta` (kg/m/L) se muestra junto a la cantidad.
        granel: v.granel,
        unidadVenta: v.unidadVenta,
        // Unidad de COMPRA + factor (ej. Rollo = 50 Metros). Cuando difieren de la
        // unidad de venta, el POS ofrece vender también por la presentación de
        // compra completa (a precio de mayoreo), con inventario REAL — a diferencia
        // del granel de abajo, aquí SÍ se valida/bloquea contra el stock (siempre
        // llevado en unidad de venta; no se migra el almacenamiento del stock).
        unidadCompra: v.unidadCompra,
        factor: v.factor,
        presentaCompraVenta: v.unidadCompra !== v.unidadVenta && v.factor > 1,
        // Artículo especial (a granel): presentaciones (padre→hijos) + disponibilidad
        // manual. El precio de cada presentación se guarda SIN IVA; se devuelve CON
        // IVA (×1.16) listo para mostrar, igual que `precio`. El descuento de
        // inventario es informativo (no bloquea) — ver /caja/ventas.
        esGranel: v.esGranel,
        agotado: v.agotado,
        agotadoBase: v.agotadoBase,
        unidadBase: v.unidadBase,
        presentaciones: v.presentaciones.map((p) => ({
          ...p,
          precio: p.precio > 0 && v.impuesto ? Math.round(p.precio * 1.16 * 100) / 100 : p.precio,
        })),
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
