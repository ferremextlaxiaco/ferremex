import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, updateJson, withFileLock } from "../../../lib/json-store"
import { leerTurnosConfig, franjaDeTimestamp, type Franja } from "../../../lib/turnos"

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
  // Caja física de la venta (arqueo por caja) y vendedor que la realizó.
  caja_id?: string | null
  caja_name?: string | null
  vendedor?: string | null
  turno_id: string
  total: number
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_credito?: number
  estado?: string
  // Venta contra entrega (por_cobrar): monto real que se cobrará al liquidar.
  entrega_total?: number
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
  // Quién realizó el corte (el que arqueó). Antes era el dueño del turno; ahora
  // el corte es por caja y cualquiera con permiso puede cerrarlo.
  cajero: string
  // Caja arqueada. El corte cubre el período (periodo_desde, cerrado_en] de esta
  // caja. `turno_id` se conserva como legacy para cortes viejos (puede faltar).
  caja_id?: string | null
  caja_name?: string | null
  turno_id?: string
  // Inicio del período cubierto por este corte (cerrado_en del corte anterior de
  // la caja, o null si fue el primero). Junto con cerrado_en delimita el período.
  periodo_desde?: string | null
  // Modo turnos: franja + día arqueados (null en modo día).
  franja_id?: string | null
  franja_dia?: string | null
  cerrado_en: string
  // Snapshot del arqueo en el momento del cierre
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_tarjeta: number
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
/** Normaliza un caja_id a string|null para comparaciones consistentes. */
function normCaja(c: unknown): string | null {
  return c == null || c === "" ? null : String(c)
}

/**
 * Inicio del período de corte de una caja: el `cerrado_en` (ISO) del último corte
 * cerrado de esa caja. Si nunca se ha cortado, devuelve null (período = todo el
 * historial sin cortar de la caja → modelo de arqueo continuo, primer corte toma
 * todas las ventas pendientes).
 */
function inicioPeriodoCaja(caja_id: string | null): string | null {
  const caja = normCaja(caja_id)
  const cortesCaja = cargarCortes()
    .filter((c) => normCaja(c.caja_id) === caja && c.cerrado_en)
    .sort((a, b) => String(b.cerrado_en).localeCompare(String(a.cerrado_en)))
  return cortesCaja[0]?.cerrado_en ?? null
}

/** Filtro opcional de franja: en modo "turnos" acota a las ventas/movs cuya hora
 *  cae en la franja `franjaId` del día `dia` (YYYY-MM-DD). En modo "día" es null. */
interface FiltroFranja { franjaId: string; dia: string; franjas: Franja[] }

/**
 * Resumen conciliable de una CAJA física para su período abierto (desde el último
 * corte de esa caja hasta ahora). El arqueo es por caja, no por cajero: suma TODAS
 * las ventas vigentes de la caja en el período, sin importar quién las hizo. Las
 * ventas/movimientos sin caja (`caja_id == null`, datos viejos) forman el grupo
 * "sin caja" (caja_id null).
 *
 * En modo "turnos" (filtroFranja presente) además se acota a la franja+día.
 */
