import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../lib/json-store"

/**
 * POST /caja/login — valida el PIN de un cajero en el servidor.
 *
 * Antes, Login.tsx recibía el `pin` de todos los usuarios vía GET /caja/usuarios
 * y comparaba en el cliente, exponiendo las credenciales en DevTools. Ahora el
 * PIN se valida aquí y nunca viaja al cliente: la respuesta es el usuario SIN pin.
 */

interface PosUsuario {
  id: string
  nombre: string
  alias?: string
  pin: string
  rol: "admin" | "supervisor" | "cajero"
  activo: boolean
  // Caja física asignada al empleado (id del catálogo ferremex_cajas). Viaja al
  // cliente para sellar el corte con la caja del cajero. Opcional.
  caja_id?: string | null
  permisos: Record<string, boolean>
}

const USUARIOS_FILE = path.join(__dirname, "../../../../data/usuarios-pos.json")

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { usuario_id, pin } = (req.body ?? {}) as { usuario_id?: string; pin?: string }
  if (!usuario_id) {
    res.status(400).json({ error: "Falta usuario_id" })
    return
  }

  const usuarios = readJson<PosUsuario[]>(USUARIOS_FILE, [])
  const usuario = usuarios.find((u) => u.id === usuario_id)

  if (!usuario || !usuario.activo) {
    res.status(404).json({ error: "Usuario no encontrado o inactivo" })
    return
  }

  // Diseño intencional del POS: un usuario con `pin: ""` (sin PIN configurado)
  // entra directo. El cliente lo refleja con `tiene_pin: false` y no muestra el
  // teclado. Si el usuario SÍ tiene PIN, debe coincidir exactamente.
  // (Comparación en tiempo variable; aceptable en LAN. Si se expone a internet,
  // migrar a crypto.timingSafeEqual.)
  if (usuario.pin && usuario.pin !== pin) {
    res.status(401).json({ error: "PIN incorrecto" })
    return
  }

  const { pin: _pin, ...sinPin } = usuario
  res.json(sinPin)
}
