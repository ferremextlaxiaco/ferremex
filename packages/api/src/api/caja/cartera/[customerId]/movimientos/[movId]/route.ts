import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CARTERA } from "../../../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../../../modules/ferremex-cartera/service"

/**
 * PATCH /caja/cartera/:customerId/movimientos/:movId — anula (cancela) un
 * movimiento de cartera, típicamente un abono registrado por error.
 *
 * No borra el registro: lo marca cancelado para que deje de contar en el cálculo
 * de saldos (el monto "regresa" a la deuda) y quede rastro auditable con motivo.
 * Body: { motivo: string }.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { customerId, movId } = req.params
  const body = (req.body ?? {}) as Record<string, unknown>
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : ""

  if (!motivo) {
    res.status(400).json({ error: "Se requiere un motivo de cancelación" })
    return
  }

  try {
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const actualizado = await carteraService.anularMovimiento(
      customerId,
      movId,
      motivo,
      new Date().toISOString()
    )
    res.json(actualizado)
  } catch (e: any) {
    const msg = e?.message ?? "Error desconocido"
    // Errores de validación de negocio (no encontrado / ya cancelado) → 400.
    if (/no encontrado|ya está cancelado/i.test(msg)) {
      res.status(400).json({ error: msg })
      return
    }
    console.error("[caja/cartera/:customerId/movimientos/:movId] PATCH error:", msg)
    res.status(500).json({ error: "No se pudo anular el movimiento" })
  }
}
