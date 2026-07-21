import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { writeJsonAtomic } from "../../../lib/json-store"
import { cargarRolesPermisos, PERMISO_KEYS, ROLES, type PermisosRol, type RolesPermisos, type Rol } from "../../../lib/roles-permisos"

/**
 * /caja/roles-permisos — plantilla de permisos por ROL (admin/supervisor/cajero).
 *
 * Es la matriz que edita "Roles y permisos" en Empleados: cambiar un permiso
 * aquí afecta a todos los empleados de ese rol que no tengan un override
 * individual guardado en su propio `permisos` (PosUsuario.permisos, /caja/usuarios).
 *
 * La plantilla en sí vive en lib/roles-permisos.ts (compartida con /caja/login
 * y /caja/usuarios, que la usan para completar permisos de usuarios existentes
 * a los que les falten flags nuevos).
 */

const CONFIG_FILE = path.join(__dirname, "../../../../data/roles-permisos.json")

/** GET /caja/roles-permisos */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(cargarRolesPermisos())
}

/**
 * PUT /caja/roles-permisos — body: { rol, permisos: Partial<PermisosRol> }.
 * Actualiza SOLO el rol indicado (merge parcial sobre lo existente), para que
 * la matriz pueda guardar un toggle a la vez o el objeto completo.
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { rol?: string; permisos?: Partial<PermisosRol> }
  const rol = body.rol as Rol
  if (!ROLES.includes(rol)) {
    res.status(400).json({ error: `rol inválido: debe ser ${ROLES.join(", ")}` })
    return
  }

  const actual = cargarRolesPermisos()
  const merged: PermisosRol = { ...actual[rol] }
  if (body.permisos && typeof body.permisos === "object") {
    for (const k of PERMISO_KEYS) {
      if (typeof body.permisos[k] === "boolean") merged[k] = body.permisos[k] as boolean
    }
  }

  const next: RolesPermisos = { ...actual, [rol]: merged }
  writeJsonAtomic(CONFIG_FILE, next)
  res.json(next)
}
