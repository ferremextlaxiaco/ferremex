import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_BIOMETRIA } from "../../../../../modules/ferremex-biometria"
import type FerremexBiometriaService from "../../../../../modules/ferremex-biometria/service"

/**
 * /caja/biometria/huellas/[id] — baja de una plantilla.
 *
 * DELETE → soft-disable (activa=false). No borra (auditoría): la plantilla deja
 * de contar como candidata pero queda el rastro. Consumido por AdminClientesLista
 * / EmployeesModule (botón "quitar huella").
 */

/** DELETE /caja/biometria/huellas/[id] */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { id } = req.params
    if (!id) { res.status(400).json({ error: "Falta id" }); return }
    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const [existe] = await service.listHuellaBiometricas({ id })
    if (!existe) { res.status(404).json({ error: "Huella no encontrada" }); return }
    await service.desactivarHuella(id)
    res.json({ ok: true, id })
  } catch (e: any) {
    console.error("[caja/biometria/huellas/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la huella" })
  }
}
