import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  cargarEncargos,
  actualizarStatusEncargo,
  agregarAbonoEncargo,
  restaEncargo,
  totalAbonado,
  type EncargoFicha,
  type EncargoStatus,
} from "../../../../lib/encargos-store"

/**
 * /caja/encargos/[id] — detalle y mutaciones de una ficha de encargo.
 *
 *   GET   → la ficha completa (con derivados resta/abonado).
 *   PATCH → cambia status (Pendiente→Recibido→Entregado→Cancelado) y/o registra
 *           un abono. Body: { status?, nota?, abono?: { monto, metodo?, nota? } }.
 */

const STATUS_VALIDOS: EncargoStatus[] = ["pendiente", "recibido", "entregado", "cancelado"]

function conDerivados(f: EncargoFicha) {
  return { ...f, resta: restaEncargo(f), abonado: totalAbonado(f) }
}

/** GET /caja/encargos/:id */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const ficha = cargarEncargos().find((f) => f.id === id)
  if (!ficha) {
    res.status(404).json({ error: "Encargo no encontrado" })
    return
  }
  res.json(conDerivados(ficha))
}

/** PATCH /caja/encargos/:id — cambia status y/o registra abono. */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const body = (req.body ?? {}) as {
    status?: string
    nota?: string
    abono?: { monto?: number; metodo?: string; nota?: string }
  }

  if (!body.status && !body.abono) {
    res.status(400).json({ error: "Nada que actualizar: envía status o abono" })
    return
  }

  let ficha: EncargoFicha | null = cargarEncargos().find((f) => f.id === id) ?? null
  if (!ficha) {
    res.status(404).json({ error: "Encargo no encontrado" })
    return
  }

  // Registrar abono primero (si viene) para que la resta refleje el pago nuevo.
  if (body.abono && Number(body.abono.monto) > 0) {
    ficha = await agregarAbonoEncargo(id, {
      monto: Number(body.abono.monto),
      metodo: body.abono.metodo,
      nota: body.abono.nota,
    })
  }

  if (body.status) {
    if (!STATUS_VALIDOS.includes(body.status as EncargoStatus)) {
      res.status(400).json({ error: `Status inválido. Usa: ${STATUS_VALIDOS.join(", ")}` })
      return
    }
    ficha = await actualizarStatusEncargo(id, body.status as EncargoStatus, body.nota)
  }

  if (!ficha) {
    res.status(404).json({ error: "Encargo no encontrado" })
    return
  }
  res.json(conDerivados(ficha))
}
