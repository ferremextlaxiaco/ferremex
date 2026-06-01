import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMPRAS } from "../../../../modules/ferremex-compras"
import type FerremexComprasService from "../../../../modules/ferremex-compras/service"
import { aCompraPOS } from "../route"

/** /caja/compras/:id — cancelación de una compra. */

/**
 * PATCH /caja/compras/:id — cancela una compra (estado → Cancelada + auditoría).
 * Body: { estado: "Cancelada", motivo }. Idempotente: si ya está cancelada, no
 * sobreescribe el motivo/fecha originales. El descuento de inventario lo hace el
 * frontend (ConsultarCompras vía incrementarInventario con deltas negativos),
 * como ya ocurría con localStorage.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexComprasService = req.scope.resolve(FERREMEX_COMPRAS)
    const [compra] = await service.listCompras({ id })
    if (!compra) {
      res.status(404).json({ error: "Compra no encontrada" }); return
    }
    const body = (req.body ?? {}) as { estado?: string; motivo?: string }
    if (body.estado !== "Cancelada") {
      res.status(400).json({ error: "Solo se admite estado 'Cancelada'" }); return
    }
    const motivo = String(body.motivo ?? "").trim()
    if (motivo.length < 5) {
      res.status(400).json({ error: "El motivo debe tener al menos 5 caracteres" }); return
    }
    // Idempotente: si ya está cancelada, devolverla sin re-escribir la auditoría.
    if ((compra as any).estado !== "Cancelada") {
      await service.updateCompras({
        id,
        estado: "Cancelada",
        cancelada_el: new Date().toISOString(),
        motivo_cancelacion: motivo,
      })
    }
    const [actualizada] = await service.listarComprasConArticulos({ id })
    res.json(aCompraPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/compras/:id] PATCH error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cancelar la compra" })
  }
}
