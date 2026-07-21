import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../lib/json-store"

/**
 * GET /caja/reportes/comisiones — comisión total generada por vendedor en un
 * rango de fechas libre (todas las cajas), para el reporte de Comisiones del
 * módulo Reportes.
 *
 * A diferencia de /caja/corte (que agrega por período-de-arqueo de UNA caja),
 * este endpoint agrega por rango de fechas arbitrario cruzando todas las cajas
 * — el vendedor cobra su comisión por persona, no por caja física.
 *
 * Mismo criterio de "vigente" que /caja/corte: una venta cancelada deja de
 * sumar automáticamente (sin necesidad de revertir nada aparte).
 */

interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  vendedor?: string | null
  estado?: string
  comision_venta?: number
}

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

export interface ReporteComisionVendedor {
  vendedor: string
  comision_total: number
  num_ventas: number
  comision_promedio: number
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const desde = String(req.query["desde"] ?? "").trim()
  const hasta = String(req.query["hasta"] ?? "").trim()
  const vendedorFiltro = String(req.query["vendedor"] ?? "").trim()

  if (!desde || !hasta) {
    res.status(400).json({ error: "Faltan parámetros: desde, hasta (YYYY-MM-DD)" })
    return
  }

  // Rango inclusivo en horario local del día: [desde 00:00:00, hasta 23:59:59].
  const desdeIso = `${desde}T00:00:00`
  const hastaIso = `${hasta}T23:59:59.999`

  const ventas = cargarVentas()
    .filter((v) => !v.estado || v.estado === "Vigente")
    .filter((v) => typeof v.fecha === "string" && v.fecha >= desdeIso && v.fecha <= hastaIso)
    .filter((v) => Number(v.comision_venta ?? 0) > 0)
    .filter((v) => !vendedorFiltro || (v.vendedor ?? v.cajero) === vendedorFiltro)

  const porVendedor = new Map<string, { total: number; num: number }>()
  for (const v of ventas) {
    const nombre = v.vendedor ?? v.cajero
    const monto = Number(v.comision_venta ?? 0)
    const actual = porVendedor.get(nombre) ?? { total: 0, num: 0 }
    porVendedor.set(nombre, { total: actual.total + monto, num: actual.num + 1 })
  }

  const resultado: ReporteComisionVendedor[] = [...porVendedor.entries()]
    .map(([vendedor, { total, num }]) => ({
      vendedor,
      comision_total: Math.round(total * 100) / 100,
      num_ventas: num,
      comision_promedio: Math.round((total / num) * 100) / 100,
    }))
    .sort((a, b) => b.comision_total - a.comision_total)

  res.json(resultado)
}
