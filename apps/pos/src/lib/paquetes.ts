// Lógica de negocio de Paquetes/Kits para el panel de ventas.
//
// Un paquete es una definición {nombre, componentes:[{sku,cantidad}], precio_paquete}.
// Al venderlo, el precio del paquete se PRORRATEA entre sus componentes según el
// peso de cada uno por su precio individual (P1), de modo que cada línea del
// ticket conserve un precio_unitario coherente (y la cancelación/reintegro de
// inventario por SKU siga funcionando). La suma de líneas = precio del paquete.

import { listarArticulos, type Paquete, type ArticuloPOS } from "./client"
import type { LineaPaquete } from "./pos-store"

export interface ComponenteResuelto {
  sku: string
  descripcion: string
  cantidad: number
  precioUnitario: number // P1 del artículo (referencia para prorratear)
  existencia: number
}

/** Resuelve los componentes de un paquete contra el catálogo (precio + stock). */
export function resolverComponentes(
  paquete: Paquete,
  articulosPorSku: Map<string, ArticuloPOS>
): ComponenteResuelto[] {
  return paquete.componentes.map((c) => {
    const art = articulosPorSku.get(c.sku)
    return {
      sku: c.sku,
      descripcion: c.descripcion || art?.descripcion || c.sku,
      cantidad: c.cantidad,
      precioUnitario: art?.precio1 ?? 0,
      existencia: art?.existencia ?? 0,
    }
  })
}

/** ¿Todos los componentes tienen existencia suficiente para una copia del paquete? */
export function paqueteVendible(comps: ComponenteResuelto[]): boolean {
  return comps.length > 0 && comps.every((c) => c.existencia >= c.cantidad)
}

/** SKU(s) de componentes sin existencia suficiente. */
export function componentesSinStock(comps: ComponenteResuelto[]): ComponenteResuelto[] {
  return comps.filter((c) => c.existencia < c.cantidad)
}

/**
 * Prorratea el precio del paquete entre sus componentes según el peso de cada
 * línea por su precio individual (precioUnitario × cantidad). Devuelve las
 * líneas listas para meter al carrito (cada una con su precio unitario
 * prorrateado). Ajusta el redondeo en la última línea para que la suma cuadre
 * EXACTAMENTE con el precio del paquete.
 */
export function prorratearPaquete(
  paquete: Paquete,
  comps: ComponenteResuelto[]
): LineaPaquete[] {
  const pesoTotal = comps.reduce((s, c) => s + c.precioUnitario * c.cantidad, 0)
  const precio = paquete.precio_paquete

  // Si todos los componentes tienen precio 0 (sin referencia), repartir parejo
  // por unidad total.
  const unidadesTotales = comps.reduce((s, c) => s + c.cantidad, 0)

  let acumulado = 0
  return comps.map((c, idx) => {
    const subtotalLinea =
      pesoTotal > 0
        ? (c.precioUnitario * c.cantidad / pesoTotal) * precio
        : (c.cantidad / unidadesTotales) * precio

    let precioUnitario: number
    if (idx === comps.length - 1) {
      // Última línea: absorbe el redondeo para que la suma sea exacta.
      const restante = precio - acumulado
      precioUnitario = redondear2(restante / c.cantidad)
    } else {
      precioUnitario = redondear2(subtotalLinea / c.cantidad)
      acumulado += redondear2(precioUnitario * c.cantidad)
    }

    return {
      sku: c.sku,
      descripcion: c.descripcion,
      precioProrrateado: precioUnitario,
      cantidad: c.cantidad,
      existencia: c.existencia,
    }
  })
}

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Dado el carrito (skus presentes) y la lista de paquetes, devuelve los paquetes
 * "sugeribles": aquellos donde al menos un componente ya está en el carrito pero
 * el paquete aún no está completo/aplicado. Útil para la tarjeta de sugerencia.
 */
export function paquetesSugeridos(
  skusEnCarrito: Set<string>,
  paquetesAplicados: Set<string>, // paquete_id ya aplicados en el carrito
  paquetes: Paquete[]
): Paquete[] {
  return paquetes.filter((p) => {
    if (paquetesAplicados.has(p.id)) return false
    const tieneAlguno = p.componentes.some((c) => skusEnCarrito.has(c.sku))
    return tieneAlguno
  })
}

