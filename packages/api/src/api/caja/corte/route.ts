import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CORTES_FILE = path.join(__dirname, "../../../../data/cortes-pos.json")

interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
}

function cargarJSON<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[]
  } catch {
    return []
  }
}

function guardarJSON(filePath: string, data: unknown[]) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}

/** GET /caja/corte?cajero=&turno_id= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cajero = String(req.query["cajero"] ?? "").trim()
  const turno_id = String(req.query["turno_id"] ?? "").trim()

  if (!cajero || !turno_id) {
    res.status(400).json({ error: "Faltan parámetros: cajero, turno_id" })
    return
  }

  const ventas = cargarJSON<VentaRegistro>(VENTAS_FILE)
  const ventasTurno = ventas.filter((v) => v.cajero === cajero && v.turno_id === turno_id)
  const total = ventasTurno.reduce((sum, v) => sum + v.total, 0)

  res.json({
    cajero,
    turno_id,
    num_ventas: ventasTurno.length,
    total,
    ventas: ventasTurno.map((v) => ({
      folio: v.folio,
      fecha: v.fecha,
      cajero: v.cajero,
      turno_id: v.turno_id,
      total: v.total,
    })),
  })
}

/** POST /caja/corte */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cajero, turno_id } = req.body as { cajero: string; turno_id: string }

  if (!cajero || !turno_id) {
    res.status(400).json({ error: "Faltan campos: cajero, turno_id" })
    return
  }

  const cortes = cargarJSON<{ cajero: string; turno_id: string; cerrado_en: string }>(CORTES_FILE)
  const yaCerrado = cortes.some((c) => c.cajero === cajero && c.turno_id === turno_id)
  if (!yaCerrado) {
    cortes.push({ cajero, turno_id, cerrado_en: new Date().toISOString() })
    guardarJSON(CORTES_FILE, cortes)
  }

  res.json({ ok: true })
}
