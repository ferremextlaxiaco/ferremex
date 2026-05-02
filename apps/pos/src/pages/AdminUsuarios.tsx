import { useEffect, useState } from "react"
import {
  obtenerUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  type PosUsuario,
} from "../lib/client"

type Rol = PosUsuario["rol"]
type Permisos = PosUsuario["permisos"]

const ROL_PERMISOS_DEFAULT: Record<Rol, Permisos> = {
  admin: {
    puede_vender: true,
    puede_cotizar: true,
    puede_anular: true,
    puede_ver_corte: true,
    puede_ver_admin: true,
  },
  supervisor: {
    puede_vender: true,
    puede_cotizar: true,
    puede_anular: true,
    puede_ver_corte: true,
    puede_ver_admin: false,
  },
  cajero: {
    puede_vender: true,
    puede_cotizar: false,
    puede_anular: false,
    puede_ver_corte: true,
    puede_ver_admin: false,
  },
}

const PERMISOS_LABELS: { key: keyof Permisos; label: string }[] = [
  { key: "puede_vender", label: "Registrar ventas" },
  { key: "puede_cotizar", label: "Crear cotizaciones" },
  { key: "puede_anular", label: "Anular ventas" },
  { key: "puede_ver_corte", label: "Ver corte de caja" },
  { key: "puede_ver_admin", label: "Acceder al panel de administración" },
]

const USUARIO_NUEVO: Omit<PosUsuario, "id"> = {
  nombre: "",
  pin: "",
  rol: "cajero",
  activo: true,
  permisos: { ...ROL_PERMISOS_DEFAULT.cajero },
}

export function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<PosUsuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<PosUsuario | Omit<PosUsuario, "id"> | null>(null)
  const [esNuevo, setEsNuevo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      setUsuarios(await obtenerUsuarios())
    } catch {
      setError("No se pudieron cargar los usuarios")
    } finally {
      setCargando(false)
    }
  }

  function abrirNuevo() {
    setEditando({ ...USUARIO_NUEVO, permisos: { ...ROL_PERMISOS_DEFAULT.cajero } })
    setEsNuevo(true)
    setFormError(null)
  }

  function abrirEditar(u: PosUsuario) {
    setEditando({ ...u, permisos: { ...u.permisos } })
    setEsNuevo(false)
    setFormError(null)
  }

  function cerrar() {
    setEditando(null)
    setFormError(null)
  }

  function setField<K extends keyof PosUsuario>(campo: K, valor: PosUsuario[K]) {
    setEditando((prev) => {
      if (!prev) return prev
      const next = { ...prev, [campo]: valor }
      // Al cambiar rol, actualizar permisos por defecto
      if (campo === "rol") {
        next.permisos = { ...ROL_PERMISOS_DEFAULT[valor as Rol] }
      }
      return next
    })
  }

  function setPermiso(key: keyof Permisos, valor: boolean) {
    setEditando((prev) => {
      if (!prev) return prev
      return { ...prev, permisos: { ...prev.permisos, [key]: valor } }
    })
  }

  async function handleGuardar() {
    if (!editando) return
    if (!editando.nombre.trim()) { setFormError("El nombre es requerido"); return }
    if (editando.pin && !/^\d{4}$/.test(editando.pin)) { setFormError("El PIN debe ser de 4 dígitos numéricos"); return }

    setGuardando(true)
    setFormError(null)
    try {
      if (esNuevo) {
        await crearUsuario(editando as Omit<PosUsuario, "id">)
      } else {
        await actualizarUsuario(editando as PosUsuario)
      }
      await cargar()
      cerrar()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  async function handleToggleActivo(u: PosUsuario) {
    try {
      await actualizarUsuario({ ...u, activo: !u.activo })
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar")
    }
  }

  async function handleEliminar(u: PosUsuario) {
    if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return
    try {
      await eliminarUsuario(u.id)
      await cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar")
    }
  }

  if (cargando) return <p className="admin-cargando">Cargando usuarios…</p>

  return (
    <div className="admin-usuarios">
      <div className="admin-usuarios-header">
        <h2 className="admin-seccion-titulo">Usuarios y permisos</h2>
        <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo usuario</button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <table className="admin-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Rol</th>
            <th>PIN</th>
            <th>Estado</th>
            <th>Permisos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id} className={!u.activo ? "admin-fila-inactiva" : ""}>
              <td className="admin-td-nombre">{u.nombre}</td>
              <td><span className={`rol-badge rol-${u.rol}`}>{u.rol}</span></td>
              <td className="admin-td-pin">{u.pin ? "••••" : <span className="texto-suave">Sin PIN</span>}</td>
              <td>
                <button
                  className={`toggle-activo ${u.activo ? "toggle-on" : "toggle-off"}`}
                  onClick={() => handleToggleActivo(u)}
                  title={u.activo ? "Click para desactivar" : "Click para activar"}
                >
                  {u.activo ? "Activo" : "Inactivo"}
                </button>
              </td>
              <td className="admin-td-permisos">
                {PERMISOS_LABELS.filter((p) => u.permisos[p.key]).map((p) => (
                  <span key={p.key} className="permiso-chip">{p.label}</span>
                ))}
              </td>
              <td className="admin-td-acciones">
                <button className="btn-ghost btn-sm" onClick={() => abrirEditar(u)}>Editar</button>
                <button className="btn-danger-ghost btn-sm" onClick={() => handleEliminar(u)}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal de edición */}
      {editando && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && cerrar()}>
          <div className="modal-cobro" style={{ maxWidth: 480 }}>
            <h2 className="modal-titulo">{esNuevo ? "Nuevo usuario" : `Editar — ${(editando as PosUsuario).nombre ?? ""}`}</h2>

            <div className="admin-form">
              <div className="admin-campo">
                <label>Nombre completo</label>
                <input
                  value={editando.nombre}
                  onChange={(e) => setField("nombre", e.target.value)}
                  placeholder="Nombre del cajero"
                  autoFocus
                />
              </div>

              <div className="admin-campo">
                <label>PIN (4 dígitos numéricos — dejar vacío si no requiere)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={editando.pin}
                  onChange={(e) => setField("pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Sin PIN"
                />
              </div>

              <div className="admin-campo">
                <label>Rol</label>
                <select value={editando.rol} onChange={(e) => setField("rol", e.target.value as Rol)}>
                  <option value="cajero">Cajero</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="admin-grupo" style={{ marginTop: 0 }}>
                <h3 className="admin-grupo-titulo">Permisos individuales</h3>
                {PERMISOS_LABELS.map(({ key, label }) => (
                  <label key={key} className="admin-toggle">
                    <input
                      type="checkbox"
                      checked={editando.permisos[key]}
                      onChange={(e) => setPermiso(key, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              {formError && <p className="error-text">{formError}</p>}
            </div>

            <div className="modal-acciones">
              <button className="btn-secondary" onClick={cerrar} disabled={guardando}>Cancelar</button>
              <button className="btn-confirmar" onClick={handleGuardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
