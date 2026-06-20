import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { leerConfigFacturacion, guardarConfigFacturacion, type ConfigFacturacion } from "../_config"

/**
 * GET/PUT /caja/facturama/config — configuración de facturación del POS
 * (serie/folio, correo del contador, periodicidad de la global). NO incluye
 * credenciales: esas viven en el .env y nunca tocan el frontend.
 *
 * Consumido por FacturacionModule (Tab Configuración).
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(leerConfigFacturacion())
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Partial<ConfigFacturacion>
    const nueva = guardarConfigFacturacion(body)
    res.json(nueva)
  } catch (e: any) {
    console.error("[caja/facturama/config] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo guardar la configuración" })
  }
}
