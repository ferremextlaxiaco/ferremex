// Motor de aplicación de promociones del POS.
//
// Por qué existe: el precio efectivo simple (paquete → mayoreo → base) lo resuelve
// `efectivoPrecio()` en pos-store. Pero las promociones NxM y por volumen NO son
// un precio unitario uniforme: dependen de la CANTIDAD de la línea y descuentan
// solo un subconjunto de unidades. Y las promos cruzadas (A→B) dependen de qué
// otros SKUs están en el carrito. Por eso el cálculo correcto es a nivel de
// carrito completo, no de un item aislado.
//
// Reglas (acordadas en el diseño):
//  - UNA sola promo por línea. Si varias aplican, gana la de mayor `prioridad`
//    (desempate: el mayor descuento en pesos para esa línea).
//  - La promo GANA sobre el mayoreo. El mayoreo sigue donde NO hay promo.
//  - Las líneas de paquete (`paquete_id`) NUNCA reciben promo (su precio manda).
//  - Sin promociones definidas/activas, el resultado es idéntico al actual
//    (mayoreo/base): RETROCOMPATIBLE.
//
// Consumidores: pos-store (total), Carrito (badge/hint por línea), ModalCobro
// (persistir descuento por línea). Datos: `listarPromociones()` de client.ts.

import type { CartItem } from "./pos-store"
import { efectivoPrecio } from "./pos-store"
import type { Cliente } from "./clientes"
import type { Promocion } from "./client"

/** Contexto mínimo del cliente activo que el motor necesita para segmentar. */
export interface ContextoCliente {
  id: string | null
  grupo: string | null
}

/** Resultado del cálculo de promociones para una línea del carrito. */
export interface LineaPromo {
  /** Importe total de la línea ya con la promo aplicada (cantidad × precio). */
  importe: number
  /** Precio unitario "vitrina" (referencia para mostrar; sin promo = base/mayoreo). */
  precioUnitarioBase: number
  /** Descuento en pesos sobre la línea respecto al importe sin promo. */
  descuento: number
  /** Promo aplicada a esta línea (null si ninguna). */
  promo: Promocion | null
  /** Etiqueta corta para mostrar en el carrito (vacío si no hay promo). */
  etiqueta: string
}

/** Deriva el contexto de segmentación desde el cliente activo del POS. */
export function contextoDeCliente(cliente: Cliente | null): ContextoCliente {
  return { id: cliente?.id ?? null, grupo: cliente?.grupo ?? null }
}

/**
 * Clave única de una línea del carrito para el mapa de promociones. Un mismo SKU
 * puede coexistir suelto y dentro de un paquete (el reducer intenta fusionarlos,
 * pero RESTORE_CART podría traer duplicados); por eso la clave combina sku +
 * paquete_id, evitando que una línea pise el resultado de otra.
 */
export function claveLinea(item: CartItem): string {
  return item.paquete_id ? `${item.sku}@@${item.paquete_id}` : item.sku
}

/** Hoy en formato YYYY-MM-DD (para comparar contra inicio/fin de vigencia). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ¿La promo está vigente HOY? (activa + dentro del rango inicio/fin si existe). */
export function promoVigente(p: Promocion, hoy = hoyISO()): boolean {
  if (!p.activa) return false
  if (p.inicio && hoy < p.inicio) return false
  if (p.fin && hoy > p.fin) return false
  return true
}

/** ¿La promo aplica al cliente/segmento activo? */
function aplicaSegmento(p: Promocion, ctx: ContextoCliente): boolean {
  if (p.segmento === "todos") return true
  if (p.segmento === "cliente") return !!ctx.id && p.cliente_id === ctx.id
  if (p.segmento === "grupo") return !!ctx.grupo && p.grupo === ctx.grupo
  return false
}

/**
 * Promociones VIGENTES en las que PARTICIPA un SKU (sea requerido o beneficiado),
 * filtradas por el segmento del cliente activo. Es INFORMATIVO: no exige que se
 * cumplan las condiciones (cantidad mínima, NxM, requeridos presentes) — sirve
 * para avisar "este artículo tiene promoción" en el detalle y el carrito, aunque
 * aún no aplique. Incluye ambos extremos de una promo cruzada A→B.
 */
export function promosDeArticulo(
  sku: string,
  promos: Promocion[],
  ctx: ContextoCliente
): Promocion[] {
  const hoy = hoyISO()
  return promos.filter(
    (p) =>
      promoVigente(p, hoy) &&
      aplicaSegmento(p, ctx) &&
      (p.skus_beneficiados.includes(sku) || p.skus_requeridos.includes(sku))
  )
}

