import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROVEEDORES } from "../../../../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../../../../modules/ferremex-proveedores/service"
import { aProveedorPOS, type ProveedorPOS } from "../route"

/** /caja/proveedores/:id — detalle, edición y borrado de un proveedor. */

/** GET /caja/proveedores/:id — proveedor + sus facturas. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const proveedor = await service.getProveedorConFacturas(id)
    if (!proveedor) {
      res.status(404).json({ error: "Proveedor no encontrado" }); return
    }
    res.json(aProveedorPOS(proveedor, (proveedor as any).facturas ?? []))
  } catch (e: any) {
    console.error("[caja/proveedores/:id] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar el proveedor" })
  }
}

/** PUT /caja/proveedores/:id — actualiza datos generales (no facturas). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const [existente] = await service.listProveedors({ id })
    if (!existente) {
      res.status(404).json({ error: "Proveedor no encontrado" }); return
    }
    const body = (req.body ?? {}) as Partial<ProveedorPOS>
    if (body.nombre !== undefined && !String(body.nombre).trim()) {
      res.status(400).json({ error: "El nombre no puede quedar vacío" }); return
    }
    // num_proveedor único si se cambia
    if (body.num_proveedor !== undefined && body.num_proveedor !== (existente as any).num_proveedor) {
      const todos = await service.listProveedors({})
      if ((todos as any[]).some((p) => p.id !== id && p.num_proveedor === body.num_proveedor)) {
        res.status(409).json({ error: `El número de proveedor ${body.num_proveedor} ya existe` })
        return
      }
    }
    await service.updateProveedors({
      id,
      ...(body.num_proveedor !== undefined ? { num_proveedor: String(body.num_proveedor) } : {}),
      ...(body.nombre !== undefined ? { nombre: String(body.nombre).trim() } : {}),
      ...(body.contacto !== undefined ? { contacto: body.contacto || null } : {}),
      ...(body.telefono !== undefined ? { telefono: body.telefono || null } : {}),
      ...(body.email !== undefined ? { email: body.email || null } : {}),
      ...(body.dias_credito !== undefined ? { dias_credito: Number(body.dias_credito) || 0 } : {}),
      ...(body.limite_credito !== undefined ? { limite_credito: Number(body.limite_credito) || 0 } : {}),
      ...(body.rfc !== undefined ? { rfc: body.rfc || null } : {}),
      ...(body.notas !== undefined ? { notas: body.notas || null } : {}),
    })
    const actualizado = await service.getProveedorConFacturas(id)
    res.json(aProveedorPOS(actualizado, (actualizado as any).facturas ?? []))
  } catch (e: any) {
    console.error("[caja/proveedores/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar el proveedor" })
  }
}

/** DELETE /caja/proveedores/:id — elimina proveedor + sus facturas (cascada). */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const [existente] = await service.listProveedors({ id })
    if (!existente) {
      res.status(404).json({ error: "Proveedor no encontrado" }); return
    }
    // Borrar facturas hijas primero (la FK no las elimina en cascada por defecto).
    const facturas = await service.listFacturaProveedors({ proveedor_id: id })
    const ids = (facturas as any[]).map((f) => f.id)
    if (ids.length > 0) await service.deleteFacturaProveedors(ids)
    await service.deleteProveedors(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/proveedores/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar el proveedor" })
  }
}
