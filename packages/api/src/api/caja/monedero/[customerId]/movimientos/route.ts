import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../../modules/ferremex-monedero/service"

/**
 * POST /caja/monedero/:customerId/movimientos — ajuste manual de puntos
 * (corrección por el admin). `puntos` puede ser positivo (otorgar) o negativo
 * (quitar). Valida que un ajuste negativo no deje el saldo por debajo de 0.
 *
 * Consumido por MonederoModule (drawer de detalle → "Ajuste manual").
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  const body = (req.body ?? {}) as { puntos?: number; descripcion?: string }
  try {
    const puntos = Math.round(Number(body.puntos))
    if (!Number.isFinite(puntos) || puntos === 0) {
      res.status(400).json({ error: "El ajuste debe ser un número distinto de 0" }); return
    }
    const descripcion = String(body.descripcion ?? "").trim()
    if (!descripcion) {
      res.status(400).json({ error: "El motivo del ajuste es obligatorio" }); return
    }
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    if (puntos < 0) {
      const saldo = await service.saldoCliente(customerId)
      if (saldo + puntos < 0) {
        res.status(400).json({ error: `El ajuste dejaría el saldo en negativo (saldo actual: ${saldo})` }); return
      }
    }
    const mov = await service.agregarMovimiento(customerId, {
      tipo: "ajuste",
      puntos,
      descripcion,
    })
    const saldo = await service.saldoCliente(customerId)
    res.status(201).json({ movimiento: mov, saldo })
  } catch (e: any) {
    console.error("[caja/monedero/:customerId/movimientos] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar el ajuste" })
  }
}
