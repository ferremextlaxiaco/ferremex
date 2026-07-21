import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMISIONES } from "../../../../../modules/ferremex-comisiones"
import type FerremexComisionesService from "../../../../../modules/ferremex-comisiones/service"
import { aReglaPOS, sanearRegla, type ComisionReglaPOS } from "../route"

/** /caja/comisiones/reglas/:id — edición y borrado de una regla de comisión. */

/** PUT /caja/comisiones/reglas/:id */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)
    const [existente] = await service.listComisionReglas({ id })
    if (!existente) { res.status(404).json({ error: "Regla no encontrada" }); return }
    const saneado = sanearRegla((req.body ?? {}) as Partial<ComisionReglaPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    // No permitir colisionar con OTRA regla del mismo empleado+ámbito+ref.
    const colisiones = await service.listComisionReglas({
      empleado_id: saneado.data.empleado_id,
      ambito: saneado.data.ambito,
      ref: saneado.data.ref,
    })
    if (colisiones.some((c: any) => c.id !== id)) {
      res.status(400).json({ error: `Ya existe otra regla de este empleado para "${saneado.data.ref}"` }); return
    }
    await service.updateComisionReglas({ id, ...saneado.data })
    const [actualizada] = await service.listComisionReglas({ id })
    res.json(aReglaPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/comisiones/reglas/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar la regla" })
  }
}

/** DELETE /caja/comisiones/reglas/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexComisionesService = req.scope.resolve(FERREMEX_COMISIONES)
    const [existente] = await service.listComisionReglas({ id })
    if (!existente) { res.status(404).json({ error: "Regla no encontrada" }); return }
    await service.deleteComisionReglas(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/comisiones/reglas/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la regla" })
  }
}
