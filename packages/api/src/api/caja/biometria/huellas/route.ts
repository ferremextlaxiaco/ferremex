import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_BIOMETRIA } from "../../../../modules/ferremex-biometria"
import type FerremexBiometriaService from "../../../../modules/ferremex-biometria/service"

/**
 * /caja/biometria/huellas — plantillas de huella (FMD) de empleados y clientes.
 *
 * GET  ?sujeto_tipo=&sujeto_ref=  → lista plantillas ACTIVAS de un sujeto
 *      (para verify 1:1: el frontend trae la plantilla del cliente y se la pasa
 *      al servicio local). Sin sujeto_ref → error (no se listan TODAS por defecto).
 * POST → registra una plantilla nueva { sujeto_tipo, sujeto_ref, dedo?, plantilla_b64, calidad?, ... }
 *
 * La plantilla es un FMD en base64 producido por el servicio local
 * (FerremexBiometriaService). Aquí NO se compara ni captura: solo se persiste.
 * Consumido por AdminClientesLista (enroll cliente), EmployeesModule (enroll
 * empleado), ModalCobro (trae plantilla del cliente para verify 1:1).
 */

const TIPOS = ["empleado", "cliente"] as const

export interface HuellaPOS {
  id: string
  sujeto_tipo: "empleado" | "cliente"
  sujeto_ref: string
  dedo: string
  plantilla_b64: string
  calidad: number
  motor: string
  formato: string
  activa: boolean
  creado_en: string
}

function aHuellaPOS(h: any): HuellaPOS {
  return {
    id: h.id,
    sujeto_tipo: h.sujeto_tipo,
    sujeto_ref: h.sujeto_ref,
    dedo: h.dedo,
    plantilla_b64: h.plantilla,
    calidad: Number(h.calidad) || 0,
    motor: h.motor,
    formato: h.formato,
    activa: !!h.activa,
    creado_en: h.creado_en,
  }
}

/** GET /caja/biometria/huellas?sujeto_tipo=&sujeto_ref= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const sujeto_tipo = String(req.query.sujeto_tipo ?? "")
    const sujeto_ref = String(req.query.sujeto_ref ?? "")
    if (!TIPOS.includes(sujeto_tipo as any)) {
      res.status(400).json({ error: "sujeto_tipo debe ser 'empleado' o 'cliente'" })
      return
    }
    if (!sujeto_ref) {
      res.status(400).json({ error: "Falta sujeto_ref" })
      return
    }
    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const filas = await service.huellasDeSujeto(sujeto_tipo as any, sujeto_ref)
    res.json(filas.map(aHuellaPOS))
  } catch (e: any) {
    console.error("[caja/biometria/huellas] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las huellas" })
  }
}

/** POST /caja/biometria/huellas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Record<string, any>
    const sujeto_tipo = String(body.sujeto_tipo ?? "")
    const sujeto_ref = String(body.sujeto_ref ?? "")
    const plantilla = String(body.plantilla_b64 ?? body.plantilla ?? "")

    if (!TIPOS.includes(sujeto_tipo as any)) {
      res.status(400).json({ error: "sujeto_tipo debe ser 'empleado' o 'cliente'" })
      return
    }
    if (!sujeto_ref) { res.status(400).json({ error: "Falta sujeto_ref" }); return }
    if (!plantilla || plantilla.length < 20) {
      res.status(400).json({ error: "Falta la plantilla (plantilla_b64)" })
      return
    }

    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const creada = await service.registrarHuella({
      sujeto_tipo: sujeto_tipo as any,
      sujeto_ref,
      dedo: body.dedo ? String(body.dedo) : undefined,
      plantilla,
      calidad: Number.isFinite(Number(body.calidad)) ? Number(body.calidad) : undefined,
      motor: body.motor ? String(body.motor) : undefined,
      formato: body.formato ? String(body.formato) : undefined,
      version_plantilla: body.version_plantilla ? String(body.version_plantilla) : undefined,
    })
    res.status(201).json(aHuellaPOS(creada))
  } catch (e: any) {
    console.error("[caja/biometria/huellas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo registrar la huella" })
  }
}