/**
 * Texto corto y legible de la mecánica de una promo (para badges/avisos).
 * Si se pasa `sku` y la promo es cruzada y el SKU SOLO es requerido (no
 * beneficiado), describe que habilita el descuento en otro artículo.
 */
export function describirPromo(p: Promocion, sku?: string): string {
  if (
    sku &&
    p.modo_articulos === "cruzada" &&
    p.skus_requeridos.includes(sku) &&
    !p.skus_beneficiados.includes(sku)
  ) {
    return "Activa descuento en otro artículo"
  }
  switch (p.tipo) {
    case "porcentaje":
      return Number(p.porcentaje) >= 100 ? "Gratis en promoción" : `${p.porcentaje}% de descuento`
    case "nivel_precio": {
      // En cruzada el nivel puede fijarse por artículo (descuentos_articulo);
      // si se pasa el sku y tiene override, mostramos ese nivel, no el global.
      const ov = sku ? p.descuentos_articulo?.[sku] : undefined
      const nivel = ov?.tipo === "nivel_precio" ? Number(ov.valor) : p.nivel_precio
      return `Precio especial (nivel ${nivel})`
    }
    case "nxm":
      return `Lleva ${p.nxm_lleva}, paga ${p.nxm_paga}`
    case "volumen":
      return `${p.volumen_desc}% al llevar ${p.volumen_min}+ piezas`
    case "personalizado": {
      const d = sku ? p.descuentos_articulo?.[sku] : undefined
      if (d) {
        return d.tipo === "precio_fijo"
          ? `Precio especial $${Number(d.valor).toFixed(2)}`
          : `${d.valor}% de descuento`
      }
      return "Descuento por artículo"
    }
    default:
      return p.nombre
  }
}

/** Etiqueta de display de una promo (etiqueta personalizada o su nombre). */
export function etiquetaPromo(p: Promocion): string {
  return p.etiqueta || p.nombre
}

/** Precio del nivel solicitado (2|3|4) para un item; undefined si no disponible. */
function precioNivel(item: CartItem, nivel: number): number | undefined {
  if (nivel === 2) return item.precio2
  if (nivel === 3) return item.precio3
  if (nivel === 4) return item.precio4
  return undefined
}

/**
 * Calcula el importe de UNA línea bajo UNA promo concreta, asumiendo que la promo
 * ya pasó los filtros de elegibilidad (vigencia, segmento, requeridos presentes,
 * el SKU es beneficiado). Devuelve null si, ya en detalle, la promo no puede
 * aplicarse (p. ej. nivel de precio no disponible, no se alcanza el mínimo).
 */
function importeConPromo(item: CartItem, promo: Promocion, base: number): number | null {
  const cant = item.cantidad
  // Cantidad mínima global para que la promo active sobre esta línea.
  if (promo.cantidad_minima && cant < promo.cantidad_minima) return null

  // Tope de unidades con descuento (las demás van a precio base).
  const conTope = (unidadesDesc: number) => Math.min(unidadesDesc, promo.max_unidades ?? unidadesDesc)

  // Piso de seguridad: ninguna pieza puede venderse por debajo del precio 4
  // (precio especial). Red de seguridad por si existe una promo agresiva creada
  // antes de la regla o por API. 0 = sin dato → no se aplica el clamp.
  const piso = Number(item.precio4) || 0
  const clampUnit = (p: number) => (piso > 0 ? Math.max(p, piso) : p)

  switch (promo.tipo) {
    case "porcentaje": {
      const pct = Number(promo.porcentaje) || 0
      if (pct <= 0) return null
      const unidadesDesc = conTope(cant)
      const precioDesc = clampUnit(base * (1 - pct / 100))
      return precioDesc * unidadesDesc + base * (cant - unidadesDesc)
    }
    case "nivel_precio": {
      // En cruzada se puede fijar el nivel POR ARTÍCULO (descuentos_articulo);
      // si no hay override, se usa el nivel global de la promo.
      const override = promo.descuentos_articulo?.[item.sku]
      const nivel = override?.tipo === "nivel_precio"
        ? Number(override.valor) || 0
        : Number(promo.nivel_precio) || 0
      const pNivel = precioNivel(item, nivel)
      if (pNivel === undefined || pNivel <= 0 || pNivel >= base) return null
      const unidadesDesc = conTope(cant)
      return clampUnit(pNivel) * unidadesDesc + base * (cant - unidadesDesc)
    }
    case "personalizado": {
      // Descuento propio de este SKU: porcentaje o precio fijo (con clamp a piso).
      const d = promo.descuentos_articulo?.[item.sku]
      if (!d) return null
      const valor = Number(d.valor) || 0
      if (valor <= 0) return null
      const precioDesc = d.tipo === "precio_fijo"
        ? clampUnit(valor)
        : clampUnit(base * (1 - valor / 100))
      if (precioDesc >= base) return null // no encarece ni iguala
      const unidadesDesc = conTope(cant)
      return precioDesc * unidadesDesc + base * (cant - unidadesDesc)
    }
    case "nxm": {
      const lleva = Number(promo.nxm_lleva) || 0
      const paga = Number(promo.nxm_paga) || 0
      if (lleva < 2 || paga < 1 || paga >= lleva) return null
      if (cant < lleva) return null
      // Cuántos grupos completos de "lleva" entran en la cantidad.
      const grupos = Math.floor(cant / lleva)
      const resto = cant % lleva
      // Unidades gratis = (lleva - paga) por grupo. El remanente (cant % lleva)
      // se paga completo, ya incluido en `cant - gratis`. Respetar tope si existe
      // (null-check, no falsy: max_unidades=0 debe anular el descuento, no ignorarse).
      let gratis = grupos * (lleva - paga)
      if (promo.max_unidades != null) gratis = Math.min(gratis, promo.max_unidades)
      void resto
      const importe = base * (cant - gratis)
      // Clamp NxM: el precio efectivo por pieza no puede caer bajo el piso.
      return piso > 0 ? Math.max(importe, piso * cant) : importe
    }
    case "volumen": {
      const min = Number(promo.volumen_min) || 0
      const desc = Number(promo.volumen_desc) || 0
      if (min < 2 || desc <= 0) return null
      if (cant < min) return null
      // Precio con descuento por pieza, clampeado al piso (precio 4).
      const precioDesc = clampUnit(base * (1 - desc / 100))
      if (promo.volumen_alcance === "excedente") {
        // Solo las piezas por ENCIMA del mínimo reciben descuento.
        let conDesc = cant - min
        conDesc = conTope(conDesc)
        return base * (cant - conDesc) + precioDesc * conDesc
      }
      // "todas": todas las piezas reciben descuento (respetando tope).
      const conDesc = conTope(cant)
      return precioDesc * conDesc + base * (cant - conDesc)
    }
    default:
      return null
  }
}

