import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * POST /caja/monedero/:customerId/inscribir — inscribe al cliente al programa
 * de Monedero Electrónico (enciende metadata.monedero). Idempotente: si ya está
 * inscrito, no falla. No otorga puntos de bienvenida (eso sería un ajuste
 * manual aparte).
 *
 * Consumido por MonederoModule ("+ Inscribir cliente").
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const [customer] = await customerModule.listCustomers({ id: customerId })
    if (!customer) { res.status(404).json({ error: "Cliente no encontrado" }); return }
    await customerModule.updateCustomers(customerId, {
      metadata: { ...(customer.metadata ?? {}), monedero: true },
    })
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/monedero/:customerId/inscribir] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo inscribir al cliente" })
  }
}
