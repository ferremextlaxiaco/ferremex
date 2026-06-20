import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError } from "../../../../../lib/facturama"

/**
 * POST /caja/facturama/comprobantes/reenviar
 * Body: { cfdi_id, email }
 *
 * Reenvía un CFDI emitido por correo (PDF + XML adjuntos) — al cliente o al
 * contador. Útil para mandar la factura sin descargarla manualmente.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor (.env)" }); return
  }

  const body = (req.body ?? {}) as { cfdi_id?: string; email?: string }
  const cfdiId = String(body.cfdi_id ?? "").trim()
  const email = String(body.email ?? "").trim()
  if (!cfdiId) { res.status(400).json({ error: "Falta el cfdi_id" }); return }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Correo inválido" }); return
  }

  try {
    const client = new FacturamaClient()
    await client.enviarPorCorreo(cfdiId, email)
    res.json({ ok: true })
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json(body); return
    }
    console.error("[caja/facturama/comprobantes/reenviar] error:", e)
    res.status(500).json({ error: "No se pudo reenviar el comprobante" })
  }
}
