// ---------------------------------------------------------------------------
// Monedero Electrónico — motor de cálculo de puntos (compartido).
//
// Calcula cuántos puntos GANA una venta a partir de la config global, las
// reglas de generación por taxonomía (marca/departamento/categoría) y el nivel
// del cliente (multiplicador). El backend persiste el resultado en /caja/ventas
// (movimiento "ganado"); la UI lo usa para el preview "ganarás ~X pts".
//
// Resolución de la tasa por línea (la más específica primero):
//     marca → categoría → departamento → tasa_base
// Una regla con tasa = 0 EXCLUYE esa línea (productos sin margen).
//
// La taxonomía de una línea se toma de sus campos REALES (departamento/categoría
// de la metadata del producto, marca de la búsqueda). Cuando la línea no trae
// departamento/categoría explícitos (datos viejos), se intentan derivar de la
// marca vía listarCatalogos() (marca → catId → cat → depId → depto) como
// fallback. Una línea sin ninguna taxonomía usa la tasa_base.
// ---------------------------------------------------------------------------

import type {
  ConfigMonederoAPI,
  ReglaPuntosAPI,
  NivelMonederoAPI,
  CatalogosData,
} from "./client"

/** Normaliza para comparar nombres de taxonomía sin importar mayúsculas/espacios. */
function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase()
}

/**
 * Una línea de venta para el cálculo: su importe (con IVA, ya con promos) y su
 * taxonomía. `departamento`/`categoria` son los valores REALES del producto (de
 * su metadata); `marca` se usa como fallback para derivar la taxonomía cuando
 * los anteriores faltan (líneas/datos viejos).
 */
export interface LineaPuntos {
  subtotal: number
  marca?: string | null
  departamento?: string | null
  categoria?: string | null
}

/** Taxonomía derivada de una marca: { marca, categoria, departamento } (nombres). */
function taxonomiaDeMarca(
  marca: string | null | undefined,
  cat: CatalogosData
): { marca: string; categoria: string; departamento: string } {
  const m = cat.marcas.find((x) => norm(x.nombre) === norm(marca))
  if (!m) return { marca: norm(marca), categoria: "", departamento: "" }
  const c = cat.cats.find((x) => x.id === m.catId)
  const d = c ? cat.depts.find((x) => x.id === c.depId) : undefined
  return {
    marca: norm(m.nombre),
    categoria: norm(c?.nombre),
    departamento: norm(d?.nombre),
  }
}

/**
 * Devuelve la tasa (%) aplicable a una línea. Busca la regla activa más
 * específica (marca → categoría → departamento); si ninguna aplica, la tasa
 * base. Una regla con tasa 0 cuenta como aplicable (excluye → 0%).
 *
 * Usa el departamento/categoría reales de la línea cuando existen; si faltan,
 * los deriva de la marca vía catálogo (retrocompatibilidad con líneas viejas).
 */
export function tasaDeLinea(
  linea: LineaPuntos,
  config: ConfigMonederoAPI,
  reglas: ReglaPuntosAPI[],
  cat: CatalogosData
): number {
  // Taxonomía derivada de la marca (fallback) y la real de la línea (preferente).
  const derivada = taxonomiaDeMarca(linea.marca, cat)
  const marca = derivada.marca // la marca solo se conoce por su nombre
  const categoria = norm(linea.categoria) || derivada.categoria
  const departamento = norm(linea.departamento) || derivada.departamento

  const activas = reglas.filter((r) => r.activa)
  const porMarca = marca
    ? activas.find((r) => r.ambito === "marca" && norm(r.ref) === marca)
    : undefined
  if (porMarca) return porMarca.tasa
  const porCat = categoria
    ? activas.find((r) => r.ambito === "categoria" && norm(r.ref) === categoria)
    : undefined
  if (porCat) return porCat.tasa
  const porDepto = departamento
    ? activas.find((r) => r.ambito === "departamento" && norm(r.ref) === departamento)
    : undefined
  if (porDepto) return porDepto.tasa
  return config.tasa_base
}

/** Aplica el modo de redondeo de la config a un número de puntos. */
export function redondearPuntos(puntos: number, redondeo: ConfigMonederoAPI["redondeo"]): number {
  if (redondeo === "ninguno") return Math.round(puntos * 100) / 100
  if (redondeo === "normal") return Math.round(puntos)
  return Math.floor(puntos) // "abajo" (default)
}

/**
 * Puntos ganados por una venta. Por cada línea: puntos = (subtotal × tasa%) /
 * valor_punto, sumados, multiplicados por el multiplicador del nivel del cliente
 * y redondeados según la config. Devuelve un entero (o 2 decimales si redondeo
 * "ninguno").
 */
export function calcularPuntosGanados(
  lineas: LineaPuntos[],
  config: ConfigMonederoAPI,
  reglas: ReglaPuntosAPI[],
  cat: CatalogosData,
  nivel: NivelMonederoAPI | null
): number {
  const valorPunto = Number(config.valor_punto) || 0
  if (valorPunto <= 0) return 0
  let puntos = 0
  for (const l of lineas) {
    const tasa = tasaDeLinea(l, config, reglas, cat)
    if (tasa <= 0) continue
    puntos += (l.subtotal * (tasa / 100)) / valorPunto
  }
  const mult = nivel ? Number(nivel.multiplicador) || 1 : 1
  return redondearPuntos(puntos * mult, config.redondeo)
}

/**
 * Equivalencia en pesos de un saldo de puntos, usando el valor de punto bonus
 * del nivel si existe (beneficio de tier), o el global.
 */
export function valorEnPesos(
  puntos: number,
  config: ConfigMonederoAPI,
  nivel: NivelMonederoAPI | null
): number {
  const vp = nivel?.valor_punto_bonus != null ? nivel.valor_punto_bonus : config.valor_punto
  return Math.round(puntos * (Number(vp) || 0) * 100) / 100
}

/**
 * Tope en pesos que el cliente puede pagar con puntos en un ticket dado
 * (max_canje_pct del total).
 */
export function topeCanjePesos(total: number, config: ConfigMonederoAPI): number {
  return Math.round(total * ((Number(config.max_canje_pct) || 0) / 100) * 100) / 100
}
