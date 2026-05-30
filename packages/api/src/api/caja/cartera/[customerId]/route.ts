import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CARTERA } from "../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../modules/ferremex-cartera/service"

/**
 * GET /caja/cartera/:customerId — cartera completa de un cliente
 * (movimientos + notas + historial de límite), shape `CartEntrada`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  try {
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const data = await carteraService.getCarteraCompleta(customerId)
    res.json(data)
  } catch (e: any) {
    console.error("[caja/cartera/:customerId] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar la cartera" })
  }
}
