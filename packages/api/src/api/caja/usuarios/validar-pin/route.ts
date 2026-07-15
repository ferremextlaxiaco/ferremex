import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../lib/json-store"

/**
 * POST /caja/usuarios/validar-pin — valida un PIN de administrador/supervisor
 * SIN exponer PINs al cliente.
 *
 * Usado por confirmaciones sensibles del POS (p. ej. eliminar cuenta de crédito)
 * que necesitan autorización de un rol elevado sin depender del token admin
 * (`VITE_POS_ADMIN_TOKEN`) para leer PINs en el navegador — mismo patrón que el
 * override de límite de crédito en /caja/ventas (credito_override).
 *
 * Body: { pin: string, roles?: Array<"admin"|"supervisor"> } — roles por defecto
 * acepta admin y supervisor. Respuesta: { valido: boolean, nombre?, rol? } (NUNCA
 * el pin). 400 si falta el pin.
 */

interface PosUsuarioMin {
  nombre: string
  pin: string
  rol: "admin" | "supervisor" | "cajero"
  activo: boolean
}

const USUARIOS_FILE = path.join(__dirname, "../../../../../data/usuarios-pos.json")

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { pin?: string; roles?: string[] }
  const pin = typeof body.pin === "string" ? body.pin.trim() : ""
  if (!pin) {
    res.status(400).json({ error: "El PIN es obligatorio" })
    return
  }
  const rolesPermitidos = Array.isArray(body.roles) && body.roles.length > 0
    ? body.roles
    : ["admin", "supervisor"]

  const usuarios = readJson<PosUsuarioMin[]>(USUARIOS_FILE, [])
  const match = usuarios.find(
    (u) => u.activo && rolesPermitidos.includes(u.rol) && u.pin && u.pin === pin
  )

  if (!match) {
    res.json({ valido: false })
    return
  }
  res.json({ valido: true, nombre: match.nombre, rol: match.rol })
}
