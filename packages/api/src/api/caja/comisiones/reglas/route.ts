import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMISIONES } from "../../../../modules/ferremex-comisiones"
import type FerremexComisionesService from "../../../../modules/ferremex-comisiones/service"

/**
 * /caja/comisiones/reglas — % de comisión que un EMPLEADO recibe sobre un
 * ámbito de la taxonomía (marca/categoría/departamento) ya habilitado en
 * ComisionEje. Consumido por el tab "Comisiones" de EmployeesModule.
 *
 * Resolución de tasa por línea (motor compartido en lib/comisiones.ts, no
 * aquí): marca → categoría → departamento → 0% (sin regla = sin comisión).
 */

const AMBITOS = ["marca", "categoria", "departamento"] as const

export interface ComisionReglaPOS {
  id: string
  empleado_id: string
  ambito: (typeof AMBITOS)[number]
  ref: string
  tasa: number
  activa: boolean
}

export function aReglaPOS(r: any): ComisionReglaPOS {
  return {
    id: r.id,
    empleado_id: r.empleado_id ?? "",
    ambito: AMBITOS.includes(r.ambito) ? r.ambito : "marca",
    ref: r.ref ?? "",
    tasa: Number(r.tasa) || 0,
    activa: !!r.activa,
  }
}

export function sanearRegla(body: Partial<ComisionReglaPOS>): { data: Record<string, any> } | { error: string } {
  const empleado_id = String(body.empleado_id ?? "").trim()
  if (!empleado_id) return { error: "empleado_id es requerido" }
  const ambito = body.ambito as ComisionReglaPOS["ambito"]
  if (!AMBITOS.includes(ambito)) return { error: "Ámbito inválido (marca, categoría o departamento)" }
  const ref = String(body.ref ?? "").trim()
  if (!ref) return { error: "Selecciona la marca, categoría o departamento de la regla" }
  const tasa = Number(body.tasa)
  if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
    return { error: "La comisión debe estar entre 0 y 100%" }
  }
  return {
    data: {
      empleado_id,
      ambito,
      ref,
      tasa: Math.round(tasa * 100) / 100,
      activa: body.activa !== undefined ? !!body.activa : true,
    },
  }
}

/** GET /caja/comisiones/reglas?empleado_id=… — reglas de un empleado (o todas si se omite). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const empleado_id = (req.query.empleado_id as string | undefined)?.trim()
    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)
    const filtro = empleado_id ? { empleado_id } : {}
    const reglas = await service.listComisionReglas(filtro, { take: 10000 })
    reglas.sort((a: any, b: any) => String(a.ref).localeCompare(String(b.ref), "es", { numeric: true }))
    res.json(reglas.map(aReglaPOS))
  } catch (e: any) {
    console.error("[caja/comisiones/reglas] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las reglas de comisión" })
  }
}

/** POST /caja/comisiones/reglas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const saneado = sanearRegla((req.body ?? {}) as Partial<ComisionReglaPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)

    // El ámbito+ref debe estar habilitado en Catálogos antes de poder asignarle %.
    const habilitado = await service.ejeHabilitado(saneado.data.ambito, saneado.data.ref)
    if (!habilitado) {
      res.status(400).json({ error: `"${saneado.data.ref}" no admite comisión — habilítalo primero en Catálogos` })
      return
    }

    // Evitar duplicados por (empleado_id, ambito, ref).
    const existentes = await service.listComisionReglas({
      empleado_id: saneado.data.empleado_id,
      ambito: saneado.data.ambito,
      ref: saneado.data.ref,
    })
    if (existentes.length > 0) {
      res.status(400).json({ error: `Ya existe una regla de este empleado para "${saneado.data.ref}"` }); return
    }
    const creada = await service.createComisionReglas(saneado.data)
    res.status(201).json(aReglaPOS(creada))
  } catch (e: any) {
    console.error("[caja/comisiones/reglas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear la regla de comisión" })
  }
}
