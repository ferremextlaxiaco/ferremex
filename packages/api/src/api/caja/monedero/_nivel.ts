import * as path from "path"
import { readJson } from "../../../lib/json-store"
import { aNivelPOS, type NivelMonederoPOS } from "./niveles/route"

/**
 * Helpers compartidos por las rutas /caja/monedero/clientes y /:customerId para
 * derivar el NIVEL de un cliente a partir de sus compras del periodo.
 *
 * El nivel NO se almacena: se calcula sumando las ventas del cliente (no
 * canceladas) dentro de la ventana `periodo_nivel_meses` y eligiendo el nivel
 * activo de mayor `orden` cuyo `umbral_periodo` se alcanza. Esto mantiene el
 * nivel siempre correcto sin un job de recálculo.
 */

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")

interface VentaRegistro {
  fecha?: string
  total?: number
  cliente_id?: string | null
  estado?: string
}

/** Fecha ISO (YYYY-MM-DD) de hace N meses respecto a hoy. */
function inicioPeriodo(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - Math.max(1, meses))
  return d.toISOString().slice(0, 10)
}

/**
 * Suma de compras (MXN) por cliente dentro del periodo. Excluye ventas
 * canceladas. Devuelve Map<cliente_id, total>. Un solo barrido del archivo de
 * ventas, reutilizable para toda la tabla del módulo.
 */
export function comprasPorClienteEnPeriodo(meses: number): Map<string, number> {
  const desde = inicioPeriodo(meses)
  const ventas = readJson<VentaRegistro[]>(VENTAS_FILE, [])
  const acc = new Map<string, number>()
  for (const v of ventas) {
    if (!v.cliente_id) continue
    if (v.estado === "cancelada") continue
    if (typeof v.fecha !== "string" || v.fecha.slice(0, 10) < desde) continue
    acc.set(v.cliente_id, (acc.get(v.cliente_id) ?? 0) + (Number(v.total) || 0))
  }
  return acc
}

/**
 * Resuelve el nivel de un cliente dado su gasto del periodo y los niveles
 * configurados. Devuelve { actual, siguiente, comprasPeriodo } donde:
 *  - actual    = nivel activo de mayor orden cuyo umbral se alcanza (o null)
 *  - siguiente = siguiente nivel por alcanzar (para la barra de progreso) o null
 */
export function resolverNivel(
  comprasPeriodo: number,
  nivelesRaw: any[]
): { actual: NivelMonederoPOS | null; siguiente: NivelMonederoPOS | null; comprasPeriodo: number } {
  const niveles = nivelesRaw
    .map(aNivelPOS)
    .filter((n) => n.activo)
    .sort((a, b) => a.orden - b.orden)

  let actual: NivelMonederoPOS | null = null
  for (const n of niveles) {
    if (comprasPeriodo >= n.umbral_periodo) actual = n
    else break
  }
  const siguiente = niveles.find((n) => n.umbral_periodo > (actual?.umbral_periodo ?? -1) && comprasPeriodo < n.umbral_periodo) ?? null
  return { actual, siguiente, comprasPeriodo }
}
