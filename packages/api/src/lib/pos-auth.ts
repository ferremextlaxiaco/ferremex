/**
 * pos-auth — validación del token compartido del POS.
 *
 * Las rutas mutantes de /caja/* estaban completamente abiertas: cualquier
 * dispositivo en la LAN podía registrar ventas, resetear el contador de folios
 * o cambiar la config del ticket. Como puente hasta tener autenticación de
 * cajero real, se valida un token compartido enviado en el header X-POS-Token
 * contra la variable de entorno POS_TOKEN.
 *
 * El token admin (POS_ADMIN_TOKEN) protege adicionalmente la vista de usuarios
 * que incluye los PINs (GET /caja/usuarios?admin=1), consumida por
 * EmployeesModule para validar PINs duplicados.
 *
 * Si POS_TOKEN no está definido en el entorno, la validación se desactiva
 * (devuelve true) para no bloquear entornos de desarrollo sin configurar.
 */
import type { MedusaRequest } from "@medusajs/framework/http"

function header(req: MedusaRequest, nombre: string): string | undefined {
  const v = req.headers[nombre.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/** ¿Trae el request un X-POS-Token válido? (o no hay POS_TOKEN configurado) */
export function validarPosToken(req: MedusaRequest): boolean {
  const esperado = process.env.POS_TOKEN
  if (!esperado) return true // sin token configurado → no se exige (dev)
  return header(req, "x-pos-token") === esperado
}

/** ¿Trae el request un X-POS-Admin-Token válido para datos sensibles (PINs)? */
export function validarPosAdminToken(req: MedusaRequest): boolean {
  const esperado = process.env.POS_ADMIN_TOKEN
  if (!esperado) return true // sin token admin configurado → no se exige (dev)
  return header(req, "x-pos-admin-token") === esperado
}
