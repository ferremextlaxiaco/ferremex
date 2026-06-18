import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { DatosFiscalesArticulo, ResolverFiscal } from "./cfdi-mapper"

/**
 * Construye un ResolverFiscal: dado un conjunto de SKUs, consulta los productos
 * de Medusa y devuelve, por SKU, sus datos fiscales (clave SAT, clave de unidad
 * SAT, si aplica IVA). Lo usa la ruta de facturación para mapear los items de una
 * venta —que NO guardan estos datos— al CFDI, sin importar si la venta es nueva
 * o histórica.
 *
 * Origen de los datos: product.metadata (claveSat, unidadVenta, impuesto), igual
 * que /caja/articulos. El SKU es la `sku` del variant.
 */

// Mapeo nombre de unidad → clave SAT (espejo de apps/pos/src/lib/unidades-sat.ts).
// La metadata puede guardar la unidad como nombre ("Pieza") o ya como clave SAT
// ("H87"); cubrimos ambos.
const UNIDAD_NOMBRE_A_CLAVE: Record<string, string> = {
  "pieza": "H87", "elemento": "EA", "kilogramo": "KGM", "gramo": "GRM",
  "tonelada": "TNE", "metro": "MTR", "metro cuadrado": "MTK", "metro cúbico": "MTQ",
  "litro": "LTR", "mililitro": "MLT", "caja": "XBX", "paquete": "XPK", "bolsa": "XBG",
  "rollo": "XRO", "docena": "DOZ", "juego": "SET", "par": "PR", "kit": "KT",
  "hoja": "XST", "botella": "BO",
}
const CLAVES_UNIDAD_VALIDAS = new Set(Object.values(UNIDAD_NOMBRE_A_CLAVE))

/** Normaliza la unidad guardada (nombre o clave) a una clave SAT. Default H87. */
function unidadAClaveSat(unidad: string): string {
  const u = (unidad ?? "").trim()
  if (!u) return "H87"
  if (CLAVES_UNIDAD_VALIDAS.has(u.toUpperCase())) return u.toUpperCase()
  return UNIDAD_NOMBRE_A_CLAVE[u.toLowerCase()] ?? "H87"
}

function metaStr(meta: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (meta[k] !== undefined && meta[k] !== null) return String(meta[k])
  }
  return ""
}
function metaBool(meta: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = meta[k]
    if (v === true || v === "true" || v === 1 || v === "1") return true
    if (v === false || v === "false" || v === 0 || v === "0") return false
  }
  return false
}

/**
 * Devuelve un ResolverFiscal para los SKUs dados. Resuelve consultando variants
 * (por sku) → su product.metadata. SKUs no encontrados quedan sin entrada (el
 * mapper aplica fallback genérico).
 */
export async function construirResolverFiscal(
  scope: any,
  skus: string[]
): Promise<ResolverFiscal> {
  const mapa = new Map<string, DatosFiscalesArticulo>()
  const unicos = [...new Set(skus.filter(Boolean))]
  if (unicos.length === 0) return () => undefined

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  // Traer los variants por sku con su producto (metadata). graph evita el
  // problema de que ProductVariant no expone metadata del product directamente.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["sku", "product.metadata"],
    filters: { sku: unicos },
  })

  for (const v of variants ?? []) {
    const sku = v?.sku
    if (!sku) continue
    const meta = (v?.product?.metadata ?? {}) as Record<string, unknown>
    mapa.set(sku, {
      claveSat: metaStr(meta, "claveSat"),
      claveUnidad: unidadAClaveSat(metaStr(meta, "unidadVenta", "unidadCompra")),
      unidadNombre: metaStr(meta, "unidadVenta") || undefined,
      aplicaIva: metaBool(meta, "impuesto", "aplicarIva"),
    })
  }

  return (sku: string) => mapa.get(sku)
}
