import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_FACTURABLE } from "../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../modules/ferremex-facturable/service"

/**
 * /caja/facturable/deptos — marca de "departamento facturable".
 *
 * GET  → Record<departamento, boolean> (solo los deptos con fila; ausente = no
 *        facturable, default conservador).
 * POST → { departamento, facturable } upsert de la marca.
 *
 * Un departamento facturable habilita que sus artículos (con clave SAT + saldo)
 * entren a las facturas. La factura global del día excluye lo de deptos NO
 * facturables aunque se haya vendido con ticket.
 */

/** GET /caja/facturable/deptos */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    res.json(await service.mapaDeptos())
  } catch (e: any) {
    console.error("[caja/facturable/deptos] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los departamentos facturables" })
  }
}

interface DeptoBody { departamento?: string; facturable?: boolean }

/** POST /caja/facturable/deptos — marca/desmarca un depto como facturable. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as DeptoBody
    const departamento = String(body.departamento ?? "").trim()
    if (!departamento) {
      res.status(400).json({ error: "Falta el nombre del departamento" }); return
    }
    const facturable = body.facturable !== false // default true
    const service: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    await service.marcarDepto(departamento, facturable)
    res.json({ departamento, facturable })
  } catch (e: any) {
    console.error("[caja/facturable/deptos] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar el departamento" })
  }
}
