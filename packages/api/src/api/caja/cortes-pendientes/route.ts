import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CAJAS } from "../../../modules/ferremex-cajas"
import type FerremexCajasService from "../../../modules/ferremex-cajas/service"
import * as path from "path"
import { readJson } from "../../../lib/json-store"

/**
 * GET /caja/cortes-pendientes — cajas con ventas SIN CORTAR.
 *
 * El corte es por caja con período continuo: una caja tiene "pendiente" si ha
 * registrado ventas vigentes DESPUÉS de su último corte cerrado (o desde siempre,
 * si nunca se ha cortado). Recorre el catálogo de cajas + el grupo "sin caja"
 * (ventas con caja_id null, datos viejos) y devuelve, para cada una con ventas
 * pendientes: conteo, total, desde cuándo, y quién(es) vendieron.
 *
 * Lo consume el tablero de pendientes del POS para avisar "esta caja ya operó pero
 * no se ha hecho el corte". No filtra por cajero: el arqueo es del cajón físico.
 */

interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  vendedor?: string | null
  caja_id?: string | null
  total?: number
  estado?: string
}

interface CorteCerrado {
  caja_id?: string | null
  cerrado_en: string
}

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CORTES_FILE = path.join(__dirname, "../../../../data/cortes-pos.json")

function normCaja(c: unknown): string | null {
  return c == null || c === "" ? null : String(c)
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const ventas = readJson<VentaRegistro[]>(VENTAS_FILE, [])
    .filter((v) => !v.estado || v.estado === "Vigente")
  const cortes = readJson<CorteCerrado[]>(CORTES_FILE, [])

  // Último cierre por caja (ISO más reciente) para delimitar el período abierto.
  const ultimoCorte = new Map<string | null, string>()
  for (const c of cortes) {
    if (!c.cerrado_en) continue
    const k = normCaja(c.caja_id)
    const prev = ultimoCorte.get(k)
    if (!prev || c.cerrado_en > prev) ultimoCorte.set(k, c.cerrado_en)
  }

  // Catálogo de cajas (nombres). El grupo "sin caja" se añade aparte si aplica.
  let catalogo: { id: string; nombre: string }[] = []
  try {
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const cajas = await cajasService.listCajas({})
    catalogo = cajas.map((c: any) => ({ id: String(c.id), nombre: c.nombre }))
  } catch {
    /* sin catálogo, igual resolvemos por los caja_id presentes en las ventas */
  }

  // Conjunto de cajas a evaluar: las del catálogo + las que aparecen en ventas
  // (incluye null = sin caja) por si hay ventas de una caja ya borrada del catálogo.
  const clavesVentas = new Set<string | null>(ventas.map((v) => normCaja(v.caja_id)))
  const claves = new Set<string | null>([...catalogo.map((c) => c.id), ...clavesVentas])

  const pendientes: Array<{
    caja_id: string | null
    caja_name: string
    num_ventas: number
    total_ventas: number
    desde: string | null
    primera_venta: string | null
    ultima_venta: string | null
    vendedores: string[]
  }> = []
  for (const clave of claves) {
    const desde = ultimoCorte.get(clave) ?? null
    const ventasCaja = ventas.filter(
      (v) => normCaja(v.caja_id) === clave && (!desde || (typeof v.fecha === "string" && v.fecha > desde))
    )
    if (ventasCaja.length === 0) continue

    const total = ventasCaja.reduce((s, v) => s + Number(v.total ?? 0), 0)
    const fechas = ventasCaja.map((v) => v.fecha).filter(Boolean).sort()
    const vendedores = [...new Set(ventasCaja.map((v) => v.vendedor || v.cajero).filter(Boolean))]
    const nombreCaja = clave == null
      ? "Sin caja (históricas)"
      : (catalogo.find((c) => c.id === clave)?.nombre ?? "Caja desconocida")

    pendientes.push({
      caja_id: clave,
      caja_name: nombreCaja,
      num_ventas: ventasCaja.length,
      total_ventas: total,
      desde: desde,                 // último cierre (null si nunca se cortó)
      primera_venta: fechas[0] ?? null,
      ultima_venta: fechas[fechas.length - 1] ?? null,
      vendedores,                   // quiénes vendieron en el período (atribución)
    })
  }

  // Más urgente primero: más ventas pendientes / más antiguas arriba.
  pendientes.sort((a, b) => (a.primera_venta ?? "").localeCompare(b.primera_venta ?? ""))

  res.json({ pendientes })
}
