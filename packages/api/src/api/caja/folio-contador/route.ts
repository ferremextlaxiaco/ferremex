import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../lib/json-store"

const COUNTER_FILE = path.join(__dirname, "../../../../data/folio-counter.json")

function leerContador(): number {
  return readJson<{ contador: number }>(COUNTER_FILE, { contador: 0 }).contador ?? 0
}

/** GET /caja/folio-contador — devuelve el contador actual */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({ contador: leerContador() })
}

/**
 * DELETE /caja/folio-contador — reinicia el contador a 0.
 * Protegido por el middleware de token POS. Escritura atómica + lock para no
 * pisar un incremento concurrente de una venta en curso.
 */
export async function DELETE(_req: MedusaRequest, res: MedusaResponse) {
  await withFileLock(COUNTER_FILE, () => writeJsonAtomic(COUNTER_FILE, { contador: 0 }))
  res.json({ ok: true, contador: 0 })
}