/**
 * Calcula el resultado de promociones para TODO el carrito.
 * Devuelve un Map sku→LineaPromo. Las líneas sin promo traen su importe normal
 * (mayoreo/base) y `promo: null`, de modo que el consumidor puede usar el Map
 * uniformemente. Sin promos activas, equivale exactamente al cálculo actual.
 */
export function calcularPromosCarrito(
  items: CartItem[],
  promos: Promocion[],
  ctx: ContextoCliente
): Map<string, LineaPromo> {
  const hoy = hoyISO()
  // Conjunto de SKUs presentes en el carrito (para evaluar "requeridos presentes").
  const skusEnCarrito = new Set(items.map((i) => i.sku))

  // Promos candidatas: vigentes + del segmento del cliente activo.
  const candidatas = promos.filter((p) => promoVigente(p, hoy) && aplicaSegmento(p, ctx))

  const resultado = new Map<string, LineaPromo>()

  for (const item of items) {
    const base = efectivoPrecio(item)
    const importeSinPromo = base * item.cantidad

    // Las líneas de paquete nunca reciben promo.
    if (item.paquete_id) {
      resultado.set(claveLinea(item), {
        importe: importeSinPromo,
        precioUnitarioBase: base,
        descuento: 0,
        promo: null,
        etiqueta: "",
      })
      continue
    }

    // Promos cuyo SKU beneficiado es este item Y cuyos requeridos están presentes.
    const aplicables = candidatas.filter((p) => {
      if (!p.skus_beneficiados.includes(item.sku)) return false
      // Todos los requeridos deben estar en el carrito (para cruzadas y mismos).
      return p.skus_requeridos.every((sku) => skusEnCarrito.has(sku))
    })

    // Evaluar cada aplicable; quedarse con la mejor por (prioridad, mayor descuento).
    let mejor: { promo: Promocion; importe: number } | null = null
    for (const p of aplicables) {
      const imp = importeConPromo(item, p, base)
      if (imp === null) continue
      // El precio solo debe BAJAR (una promo nunca encarece la línea).
      if (imp >= importeSinPromo) continue
      if (
        !mejor ||
        p.prioridad > mejor.promo.prioridad ||
        (p.prioridad === mejor.promo.prioridad && imp < mejor.importe)
      ) {
        mejor = { promo: p, importe: imp }
      }
    }

    if (mejor) {
      const imp = Math.round(mejor.importe * 100) / 100
      resultado.set(claveLinea(item), {
        importe: imp,
        precioUnitarioBase: base,
        descuento: Math.round((importeSinPromo - imp) * 100) / 100,
        promo: mejor.promo,
        etiqueta: mejor.promo.etiqueta || mejor.promo.nombre,
      })
    } else {
      resultado.set(claveLinea(item), {
        importe: importeSinPromo,
        precioUnitarioBase: base,
        descuento: 0,
        promo: null,
        etiqueta: "",
      })
    }
  }

  return resultado
}

