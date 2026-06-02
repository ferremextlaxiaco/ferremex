import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, updateJson, withFileLock } from "../../../lib/json-store"

/**
 * /caja/corte — corte de caja / arqueo de un turno.
 *
 * GET: arma el resumen conciliable de un turno combinando dos fuentes:
 *   - ventas-pos.json     → ventas del turno, desglosadas por método de pago.
 *   - movimientos-caja.json → fondo inicial + entradas/salidas manuales del turno.
 * Con eso calcula el "efectivo esperado":
 *     fondo_inicial + ventas_efectivo + entradas_manuales − salidas_manuales
 *
 * POST: cierra el turno (idempotente). Persiste el arqueo completo (conteo
 * físico, diferencia, fondo dejado, motivo) en cortes-pos.json y, si el cajero
 * deja fondo para el siguiente turno, lo registra como un movimiento de "Fondo
 * inicial" (origin FONDO, auto:true) asociado al turno entrante.
 */

interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
  pago_efectivo?: number
  pago_transferencia?: number
  pago_credito?: number
  estado?: string
}

interface Movimiento {
  id: string
  date: string
  time: string
  fecha: string
  origin: "MOVIM_E" | "MOVIM_S" | "FONDO"
  desc: string
  method: string
  amount: number
  cajaId?: string | null
  cajaName?: string | null
  cajeroId?: string
  cajeroName?: string
  turnoId?: string | null
  [k: string]: unknown
}

interface CorteCerrado {
  cajero: string
  turno_id: string
  cerrado_en: string
  // Caja física en la que se hizo el corte (heredada del empleado). Se sella en
  // el arqueo para auditoría; null si el empleado no tenía caja asignada.
  caja_id?: string | null
  caja_name?: string | null
  // Snapshot del arqueo en el momento del cierre
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_credito: number
  fondo_inicial: number
  entradas_manuales: number
  salidas_manuales: number
  efectivo_esperado: number
  efectivo_contado: number
  diferencia: number
  fondo_dejado: number
  motivo?: string
  denominaciones?: Record<string, number> | null
}

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CORTES_FILE = path.join(__dirname, "../../../../data/cortes-pos.json")
const MOVIMIENTOS_FILE = path.join(__dirname, "../../../../data/movimientos-caja.json")

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}
function cargarMovimientos(): Movimiento[] {
  return readJson<Movimiento[]>(MOVIMIENTOS_FILE, [])
}
function cargarCortes(): CorteCerrado[] {
  return readJson<CorteCerrado[]>(CORTES_FILE, [])
}

/**
 * Calcula el resumen conciliable de un turno (sin escribir nada).
 *
 * `caja_id` (opcional) acota los MOVIMIENTOS manuales a esa caja física: cuando
 * se pasa, solo cuentan los movimientos de esa caja MÁS los que no tienen caja
 * (`cajaId == null`, históricos o capturados sin caja asignada), para no perder
 * efectivo. Las VENTAS no se filtran por caja: hoy no llevan `cajaId`, así que
 * el arqueo de ventas sigue siendo por cajero+turno.
 */
function calcularResumen(cajero: string, turno_id: string, caja_id?: string | null) {
  const ventas = cargarVentas()
    .filter((v) => v.cajero === cajero && v.turno_id === turno_id)
    .filter((v) => !v.estado || v.estado === "Vigente")

  const ventas_efectivo = ventas.reduce((s, v) => s + Number(v.pago_efectivo ?? 0), 0)
  const ventas_transferencia = ventas.reduce((s, v) => s + Number(v.pago_transferencia ?? 0), 0)
  const ventas_credito = ventas.reduce((s, v) => s + Number(v.pago_credito ?? 0), 0)
  const total_ventas = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)

  const caja = caja_id ? String(caja_id) : null
  const movs = cargarMovimientos()
    .filter((m) => m.turnoId === turno_id)
    // Si el corte es de una caja concreta, incluir sus movimientos + los sin caja.
    .filter((m) => !caja || m.cajaId == null || String(m.cajaId) === caja)
  const fondo_inicial = movs.filter((m) => m.origin === "FONDO").reduce((s, m) => s + m.amount, 0)
  const entradas_manuales = movs.filter((m) => m.origin === "MOVIM_E").reduce((s, m) => s + m.amount, 0)
  // Las salidas vienen con signo negativo; las exponemos como magnitud positiva.
  const salidas_manuales = Math.abs(movs.filter((m) => m.origin === "MOVIM_S").reduce((s, m) => s + m.amount, 0))

  const efectivo_esperado = fondo_inicial + ventas_efectivo + entradas_manuales - salidas_manuales

  return {
    cajero,
    turno_id,
    caja_id: caja,
    num_ventas: ventas.length,
    total_ventas,
    ventas_efectivo,
    ventas_transferencia,
    ventas_credito,
    fondo_inicial,
    entradas_manuales,
    salidas_manuales,
    efectivo_esperado,
    ventas: ventas
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))
      .map((v) => ({
        folio: v.folio,
        fecha: v.fecha,
        cajero: v.cajero,
        turno_id: v.turno_id,
        total: v.total,
        pago_efectivo: Number(v.pago_efectivo ?? 0),
        pago_transferencia: Number(v.pago_transferencia ?? 0),
        pago_credito: Number(v.pago_credito ?? 0),
      })),
    movimientos: movs
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))
      .map((m) => ({
        id: m.id, origin: m.origin, desc: m.desc, amount: m.amount,
        time: m.time, category: m.category as string | undefined,
      })),
  }
}

