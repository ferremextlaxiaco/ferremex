import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../../modules/ferremex-monedero/service"

/**
 * POST /caja/monedero/:customerId/reset — lleva el saldo de puntos del cliente
 * a 0 registrando un movimiento "reset" auditable (no borra el historial).
 * Requiere motivo. Idempotente: si el saldo ya es 0, responde ok sin crear nada.
 *
 * Consumido por MonederoModule (drawer de detalle → "Resetear puntos",
 * confirmado con ConfirmDialog).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  const body = (req.body ?? {}) as { motivo?: string }
  try {
    const motivo = String(body.motivo ?? "").trim()
    if (!motivo) {
      res.status(400).json({ error: "El motivo del reseteo es obligatorio" }); return
    }
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const restados = await service.resetearCliente(customerId, motivo)
    res.json({ ok: true, puntos_restados: restados, saldo: 0 })
  } catch (e: any) {
    console.error("[caja/monedero/:customerId/reset] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo resetear el monedero del cliente" })
  }
}
