import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CAJAS } from "../../../../modules/ferremex-cajas"
import type FerremexCajasService from "../../../../modules/ferremex-cajas/service"
import { aCajaPOS, type CajaPOS } from "../route"
import { nulificarCajaEnUsuarios } from "../../usuarios/route"

/** /caja/cajas/:id — edición y borrado de una caja del catálogo. */

/** PUT /caja/cajas/:id — actualiza nombre/descripcion/activa. */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const [existente] = await cajasService.listCajas({ id })
    if (!existente) {
      res.status(404).json({ error: "Caja no encontrada" }); return
    }
    const body = (req.body ?? {}) as Partial<CajaPOS>
    if (body.nombre !== undefined && !String(body.nombre).trim()) {
      res.status(400).json({ error: "El nombre no puede quedar vacío" }); return
    }
    await cajasService.updateCajas({
      id,
      ...(body.nombre !== undefined ? { nombre: String(body.nombre).trim() } : {}),
      ...(body.descripcion !== undefined
        ? { descripcion: body.descripcion != null ? String(body.descripcion) : null }
        : {}),
      ...(body.activa !== undefined ? { activa: !!body.activa } : {}),
    })
    const [actualizada] = await cajasService.listCajas({ id })
    res.json(aCajaPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/cajas/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar la caja" })
  }
}

/** DELETE /caja/cajas/:id — elimina la caja y limpia su asignación en usuarios. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const cajasService: FerremexCajasService = req.scope.resolve(FERREMEX_CAJAS)
    const [existente] = await cajasService.listCajas({ id })
    if (!existente) {
      res.status(404).json({ error: "Caja no encontrada" }); return
    }
    await cajasService.deleteCajas(id)
    // Evita asignaciones colgando: cualquier empleado con esta caja queda sin caja.
    await nulificarCajaEnUsuarios(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/cajas/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la caja" })
  }
}
