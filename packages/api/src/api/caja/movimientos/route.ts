import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "../../../lib/json-store"

/**
 * /caja/movimientos — movimientos manuales de caja (entradas, salidas y fondo
 * inicial) del POS.
 *
 * Antes vivían solo en localStorage por día y por terminal (cada caja con su
 * copia aislada), lo que hacía imposible: (a) que un supervisor en otra
 * terminal viera los movimientos, (b) agrupar por turno para el corte/arqueo.
 * Ahora se persisten server-side en JSON (lib/json-store) y se pueden filtrar
 * por fecha, turno, caja o cajero.
 *
 * Las VENTAS no viven aquí: el corte las combina leyendo /caja/ventas. Aquí
 * solo viven los movimientos manuales (MOVIM_E, MOVIM_S, FONDO).
 */

type MovOrigin = "MOVIM_E" | "MOVIM_S" | "FONDO"

interface Movimiento {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  fecha: string // ISO completa (para ordenar)
  origin: MovOrigin
  desc: string
  method: string // "efectivo" (los manuales hoy siempre son efectivo)
  amount: number // con signo: salidas negativas, entradas/fondo positivas
  category?: string
  cajaId?: string | null
  cajaName?: string | null
  cajeroId?: string
  cajeroName?: string
  turnoId?: string | null
  supplier?: string
  notes?: string
  // Marca los movimientos de fondo inicial creados automáticamente al cerrar un
  // corte (fondo dejado para el siguiente turno), para distinguirlos de los
  // capturados a mano.
  auto?: boolean
  [k: string]: unknown
}

const MOVIMIENTOS_FILE = path.join(__dirname, "../../../../data/movimientos-caja.json")

function cargarMovimientos(): Movimiento[] {
  return readJson<Movimiento[]>(MOVIMIENTOS_FILE, [])
}

/**
 * GET /caja/movimientos — lista movimientos manuales.
 * Filtros opcionales por query: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&turno_id=&caja_id=&cajero_id=
 * Más reciente primero.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { desde, hasta, turno_id, caja_id, cajero_id } = req.query as Record<string, string>
  let movs = cargarMovimientos()
  if (desde) movs = movs.filter((m) => m.date >= desde)
  if (hasta) movs = movs.filter((m) => m.date <= hasta)
  if (turno_id) movs = movs.filter((m) => m.turnoId === turno_id)
  if (caja_id) movs = movs.filter((m) => String(m.cajaId ?? "") === caja_id)
  if (cajero_id) movs = movs.filter((m) => String(m.cajeroId ?? "") === cajero_id)
  movs = movs.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
  res.json(movs)
}

/** POST /caja/movimientos — registra un movimiento manual. Genera id server-side. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<Movimiento>

  const origin = body.origin as MovOrigin
  if (origin !== "MOVIM_E" && origin !== "MOVIM_S" && origin !== "FONDO") {
    res.status(400).json({ error: "origin inválido (MOVIM_E | MOVIM_S | FONDO)" })
    return
  }
  const monto = Number(body.amount)
  if (!Number.isFinite(monto) || monto === 0) {
    res.status(400).json({ error: "amount debe ser un número distinto de 0" })
    return
  }
  if (!body.desc || !String(body.desc).trim()) {
    res.status(400).json({ error: "La descripción es obligatoria" })
    return
  }

  // Normalizamos el signo según el tipo: salidas negativas; entradas y fondo
  // positivas. Confiamos en el tipo, no en el signo que mande el cliente.
  const abs = Math.abs(monto)
  const amount = origin === "MOVIM_S" ? -abs : abs

  const now = new Date()
  const isoNow = now.toISOString()
  const date = typeof body.date === "string" ? body.date : isoNow.slice(0, 10)

  let nuevo: Movimiento | null = null
  await updateJson<Movimiento[]>(MOVIMIENTOS_FILE, [], (movs) => {
    nuevo = {
      id: crypto.randomBytes(6).toString("hex"),
      date,
      time: typeof body.time === "string" ? body.time
        : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      fecha: isoNow,
      origin,
      desc: String(body.desc).trim(),
      method: "efectivo",
      amount,
      category: body.category ? String(body.category) : (origin === "FONDO" ? "Fondo inicial" : undefined),
      cajaId: body.cajaId != null ? String(body.cajaId) : null,
      cajaName: body.cajaName != null ? String(body.cajaName) : null,
      cajeroId: body.cajeroId != null ? String(body.cajeroId) : undefined,
      cajeroName: body.cajeroName != null ? String(body.cajeroName) : undefined,
      turnoId: body.turnoId != null ? String(body.turnoId) : null,
      ...(body.supplier ? { supplier: String(body.supplier).trim() } : {}),
      ...(body.notes ? { notes: String(body.notes).trim() } : {}),
      ...(body.auto ? { auto: true } : {}),
    }
    return [nuevo!, ...movs]
  })

  res.status(201).json(nuevo!)
}

/** DELETE /caja/movimientos — elimina un movimiento manual (id en query). */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.query as Record<string, string>).id
  if (!id) {
    res.status(400).json({ error: "Falta id" })
    return
  }
  let existia = false
  await updateJson<Movimiento[]>(MOVIMIENTOS_FILE, [], (movs) => {
    existia = movs.some((m) => m.id === id)
    return movs.filter((m) => m.id !== id)
  })
  if (!existia) {
    res.status(404).json({ error: "Movimiento no encontrado" })
    return
  }
  res.json({ ok: true })
}
