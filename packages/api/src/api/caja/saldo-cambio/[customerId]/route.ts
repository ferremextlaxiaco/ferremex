import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_SALDO_CAMBIO } from "../../../../modules/ferremex-saldo-cambio"
import type FerremexSaldoCambioService from "../../../../modules/ferremex-saldo-cambio/service"

/** GET /caja/saldo-cambio/:customerId — saldo disponible + movimientos del cliente. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req.params as Record<string, string>).customerId
  if (!customerId) {
    res.status(400).json({ error: "customerId requerido" })
    return
  }
  const saldoCambioService: FerremexSaldoCambioService = req.scope.resolve(FERREMEX_SALDO_CAMBIO)
  const [saldo, movimientos] = await Promise.all([
    saldoCambioService.saldoCliente(customerId),
    saldoCambioService.movimientosCliente(customerId),
  ])
  res.json({ customer_id: customerId, saldo, movimientos })
}
