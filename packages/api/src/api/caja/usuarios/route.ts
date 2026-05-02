import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"

const USUARIOS_FILE = path.join(__dirname, "../../../../data/usuarios-pos.json")

export interface PosUsuario {
  id: string
  nombre: string
  pin: string
  rol: "admin" | "supervisor" | "cajero"
  activo: boolean
  permisos: {
    puede_vender: boolean
    puede_cotizar: boolean
    puede_anular: boolean
    puede_ver_corte: boolean
    puede_ver_admin: boolean
  }
}

const DEFAULTS: PosUsuario[] = [
  {
    id: "1",
    nombre: "André",
    pin: "",
    rol: "admin",
    activo: true,
    permisos: {
      puede_vender: true,
      puede_cotizar: true,
      puede_anular: true,
      puede_ver_corte: true,
      puede_ver_admin: true,
    },
  },
  {
    id: "2",
    nombre: "Cajero 2",
    pin: "",
    rol: "cajero",
    activo: true,
    permisos: {
      puede_vender: true,
      puede_cotizar: false,
      puede_anular: false,
      puede_ver_corte: true,
      puede_ver_admin: false,
    },
  },
]

function cargarUsuarios(): PosUsuario[] {
  if (!fs.existsSync(USUARIOS_FILE)) {
    guardarUsuarios(DEFAULTS)
    return DEFAULTS
  }
  try {
    return JSON.parse(fs.readFileSync(USUARIOS_FILE, "utf-8")) as PosUsuario[]
  } catch {
    return DEFAULTS
  }
}

function guardarUsuarios(usuarios: PosUsuario[]) {
  const dir = path.dirname(USUARIOS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2), "utf-8")
}

/** GET /caja/usuarios */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(cargarUsuarios())
}

/** POST /caja/usuarios — crear usuario */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Omit<PosUsuario, "id">
  if (!body.nombre?.trim()) {
    res.status(400).json({ error: "El nombre es requerido" })
    return
  }
  const usuarios = cargarUsuarios()
  if (usuarios.some((u) => u.nombre.toLowerCase() === body.nombre.trim().toLowerCase())) {
    res.status(400).json({ error: "Ya existe un usuario con ese nombre" })
    return
  }
  const nuevo: PosUsuario = {
    id: crypto.randomBytes(4).toString("hex"),
    nombre: body.nombre.trim(),
    pin: body.pin ?? "",
    rol: body.rol ?? "cajero",
    activo: body.activo ?? true,
    permisos: body.permisos ?? {
      puede_vender: true,
      puede_cotizar: false,
      puede_anular: false,
      puede_ver_corte: true,
      puede_ver_admin: false,
    },
  }
  usuarios.push(nuevo)
  guardarUsuarios(usuarios)
  res.status(201).json(nuevo)
}

/** PUT /caja/usuarios — actualizar usuario (id en body) */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as PosUsuario
  if (!body.id) {
    res.status(400).json({ error: "Falta id" })
    return
  }
  const usuarios = cargarUsuarios()
  const idx = usuarios.findIndex((u) => u.id === body.id)
  if (idx === -1) {
    res.status(404).json({ error: "Usuario no encontrado" })
    return
  }
  // No permitir renombrar al mismo nombre que otro
  if (
    body.nombre &&
    usuarios.some(
      (u) => u.id !== body.id && u.nombre.toLowerCase() === body.nombre.trim().toLowerCase()
    )
  ) {
    res.status(400).json({ error: "Ya existe un usuario con ese nombre" })
    return
  }
  usuarios[idx] = { ...usuarios[idx], ...body, nombre: (body.nombre ?? usuarios[idx].nombre).trim() }
  guardarUsuarios(usuarios)
  res.json(usuarios[idx])
}

/** DELETE /caja/usuarios — eliminar (id en query) */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.query as Record<string, string>).id
  if (!id) {
    res.status(400).json({ error: "Falta id" })
    return
  }
  const usuarios = cargarUsuarios()
  const activos = usuarios.filter((u) => u.activo && u.rol === "admin")
  const objetivo = usuarios.find((u) => u.id === id)
  if (objetivo?.rol === "admin" && activos.length <= 1) {
    res.status(400).json({ error: "Debe quedar al menos un administrador activo" })
    return
  }
  guardarUsuarios(usuarios.filter((u) => u.id !== id))
  res.json({ ok: true })
}
