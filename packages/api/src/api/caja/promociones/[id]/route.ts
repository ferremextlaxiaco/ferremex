import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROMOCIONES } from "../../../../modules/ferremex-promociones"
import type FerremexPromocionesService from "../../../../modules/ferremex-promociones/service"
import { aPromocionPOS, sanearPromocion, type PromocionPOS } from "../route"

/** /caja/promociones/:id — detalle, edición y borrado de una promoción. */

/** GET /caja/promociones/:id — una promoción por id. 404 si no existe. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexPromocionesService = req.scope.resolve(FERREMEX_PROMOCIONES)
    const [promo] = await service.listPromocions({ id })
    if (!promo) {
      res.status(404).json({ error: "Promoción no encontrada" }); return
    }
    res.json(aPromocionPOS(promo))
  } catch (e: any) {
    console.error("[caja/promociones/:id] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar la promoción" })
  }
}

/** PUT /caja/promociones/:id — reemplaza la promoción (revalida todo el cuerpo). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexPromocionesService = req.scope.resolve(FERREMEX_PROMOCIONES)
    const [existente] = await service.listPromocions({ id })
    if (!existente) {
      res.status(404).json({ error: "Promoción no encontrada" }); return
    }
    const saneado = sanearPromocion((req.body ?? {}) as Partial<PromocionPOS>)
    if ("error" in saneado) {
      res.status(400).json({ error: saneado.error }); return
    }
    await service.updatePromocions({ id, ...saneado.data })
    const [actualizada] = await service.listPromocions({ id })
    res.json(aPromocionPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/promociones/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar la promoción" })
  }
}

/** DELETE /caja/promociones/:id — elimina la promoción. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexPromocionesService = req.scope.resolve(FERREMEX_PROMOCIONES)
    const [existente] = await service.listPromocions({ id })
    if (!existente) {
      res.status(404).json({ error: "Promoción no encontrada" }); return
    }
    await service.deletePromocions(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/promociones/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la promoción" })
  }
}