// ── Desglose para el modal (precio original vs prorrateado + imagen) ──────────

export interface DesgloseComponente {
  sku: string
  descripcion: string
  cantidad: number
  thumbnail: string | null
  precioOriginal: number      // P1 individual del artículo
  precioProrrateado: number   // precio real que se cobra dentro del paquete
  existencia: number
}

export interface DesglosePaquete {
  componentes: DesgloseComponente[]
  sumaOriginal: number        // Σ (precioOriginal × cantidad)
  precioPaquete: number       // precio_paquete
  ahorro: number              // sumaOriginal − precioPaquete (≥ 0)
  ahorroPct: number           // % de ahorro sobre la suma original
}

/**
 * Carga el desglose completo de un paquete para mostrarlo en el modal: cada
 * componente con su imagen, cantidad, precio original (P1) y precio prorrateado
 * (lo que realmente se cobra), más el resumen de ahorro. Reutiliza
 * `resolverComponentes` + `prorratearPaquete` y agrega thumbnails del catálogo.
 */
export async function cargarDesglosePaquete(p: Paquete): Promise<DesglosePaquete> {
  const arts = await Promise.all(p.componentes.map((c) => listarArticulos(c.sku)))
  const mapa = new Map<string, ArticuloPOS>()
  p.componentes.forEach((c, i) => {
    const lista = arts[i]
    const art = lista.find((a) => a.clave === c.sku || a.claveAlterna === c.sku) ?? lista[0]
    if (art) mapa.set(c.sku, art)
  })

  const comps = resolverComponentes(p, mapa)
  const lineas = prorratearPaquete(p, comps)
  const prorrateadoPorSku = new Map(lineas.map((l) => [l.sku, l.precioProrrateado]))

  const componentes: DesgloseComponente[] = comps.map((c) => ({
    sku: c.sku,
    descripcion: c.descripcion,
    cantidad: c.cantidad,
    thumbnail: mapa.get(c.sku)?.thumbnail ?? null,
    precioOriginal: c.precioUnitario,
    precioProrrateado: prorrateadoPorSku.get(c.sku) ?? 0,
    existencia: c.existencia,
  }))

  const sumaOriginal = componentes.reduce((s, c) => s + c.precioOriginal * c.cantidad, 0)
  const precioPaquete = p.precio_paquete
  const ahorro = Math.max(0, sumaOriginal - precioPaquete)
  const ahorroPct = sumaOriginal > 0 ? (ahorro / sumaOriginal) * 100 : 0

  return { componentes, sumaOriginal, precioPaquete, ahorro, ahorroPct }
}

export type PrepararResultado =
  | { ok: true; lineas: LineaPaquete[] }
  | { ok: false; motivo: "sin_stock"; faltantes: string[] }
  | { ok: false; motivo: "error" }

/**
 * Trae precio+existencia actuales de los componentes de un paquete, valida que
 * todos tengan stock suficiente y devuelve las líneas prorrateadas listas para
 * dispatch({type:"ADD_PAQUETE"}). Compartido por la sugerencia y el buscador de
 * venta para no duplicar la lógica de validación.
 */
export async function prepararLineasPaquete(p: Paquete): Promise<PrepararResultado> {
  try {
    const arts = await Promise.all(p.componentes.map((c) => listarArticulos(c.sku)))
    const mapa = new Map<string, ArticuloPOS>()
    p.componentes.forEach((c, i) => {
      const lista = arts[i]
      const art = lista.find((a) => a.clave === c.sku || a.claveAlterna === c.sku) ?? lista[0]
      if (art) mapa.set(c.sku, art)
    })
    const comps = resolverComponentes(p, mapa)
    if (!paqueteVendible(comps)) {
      return { ok: false, motivo: "sin_stock", faltantes: componentesSinStock(comps).map((c) => c.descripcion) }
    }
    return { ok: true, lineas: prorratearPaquete(p, comps) }
  } catch {
    return { ok: false, motivo: "error" }
  }
}
