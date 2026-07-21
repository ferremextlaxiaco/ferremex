// ---------------------------------------------------------------------------
// Comisiones de venta por empleado — motor de resolución (compartido).
//
// Calcula qué % de comisión aplica a una línea vendida, para un empleado dado,
// según las reglas que ese empleado tiene asignadas por marca/categoría/
// departamento (ferremex_comisiones). Mismo espíritu que lib/monedero.ts
// (tasaDeLinea), pero:
//   - Es POR EMPLEADO, no global: cada vendedor tiene su propio set de reglas.
//   - Sin tasa base: si ninguna regla aplica, la comisión es 0% (decisión de
//     negocio — solo comisiona lo explícitamente asignado a ese empleado).
//   - Solo 3 ámbitos (sin proveedor, por ahora).
//   - La base de cálculo es el subtotal SIN IVA de la línea (se des-grava con
//     el flag `impuesto` del producto antes de aplicar el %).
//
// Resolución de la tasa por línea (la más específica primero):
//     marca → categoría → departamento → 0%
// ---------------------------------------------------------------------------

import type { ComisionReglaAPI } from "./client"

/** Normaliza para comparar nombres de taxonomía sin importar mayúsculas/espacios. */
function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase()
}

/** Una línea de venta para el cálculo de comisión. */
export interface LineaComision {
  /** Subtotal CON IVA de la línea (tal como se cobró). */
  subtotal: number
  /** true si el producto causa IVA (para des-gravar antes de aplicar el %). */
  impuesto?: boolean
  marca?: string | null
  categoria?: string | null
  departamento?: string | null
}

/**
 * Devuelve el % de comisión aplicable a una línea, para las reglas de UN
 * empleado. Busca la regla activa más específica (marca → categoría →
 * departamento); si ninguna aplica, 0%. Una regla con tasa 0 cuenta como
 * aplicable (permite "excluir explícitamente" un ámbito para ese empleado).
 */
export function tasaComisionDeLinea(linea: LineaComision, reglasEmpleado: ComisionReglaAPI[]): number {
  const marca = norm(linea.marca)
  const categoria = norm(linea.categoria)
  const departamento = norm(linea.departamento)

  const activas = reglasEmpleado.filter((r) => r.activa)
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
  return 0
}

/** Importe sin IVA de una línea (÷1.16 si causa impuesto, tal cual si no). */
function subtotalSinIva(linea: LineaComision): number {
  const factor = linea.impuesto ? 1.16 : 1
  return linea.subtotal / factor
}

/** Comisión ($) de UNA línea para un empleado dado. */
export function comisionDeLinea(linea: LineaComision, reglasEmpleado: ComisionReglaAPI[]): number {
  const tasa = tasaComisionDeLinea(linea, reglasEmpleado)
  if (tasa <= 0) return 0
  return Math.round(subtotalSinIva(linea) * (tasa / 100) * 100) / 100
}

/** Comisión total ($) de una venta completa para un empleado. */
export function comisionDeVenta(lineas: LineaComision[], reglasEmpleado: ComisionReglaAPI[]): number {
  return Math.round(lineas.reduce((acc, l) => acc + comisionDeLinea(l, reglasEmpleado), 0) * 100) / 100
}
