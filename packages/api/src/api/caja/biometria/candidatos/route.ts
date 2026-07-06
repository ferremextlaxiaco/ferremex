import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../lib/json-store"
import { FERREMEX_BIOMETRIA } from "../../../../modules/ferremex-biometria"
import type FerremexBiometriaService from "../../../../modules/ferremex-biometria/service"

/**
 * /caja/biometria/candidatos — plantillas de empleados AUTORIZADOS para una acción,
 * listas para pasar a identify 1:N en el servicio local.
 *
 * GET ?accion=<accion>  → [{ sujeto_ref, plantilla_b64 }]
 *
 * Cruza: (empleados con huella activa) × (empleados con permiso para esa acción).
 * El permiso se lee de usuarios-pos.json. Así, aunque un empleado tenga huella,
 * solo aparece como candidato si su rol/permisos le permiten esa acción — la
 * biometría autentica (¿quién es?), los permisos autorizan (¿puede hacerlo?).
 *
 * Consumido por AutorizacionHuellaModal (frontend) antes de identificar.
 */

const USUARIOS_FILE = path.join(__dirname, "../../../../../data/usuarios-pos.json")

// Mapa acción → permiso que la habilita. Acciones sin permiso específico
// (gerencial) requieren rol admin/supervisor.
const PERMISO_POR_ACCION: Record<string, keyof Permisos | "_admin"> = {
  cancelar_venta: "puede_anular",
  descuento: "puede_anular",     // reusa anular como "acción sensible"; ajustable
  abrir_cajon: "puede_vender",   // cualquiera que vende puede abrir cajón manual
  gerencial: "_admin",           // solo admin/supervisor
  canje_puntos: "puede_vender",  // (para clientes es 1:1, pero por si se usa emple.)
  otro: "_admin",
}

interface Permisos {
  puede_vender: boolean
  puede_cotizar: boolean
  puede_anular: boolean
  puede_ver_corte: boolean
  puede_ver_admin: boolean
}
interface PosUsuario {
  id: string
  nombre: string
  rol: "admin" | "supervisor" | "cajero"
  activo: boolean
  permisos: Permisos
}

function empleadoAutorizado(u: PosUsuario, accion: string): boolean {
  if (!u.activo) return false
  const req = PERMISO_POR_ACCION[accion] ?? "_admin"
  if (req === "_admin") return u.rol === "admin" || u.rol === "supervisor"
  return !!u.permisos?.[req]
}

/** GET /caja/biometria/candidatos?accion= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const accion = String(req.query.accion ?? "otro")

    // 1) Empleados con permiso para esta acción.
    const usuarios = await readJson<PosUsuario[]>(USUARIOS_FILE, [])
    const autorizados = new Set(
      usuarios.filter((u) => empleadoAutorizado(u, accion)).map((u) => u.id)
    )

    // 2) Plantillas activas de empleados, filtradas a los autorizados.
    const service: FerremexBiometriaService = req.scope.resolve(FERREMEX_BIOMETRIA)
    const todas = await service.candidatosEmpleados()
    const candidatos = todas
      .filter((c) => autorizados.has(c.sujeto_ref))
      .map((c) => ({ sujeto_ref: c.sujeto_ref, plantilla_b64: c.plantilla }))

    res.json(candidatos)
  } catch (e: any) {
    console.error("[caja/biometria/candidatos] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los candidatos" })
  }
}