/** Estado de aplicación de una promo respecto al carrito actual. */
export interface DiagnosticoPromo {
  /** ¿La promo se está APLICANDO de verdad a alguna línea del carrito? */
  aplicada: boolean
  /** SKUs requeridos que aún NO están en el carrito (cruzada o mismos). */
  faltanSkus: string[]
  /**
   * Piezas mínimas exigidas por la promo (`cantidad_minima`) y cuántas hay hoy
   * en la línea más cargada de los beneficiados. null si la promo no exige mínimo.
   */
  minimoPiezas: number | null
  /** Piezas que faltan para alcanzar el mínimo en el artículo con descuento más cercano (0 si ya se cumple). */
  faltanPiezas: number
  /** Motivo legible de por qué no aplica (vacío si aplicada). */
  motivo: string
}

/**
 * Diagnostica por qué una promo NO se aplica al carrito (o confirma que sí),
 * para mostrarle al cajero qué le falta: agregar un artículo requerido, o llevar
 * más piezas para alcanzar la cantidad mínima. Reproduce la misma elegibilidad
 * que `calcularPromosCarrito` (vigencia, segmento, requeridos presentes,
 * cantidad mínima) pero reportando la causa en vez del importe.
 */
export function diagnosticoPromo(
  promo: Promocion,
  items: CartItem[],
  ctx: ContextoCliente
): DiagnosticoPromo {
  const vacio: DiagnosticoPromo = {
    aplicada: false, faltanSkus: [], minimoPiezas: null, faltanPiezas: 0, motivo: "",
  }

  if (!promoVigente(promo) || !aplicaSegmento(promo, ctx)) {
    return { ...vacio, motivo: "La promoción no está vigente para este cliente." }
  }

  // ¿Se está aplicando ya a alguna línea? (fuente de verdad: el motor real).
  const mapa = calcularPromosCarrito(items, promos1(promo), ctx)
  const aplicada = items.some((it) => mapa.get(claveLinea(it))?.promo?.id === promo.id)
  if (aplicada) return { ...vacio, aplicada: true }

  // No aplica: averiguar por qué. 1) ¿faltan SKUs requeridos en el carrito?
  const skusEnCarrito = new Set(items.map((i) => i.sku))
  const faltanSkus = promo.skus_requeridos.filter((s) => !skusEnCarrito.has(s))
  if (faltanSkus.length > 0) {
    return { ...vacio, faltanSkus, motivo: `Faltan ${faltanSkus.length} artículo(s) requerido(s) en el carrito.` }
  }

  // 2) Todos los requeridos están, pero no aplica → casi siempre es la cantidad
  //    mínima por línea. Calcular cuántas piezas tiene el beneficiado con MÁS
  //    piezas y cuántas faltan para el mínimo.
  const minimo = Number(promo.cantidad_minima) || 0
  if (minimo > 1) {
    const benSet = new Set(promo.skus_beneficiados)
    // Piezas máximas en una sola línea beneficiada (la promo se evalúa por línea).
    let maxEnLinea = 0
    for (const it of items) {
      if (benSet.has(it.sku) && !it.paquete_id) maxEnLinea = Math.max(maxEnLinea, it.cantidad)
    }
    const faltanPiezas = Math.max(0, minimo - maxEnLinea)
    if (faltanPiezas > 0) {
      return {
        ...vacio,
        minimoPiezas: minimo,
        faltanPiezas,
        motivo: `Requiere ${minimo} piezas del artículo con descuento para activarse (tienes ${maxEnLinea}). Agrega ${faltanPiezas} más.`,
      }
    }
  }

  // 3) Todo presente y el mínimo se cumple, pero el motor igual no la aplicó:
  //    el descuento no baja el precio (nivel no disponible, precio ≥ base, etc.).
  return {
    ...vacio,
    motivo: "Con los precios actuales esta promoción no reduce el precio. Revisa su configuración.",
  }
}

/** Helper: envuelve una sola promo en arreglo para reusar el motor del carrito. */
function promos1(p: Promocion): Promocion[] {
  return [p]
}

/** Total del carrito aplicando promociones. Sin promos = suma base/mayoreo. */
export function totalConPromos(
  items: CartItem[],
  promos: Promocion[],
  ctx: ContextoCliente
): number {
  const mapa = calcularPromosCarrito(items, promos, ctx)
  let total = 0
  for (const item of items) {
    total += mapa.get(claveLinea(item))?.importe ?? efectivoPrecio(item) * item.cantidad
  }
  return Math.round(total * 100) / 100
}
