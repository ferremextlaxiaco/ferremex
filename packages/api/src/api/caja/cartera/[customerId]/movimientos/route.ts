import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CARTERA } from "../../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../../modules/ferremex-cartera/service"

/**
 * POST /caja/cartera/:customerId/movimientos — registra un movimiento (compra|pago).
 * Espejo del viejo `agregarMovimientoCredito` que escribía en localStorage.
 *
 * Nota: los cargos a crédito derivados de una VENTA se generan transaccionalmente
 * dentro de POST /caja/ventas. Este endpoint cubre abonos/pagos manuales y
 * cargos registrados desde la pantalla de Cartera.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  const body = (req.body ?? {}) as Record<string, unknown>
  const tipo = body.tipo
  if (tipo !== "compra" && tipo !== "pago") {
    res.status(400).json({ error: "tipo debe ser 'compra' o 'pago'" }); return
  }
  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) {
    res.status(400).json({ error: "monto debe ser un número positivo" }); return
  }
  try {
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const creado = await carteraService.agregarMovimiento(customerId, {
      tipo,
      monto,
      fecha: typeof body.fecha === "string" ? body.fecha : new Date().toISOString().slice(0, 10),
      folio: typeof body.folio === "string" ? body.folio : null,
      plazo: body.plazo != null ? Number(body.plazo) : null,
      descripcion: typeof body.descripcion === "string" ? body.descripcion : "",
      nota: typeof body.nota === "string" ? body.nota : null,
    })
    res.status(201).json(creado)
  } catch (e: any) {
    console.error("[caja/cartera/:customerId/movimientos] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar el movimiento" })
  }
}
