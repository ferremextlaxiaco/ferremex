import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cargarEntregas } from "../../../lib/entregas-store"

/**
 * /caja/entregas — fichas de venta contra entrega (a domicilio, pago diferido).
 *
 * El módulo "Por cobrar" del POS las consulta. Se crean desde el POST de
 * /caja/ventas al cobrar con método "Contra entrega". La liquidación vive en
 * /caja/entregas/[id]/liquidar (Entrega 2).
 */

/** GET /caja/entregas — lista las fichas (más reciente primero). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { status } = req.query as Record<string, string>
  let fichas = cargarEntregas()
  if (status) fichas = fichas.filter((f) => f.status === status)
  fichas = fichas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
  res.json(fichas)
}
