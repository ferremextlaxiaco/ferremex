import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { customerAClientePOS, clientePOSACustomer, type ClientePOS } from "./_mapper"

/**
 * /caja/clientes — CRUD de clientes del POS sobre el Customer NATIVO de Medusa.
 *
 * Los clientes POS se distinguen de los de e-commerce por
 * `metadata.pos_cliente === true`. A la escala de Ferremex (cientos de clientes)
 * filtramos en memoria; metadata no es indexable eficientemente en Medusa.
 *
 * El `grupo` se modela con customer_group nativo (relación), no solo metadata.
 */

const POS_FLAG = "pos_cliente"

/** Carga todos los Customers marcados como POS, con sus grupos. */
async function listarClientesPOS(req: MedusaRequest): Promise<ClientePOS[]> {
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const customers = await customerModule.listCustomers(
    {},
    { relations: ["groups"], take: null }
  )
  return customers
    .filter((c: any) => c.metadata?.[POS_FLAG] === true)
    .map((c: any) => customerAClientePOS(c))
}

/** Siguiente num_cliente disponible (rellena el hueco más bajo). Server-side para evitar colisiones entre terminales. */
function siguienteNumCliente(clientes: ClientePOS[]): string {
  const usados = new Set(
    clientes.map((c) => parseInt(c.num_cliente, 10)).filter((n) => !isNaN(n) && n > 0)
  )
  let n = 1
  while (usados.has(n)) n++
  return String(n).padStart(3, "0")
}

/** GET /caja/clientes — lista clientes POS. `?siguiente-num=1` devuelve solo el siguiente número. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const clientes = await listarClientesPOS(req)
    if ((req.query as Record<string, string>)["siguiente-num"] === "1") {
      res.json({ num_cliente: siguienteNumCliente(clientes) })
      return
    }
    clientes.sort((a, b) => a.num_cliente.localeCompare(b.num_cliente, undefined, { numeric: true }))
    res.json(clientes)
  } catch (e: any) {
    console.error("[caja/clientes] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los clientes" })
  }
}

/**
 * Asigna el cliente a un customer_group por nombre, creándolo si no existe.
 * Quita al cliente de cualquier otro grupo POS previo (un cliente = 0..1 grupo POS).
 */
async function asignarGrupo(req: MedusaRequest, customerId: string, grupo: string | undefined) {
  if (grupo === undefined) return
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  // Desvincular grupos actuales del cliente
  const actual = await customerModule.listCustomers(
    { id: customerId },
    { relations: ["groups"] }
  )
  const gruposActuales: { id: string }[] = (actual[0] as any)?.groups ?? []
  for (const g of gruposActuales) {
    await customerModule.removeCustomerFromGroup({ customer_id: customerId, customer_group_id: g.id })
  }
  if (!grupo.trim()) return // "" = sin grupo
  // Buscar o crear el grupo destino (marcado como grupo POS para que aparezca en /caja/grupos)
  const existentes = await customerModule.listCustomerGroups({ name: grupo })
  const grupoId =
    existentes[0]?.id ??
    (await customerModule.createCustomerGroups({ name: grupo, metadata: { pos_grupo: true } })).id
  await customerModule.addCustomerToGroup({ customer_id: customerId, customer_group_id: grupoId })
}

/** POST /caja/clientes — crea un cliente POS. Valida nombre y num_cliente único. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Partial<ClientePOS>
    if (!body.nombre || !body.nombre.trim()) {
      res.status(400).json({ error: "El nombre es requerido" }); return
    }
    const existentes = await listarClientesPOS(req)
    if (body.num_cliente && existentes.some((c) => c.num_cliente === body.num_cliente)) {
      res.status(409).json({ error: `El número de cliente ${body.num_cliente} ya existe` }); return
    }

    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const mapped = clientePOSACustomer({
      ...body,
      num_cliente: body.num_cliente || siguienteNumCliente(existentes),
    })
    const created = await customerModule.createCustomers({
      first_name: mapped.first_name,
      phone: mapped.phone,
      metadata: { ...mapped.metadata, [POS_FLAG]: true },
    })
    await asignarGrupo(req, created.id, body.grupo)

    const [withGroups] = await customerModule.listCustomers(
      { id: created.id },
      { relations: ["groups"] }
    )
    res.status(201).json(customerAClientePOS(withGroups as any))
  } catch (e: any) {
    console.error("[caja/clientes] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear el cliente" })
  }
}

export { listarClientesPOS, asignarGrupo, POS_FLAG }
