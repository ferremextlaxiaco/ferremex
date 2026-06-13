import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../../modules/ferremex-monedero/service"
import { aNivelPOS, sanearNivel, type NivelMonederoPOS } from "../route"

/** /caja/monedero/niveles/:id — edición y borrado de un nivel. */

/** PUT /caja/monedero/niveles/:id */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const [existente] = await service.listNivelMonederos({ id })
    if (!existente) { res.status(404).json({ error: "Nivel no encontrado" }); return }
    const saneado = sanearNivel((req.body ?? {}) as Partial<NivelMonederoPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    await service.updateNivelMonederos({ id, ...saneado.data })
    const [actualizado] = await service.listNivelMonederos({ id })
    res.json(aNivelPOS(actualizado))
  } catch (e: any) {
    console.error("[caja/monedero/niveles/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar el nivel" })
  }
}

/** DELETE /caja/monedero/niveles/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const [existente] = await service.listNivelMonederos({ id })
    if (!existente) { res.status(404).json({ error: "Nivel no encontrado" }); return }
    await service.deleteNivelMonederos(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/monedero/niveles/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar el nivel" })
  }
}
