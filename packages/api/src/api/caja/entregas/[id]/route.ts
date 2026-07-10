import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  cargarEntregas,
  actualizarStatusEntrega,
  type EntregaFicha,
  type EntregaStatus,
} from "../../../../lib/entregas-store"

/**
 * /caja/entregas/[id] — detalle y mutaciones de una ficha de entrega.
 *
 *   GET   → la ficha completa.
 *   PATCH → cambia status. Body: { status, nota? }.
 *
 * El COBRO (liquidación) va por /caja/entregas/[id]/liquidar (registra el pago +
 * movimiento de caja del día + marca la venta cobrada). Aquí solo se usa PATCH
 * para cancelar una entrega (status: "cancelada").
 */

const STATUS_VALIDOS: EntregaStatus[] = ["por_entregar", "entregada", "cancelada"]

/** GET /caja/entregas/:id */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const ficha = cargarEntregas().find((f) => f.id === id)
  if (!ficha) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  res.json(ficha)
}

/** PATCH /caja/entregas/:id — cambia status (p. ej. cancelar). */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const body = (req.body ?? {}) as { status?: string; nota?: string }

  if (!body.status) {
    res.status(400).json({ error: "Falta el campo: status" })
    return
  }
  if (!STATUS_VALIDOS.includes(body.status as EntregaStatus)) {
    res.status(400).json({ error: `Status inválido. Usa: ${STATUS_VALIDOS.join(", ")}` })
    return
  }

  const actual = cargarEntregas().find((f) => f.id === id)
  if (!actual) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  if (actual.status === "entregada") {
    res.status(400).json({ error: "La entrega ya fue cobrada y entregada; no se puede cambiar" })
    return
  }

  const ficha: EntregaFicha | null = await actualizarStatusEntrega(
    id,
    body.status as EntregaStatus,
    body.nota
  )
  if (!ficha) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  res.json(ficha)
}
