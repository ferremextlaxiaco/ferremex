import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "../../../lib/json-store"
import { validarPosAdminToken } from "../../../lib/pos-auth"

const USUARIOS_FILE = path.join(__dirname, "../../../../data/usuarios-pos.json")

/**
 * Quita el campo `pin` de un usuario antes de exponerlo al cliente, pero conserva
 * un booleano `tiene_pin` para que el POS sepa si debe pedir PIN sin exponerlo.
 */
function sinPin(u: PosUsuario): Omit<PosUsuario, "pin"> & { tiene_pin: boolean } {
  const { pin, ...resto } = u
  return { ...resto, tiene_pin: !!pin }
}

export interface PosUsuario {
  id: string
  nombre: string
  alias?: string
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
  return readJson<PosUsuario[]>(USUARIOS_FILE, DEFAULTS)
}

/**
 * GET /caja/usuarios — listado de usuarios POS.
 *
 * Por defecto NO incluye el campo `pin` (lo consumía Login y exponía las
 * credenciales de todos los cajeros en el cliente). Con `?admin=1` + token
 * admin válido sí lo incluye, para que EmployeesModule pueda validar PINs
 * duplicados y sugerir PINs libres.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const usuarios = cargarUsuarios()
  const quiereAdmin = (req.query as Record<string, string>).admin === "1"
  if (quiereAdmin && validarPosAdminToken(req)) {
    res.json(usuarios)
    return
  }
  res.json(usuarios.map(sinPin))
}

/** POST /caja/usuarios — crear usuario */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Omit<PosUsuario, "id">
  if (!body.nombre?.trim()) {
    res.status(400).json({ error: "El nombre es requerido" })
    return
  }
  if (body.pin && !/^\d{4,6}$/.test(body.pin)) {
    res.status(400).json({ error: "El PIN debe tener entre 4 y 6 dígitos" })
    return
  }

  let error: string | null = null
  let nuevo: PosUsuario | null = null
  await updateJson<PosUsuario[]>(USUARIOS_FILE, DEFAULTS, (usuarios) => {
    if (usuarios.some((u) => u.nombre.toLowerCase() === body.nombre.trim().toLowerCase())) {
      error = "Ya existe un usuario con ese nombre"
      return usuarios
    }
    if (body.pin && usuarios.some((u) => u.pin === body.pin)) {
      error = "Ese PIN ya está en uso por otro usuario"
      return usuarios
    }
    nuevo = {
      id: crypto.randomBytes(4).toString("hex"),
      nombre: body.nombre.trim(),
      alias: body.alias?.trim() ?? "",
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
    return [...usuarios, nuevo]
  })

  if (error) { res.status(400).json({ error }); return }
  res.status(201).json(sinPin(nuevo!))
}

/** PUT /caja/usuarios — actualizar usuario (id en body) */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as PosUsuario
  if (!body.id) {
    res.status(400).json({ error: "Falta id" })
    return
  }
  if (body.pin && !/^\d{4,6}$/.test(body.pin)) {
    res.status(400).json({ error: "El PIN debe tener entre 4 y 6 dígitos" })
    return
  }

  let error: string | null = null
  let actualizado: PosUsuario | null = null
  await updateJson<PosUsuario[]>(USUARIOS_FILE, DEFAULTS, (usuarios) => {
    const idx = usuarios.findIndex((u) => u.id === body.id)
    if (idx === -1) { error = "Usuario no encontrado"; return usuarios }
    // No permitir renombrar al mismo nombre que otro
    if (
      body.nombre &&
      usuarios.some(
        (u) => u.id !== body.id && u.nombre.toLowerCase() === body.nombre.trim().toLowerCase()
      )
    ) { error = "Ya existe un usuario con ese nombre"; return usuarios }
    // No permitir un PIN ya usado por otro
    if (body.pin && usuarios.some((u) => u.id !== body.id && u.pin === body.pin)) {
      error = "Ese PIN ya está en uso por otro usuario"; return usuarios
    }
    const copia = [...usuarios]
    copia[idx] = { ...copia[idx], ...body, nombre: (body.nombre ?? copia[idx].nombre).trim() }
    actualizado = copia[idx]
    return copia
  })

  if (error) {
    res.status(error === "Usuario no encontrado" ? 404 : 400).json({ error })
    return
  }
  res.json(sinPin(actualizado!))
}

/** DELETE /caja/usuarios — eliminar (id en query) */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.query as Record<string, string>).id
  if (!id) {
    res.status(400).json({ error: "Falta id" })
    return
  }

  let error: string | null = null
  await updateJson<PosUsuario[]>(USUARIOS_FILE, DEFAULTS, (usuarios) => {
    const activos = usuarios.filter((u) => u.activo && u.rol === "admin")
    const objetivo = usuarios.find((u) => u.id === id)
    if (objetivo?.rol === "admin" && activos.length <= 1) {
      error = "Debe quedar al menos un administrador activo"
      return usuarios
    }
    return usuarios.filter((u) => u.id !== id)
  })

  if (error) { res.status(400).json({ error }); return }
  res.json({ ok: true })
}
