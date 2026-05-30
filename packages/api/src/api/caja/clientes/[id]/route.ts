import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { customerAClientePOS, clientePOSACustomer, type ClientePOS } from "../_mapper"
import { asignarGrupo, POS_FLAG } from "../route"

/** /caja/clientes/:id — detalle, edición y borrado de un cliente POS. */

async function cargarCliente(req: MedusaRequest, id: string) {
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const [c] = await customerModule.listCustomers({ id }, { relations: ["groups"] })
  return c as any
}

/** GET /caja/clientes/:id */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const c = await cargarCliente(req, id)
    if (!c || c.metadata?.[POS_FLAG] !== true) {
      res.status(404).json({ error: "Cliente no encontrado" }); return
    }
    res.json(customerAClientePOS(c))
  } catch (e: any) {
    console.error("[caja/clientes/:id] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar el cliente" })
  }
}

/** PUT /caja/clientes/:id — actualiza campos nativos + metadata + grupo. */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const existing = await cargarCliente(req, id)
    if (!existing || existing.metadata?.[POS_FLAG] !== true) {
      res.status(404).json({ error: "Cliente no encontrado" }); return
    }
    const body = (req.body ?? {}) as Partial<ClientePOS>
    if (body.nombre !== undefined && !body.nombre.trim()) {
      res.status(400).json({ error: "El nombre no puede quedar vacío" }); return
    }

    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const mapped = clientePOSACustomer(body)
    // Mezclar metadata: conservar la existente (incl. POS_FLAG) y sobreescribir lo enviado.
    await customerModule.updateCustomers(id, {
      ...(mapped.first_name !== undefined ? { first_name: mapped.first_name } : {}),
      ...(mapped.phone !== undefined ? { phone: mapped.phone } : {}),
      metadata: { ...(existing.metadata ?? {}), ...mapped.metadata, [POS_FLAG]: true },
    })
    await asignarGrupo(req, id, body.grupo)

    const actualizado = await cargarCliente(req, id)
    res.json(customerAClientePOS(actualizado))
  } catch (e: any) {
    console.error("[caja/clientes/:id] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo actualizar el cliente" })
  }
}

/** DELETE /caja/clientes/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const existing = await cargarCliente(req, id)
    if (!existing || existing.metadata?.[POS_FLAG] !== true) {
      res.status(404).json({ error: "Cliente no encontrado" }); return
    }
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    await customerModule.deleteCustomers(id)
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/clientes/:id] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo eliminar el cliente" })
  }
}
