import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMISIONES } from "../../../../modules/ferremex-comisiones"
import type FerremexComisionesService from "../../../../modules/ferremex-comisiones/service"

/**
 * /caja/comisiones/ejes — qué ámbitos de la taxonomía (marca/categoría/
 * departamento) ADMITEN comisión para vendedores. Toggle GLOBAL (no por
 * empleado), editado desde Catálogos (EditPanel de cada Depto/Cat/Marca).
 *
 * Consumido por CatalogosColumnas (toggle "Admite comisión") y por el selector
 * de "Agregar ámbito" del tab Comisiones en Empleados (solo lista los ejes
 * habilitados aquí).
 */

const AMBITOS = ["marca", "categoria", "departamento"] as const

export interface ComisionEjePOS {
  id: string
  ambito: (typeof AMBITOS)[number]
  ref: string
  habilitado: boolean
}

function aEjePOS(e: any): ComisionEjePOS {
  return {
    id: e.id,
    ambito: AMBITOS.includes(e.ambito) ? e.ambito : "marca",
    ref: e.ref ?? "",
    habilitado: !!e.habilitado,
  }
}

/** GET /caja/comisiones/ejes — lista todos los ejes registrados (habilitados o no). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)
    const ejes = await service.listComisionEjes({}, { take: 10000 })
    ejes.sort((a: any, b: any) => String(a.ref).localeCompare(String(b.ref), "es", { numeric: true }))
    res.json(ejes.map(aEjePOS))
  } catch (e: any) {
    console.error("[caja/comisiones/ejes] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los ámbitos de comisión" })
  }
}

/**
 * PATCH /caja/comisiones/ejes — crea o alterna el toggle de un ámbito. Body:
 * { ambito, ref, habilitado }. Upsert por (ambito, ref) normalizado: si ya
 * existe una fila para ese ámbito+ref, actualiza `habilitado`; si no, la crea.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Partial<ComisionEjePOS>
    const ambito = body.ambito as ComisionEjePOS["ambito"]
    if (!AMBITOS.includes(ambito)) {
      res.status(400).json({ error: "Ámbito inválido (marca, categoría o departamento)" }); return
    }
    const ref = String(body.ref ?? "").trim()
    if (!ref) { res.status(400).json({ error: "ref es requerido" }); return }
    const habilitado = body.habilitado !== undefined ? !!body.habilitado : true

    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)
    const existentes = await service.listComisionEjes({ ambito, ref }, { take: 5 })
    let fila
    if (existentes.length > 0) {
      await service.updateComisionEjes({ id: existentes[0].id, habilitado })
      ;[fila] = await service.listComisionEjes({ id: existentes[0].id })
    } else {
      fila = await service.createComisionEjes({ ambito, ref, habilitado })
    }
    res.json(aEjePOS(fila))
  } catch (e: any) {
    console.error("[caja/comisiones/ejes] PATCH error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo guardar el ámbito de comisión" })
  }
}