/** GET /caja/corte?cajero=&turno_id=&caja_id= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cajero = String(req.query["cajero"] ?? "").trim()
  const turno_id = String(req.query["turno_id"] ?? "").trim()
  const caja_id = String(req.query["caja_id"] ?? "").trim() || null

  if (!cajero || !turno_id) {
    res.status(400).json({ error: "Faltan parámetros: cajero, turno_id" })
    return
  }

  const resumen = calcularResumen(cajero, turno_id, caja_id)
  // Si el turno ya tiene corte cerrado, lo adjuntamos (vista de solo lectura).
  const cerrado = cargarCortes().find((c) => c.cajero === cajero && c.turno_id === turno_id) ?? null

  res.json({ ...resumen, cerrado })
}

interface CorteBody {
  cajero: string
  turno_id: string
  efectivo_contado: number
  fondo_dejado?: number
  motivo?: string
  denominaciones?: Record<string, number> | null
  // turno_id del turno entrante; el frontend lo calcula con buildTurnoId(). Si
  // se deja fondo, se registra como "Fondo inicial" auto en ese turno.
  siguiente_turno_id?: string | null
  cajero_id?: string
  caja_id?: string | null
  caja_name?: string | null
}

/** POST /caja/corte — cierra el turno con el arqueo completo (idempotente). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as CorteBody
  const { cajero, turno_id } = body

  if (!cajero || !turno_id) {
    res.status(400).json({ error: "Faltan campos: cajero, turno_id" })
    return
  }

  const efectivo_contado = Number(body.efectivo_contado)
  if (!Number.isFinite(efectivo_contado) || efectivo_contado < 0) {
    res.status(400).json({ error: "efectivo_contado inválido" })
    return
  }
  const fondo_dejado = Math.max(0, Number(body.fondo_dejado ?? 0))
  if (fondo_dejado > efectivo_contado) {
    res.status(400).json({ error: "El fondo a dejar no puede exceder el efectivo contado" })
    return
  }

  // Recalculamos el resumen en el servidor (no confiamos en cifras del cliente).
  // El arqueo se acota a la caja del corte (si viene), igual que el GET.
  const caja_id = body.caja_id ? String(body.caja_id) : null
  const caja_name = body.caja_name ? String(body.caja_name) : null
  const resumen = calcularResumen(cajero, turno_id, caja_id)
  const diferencia = efectivo_contado - resumen.efectivo_esperado

  // Cierre idempotente bajo el lock del archivo de cortes.
  let yaCerrado: CorteCerrado | null = null
  let registro: CorteCerrado | null = null
  await updateJson<CorteCerrado[]>(CORTES_FILE, [], (cortes) => {
    const existente = cortes.find((c) => c.cajero === cajero && c.turno_id === turno_id)
    if (existente) { yaCerrado = existente; return cortes }
    registro = {
      cajero,
      turno_id,
      cerrado_en: new Date().toISOString(),
      caja_id,
      caja_name,
      num_ventas: resumen.num_ventas,
      total_ventas: resumen.total_ventas,
      ventas_efectivo: resumen.ventas_efectivo,
      ventas_transferencia: resumen.ventas_transferencia,
      ventas_credito: resumen.ventas_credito,
      fondo_inicial: resumen.fondo_inicial,
      entradas_manuales: resumen.entradas_manuales,
      salidas_manuales: resumen.salidas_manuales,
      efectivo_esperado: resumen.efectivo_esperado,
      efectivo_contado,
      diferencia,
      fondo_dejado,
      ...(body.motivo ? { motivo: String(body.motivo).trim() } : {}),
      denominaciones: body.denominaciones ?? null,
    }
    return [registro, ...cortes]
  })

  if (yaCerrado) {
    res.json({ ok: true, yaCerrado: true, corte: yaCerrado })
    return
  }

  // Si se dejó fondo para el siguiente turno, registrarlo como movimiento
  // "Fondo inicial" (auto) del turno entrante. Solo si el frontend mandó el
  // turno destino; sin él no podemos asociarlo correctamente.
  if (fondo_dejado > 0 && body.siguiente_turno_id) {
    const now = new Date()
    await withFileLock(MOVIMIENTOS_FILE, async () => {
      const movs = readJson<Movimiento[]>(MOVIMIENTOS_FILE, [])
      const mov: Movimiento = {
        id: crypto.randomBytes(6).toString("hex"),
        date: now.toISOString().slice(0, 10),
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        fecha: now.toISOString(),
        origin: "FONDO",
        desc: `Fondo inicial (dejado del turno ${turno_id})`,
        method: "efectivo",
        amount: fondo_dejado,
        category: "Fondo inicial",
        cajaId: body.caja_id ?? null,
        cajaName: body.caja_name ?? null,
        cajeroId: body.cajero_id ?? undefined,
        cajeroName: cajero,
        turnoId: body.siguiente_turno_id,
        auto: true,
      }
      writeJsonAtomic(MOVIMIENTOS_FILE, [mov, ...movs])
    })
  }

  res.json({ ok: true, corte: registro })
}