function calcularResumen(caja_id?: string | null, desde?: string | null, filtroFranja?: FiltroFranja | null) {
  const caja = normCaja(caja_id)
  const inicio = desde ?? inicioPeriodoCaja(caja)

  const enPeriodo = (fecha: string | undefined) =>
    !inicio || (typeof fecha === "string" && fecha > inicio)

  // En modo turnos: la venta/mov debe caer en la franja indicada Y en su día.
  const enFranja = (fecha: string | undefined) => {
    if (!filtroFranja) return true
    if (typeof fecha !== "string") return false
    if (fecha.slice(0, 10) !== filtroFranja.dia) return false
    const f = franjaDeTimestamp(fecha, filtroFranja.franjas)
    return f?.id === filtroFranja.franjaId
  }

  const ventasCaja = cargarVentas()
    .filter((v) => normCaja(v.caja_id) === caja)
    .filter((v) => enPeriodo(v.fecha))
    .filter((v) => enFranja(v.fecha))

  const ventas = ventasCaja.filter((v) => !v.estado || v.estado === "Vigente")

  // Ventas contra entrega aún NO cobradas del período (estado por_cobrar). Su
  // dinero NO está en el cajón todavía (se cobra al liquidar, entra como
  // movimiento "Cobro de entrega" el día del cobro). Solo informativo en el corte.
  const ventas_por_cobrar = ventasCaja
    .filter((v) => v.estado === "por_cobrar")
    .reduce((s, v) => s + Number(v.entrega_total ?? 0), 0)
  const num_por_cobrar = ventasCaja.filter((v) => v.estado === "por_cobrar").length

  const ventas_efectivo = ventas.reduce((s, v) => s + Number(v.pago_efectivo ?? 0), 0)
  const ventas_transferencia = ventas.reduce((s, v) => s + Number(v.pago_transferencia ?? 0), 0)
  const ventas_tarjeta = ventas.reduce((s, v) => s + Number(v.pago_tarjeta ?? 0), 0)
  const ventas_credito = ventas.reduce((s, v) => s + Number(v.pago_credito ?? 0), 0)
  const total_ventas = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)

  // Movimientos de la MISMA caja en el período (fondo, entradas, salidas). No se
  // subdividen por franja: el fondo y los movimientos son del cajón físico (no
  // tienen franja natural) y el fondo inicial se registra al borde del período.
  const movs = cargarMovimientos()
    .filter((m) => normCaja(m.cajaId) === caja)
    .filter((m) => enPeriodo(m.fecha))
  const fondo_inicial = movs.filter((m) => m.origin === "FONDO").reduce((s, m) => s + m.amount, 0)
  const entradas_manuales = movs.filter((m) => m.origin === "MOVIM_E").reduce((s, m) => s + m.amount, 0)
  // Las salidas vienen con signo negativo; las exponemos como magnitud positiva.
  const salidas_manuales = Math.abs(movs.filter((m) => m.origin === "MOVIM_S").reduce((s, m) => s + m.amount, 0))

  const efectivo_esperado = fondo_inicial + ventas_efectivo + entradas_manuales - salidas_manuales

  return {
    caja_id: caja,
    periodo_desde: inicio,
    // Franja del corte (modo turnos) o null (modo día). Eco del filtro aplicado.
    franja_id: filtroFranja?.franjaId ?? null,
    num_ventas: ventas.length,
    total_ventas,
    ventas_efectivo,
    ventas_transferencia,
    ventas_tarjeta,
    ventas_credito,
    // Informativo: ventas contra entrega del período aún sin cobrar (no en cajón).
    ventas_por_cobrar,
    num_por_cobrar,
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
        // Vendedor de la venta (quién la hizo); default al cajero si es vieja.
        vendedor: v.vendedor ?? v.cajero,
        turno_id: v.turno_id,
        total: v.total,
        pago_efectivo: Number(v.pago_efectivo ?? 0),
        pago_transferencia: Number(v.pago_transferencia ?? 0),
        pago_tarjeta: Number(v.pago_tarjeta ?? 0),
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

/**
 * GET /caja/corte?caja_id= — resumen del corte ABIERTO de una caja (período desde
 * su último cierre hasta ahora). `caja_id` vacío = corte del grupo "sin caja"
 * (ventas/movimientos históricos sin caja asignada). `cajero` es opcional (solo
 * informa quién consulta; el arqueo agrupa por caja, no por cajero).
 *
 * Compat: si llega `turno_id` legacy y no `caja_id`, se ignora — el modelo ahora
 * es por caja. El frontend nuevo manda caja_id.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const caja_id = String(req.query["caja_id"] ?? "").trim() || null
  const filtroFranja = resolverFiltroFranja(
    String(req.query["franja_id"] ?? "").trim() || null,
    String(req.query["dia"] ?? "").trim() || null
  )
  const cfg = leerTurnosConfig()
  const resumen = calcularResumen(caja_id, null, filtroFranja)
  // El corte ABIERTO no tiene snapshot cerrado todavía; `cerrado` es null hasta
  // que se cierre. Adjuntamos el modo + franjas para que el frontend sepa si debe
  // ofrecer el selector de franja (modo turnos) o no (modo día).
  res.json({ ...resumen, cerrado: null, modo: cfg.modo, franjas: cfg.franjas })
}

/**
 * Construye el filtro de franja para el corte. Solo aplica en modo "turnos" y si
 * se pasó franja_id + día; devuelve null en modo "día" (corte continuo de Fase 1).
 */
function resolverFiltroFranja(franjaId: string | null, dia: string | null): FiltroFranja | null {
  const cfg = leerTurnosConfig()
  if (cfg.modo !== "turnos" || !franjaId || !dia) return null
  const existe = cfg.franjas.some((f) => f.id === franjaId)
  if (!existe) return null
  return { franjaId, dia, franjas: cfg.franjas }
}

interface CorteBody {
  // Quién REALIZA el corte (el usuario que arquea, no necesariamente quien vendió).
  cajero: string
  cajero_id?: string
  // Caja que se arquea. El período va desde el último corte de esta caja hasta
  // ahora. caja_id null/"" = grupo "sin caja" (ventas/movs históricos sin caja).
  caja_id?: string | null
  caja_name?: string | null
  // Modo turnos: franja+día que se arquea (subdivide el corte). Omitidos = modo día.
  franja_id?: string | null
  dia?: string | null
  efectivo_contado: number
  fondo_dejado?: number
  motivo?: string
  denominaciones?: Record<string, number> | null
}

/**
 * POST /caja/corte — cierra el arqueo de una CAJA para su período abierto.
 * Idempotente respecto al período: si entre la apertura y el cierre nadie más
 * cerró esta caja, crea el corte; si ya se cerró el mismo período, lo devuelve.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as CorteBody
  const cajero = String(body.cajero ?? "").trim()

  if (!cajero) {
    res.status(400).json({ error: "Falta el campo: cajero (quién realiza el corte)" })
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
  // El arqueo agrupa por caja, en su período abierto (desde el último cierre).
  const caja_id = normCaja(body.caja_id)
  const caja_name = body.caja_name ? String(body.caja_name) : null
  const periodo_desde = inicioPeriodoCaja(caja_id)
  const filtroFranja = resolverFiltroFranja(body.franja_id ?? null, body.dia ?? null)
  const resumen = calcularResumen(caja_id, periodo_desde, filtroFranja)
  const diferencia = efectivo_contado - resumen.efectivo_esperado
  const cerrado_en = new Date().toISOString()

  // Cierre idempotente bajo el lock del archivo de cortes: una caja no puede tener
  // dos cortes con el mismo periodo_desde (y franja, en modo turnos) ya cerrado.
  let yaCerrado: CorteCerrado | null = null
  let registro: CorteCerrado | null = null
  await updateJson<CorteCerrado[]>(CORTES_FILE, [], (cortes) => {
    const existente = cortes.find(
      (c) => normCaja(c.caja_id) === caja_id
        && (c.periodo_desde ?? null) === (periodo_desde ?? null)
        && (c.franja_id ?? null) === (filtroFranja?.franjaId ?? null)
        && (c.franja_dia ?? null) === (filtroFranja?.dia ?? null)
    )
    if (existente) { yaCerrado = existente; return cortes }
    registro = {
      cajero,
      caja_id,
      caja_name,
      periodo_desde,
      franja_id: filtroFranja?.franjaId ?? null,
      franja_dia: filtroFranja?.dia ?? null,
      cerrado_en,
      num_ventas: resumen.num_ventas,
      total_ventas: resumen.total_ventas,
      ventas_efectivo: resumen.ventas_efectivo,
      ventas_transferencia: resumen.ventas_transferencia,
      ventas_tarjeta: resumen.ventas_tarjeta,
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

  // Fondo dejado para el siguiente período de la MISMA caja: se registra como
  // movimiento "Fondo inicial" (auto) con timestamp POSTERIOR al cierre. Como el
  // período siguiente es "fecha > cerrado_en", este fondo cae automáticamente en
  // el próximo corte de la caja, sin depender de un turno_id destino.
  if (fondo_dejado > 0) {
    const now = new Date()
    // Un milisegundo después del cierre garantiza que el fondo quede en el NUEVO
    // período (estrictamente mayor que cerrado_en) y no en el que se acaba de cerrar.
    const fechaFondo = new Date(new Date(cerrado_en).getTime() + 1).toISOString()
    await withFileLock(MOVIMIENTOS_FILE, async () => {
      const movs = readJson<Movimiento[]>(MOVIMIENTOS_FILE, [])
      const mov: Movimiento = {
        id: crypto.randomBytes(6).toString("hex"),
        date: fechaFondo.slice(0, 10),
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        fecha: fechaFondo,
        origin: "FONDO",
        desc: `Fondo inicial (dejado del corte ${caja_name ?? "sin caja"})`,
        method: "efectivo",
        amount: fondo_dejado,
        category: "Fondo inicial",
        cajaId: caja_id,
        cajaName: caja_name,
        cajeroId: body.cajero_id ?? undefined,
        cajeroName: cajero,
        turnoId: null,
        auto: true,
      }
      writeJsonAtomic(MOVIMIENTOS_FILE, [mov, ...movs])
    })
  }

  res.json({ ok: true, corte: registro })
}
