import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_CARTERA } from "../../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../../modules/ferremex-cartera/service"

/** POST /caja/cartera/:customerId/notas — agrega una nota libre a la cartera. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  const body = (req.body ?? {}) as Record<string, unknown>
  if (typeof body.texto !== "string" || !body.texto.trim()) {
    res.status(400).json({ error: "texto es requerido" }); return
  }
  try {
    const now = new Date()
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const creada = await carteraService.agregarNota(customerId, {
      fecha: typeof body.fecha === "string" ? body.fecha : now.toISOString().slice(0, 10),
      hora: typeof body.hora === "string" ? body.hora : now.toTimeString().slice(0, 5),
      autor: typeof body.autor === "string" ? body.autor : "—",
      texto: body.texto,
    })
    res.status(201).json(creada)
  } catch (e: any) {
    console.error("[caja/cartera/:customerId/notas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar la nota" })
  }
}
