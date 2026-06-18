import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado, type FormatoArchivo } from "../../../../../lib/facturama"

/**
 * /caja/facturama/factura/:folio
 *
 * GET ?formato=pdf|xml → descarga el archivo del CFDI de esa venta (base64 →
 *     binario con el Content-Type correcto). Sin ?formato devuelve el estado de
 *     facturación de la venta (si tiene factura, su uuid, etc.).
 *
 * El cfdi_id se lee de la venta (guardado al timbrar). Esto evita exponer ids de
 * Facturama al frontend: el POS solo conoce el folio de la venta.
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../../data/ventas-pos.json")

interface VentaRegistro {
  folio: string
  factura?: {
    cfdi_id: string
    uuid: string | null
    fecha: string
    receptor_rfc: string
    receptor_nombre: string
    total: number | null
    cancelada?: boolean
  }
  [k: string]: unknown
}

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const folio = (req.params as Record<string, string>).folio
  const formato = (req.query as Record<string, string>).formato as FormatoArchivo | undefined

  const venta = cargarVentas().find((v) => v.folio === folio)
  if (!venta) {
    res.status(404).json({ error: "Venta no encontrada" }); return
  }

  // Sin ?formato → estado de facturación.
  if (!formato) {
    res.json({ folio, facturada: !!venta.factura?.cfdi_id, factura: venta.factura ?? null })
    return
  }

  if (formato !== "pdf" && formato !== "xml") {
    res.status(400).json({ error: "formato debe ser pdf o xml" }); return
  }
  if (!venta.factura?.cfdi_id) {
    res.status(400).json({ error: "La venta no está facturada" }); return
  }
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor" }); return
  }

  try {
    const client = new FacturamaClient()
    const archivo = await client.descargarCfdi(venta.factura.cfdi_id, formato)
    const buffer = Buffer.from(archivo.Content, "base64")
    const contentType = formato === "pdf" ? "application/pdf" : "application/xml"
    const nombre = `${folio}.${formato}`
    res.setHeader("Content-Type", contentType)
    res.setHeader("Content-Disposition", `inline; filename="${nombre}"`)
    res.send(buffer)
  } catch (e) {
    if (e instanceof FacturamaError) {
      res.status(502).json({ error: e.message, detalle: e.detalle }); return
    }
    console.error("[caja/facturama/factura/:folio] Error descargando:", e)
    res.status(500).json({ error: "No se pudo descargar el archivo" })
  }
}
