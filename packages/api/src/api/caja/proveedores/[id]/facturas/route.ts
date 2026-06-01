import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROVEEDORES } from "../../../../../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../../../../../modules/ferremex-proveedores/service"
import { aFacturaPOS, type FacturaProveedorPOS } from "../../route"

/**
 * POST /caja/proveedores/:id/facturas — agrega una factura por pagar al proveedor.
 * Espejo de POST /caja/cartera/:customerId/movimientos.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const [proveedor] = await service.listProveedors({ id })
    if (!proveedor) {
      res.status(404).json({ error: "Proveedor no encontrado" }); return
    }
    const body = (req.body ?? {}) as Partial<FacturaProveedorPOS>
    if (!body.numero_factura || !String(body.numero_factura).trim()) {
      res.status(400).json({ error: "El número de factura es requerido" }); return
    }
    const monto = Number(body.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      res.status(400).json({ error: "El monto debe ser un número positivo" }); return
    }
    const creada = await service.agregarFactura(id, {
      numero_factura: String(body.numero_factura).trim(),
      fecha_emision:
        typeof body.fecha_emision === "string" && body.fecha_emision
          ? body.fecha_emision
          : new Date().toISOString().slice(0, 10),
      dias_credito: Number(body.dias_credito) || 0,
      monto,
      descripcion: typeof body.descripcion === "string" ? body.descripcion : "",
      pagada: !!body.pagada,
    })
    res.status(201).json(aFacturaPOS(creada))
  } catch (e: any) {
    console.error("[caja/proveedores/:id/facturas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar la factura" })
  }
}
