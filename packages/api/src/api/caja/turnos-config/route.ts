import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson, writeJsonAtomic } from "../../../lib/json-store"

/**
 * /caja/turnos-config — configuración global del modelo de turnos/corte.
 *
 * `modo "dia"` (default): el corte de caja es continuo (desde el último cierre de
 * la caja hasta ahora), sin importar la hora. Es el comportamiento de Fase 1.
 *
 * `modo "turnos"`: el corte de caja se SUBDIVIDE por franja horaria. Cada caja
 * tiene un corte por franja (Matutino / Vespertino…) en vez de uno continuo. Las
 * franjas son configurables (nombre + rango horario HH:MM).
 *
 * Los horarios laborales por empleado viven en el usuario (/caja/usuarios), no
 * aquí: esto es solo la config GLOBAL del modo y las franjas.
 */

const CONFIG_FILE = path.join(__dirname, "../../../../data/turnos-config.json")

export interface Franja {
  id: string
  nombre: string
  desde: string  // "HH:MM"
  hasta: string  // "HH:MM"
}

export interface TurnosConfig {
  modo: "dia" | "turnos"
  franjas: Franja[]
}

const DEFAULT: TurnosConfig = {
  modo: "dia",
  franjas: [
    { id: "matutino",   nombre: "Matutino",   desde: "08:00", hasta: "14:00" },
    { id: "vespertino", nombre: "Vespertino", desde: "14:00", hasta: "21:00" },
  ],
}

function cargar(): TurnosConfig {
  const c = readJson<Partial<TurnosConfig>>(CONFIG_FILE, DEFAULT)
  return {
    modo: c.modo === "turnos" ? "turnos" : "dia",
    franjas: Array.isArray(c.franjas) && c.franjas.length > 0 ? (c.franjas as Franja[]) : DEFAULT.franjas,
  }
}

/** GET /caja/turnos-config */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(cargar())
}

/** Valida "HH:MM" 24h. */
function esHora(s: unknown): boolean {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

/** PUT /caja/turnos-config */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<TurnosConfig>
  const actual = cargar()

  const modo: TurnosConfig["modo"] = body.modo === "turnos" ? "turnos" : body.modo === "dia" ? "dia" : actual.modo

  let franjas = actual.franjas
  if (Array.isArray(body.franjas)) {
    // Sanear cada franja; rechazar si alguna es inválida (evita corromper el modo).
    const limpias: Franja[] = []
    for (const f of body.franjas) {
      const nombre = String((f as Franja)?.nombre ?? "").trim()
      const desde = (f as Franja)?.desde
      const hasta = (f as Franja)?.hasta
      if (!nombre || !esHora(desde) || !esHora(hasta)) {
        res.status(400).json({ error: `Franja inválida: cada franja requiere nombre y horas HH:MM válidas` })
        return
      }
      const id = String((f as Franja)?.id ?? "").trim() || nombre.toLowerCase().replace(/\s+/g, "-")
      limpias.push({ id, nombre, desde, hasta })
    }
    if (modo === "turnos" && limpias.length === 0) {
      res.status(400).json({ error: "El modo 'turnos' requiere al menos una franja" })
      return
    }
    franjas = limpias.length > 0 ? limpias : actual.franjas
  }

  const next: TurnosConfig = { modo, franjas }
  writeJsonAtomic(CONFIG_FILE, next)
  res.json(next)
}
