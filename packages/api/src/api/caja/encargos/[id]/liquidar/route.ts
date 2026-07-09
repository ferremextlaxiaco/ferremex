import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "../../../../../lib/json-store"
import {
  cargarEncargos,
  agregarAbonoEncargo,
  actualizarStatusEncargo,
  restaEncargo,
  totalAbonado,
  type EncargoFicha,
} from "../../../../../lib/encargos-store"

/**
 * POST /caja/encargos/[id]/liquidar — liquida y entrega un encargo.
 *
 * Hace tres cosas coordinadas (cliente esporádico / resta en ficha):
 *   1. Registra el pago de la resta como ABONO en la ficha.
 *   2. Crea un MOVIMIENTO DE CAJA de entrada ("Abono de cliente") con la fecha de
 *      HOY, para que ese dinero entre al corte/arqueo del día en que se cobra
 *      (no del día de la venta original).
 *   3. Marca el encargo como ENTREGADO.
 *
 * No aplica a encargos con resta_en_cartera (esos se liquidan por la cartera del
 * cliente): en ese caso solo se marca entregado, sin abono ni movimiento.
 *
 * Body: { caja_id?, caja_name?, cajero_id?, cajero_name?, turno_id?, metodo? }.
 */

const MOVIMIENTOS_FILE = path.join(__dirname, "../../../../../../data/movimientos-caja.json")

interface Movimiento {
  id: string
  date: string
  time: string
  fecha: string
  origin: string
  desc: string
  method: string
  amount: number
  category?: string
  cajaId?: string | null
  cajaName?: string | null
  cajeroId?: string
  cajeroName?: string
  turnoId?: string | null
  [k: string]: unknown
}

function conDerivados(f: EncargoFicha) {
  return { ...f, resta: restaEncargo(f), abonado: totalAbonado(f) }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const body = (req.body ?? {}) as {
    caja_id?: string
    caja_name?: string
    cajero_id?: string
    cajero_name?: string
    turno_id?: string
    metodo?: string
  }

  let ficha = cargarEncargos().find((f) => f.id === id) ?? null
  if (!ficha) {
    res.status(404).json({ error: "Encargo no encontrado" })
    return
  }
  if (ficha.status === "cancelado") {
    res.status(400).json({ error: "El encargo está cancelado" })
    return
  }
  if (ficha.status === "entregado") {
    res.status(400).json({ error: "El encargo ya fue entregado" })
    return
  }

  const resta = restaEncargo(ficha)

  // Si la resta va a cartera, NO se cobra aquí (se liquida en la cuenta de
  // crédito): solo se marca entregado.
  if (!ficha.resta_en_cartera && resta > 0.01) {
    // 1) Abono de la resta en la ficha.
    ficha = await agregarAbonoEncargo(id, {
      monto: resta,
      metodo: body.metodo || "efectivo",
      nota: "Liquidación al entregar",
    })

    // 2) Movimiento de caja (entrada) → entra al corte del día de HOY. Solo si el
    //    pago fue en efectivo (transferencia/tarjeta no entran al cajón físico).
    const metodo = body.metodo || "efectivo"
    if (metodo === "efectivo") {
      const now = new Date()
      const isoNow = now.toISOString()
      await updateJson<Movimiento[]>(MOVIMIENTOS_FILE, [], (movs) => {
        const mov: Movimiento = {
          id: crypto.randomBytes(6).toString("hex"),
          date: isoNow.slice(0, 10),
          time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          fecha: isoNow,
          origin: "MOVIM_E",
          desc: `Liquidación de encargo ${ficha!.folio} — ${ficha!.cliente_nombre}`,
          method: "efectivo",
          amount: Math.round(resta * 100) / 100,
          category: "Abono de cliente",
          cajaId: body.caja_id ?? null,
          cajaName: body.caja_name ?? null,
          cajeroId: body.cajero_id,
          cajeroName: body.cajero_name,
          turnoId: body.turno_id ?? null,
        }
        return [mov, ...movs]
      })
    }
  }

  // 3) Marcar entregado.
  ficha = await actualizarStatusEncargo(id, "entregado", "Liquidado y entregado")
  if (!ficha) {
    res.status(404).json({ error: "Encargo no encontrado" })
    return
  }
  res.json(conDerivados(ficha))
}
