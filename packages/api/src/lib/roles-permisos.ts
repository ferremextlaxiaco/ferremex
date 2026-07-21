import * as path from "path"
import { readJson } from "./json-store"

/**
 * Plantilla de permisos por rol (fuente compartida por /caja/roles-permisos,
 * /caja/login y /caja/usuarios). Vive aquí — no en una ruta — porque varias
 * rutas necesitan leerla sin depender de un import cruzado entre ellas.
 */

export type Rol = "admin" | "supervisor" | "cajero"

export interface PermisosRol {
  puede_vender: boolean
  puede_cotizar: boolean
  puede_anular: boolean
  puede_ver_corte: boolean
  puede_ver_admin: boolean
  puede_ver_reportes: boolean
  puede_autorizar_sobregiro: boolean
  puede_gestionar_empleados: boolean
  puede_cerrar_otra_caja: boolean
  puede_ajustar_inventario: boolean
  puede_editar_articulos: boolean
  puede_ver_formatos: boolean
  puede_ver_perifericos: boolean
  puede_eliminar_cartera: boolean
  puede_ver_reglas_monedero: boolean
  puede_ver_niveles_monedero: boolean
  puede_ver_config_monedero: boolean
}

export type RolesPermisos = Record<Rol, PermisosRol>

const CONFIG_FILE = path.join(__dirname, "../../data/roles-permisos.json")

export const DEFAULT_ROLES_PERMISOS: RolesPermisos = {
  admin: {
    puede_vender: true, puede_cotizar: true, puede_anular: true,
    puede_ver_corte: true, puede_ver_admin: true, puede_ver_reportes: true,
    puede_autorizar_sobregiro: true, puede_gestionar_empleados: true, puede_cerrar_otra_caja: true,
    puede_ajustar_inventario: true, puede_editar_articulos: true, puede_ver_formatos: true,
    puede_ver_perifericos: true, puede_eliminar_cartera: true,
    puede_ver_reglas_monedero: true, puede_ver_niveles_monedero: true, puede_ver_config_monedero: true,
  },
  supervisor: {
    puede_vender: true, puede_cotizar: true, puede_anular: true,
    puede_ver_corte: true, puede_ver_admin: false, puede_ver_reportes: true,
    puede_autorizar_sobregiro: true, puede_gestionar_empleados: false, puede_cerrar_otra_caja: false,
    puede_ajustar_inventario: true, puede_editar_articulos: true, puede_ver_formatos: true,
    puede_ver_perifericos: true, puede_eliminar_cartera: false,
    puede_ver_reglas_monedero: true, puede_ver_niveles_monedero: true, puede_ver_config_monedero: true,
  },
  cajero: {
    puede_vender: true, puede_cotizar: false, puede_anular: false,
    puede_ver_corte: true, puede_ver_admin: false, puede_ver_reportes: false,
    puede_autorizar_sobregiro: false, puede_gestionar_empleados: false, puede_cerrar_otra_caja: false,
    puede_ajustar_inventario: false, puede_editar_articulos: false, puede_ver_formatos: false,
    puede_ver_perifericos: false, puede_eliminar_cartera: false,
    puede_ver_reglas_monedero: false, puede_ver_niveles_monedero: false, puede_ver_config_monedero: false,
  },
}

export const PERMISO_KEYS = Object.keys(DEFAULT_ROLES_PERMISOS.admin) as (keyof PermisosRol)[]
export const ROLES: Rol[] = ["admin", "supervisor", "cajero"]

function sanearPermisosRol(p: unknown, fallback: PermisosRol): PermisosRol {
  const src = (p ?? {}) as Record<string, unknown>
  const out = {} as PermisosRol
  for (const k of PERMISO_KEYS) {
    out[k] = typeof src[k] === "boolean" ? (src[k] as boolean) : fallback[k]
  }
  return out
}

export function cargarRolesPermisos(): RolesPermisos {
  const c = readJson<Partial<RolesPermisos>>(CONFIG_FILE, DEFAULT_ROLES_PERMISOS)
  const out = {} as RolesPermisos
  for (const rol of ROLES) {
    out[rol] = sanearPermisosRol(c[rol], DEFAULT_ROLES_PERMISOS[rol])
  }
  return out
}

/**
 * Resuelve los permisos EFECTIVOS de un usuario: siempre la plantilla de su rol,
 * en vivo. No hay personalización por usuario (se quitó la tab individual) —
 * cualquier `permisos` ya guardado en el usuario se ignora, para que un cambio
 * en "Roles y permisos" se refleje de inmediato sin quedar "congelado" por un
 * valor persistido de antes de que existiera la matriz de roles.
 */
export function completarPermisosUsuario<T extends { rol: string; permisos?: Record<string, unknown> }>(
  usuario: T,
  plantilla: RolesPermisos
): T & { permisos: PermisosRol } {
  const rol = ROLES.includes(usuario.rol as Rol) ? (usuario.rol as Rol) : "cajero"
  return { ...usuario, permisos: { ...plantilla[rol] } }
}
