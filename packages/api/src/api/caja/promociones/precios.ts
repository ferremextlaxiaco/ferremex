import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { amountAPesos } from "../../../lib/precio"

/**
 * Precios relevantes de un artículo para validar la regla de "no por debajo de
 * precio 4". Mismos criterios de IVA que /caja/productos (con IVA si impuesto),
 * para que la comparación sea consistente con lo que se cobra en el carrito.
 *   - precio1: precio mostrador (base sobre el que se calcula el descuento)
 *   - precio4: precio especial / piso (el descuento no puede dejar el precio
 *     efectivo por pieza por debajo de éste)
 */
export interface PreciosArticulo {
  precio1: number
  precio2: number
  precio3: number
  precio4: number
  impuesto: boolean
}

/**
 * Resuelve precio1 (de price_set) y precio4 (de metadata) por SKU, aplicando IVA
 * cuando el producto lo lleva. Una sola consulta por lote. SKUs inexistentes se
 * omiten del mapa.
 */
export async function resolverPreciosPorSku(
  scope: any,
  skus: string[]
): Promise<Map<string, PreciosArticulo>> {
  const map = new Map<string, PreciosArticulo>()
  const limpios = [...new Set(skus.map((s) => String(s).trim()).filter(Boolean))]
  if (limpios.length === 0) return map

  const productModule = scope.resolve(Modules.PRODUCT)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  // Variantes por SKU → su product_id (para leer metadata) y su id (para precios).
  const variantes = await productModule.listProductVariants(
    { sku: limpios },
    { select: ["id", "sku", "product_id"], take: limpios.length + 10 }
  )
  if (!variantes.length) return map

  const productIds = [...new Set(variantes.map((v: any) => v.product_id).filter(Boolean))]
  const productos = await productModule.listProducts(
    { id: productIds },
    { select: ["id", "metadata"], take: productIds.length + 10 }
  )
  const metaPorProd = new Map<string, any>(productos.map((p: any) => [p.id, p.metadata ?? {}]))

  // precio1 (mostrador) vía price_set, en MXN.
  const variantIds = variantes.map((v: any) => v.id)
  const { data: conPrecios } = await query.graph({
    entity: "product_variant",
    filters: { id: variantIds },
    fields: ["id", "price_set.prices.amount", "price_set.prices.currency_code"],
    pagination: { take: variantIds.length + 10 },
  })
  const precio1PorVariant = new Map<string, number>()
  for (const v of conPrecios) {
    const precios: any[] = (v as any).price_set?.prices ?? []
    const mxn = precios.find((p) => p.currency_code === "mxn")?.amount
    if (mxn !== undefined) precio1PorVariant.set(v.id, amountAPesos(mxn))
  }

  for (const v of variantes as any[]) {
    if (!v.sku) continue
    const meta = metaPorProd.get(v.product_id) ?? {}
    const impuesto = !!meta.impuesto
    const base1 = precio1PorVariant.get(v.id) ?? 0
    const f = impuesto ? 1.16 : 1
    const conIva = (n: number) => Math.round((Number(n) || 0) * f * 100) / 100
    map.set(v.sku, {
      precio1: Math.round(base1 * f * 100) / 100,
      precio2: conIva(meta.precio2),
      precio3: conIva(meta.precio3),
      precio4: conIva(meta.precio4),
      impuesto,
    })
  }
  return map
}

/** Un artículo cuyo descuento viola el piso de precio4. */
export interface ViolacionPiso {
  sku: string
  precio1: number
  precio4: number
  precioConPromo: number   // precio efectivo por pieza que produciría la promo
  descuentoMaxPct: number  // % máximo permitido (el que deja el precio en precio4)
}

/**
 * Precio EFECTIVO por pieza que la promo deja sobre un artículo beneficiado,
 * según el tipo. Misma lógica que el motor del frontend. null si el tipo/datos
 * no permiten calcularlo (no se valida ese artículo).
 */
function precioEfectivoPieza(
  promo: { tipo: string; porcentaje?: any; nivel_precio?: any; nxm_lleva?: any; nxm_paga?: any; volumen_desc?: any; descuentos_articulo?: any },
  pr: PreciosArticulo,
  precioNivel: (n: number) => number | undefined,
  sku: string
): number | null {
  const base = pr.precio1
  if (base <= 0) return null
  switch (promo.tipo) {
    case "porcentaje": {
      const pct = Number(promo.porcentaje) || 0
      if (pct <= 0) return null
      return Math.round(base * (1 - pct / 100) * 100) / 100
    }
    case "nivel_precio": {
      // En cruzada el nivel puede venir por artículo (descuentos_articulo).
      const ov = (promo.descuentos_articulo ?? {})[sku]
      const nivel = ov && ov.tipo === "nivel_precio" ? Number(ov.valor) : Number(promo.nivel_precio)
      const p = precioNivel(nivel)
      return p !== undefined && p > 0 ? Math.round(p * 100) / 100 : null
    }
    case "nxm": {
      const l = Number(promo.nxm_lleva) || 0
      const pa = Number(promo.nxm_paga) || 0
      if (!(l >= 2 && pa >= 1 && pa < l)) return null
      return Math.round((base * pa / l) * 100) / 100
    }
    case "volumen": {
      const d = Number(promo.volumen_desc) || 0
      if (!(d > 0)) return null
      return Math.round(base * (1 - d / 100) * 100) / 100
    }
    case "personalizado": {
      const d = (promo.descuentos_articulo ?? {})[sku]
      if (!d) return null
      const valor = Number(d.valor) || 0
      if (valor <= 0) return null
      if (d.tipo === "precio_fijo") return Math.round(valor * 100) / 100
      return Math.round(base * (1 - valor / 100) * 100) / 100 // porcentaje
    }
    default:
      return null
  }
}

/**
 * Revisa que NINGÚN artículo beneficiado quede por debajo de su precio4. Devuelve
 * la lista de violaciones (vacía = todo OK). `preciosNivel` debe poder dar
 * precio2/3/4 por SKU para el tipo nivel_precio.
 */
export function validarPisoPrecio4(
  promo: any,
  precios: Map<string, PreciosArticulo>,
  preciosNivel: (sku: string, n: number) => number | undefined
): ViolacionPiso[] {
  const violaciones: ViolacionPiso[] = []
  const skus: string[] =
    promo.modo_articulos === "cruzada" ? promo.skus_beneficiados ?? [] : promo.skus_requeridos ?? []
  for (const sku of skus) {
    const pr = precios.get(sku)
    if (!pr || pr.precio1 <= 0 || pr.precio4 <= 0) continue // sin datos suficientes
    const efectivo = precioEfectivoPieza(promo, pr, (n) => preciosNivel(sku, n), sku)
    if (efectivo === null) continue
    // Tolerancia de 1 centavo por redondeo.
    if (efectivo < pr.precio4 - 0.01) {
      violaciones.push({
        sku,
        precio1: pr.precio1,
        precio4: pr.precio4,
        precioConPromo: efectivo,
        descuentoMaxPct: Math.floor((1 - pr.precio4 / pr.precio1) * 100),
      })
    }
  }
  return violaciones
}
