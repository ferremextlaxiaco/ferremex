import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CARTERA } from "../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../modules/ferremex-cartera/service"

/**
 * GET /caja/cartera — todas las carteras, como Record<customer_id, CartEntrada>.
 * Preserva el patrón de carga masiva del viejo `loadCartera()` (localStorage),
 * que CarteraCredito.jsx consume para calcular saldos FIFO en el cliente.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const carteras = await carteraService.listCarteraClientes({}, { take: null })

    const out: Record<string, { movimientos: any[]; notas: any[]; historialLimite: any[] }> = {}
    await Promise.all(
      carteras.map(async (c: any) => {
        const [movimientos, notas, historialLimite] = await Promise.all([
          carteraService.listMovimientoCarteras({ cartera_id: c.id }),
          carteraService.listNotaCarteras({ cartera_id: c.id }),
          carteraService.listHistorialLimites({ cartera_id: c.id }),
        ])
        out[c.customer_id] = { movimientos, notas, historialLimite }
      })
    )
    res.json(out)
  } catch (e: any) {
    console.error("[caja/cartera] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las carteras" })
  }
}
