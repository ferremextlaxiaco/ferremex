import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "../../../../../lib/json-store"
import {
  cargarEntregas,
  actualizarStatusEntrega,
  registrarPagoEntrega,
  type EntregaFicha,
} from "../../../../../lib/entregas-store"

/**
 * POST /caja/entregas/[id]/liquidar — cobra y entrega una venta contra entrega.
 *
 * La venta contra entrega salió con inventario descontado pero SIN cobrarse
 * (quedó `por_cobrar`, total 0 en el corte del día de la venta). Cuando el
 * repartidor regresa con el dinero, aquí se coordina el cobro:
 *
 *   1. Registra el PAGO en la ficha de entrega (método real: efectivo/transf/tarjeta).
 *   2. Si el pago fue en EFECTIVO, crea un MOVIMIENTO DE CAJA de entrada
 *      ("Cobro de entrega") con la fecha de HOY → entra al corte/arqueo del día en
 *      que se cobra, no del día de la venta. (Transferencia/tarjeta no tocan el cajón.)
 *   3. Marca la venta `cobrada` en ventas-pos.json (deja de estar pendiente) y
 *      registra el método/fecha de cobro para trazabilidad.
 *   4. Marca la entrega como ENTREGADA.
 *
 * Idempotente: si la entrega ya está entregada, devuelve 400.
 *
 * Body: { caja_id?, caja_name?, cajero_id?, cajero_name?, turno_id?, metodo? }.
 */

const MOVIMIENTOS_FILE = path.join(__dirname, "../../../../../../data/movimientos-caja.json")
const VENTAS_FILE = path.join(__dirname, "../../../../../../data/ventas-pos.json")

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

interface VentaRegistro {
  folio: string
  estado?: string
  entrega_total?: number
  metodo_pago?: string
  [k: string]: unknown
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

  let ficha: EntregaFicha | null = cargarEntregas().find((f) => f.id === id) ?? null
  if (!ficha) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  if (ficha.status === "cancelada") {
    res.status(400).json({ error: "La entrega está cancelada" })
    return
  }
  if (ficha.status === "entregada") {
    res.status(400).json({ error: "La entrega ya fue cobrada y entregada" })
    return
  }

  // Lo que se cobra AL ENTREGAR es la RESTA, no el total. Contra entrega = todo el
  // total; envío con pago en tienda (pagada) = total − abono (0 si pagó completo).
  // `ficha.resta` ya viene calculada al crear la ficha; fallback al total por si es
  // una ficha vieja sin el campo.
  const resta = ficha.resta != null ? Number(ficha.resta) : (Number(ficha.total) || 0)

  // ── Sin nada por cobrar (pagó todo en tienda) ──────────────────────────────
  // Solo se confirma que el material llegó. Sin movimiento de caja, sin tocar la
  // venta (ya se cobró completa el día que se hizo).
  if (resta <= 0.005) {
    const entregada = await actualizarStatusEntrega(id, "entregada", "Entregada (pagada en tienda)")
    if (!entregada) {
      res.status(404).json({ error: "Entrega no encontrada" })
      return
    }
    res.json(entregada)
    return
  }

  // ── Hay resta por cobrar al entregar (contra entrega, o pagada parcial) ─────
  const metodo = body.metodo || "efectivo"
  const monto = Math.round(resta * 100) / 100

  // 1) Registrar el pago (de la resta) en la ficha.
  ficha = await registrarPagoEntrega(id, {
    monto,
    metodo,
    nota: ficha.pagada ? "Cobro de resta al entregar" : "Cobro contra entrega",
  })

  // 2) Movimiento de caja (entrada) → entra al corte de HOY. Solo efectivo (el
  //    resto no pasa por el cajón físico). Misma lógica que liquidar encargos.
  if (metodo === "efectivo" && monto > 0.01) {
    const now = new Date()
    const isoNow = now.toISOString()
    // En envío pagado no hay "paga.nombre" (es el que recibe); usa el que aplique.
    const quien = ficha!.paga?.nombre?.trim() || ficha!.recibe?.nombre?.trim() || ""
    await updateJson<Movimiento[]>(MOVIMIENTOS_FILE, [], (movs) => {
      const mov: Movimiento = {
        id: crypto.randomBytes(6).toString("hex"),
        date: isoNow.slice(0, 10),
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        fecha: isoNow,
        origin: "MOVIM_E",
        desc: `Cobro de entrega ${ficha!.folio}${quien ? ` — ${quien}` : ""}`,
        method: "efectivo",
        amount: monto,
        category: "Cobro de entrega",
        cajaId: body.caja_id ?? null,
        cajaName: body.caja_name ?? null,
        cajeroId: body.cajero_id,
        cajeroName: body.cajero_name,
        turnoId: body.turno_id ?? null,
      }
      return [mov, ...movs]
    })
  }

  // 3) Marcar la venta como cobrada en ventas-pos.json (deja de estar por_cobrar).
  //    Registra el método/fecha de cobro de la resta. No toca `total` (el abono ya
  //    entró al corte de su día; la resta entró como movimiento hoy).
  await updateJson<VentaRegistro[]>(VENTAS_FILE, [], (ventas) => {
    const idx = ventas.findIndex((v) => v.folio === ficha!.folio)
    if (idx === -1) return ventas
    const copia = [...ventas]
    copia[idx] = {
      ...copia[idx],
      estado: "cobrada",
      cobro_metodo: metodo,
      cobro_fecha: new Date().toISOString(),
    }
    return copia
  })

  // 4) Marcar la entrega como entregada.
  ficha = await actualizarStatusEntrega(id, "entregada", `Cobrada resta ${monto.toFixed(2)} (${metodo}) y entregada`)
  if (!ficha) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  res.json(ficha)
}
