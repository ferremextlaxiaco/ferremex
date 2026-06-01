import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CAJAS } from "../../../modules/ferremex-cajas"
import type FerremexCajasService from "../../../modules/ferremex-cajas/service"

/**
 * /caja/cajas — CRUD del catálogo de cajas físicas del POS.
 * Dato maestro compartido entre terminales (antes en localStorage
 * `pos_cajas_catalogo`). Consumido por CashMovementsModule y EmployeesModule.
 */

export interface CajaPOS {
  id: string
  nombre: string
  descripcion: string | null
  activa: boolean
}

/** Normaliza un registro de BD al shape que espera el frontend (sin created_at/etc). */
export function aCajaPOS(c: any): CajaPOS {
  return {
    id: c.id,
    nombre: c.nombre ?? "",
    descripcion: c.descripcion ?? null,
    activa: !!c.activa,
  }
}

/** GET /caja/cajas — lista las cajas, ordenadas por nombre. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const cajas = await cajasService.listCajas({})
    cajas.sort((a: any, b: any) =>
      String(a.nombre).localeCompare(String(b.nombre), "es", { numeric: true })
    )
    res.json(cajas.map(aCajaPOS))
  } catch (e: any) {
    console.error("[caja/cajas] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las cajas" })
  }
}

/** POST /caja/cajas — crea una caja. Valida nombre. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Partial<CajaPOS>
    if (!body.nombre || !String(body.nombre).trim()) {
      res.status(400).json({ error: "El nombre de la caja es requerido" }); return
    }
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const creada = await cajasService.createCajas({
      nombre: String(body.nombre).trim(),
      descripcion: body.descripcion != null ? String(body.descripcion) : null,
      activa: body.activa ?? true,
    })
    res.status(201).json(aCajaPOS(creada))
  } catch (e: any) {
    console.error("[caja/cajas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear la caja" })
  }
}
