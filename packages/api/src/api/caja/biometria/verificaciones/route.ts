import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_BIOMETRIA } from "../../../../modules/ferremex-biometria"
import type FerremexBiometriaService from "../../../../modules/ferremex-biometria/service"

/**
 * /caja/biometria/verificaciones — log auditable de autorizaciones por huella.
 *
 * POST → registra un intento { accion, contexto_ref?, resultado, sujeto_tipo?,
 *        sujeto_ref?, score?, umbral?, caja_id?, cajero_id?, detalle? }
 * GET  ?desde=&hasta=&accion=&sujeto_ref=&caja_id=  → consulta (auditoría)
 *
 * Append-only (no se edita ni borra). Registra éxitos Y fallos. Consumido por
 * todos los flujos de autorización del frontend (log tras cada intento) y por un
 * futuro panel de auditoría en admin.
 */

const RESULTADOS = [
  "match", "no_match", "sin_permiso", "degradado_pin", "servicio_caido", "cancelado", "error",
]

/** POST /caja/biometria/verificaciones */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const b = (req.body ?? {}) as Record<string, any>
    const accion = String(b.accion ?? "")
    const resultado = String(b.resultado ?? "")
    if (!accion) { res.status(400).json({ error: "Falta accion" }); return }
    if (!RESULTADOS.includes(resultado)) {
      res.status(400).json({ error: "resultado inválido" })
      return
    }
    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const creada = await service.registrarVerificacion({
      accion,
      contexto_ref: b.contexto_ref != null ? String(b.contexto_ref) : null,
      resultado,
      sujeto_tipo: b.sujeto_tipo === "empleado" || b.sujeto_tipo === "cliente" ? b.sujeto_tipo : null,
      sujeto_ref: b.sujeto_ref != null ? String(b.sujeto_ref) : null,
      score: Number.isFinite(Number(b.score)) ? Number(b.score) : null,
      umbral: Number.isFinite(Number(b.umbral)) ? Number(b.umbral) : null,
      caja_id: b.caja_id != null ? String(b.caja_id) : null,
      cajero_id: b.cajero_id != null ? String(b.cajero_id) : null,
      detalle: b.detalle != null ? String(b.detalle) : null,
    })
    res.status(201).json({ ok: true, id: creada.id })
  } catch (e: any) {
    console.error("[caja/biometria/verificaciones] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar la verificación" })
  }
}

/** GET /caja/biometria/verificaciones?desde=&hasta=&accion=&sujeto_ref=&caja_id= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const filtro: Record<string, any> = {}
    if (req.query.accion) filtro.accion = String(req.query.accion)
    if (req.query.sujeto_ref) filtro.sujeto_ref = String(req.query.sujeto_ref)
    if (req.query.caja_id) filtro.caja_id = String(req.query.caja_id)

    let filas = await service.listVerificacionBiometricas(filtro, { take: 5000 })

    // Filtro de fechas en memoria (fecha es ISO string).
    const desde = req.query.desde ? String(req.query.desde) : null
    const hasta = req.query.hasta ? String(req.query.hasta) : null
    if (desde) filas = filas.filter((v) => v.fecha >= desde)
    if (hasta) filas = filas.filter((v) => v.fecha <= hasta + "T23:59:59.999Z")

    // Más reciente primero.
    filas.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    res.json(filas)
  } catch (e: any) {
    console.error("[caja/biometria/verificaciones] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las verificaciones" })
  }
}
