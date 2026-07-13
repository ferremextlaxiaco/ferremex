import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { updateJson } from "../../../../../lib/json-store"
import { cargarEntregas, cancelarFleteEntrega } from "../../../../../lib/entregas-store"

/**
 * DELETE /caja/entregas/[id]/flete — cancela (soft) el flete de una entrega.
 *
 * Marca el flete como `cancelado` (no lo borra; queda auditable). Si el flete YA
 * se había cobrado EN TIENDA (en efectivo), genera un movimiento de caja de SALIDA
 * (reversa, categoría "Flete") con la fecha de HOY para que el corte cuadre. Si el
 * flete era "al entregar" y aún no se cobraba, no toca la caja.
 *
 * Body: { motivo, caja_id?, caja_name?, cajero_id?, cajero_name?, turno_id? }.
 */

const MOVIMIENTOS_FILE = path.join(__dirname, "../../../../../../data/movimientos-caja.json")

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as Record<string, string>).id
  const body = (req.body ?? {}) as {
    motivo?: string
    caja_id?: string
    caja_name?: string
    cajero_id?: string
    cajero_name?: string
    turno_id?: string
  }

  const motivo = (body.motivo ?? "").trim()
  if (!motivo) {
    res.status(400).json({ error: "El motivo de cancelación del flete es obligatorio" })
    return
  }

  const actual = cargarEntregas().find((f) => f.id === id)
  if (!actual) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }
  if (!actual.flete) {
    res.status(400).json({ error: "Esta entrega no tiene flete" })
    return
  }
  if (actual.flete.cancelado) {
    res.status(400).json({ error: "El flete ya está cancelado" })
    return
  }

  const { ficha, revertir, metodo } = await cancelarFleteEntrega(id, motivo)
  if (!ficha) {
    res.status(404).json({ error: "Entrega no encontrada" })
    return
  }

  // Reversa en caja solo si el flete ya se había cobrado en tienda en EFECTIVO.
  // (Transferencia/tarjeta no pasan por el cajón, así que no se reversan aquí.)
  if (revertir > 0.005 && metodo === "efectivo") {
    try {
      const now = new Date()
      const isoNow = now.toISOString()
      await updateJson<Record<string, unknown>[]>(MOVIMIENTOS_FILE, [], (movs) => {
        const mov: Record<string, unknown> = {
          id: crypto.randomBytes(6).toString("hex"),
          date: isoNow.slice(0, 10),
          time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          fecha: isoNow,
          origin: "MOVIM_S", // salida
          desc: `Cancelación de flete ${ficha.folio}`,
          method: "efectivo",
          amount: -Math.round(revertir * 100) / 100, // salidas negativas
          category: "Flete",
          cajaId: body.caja_id ?? null,
          cajaName: body.caja_name ?? null,
          cajeroId: body.cajero_id,
          cajeroName: body.cajero_name,
          turnoId: body.turno_id ?? null,
        }
        return [mov, ...movs]
      })
    } catch (e) {
      console.error("[caja/entregas/flete] Flete cancelado pero falló la reversa en caja:", e)
    }
  }

  res.json(ficha)
}
