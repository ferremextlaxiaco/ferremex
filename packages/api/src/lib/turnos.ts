/**
 * Helpers compartidos del modelo de turnos/franjas (backend).
 *
 * En modo "turnos" el corte de caja se subdivide por franja horaria. Estas
 * utilidades resuelven en qué franja cae un timestamp y leen la config global
 * (modo + franjas) de turnos-config.json.
 */
import * as path from "path"
import { readJson } from "./json-store"

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

const CONFIG_FILE = path.join(__dirname, "../../data/turnos-config.json")

const DEFAULT: TurnosConfig = {
  modo: "dia",
  franjas: [
    { id: "matutino",   nombre: "Matutino",   desde: "08:00", hasta: "14:00" },
    { id: "vespertino", nombre: "Vespertino", desde: "14:00", hasta: "21:00" },
  ],
}

/** Lee la config de turnos (con defaults seguros). */
export function leerTurnosConfig(): TurnosConfig {
  const c = readJson<Partial<TurnosConfig>>(CONFIG_FILE, DEFAULT)
  return {
    modo: c.modo === "turnos" ? "turnos" : "dia",
    franjas: Array.isArray(c.franjas) && c.franjas.length > 0 ? (c.franjas as Franja[]) : DEFAULT.franjas,
  }
}

/** Minutos desde medianoche para "HH:MM" (NaN si malformado). */
function minutos(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "")
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Franja a la que pertenece un timestamp ISO según las franjas dadas. Compara por
 * hora local del servidor (las cajas operan en la zona del negocio). Una franja
 * cubre [desde, hasta). Si ninguna franja contiene la hora, devuelve null (la
 * venta queda fuera de franja — se reporta aparte para no perderla).
 */
export function franjaDeTimestamp(iso: string, franjas: Franja[]): Franja | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const min = d.getHours() * 60 + d.getMinutes()
  for (const f of franjas) {
    const a = minutos(f.desde), b = minutos(f.hasta)
    if (isNaN(a) || isNaN(b)) continue
    // Franja normal (desde < hasta). Franja que cruza medianoche (desde > hasta)
    // cubre [desde, 24h) ∪ [0, hasta).
    if (a <= b ? (min >= a && min < b) : (min >= a || min < b)) return f
  }
  return null
}
