import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROVEEDORES } from "../../../../../../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../../../../../../modules/ferremex-proveedores/service"
import { aFacturaPOS, type FacturaProveedorPOS } from "../../../route"

/** /caja/proveedores/:id/facturas/:facturaId — edición y borrado de una factura. */

/** PUT — edita una factura (incluye marcar `pagada`). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id, facturaId } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const [factura] = await service.listFacturaProveedors({ id: facturaId, proveedor_id: id })
    if (!factura) {
      res.status(404).json({ error: "Factura no encontrada" }); return
    }
    const body = (req.body ?? {}) as Partial<FacturaProveedorPOS>
    if (body.numero_factura !== undefined && !String(body.numero_factura).trim()) {
      res.status(400).json({ error: "El número de factura no puede quedar vacío" }); return
    }
    if (body.monto !== undefined) {
      const monto = Number(body.monto)
      if (!Number.isFinite(monto) || monto <= 0) {
        res.status(400).json({ error: "El monto debe ser un número positivo" }); return
      }
    }
    await service.updateFacturaProveedors({
      id: facturaId,
      ...(body.numero_factura !== undefined ? { numero_factura: String(body.numero_factura).trim() } : {}),
      ...(body.fecha_emision !== undefined ? { fecha_emision: String(body.fecha_emision) } : {}),
      ...(body.dias_credito !== undefined ? { dias_credito: Number(body.dias_credito) || 0 } : {}),
      ...(body.monto !== undefined ? { monto: Number(body.monto) } : {}),
      ...(body.descripcion !== undefined ? { descripcion: String(body.descripcion) } : {}),
      ...(body.pagada !== undefined ? { pagada: !!body.pagada } : {}),
    })
    const [actualizada] = await service.listFacturaProveedors({ id: facturaId })
    res.json(aFacturaPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/proveedores/:id/facturas/:facturaId] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar la factura" })
  }
}

/** DELETE — elimina una factura. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id, facturaId } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const [factura] = await service.listFacturaProveedors({ id: facturaId, proveedor_id: id })
    if (!factura) {
      res.status(404).json({ error: "Factura no encontrada" }); return
    }
    await service.deleteFacturaProveedors(facturaId)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/proveedores/:id/facturas/:facturaId] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar la factura" })
  }
}
