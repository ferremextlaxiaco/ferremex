import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../../modules/ferremex-monedero/service"
import { aReglaPOS, sanearRegla, type ReglaPuntosPOS } from "../route"

/** /caja/monedero/reglas/:id — edición y borrado de una regla de puntos. */

/** PUT /caja/monedero/reglas/:id */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const [existente] = await service.listReglaPuntos({ id })
    if (!existente) { res.status(404).json({ error: "Regla no encontrada" }); return }
    const saneado = sanearRegla((req.body ?? {}) as Partial<ReglaPuntosPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    // No permitir colisionar con OTRA regla del mismo ámbito+ref.
    const colisiones = await service.listReglaPuntos({ ambito: saneado.data.ambito, ref: saneado.data.ref })
    if (colisiones.some((c: any) => c.id !== id)) {
      res.status(400).json({ error: `Ya existe otra regla para "${saneado.data.ref}" en ese ámbito` }); return
    }
    await service.updateReglaPuntos({ id, ...saneado.data })
    const [actualizada] = await service.listReglaPuntos({ id })
    res.json(aReglaPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/monedero/reglas/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar la regla" })
  }
}

/** DELETE /caja/monedero/reglas/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const [existente] = await service.listReglaPuntos({ id })
    if (!existente) { res.status(404).json({ error: "Regla no encontrada" }); return }
    await service.deleteReglaPuntos(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/monedero/reglas/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la regla" })
  }
}
