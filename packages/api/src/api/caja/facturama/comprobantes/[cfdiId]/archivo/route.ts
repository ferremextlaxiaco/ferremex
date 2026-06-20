import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError, type FormatoArchivo } from "../../../../../../lib/facturama"

/**
 * GET /caja/facturama/comprobantes/:cfdiId/archivo?formato=pdf|xml
 *
 * Descarga el PDF/XML de un CFDI por su id de Facturama (no por folio de venta,
 * porque las globales y los CFDIs viejos no tienen folio POS). Devuelve binario
 * con el Content-Type correcto. Consumido por el Tab Comprobantes (descarga
 * individual + descarga por lote a carpeta vía File System Access API).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cfdiId = (req.params as Record<string, string>).cfdiId
  const formato = (req.query as Record<string, string>).formato as FormatoArchivo | undefined

  if (!formato || (formato !== "pdf" && formato !== "xml")) {
    res.status(400).json({ error: "formato debe ser pdf o xml" }); return
  }
  if (!cfdiId || !/^[a-zA-Z0-9_-]{1,64}$/.test(cfdiId)) {
    res.status(400).json({ error: "cfdi_id inválido" }); return
  }
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor" }); return
  }

  try {
    const client = new FacturamaClient()
    const archivo = await client.descargarCfdi(cfdiId, formato)
    const buffer = Buffer.from(archivo.Content, "base64")
    res.setHeader("Content-Type", formato === "pdf" ? "application/pdf" : "application/xml")
    res.setHeader("Content-Disposition", `inline; filename="${cfdiId}.${formato}"`)
    res.send(buffer)
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json(body); return
    }
    console.error("[caja/facturama/comprobantes/:cfdiId/archivo] error:", e)
    res.status(500).json({ error: "No se pudo descargar el archivo" })
  }
}
