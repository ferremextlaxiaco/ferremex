import { useState, useEffect, useRef, useMemo, Fragment } from "react"
import {
  UserPlus, Search, ArrowLeftRight, MoreVertical, UserCog,
  Eye, EyeOff, PlusCircle, AlertTriangle, Clock, Trash2, Plus, Fingerprint,
  Percent, X as XIcon, Pencil, ShieldCheck, Users as UsersIcon,
} from "lucide-react"
import {
  obtenerUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario,
  listarCajasAPI,
  obtenerConfigTurnos, guardarConfigTurnos,
  tieneHuellaAPI, listarHuellasAPI, eliminarHuellaAPI,
  listarCatalogos,
  listarEjesComisionAPI, listarReglasComisionAPI,
  crearReglaComisionAPI, actualizarReglaComisionAPI, eliminarReglaComisionAPI,
  obtenerRolesPermisosAPI, actualizarRolPermisoAPI,
} from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import RegistroHuellaModal from "../components/RegistroHuellaModal"
import ConfirmDialog from "../components/ConfirmDialog"

// ── Constants ──────────────────────────────────────────────────────────────────

// El catálogo de cajas (registers) y la asignación caja↔empleado viven en la BD:
//  - Catálogo: módulo ferremex_cajas, vía /caja/cajas (listarCajasAPI y CRUD).
//  - Asignación: campo `caja_id` del usuario (/caja/usuarios), persistido con
//    actualizarUsuario. Antes ambos vivían en localStorage (`pos_cajas_catalogo`,
//    `pos_cajas_asignaciones`), aislados por terminal; esa deuda quedó saldada.
//
// En el estado de este componente, `employee.caja` sigue siendo el NOMBRE de la
// caja (la UI trabaja con nombres). Al cargar se resuelve caja_id→nombre; al
// guardar se traduce nombre→caja_id antes de persistir.

// Fallback local usado SOLO mientras carga /caja/roles-permisos (o si falla la
// carga) — la fuente de verdad es el backend (ver TabRolesPermisos). Debe
// coincidir con el DEFAULT del backend (roles-permisos/route.ts).
const ROL_PERMISOS_DEFAULT = {
  admin:      { puede_vender: true,  puede_cotizar: true,  puede_anular: true,  puede_ver_corte: true,  puede_ver_admin: true,  puede_ver_reportes: true,  puede_autorizar_sobregiro: true,  puede_gestionar_empleados: true,  puede_cerrar_otra_caja: true,  puede_ajustar_inventario: true,  puede_editar_articulos: true,  puede_ver_formatos: true,  puede_ver_perifericos: true,  puede_eliminar_cartera: true,  puede_ver_reglas_monedero: true,  puede_ver_niveles_monedero: true,  puede_ver_config_monedero: true  },
  supervisor: { puede_vender: true,  puede_cotizar: true,  puede_anular: true,  puede_ver_corte: true,  puede_ver_admin: false, puede_ver_reportes: true,  puede_autorizar_sobregiro: true,  puede_gestionar_empleados: false, puede_cerrar_otra_caja: false, puede_ajustar_inventario: true,  puede_editar_articulos: true,  puede_ver_formatos: true,  puede_ver_perifericos: true,  puede_eliminar_cartera: false, puede_ver_reglas_monedero: true,  puede_ver_niveles_monedero: true,  puede_ver_config_monedero: true  },
  cajero:     { puede_vender: true,  puede_cotizar: false, puede_anular: false, puede_ver_corte: true,  puede_ver_admin: false, puede_ver_reportes: false, puede_autorizar_sobregiro: false, puede_gestionar_empleados: false, puede_cerrar_otra_caja: false, puede_ajustar_inventario: false, puede_editar_articulos: false, puede_ver_formatos: false, puede_ver_perifericos: false, puede_eliminar_cartera: false, puede_ver_reglas_monedero: false, puede_ver_niveles_monedero: false, puede_ver_config_monedero: false },
}

// Permisos agrupados por módulo (matriz de "Roles y permisos" + tab individual).
const PERMISOS_GRUPOS = [
  { grupo: "Ventas", items: [
    { key: "puede_vender",              label: "Registrar ventas" },
    { key: "puede_cotizar",             label: "Crear cotizaciones" },
    { key: "puede_anular",              label: "Anular ventas" },
    { key: "puede_autorizar_sobregiro", label: "Autorizar sobregiro de crédito" },
  ]},
  { grupo: "Caja", items: [
    { key: "puede_ver_corte",       label: "Ver corte de caja" },
    { key: "puede_cerrar_otra_caja", label: "Cerrar corte de otra caja" },
  ]},
  { grupo: "Inventario", items: [
    { key: "puede_ajustar_inventario", label: "Ajustar inventario" },
  ]},
  { grupo: "Artículos", items: [
    { key: "puede_editar_articulos", label: "Agregar, editar y eliminar artículos" },
  ]},
  { grupo: "Formatos", items: [
    { key: "puede_ver_formatos", label: "Configurar formatos (ticket, nota, factura, cupón)" },
  ]},
  { grupo: "Periféricos", items: [
    { key: "puede_ver_perifericos", label: "Configurar periféricos (impresora, huella, escáner)" },
  ]},
  { grupo: "Cartera de crédito", items: [
    { key: "puede_eliminar_cartera", label: "Eliminar cuentas de crédito" },
  ]},
  { grupo: "Monedero Electrónico", items: [
    { key: "puede_ver_reglas_monedero", label: "Reglas de puntos" },
    { key: "puede_ver_niveles_monedero", label: "Niveles" },
    { key: "puede_ver_config_monedero", label: "Configuración" },
  ]},
  { grupo: "Administración", items: [
    { key: "puede_ver_admin",           label: "Acceder al panel de administración" },
    { key: "puede_ver_reportes",        label: "Ver reportes" },
    { key: "puede_gestionar_empleados", label: "Gestionar empleados y permisos" },
  ]},
]
const ROL_LABEL = { admin: "Admin", supervisor: "Supervisor", cajero: "Cajero" }
const ROLES_ORDEN = ["cajero", "supervisor", "admin"]

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_HEX = ["#f97316","#3b82f6","#a855f7","#22c55e","#14b8a6","#ef4444"]

function avatarIdx(nombre) { return (nombre.charCodeAt(0) || 0) % 6 }

function initials(nombre) {
  const parts = (nombre || "?").trim().split(/\s+/)
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[1][0]).toUpperCase()
}

function roleBadgeStyle(rol) {
  return {
    admin:      { background: "#ffedd5", color: "#c2410c" },
    supervisor: { background: "#f3e8ff", color: "#7e22ce" },
    cajero:     { background: "#dbeafe", color: "#1d4ed8" },
  }[rol] ?? { background: "#f3f4f6", color: "#4b5563" }
}

function randPin(existing) {
  let p
  do { p = String(Math.floor(1000 + Math.random() * 9000)) } while (existing.includes(p))
  return p
}

// ── Common style objects ───────────────────────────────────────────────────────

const inp = {
  width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
  padding: "8px 12px", fontSize: 14, outline: "none",
  boxSizing: "border-box", color: "#111827", background: "#fff",
}

// Etiqueta de sección (gris, mayúsculas). A nivel de módulo porque la comparten
// TabCajas y HorarioEmpleado (componentes hermanos).
const secLabel = { fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 0, display: "block" }

const btnPrimary = {
  background: "#ea580c", color: "#fff", border: "none",
  padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500,
  cursor: "pointer",
}

const btnSecondary = {
  background: "none", color: "#4b5563", border: "none",
  padding: "8px 16px", fontSize: 14, cursor: "pointer",
}

const lbl = {
  fontSize: 12, fontWeight: 500, color: "#6b7280",
  display: "block", marginBottom: 4,
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 5000, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#dc2626" : "#16a34a",
          color: "#fff", borderRadius: 8, padding: "10px 18px",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
          minWidth: 200, maxWidth: 360,
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ nombre, size = 40 }) {
  return (
    <div style={{
      background: AVATAR_HEX[avatarIdx(nombre || " ")],
      borderRadius: "50%", width: size, height: size,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 600, flexShrink: 0,
      fontSize: size * 0.35,
    }}>
      {initials(nombre || "?")}
    </div>
  )
}

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange() } }}
      style={{
        position: "relative", width: 40, height: 20, borderRadius: 10,
        background: checked ? "#ea580c" : "#d1d5db",
        cursor: "pointer", flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: checked ? 22 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        transition: "left .2s",
      }} />
    </div>
  )
}

// ── Generic Modal ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, width = 440 }) {
  useEffect(() => {
    const esc = e => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 4500, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: Math.min(width, window.innerWidth - 32), boxShadow: "0 25px 50px rgba(0,0,0,.25)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Change PIN Modal ───────────────────────────────────────────────────────────

function ChangePinModal({ employee, employees, onSave, onClose }) {
  const [pin, setPin]         = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow]       = useState(false)
  const [err, setErr]         = useState("")
  const otherPins = employees.filter(e => e.id !== employee.id).map(e => e.pin)

  function validate() {
    if (!/^\d{4,6}$/.test(pin)) return "El PIN debe tener entre 4 y 6 dígitos"
    if (pin !== confirm) return "Los PINs no coinciden"
    // PIN duplicado PERMITIDO a propósito (el login valida usuario + PIN, no solo PIN).
    return ""
  }

  function submit() {
    const e = validate()
    if (e) { setErr(e); return }
    onSave(pin)
  }

  return (
    <Modal title={`Cambiar PIN — ${employee.nombre}`} onClose={onClose} width={360}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={lbl}>Nuevo PIN</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input type={show ? "text" : "password"} value={pin}
                onChange={e => { setPin(e.target.value); setErr("") }} maxLength={6}
                style={{ ...inp, paddingRight: 32 }} placeholder="4–6 dígitos" />
              <button onClick={() => setShow(s => !s)}
                style={{ position: "absolute", right: 8, top: 8, background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={() => { setPin(randPin(otherPins)); setErr("") }}
              style={{ background: "none", border: "none", color: "#ea580c", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
              🎲 Sugerir
            </button>
          </div>
        </div>
        <div>
          <label style={lbl}>Confirmar PIN</label>
          <input type={show ? "text" : "password"} value={confirm}
            onChange={e => { setConfirm(e.target.value); setErr("") }} maxLength={6}
            style={inp} placeholder="Repetir PIN" />
        </div>
        {err && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={submit} style={btnPrimary}>Guardar PIN</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Unsaved Modal ──────────────────────────────────────────────────────────────

function UnsavedModal({ onDiscard, onKeep }) {
  return (
    <Modal title="Cambios sin guardar" onClose={onKeep} width={360}>
      <p style={{ fontSize: 14, color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
        Si cambias de empleado ahora, perderás los cambios que no has guardado.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onKeep} style={btnSecondary}>Seguir editando</button>
        <button onClick={onDiscard} style={{ ...btnSecondary, color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8 }}>
          Descartar cambios
        </button>
      </div>
    </Modal>
  )
}

// ── Deactivate Modal ───────────────────────────────────────────────────────────

function DeactivateModal({ nombre, onConfirm, onClose }) {
  return (
    <Modal title={`¿Desactivar a ${nombre}?`} onClose={onClose} width={360}>
      <p style={{ fontSize: 14, color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
        No podrá acceder al sistema hasta que se reactive. Sus datos e historial se conservan.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={btnSecondary}>Cancelar</button>
        <button onClick={onConfirm} style={{ ...btnPrimary, background: "#1f2937" }}>Sí, desactivar</button>
      </div>
    </Modal>
  )
}

// ── Delete Modal ───────────────────────────────────────────────────────────────

function DeleteModal({ nombre, onConfirm, onClose }) {
  return (
    <Modal title={`¿Eliminar a ${nombre}?`} onClose={onClose} width={360}>
      <p style={{ fontSize: 14, color: "#4b5563", marginTop: 0, marginBottom: 16 }}>
        Esta acción no se puede deshacer. El usuario perderá el acceso al sistema permanentemente.
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={btnSecondary}>Cancelar</button>
        <button onClick={onConfirm} style={{ ...btnPrimary, background: "#dc2626" }}>Sí, eliminar</button>
      </div>
    </Modal>
  )
}

// ── Reassign Dropdown (position: fixed) ────────────────────────────────────────

function ReassignDropdown({ employee, employees, registers, onReassign, onClose, rect }) {
  const dropRef  = useRef(null)
  const [confirming, setConfirming] = useState(null)

  useEffect(() => {
    function handler(e) { if (dropRef.current && !dropRef.current.contains(e.target)) onClose() }
    function esc(e) { if (e.key === "Escape") onClose() }
    document.addEventListener("mousedown", handler)
    window.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("keydown", esc) }
  }, [onClose])

  function ownerOf(regName) { return employees.find(e => e.id !== employee.id && e.caja === regName) ?? null }

  function select(reg) {
    const owner = ownerOf(reg.nombre)
    if (owner) { setConfirming({ register: reg, owner }); return }
    onReassign(reg.nombre === "_none" ? null : reg.nombre, null)
  }

  function shortName(nombre) {
    const p = nombre.trim().split(/\s+/)
    return p[0] + (p[1] ? " " + p[1][0] + "." : "")
  }

  const noneRow = { id: "_none", nombre: "_none", descripcion: "Sin asignar", activa: true }
  const active   = [noneRow, ...registers.filter(r => r.activa)]
  const inactive = registers.filter(r => !r.activa)

  const dropW = 256
  const left  = Math.max(8, Math.min(rect.right - dropW, window.innerWidth - dropW - 8))
  const top   = rect.bottom + 4

  return (
    <div
      ref={dropRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: dropW, zIndex: 4000,
        background: "#fff", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,.18)",
        border: "1px solid #e5e7eb", overflow: "hidden",
      }}
    >
      <div style={{ padding: "8px 12px 6px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Reasignar caja — {employee.nombre.split(" ")[0]}
      </div>
      <div style={{ borderTop: "1px solid #f3f4f6" }} />

      {confirming ? (
        <div style={{ padding: "10px 12px" }}>
          <p style={{ fontSize: 13, color: "#374151", margin: "0 0 10px" }}>
            ¿Quitar a <strong>{confirming.owner.nombre.split(" ")[0]}</strong> de <strong>{confirming.register.nombre}</strong> y asignarla a <strong>{employee.nombre.split(" ")[0]}</strong>?
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => onReassign(confirming.register.nombre, confirming.owner)} style={{ background: "none", border: "none", color: "#ea580c", fontWeight: 500, fontSize: 14, cursor: "pointer" }}>Sí, reasignar</button>
            <button onClick={() => setConfirming(null)} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 14, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          {active.map(reg => {
            const isNone    = reg.id === "_none"
            const isCurrent = isNone ? employee.caja === null : employee.caja === reg.nombre
            const owner     = isNone ? null : ownerOf(reg.nombre)
            return (
              <button key={reg.id} onClick={() => select(reg)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >
                <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid", borderColor: isCurrent ? "#ea580c" : "#d1d5db", background: isCurrent ? "#ea580c" : "none", flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: "#111827" }}>{isNone ? "Sin asignar" : reg.nombre}</span>
                {isCurrent && <span style={{ fontSize: 11, color: "#ea580c" }}>← actual</span>}
                {owner && !isCurrent && (
                  <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: "#9ca3af" }}>
                    <AlertTriangle size={10} color="#f59e0b" />
                    {shortName(owner.nombre)}
                  </span>
                )}
              </button>
            )
          })}
          {inactive.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #f3f4f6", margin: "4px 0" }} />
              {inactive.map(reg => (
                <div key={reg.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", opacity: 0.5, cursor: "not-allowed" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #d1d5db", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#9ca3af" }}>{reg.nombre}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>[inactiva]</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── More Menu (position: fixed) ────────────────────────────────────────────────

function MoreMenu({ employee, onAction, onClose, rect }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    function esc(e) { if (e.key === "Escape") onClose() }
    document.addEventListener("mousedown", handler)
    window.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", handler); window.removeEventListener("keydown", esc) }
  }, [onClose])

  const menuW = 180
  const left  = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8))
  const top   = rect.bottom + 4

  const items = [
    { label: "Editar",                                     action: "edit",         danger: false },
    { label: "Cambiar PIN",                                action: "changePin",    danger: false },
    { label: employee.activo ? "Desactivar" : "Activar",  action: "toggleActive", danger: false },
    { label: "Eliminar",                                   action: "delete",       danger: true  },
  ]

  return (
    <div
      ref={menuRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: menuW, zIndex: 4000,
        background: "#fff", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.15)",
        border: "1px solid #e5e7eb", overflow: "hidden", padding: "4px 0",
      }}
    >
      {items.map(it => (
        <button key={it.action} onClick={() => { onClose(); onAction(it.action, employee) }}
          style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", fontSize: 14, color: it.danger ? "#dc2626" : "#374151", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = it.danger ? "#fef2f2" : "#f9fafb"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ── Tab: Información ───────────────────────────────────────────────────────────

function TabInfo({ form, setForm, employees, original, rolesPermisos }) {
  const [showPin, setShowPin] = useState(false)
  const [pinModified, setPinMod] = useState(false)
  const [errors, setErrors] = useState({})
  const otherPins = employees.filter(e => e.id !== form.id).map(e => e.pin)

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === "rol") next.permisos = { ...(rolesPermisos?.[v] ?? ROL_PERMISOS_DEFAULT[v]) }
      return next
    })
    setErrors(e => ({ ...e, [k]: "" }))
    if (k === "pin") setPinMod(v !== original.pin)
  }

  const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Nombre completo <span style={{ color: "#ef4444" }}>*</span></label>
        <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={inp} placeholder="Nombre y apellido" />
        {errors.nombre && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{errors.nombre}</p>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Alias</label>
        <input value={form.alias ?? ""} onChange={e => set("alias", e.target.value)} style={inp} placeholder="Nombre corto o apodo (opcional)" maxLength={30} />
      </div>

      <div style={grid2}>
        <div>
          <label style={lbl}>Rol</label>
          <select value={form.rol} onChange={e => set("rol", e.target.value)}
            style={{ ...inp, cursor: "pointer" }}>
            <option value="cajero">Cajero</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label style={lbl}>PIN de acceso</label>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input type={showPin ? "text" : "password"} value={form.pin}
                onChange={e => set("pin", e.target.value)} maxLength={6}
                style={{ ...inp, paddingRight: 32 }} placeholder="4–6 dígitos" />
              <button onClick={() => setShowPin(s => !s)}
                style={{ position: "absolute", right: 8, top: 9, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}>
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={() => set("pin", randPin(otherPins))}
              style={{ background: "none", border: "none", color: "#ea580c", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
              🎲 Sugerir
            </button>
          </div>
          {errors.pin && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{errors.pin}</p>}
        </div>
        {pinModified && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Confirmar nuevo PIN</label>
            <input type={showPin ? "text" : "password"} value={form.pinConfirm ?? ""}
              onChange={e => set("pinConfirm", e.target.value)} maxLength={6}
              style={inp} placeholder="Repetir PIN" />
            {errors.pinConfirm && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{errors.pinConfirm}</p>}
          </div>
        )}
      </div>

      <HuellaEmpleado empleadoId={form.id} nombre={form.nombre} esNuevo={!form.id} />
    </div>
  )
}

// ── Tab: Cajas ─────────────────────────────────────────────────────────────────
// El CRUD del catálogo de cajas (crear/editar/eliminar) vive en Periféricos
// (config de infraestructura de la tienda). Aquí solo se ASIGNA cuál caja usa
// este empleado, sobre el mismo catálogo cargado desde /caja/cajas.

function TabCajas({ form, setForm, employees, registers, pushToast, franjas }) {
  const assignedOwner = form.caja ? employees.find(e => e.id !== form.id && e.caja === form.caja) : null

  return (
    <div>
      <span style={secLabel}>Caja asignada a {(form.nombre || "EMPLEADO").toUpperCase()}</span>
      <select value={form.caja ?? ""} onChange={e => setForm(f => ({ ...f, caja: e.target.value || null }))}
        style={{ ...inp, cursor: "pointer" }}>
        <option value="">Sin asignar</option>
        {registers.filter(r => r.activa).map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
      </select>
      {registers.length === 0 && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>
          No hay cajas registradas todavía. Créalas en <strong>Periféricos</strong>.
        </p>
      )}
      {assignedOwner && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10 }}>
          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
            <strong>{form.caja}</strong> ya está asignada a {assignedOwner.nombre}. Al guardar, se le quitará la asignación.
          </p>
        </div>
      )}

      <HorarioEmpleado form={form} setForm={setForm} franjas={franjas} />
    </div>
  )
}

// ── Sección: Horario laboral (dentro de la tab Cajas) ───────────────────────────
// Informativo + sugerencia de franja al login en modo turnos. No restringe acceso.

const DIAS = [
  { k: "lun", l: "L" }, { k: "mar", l: "M" }, { k: "mie", l: "M" }, { k: "jue", l: "J" },
  { k: "vie", l: "V" }, { k: "sab", l: "S" }, { k: "dom", l: "D" },
]
const DIAS_DEFAULT = { lun: true, mar: true, mie: true, jue: true, vie: true, sab: true, dom: false }

function HorarioEmpleado({ form, setForm, franjas }) {
  const h = form.horario ?? {}
  const dias = h.dias ?? DIAS_DEFAULT

  const setH = (patch) => setForm(f => ({ ...f, horario: { ...(f.horario ?? {}), ...patch } }))
  const toggleDia = (k) => setH({ dias: { ...dias, [k]: !dias[k] } })

  return (
    <div style={{ marginTop: 28 }}>
      <span style={secLabel}>Horario laboral</span>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#9ca3af" }}>
        Referencia del horario del empleado. En modo turnos sugiere su franja al iniciar sesión. No bloquea ventas fuera de horario.
      </p>

      {/* Días de la semana */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {DIAS.map(({ k, l }) => (
          <button key={k} onClick={() => toggleDia(k)} type="button"
            title={k}
            style={{
              width: 36, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${dias[k] ? "#fdba74" : "#e5e7eb"}`,
              background: dias[k] ? "#fff7ed" : "#fff",
              color: dias[k] ? "#c2410c" : "#9ca3af",
            }}>
            {l}
          </button>
        ))}
      </div>

      {/* Entrada / salida */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Entrada</label>
          <input type="time" value={h.entrada ?? ""} onChange={e => setH({ entrada: e.target.value })} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Salida</label>
          <input type="time" value={h.salida ?? ""} onChange={e => setH({ salida: e.target.value })} style={inp} />
        </div>
      </div>

      {/* Turno habitual (franja) */}
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Turno habitual</label>
      <select value={h.turno_id ?? ""} onChange={e => setH({ turno_id: e.target.value || null })} style={{ ...inp, cursor: "pointer" }}>
        <option value="">Sin turno fijo</option>
        {(franjas ?? []).map(fr => <option key={fr.id} value={fr.id}>{fr.nombre} ({fr.desde}–{fr.hasta})</option>)}
      </select>
    </div>
  )
}

// ── Tab: Roles y permisos (matriz por rol, nivel MÓDULO no empleado) ───────────
// Edita la plantilla server-side (/caja/roles-permisos). Afecta a todos los
// empleados del rol que NO tengan override individual en su propio `permisos`.

function TabRolesPermisos({ rolesPermisos, setRolesPermisos, employees, pushToast }) {
  const [guardando, setGuardando] = useState(null) // `${rol}:${key}` en vuelo
  const [confirmar, setConfirmar] = useState(null) // { rol, key, valor, afectados }

  function conteoAfectados(rol) {
    // Empleados de ese rol SIN override individual en este permiso (heredan la
    // plantilla) — son los que un cambio aquí modifica en la práctica.
    return employees.filter(e => e.rol === rol).length
  }

  function pedirCambio(rol, key, valorActual) {
    const afectados = conteoAfectados(rol)
    setConfirmar({ rol, key, valor: !valorActual, afectados })
  }

  async function confirmarCambio() {
    const { rol, key, valor } = confirmar
    setConfirmar(null)
    setGuardando(`${rol}:${key}`)
    try {
      const actualizado = await actualizarRolPermisoAPI(rol, { [key]: valor })
      setRolesPermisos(actualizado)
      pushToast("Permiso de rol actualizado ✓")
    } catch (err) {
      pushToast(err?.message || "No se pudo guardar", "error")
    } finally {
      setGuardando(null)
    }
  }

  if (!rolesPermisos) return <p style={{ fontSize: 13, color: "#9ca3af" }}>Cargando…</p>

  return (
    <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 20, maxWidth: 640 }}>
        Configura qué puede hacer cada <strong>rol</strong> por defecto. Un cambio aquí afecta a todos los
        empleados que tengan ese rol.
      </p>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid #e5e7eb" }}>
                Permiso
              </th>
              {ROLES_ORDEN.map(rol => (
                <th key={rol} style={{ textAlign: "center", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#111827", borderBottom: "1px solid #e5e7eb", minWidth: 100 }}>
                  {ROL_LABEL[rol]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISOS_GRUPOS.map(({ grupo, items }) => (
              <Fragment key={grupo}>
                <tr>
                  <td colSpan={ROLES_ORDEN.length + 1} style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", background: "#fcfcfd" }}>
                    {grupo}
                  </td>
                </tr>
                {items.map(({ key, label }) => (
                  <tr key={key}>
                    <td style={{ padding: "8px 14px", fontSize: 13.5, color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{label}</td>
                    {ROLES_ORDEN.map(rol => {
                      const valor = !!rolesPermisos[rol]?.[key]
                      const enVuelo = guardando === `${rol}:${key}`
                      return (
                        <td key={rol} style={{ textAlign: "center", padding: "8px 14px", borderBottom: "1px solid #f3f4f6" }}>
                          <div style={{ display: "inline-flex", opacity: enVuelo ? 0.5 : 1, pointerEvents: enVuelo ? "none" : "auto" }}>
                            <Toggle checked={valor} onChange={() => pedirCambio(rol, key, valor)} />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {confirmar && (
        <ConfirmDialog
          open
          title={`${confirmar.valor ? "Habilitar" : "Deshabilitar"} permiso para ${ROL_LABEL[confirmar.rol]}`}
          message={
            confirmar.afectados > 0
              ? `Esto afectará a ${confirmar.afectados} empleado${confirmar.afectados === 1 ? "" : "s"} con rol ${ROL_LABEL[confirmar.rol]}.`
              : `No hay empleados con rol ${ROL_LABEL[confirmar.rol]} todavía, pero el cambio se aplicará a los que se creen o cambien a este rol.`
          }
          confirmLabel="Sí, aplicar"
          onConfirm={confirmarCambio}
          onClose={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}

// ── Tab: Comisiones ────────────────────────────────────────────────────────────
// % de comisión que ESTE empleado recibe por marca/categoría/departamento.
// Solo se pueden asignar reglas sobre ámbitos ya habilitados globalmente desde
// Catálogos (toggle "Admite comisión"). Cada regla se guarda de inmediato
// (no forma parte del "Guardar cambios" general del empleado) — mismo patrón
// que "Cajas de Ferremex" en la tab Cajas.

const AMBITO_LABEL = { marca: "Marca", categoria: "Categoría", departamento: "Departamento" }
const AMBITOS_ORDEN = ["marca", "categoria", "departamento"]

function TabComisiones({ form, pushToast }) {
  const empleadoId = form.id
  const [catalogos, setCatalogos] = useState(null)     // { depts, cats, marcas }
  const [ejes, setEjes] = useState([])                 // ComisionEjeAPI[] (habilitados)
  const [reglas, setReglas] = useState([])             // ComisionReglaAPI[] de este empleado
  const [cargando, setCargando] = useState(true)
  const [addingAmbito, setAddingAmbito] = useState(null) // null | "marca" | "categoria" | "departamento"
  const [nuevaRef, setNuevaRef] = useState("")
  const [nuevaTasa, setNuevaTasa] = useState("")
  const [editandoId, setEditandoId] = useState(null)
  const [editTasa, setEditTasa] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!empleadoId) { setCargando(false); return }
    let on = true
    setCargando(true)
    Promise.all([
      listarCatalogos().catch(() => null),
      listarEjesComisionAPI().catch(() => []),
      listarReglasComisionAPI(empleadoId).catch(() => []),
    ]).then(([cat, ejesData, reglasData]) => {
      if (!on) return
      setCatalogos(cat)
      setEjes((ejesData ?? []).filter(e => e.habilitado))
      setReglas(reglasData ?? [])
    }).finally(() => { if (on) setCargando(false) })
    return () => { on = false }
  }, [empleadoId])

  // Nombres disponibles por ámbito (habilitados en Catálogos, sin regla ya creada).
  const opcionesPorAmbito = useMemo(() => {
    if (!catalogos) return { marca: [], categoria: [], departamento: [] }
    const nombresPorAmbito = {
      marca: catalogos.marcas.map(m => m.nombre),
      categoria: catalogos.cats.map(c => c.nombre),
      departamento: catalogos.depts.map(d => d.nombre),
    }
    const out = {}
    for (const amb of AMBITOS_ORDEN) {
      const habilitados = new Set(
        ejes.filter(e => e.ambito === amb).map(e => e.ref.trim().toLowerCase())
      )
      const yaAsignados = new Set(
        reglas.filter(r => r.ambito === amb).map(r => r.ref.trim().toLowerCase())
      )
      out[amb] = [...new Set(nombresPorAmbito[amb])]
        .filter(n => habilitados.has(n.trim().toLowerCase()) && !yaAsignados.has(n.trim().toLowerCase()))
        .sort((a, b) => a.localeCompare(b, "es"))
    }
    return out
  }, [catalogos, ejes, reglas])

  const hayAlgunEjeHabilitado = ejes.length > 0

  function startAdd(ambito) {
    setAddingAmbito(ambito); setNuevaRef(""); setNuevaTasa(""); setEditandoId(null)
  }

  async function confirmAdd() {
    if (!nuevaRef || guardando) return
    const tasa = Number(nuevaTasa)
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
      pushToast("La comisión debe estar entre 0 y 100%", "error"); return
    }
    setGuardando(true)
    try {
      const creada = await crearReglaComisionAPI({ empleado_id: empleadoId, ambito: addingAmbito, ref: nuevaRef, tasa, activa: true })
      setReglas(rs => [...rs, creada])
      setAddingAmbito(null); setNuevaRef(""); setNuevaTasa("")
      pushToast(`Comisión de ${creada.ref} asignada ✓`)
    } catch (err) {
      pushToast(err?.message || "No se pudo guardar la regla", "error")
    } finally {
      setGuardando(false)
    }
  }

  function startEdit(regla) {
    setEditandoId(regla.id); setEditTasa(String(regla.tasa)); setAddingAmbito(null)
  }

  async function confirmEdit(regla) {
    const tasa = Number(editTasa)
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
      pushToast("La comisión debe estar entre 0 y 100%", "error"); return
    }
    setGuardando(true)
    try {
      const actualizada = await actualizarReglaComisionAPI(regla.id, { ...regla, tasa })
      setReglas(rs => rs.map(r => r.id === regla.id ? actualizada : r))
      setEditandoId(null)
    } catch (err) {
      pushToast(err?.message || "No se pudo actualizar", "error")
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarRegla(regla) {
    try {
      await eliminarReglaComisionAPI(regla.id)
      setReglas(rs => rs.filter(r => r.id !== regla.id))
      pushToast("Regla eliminada")
    } catch (err) {
      pushToast(err?.message || "No se pudo eliminar", "error")
    }
  }

  if (!empleadoId) {
    return <p style={{ fontSize: 13, color: "#9ca3af" }}>Guarda el empleado primero para poder asignarle comisiones.</p>
  }
  if (cargando) {
    return <p style={{ fontSize: 13, color: "#9ca3af" }}>Cargando…</p>
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
        % de comisión que <strong>{form.nombre || "este empleado"}</strong> recibe por venta, según marca, categoría o departamento. Gana la regla más específica: Marca &gt; Categoría &gt; Departamento. Sin ninguna regla, el empleado no gana comisión en ese producto.
      </p>

      {!hayAlgunEjeHabilitado && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
            Ningún ámbito admite comisión todavía. Actívalos primero en <strong>Catálogos</strong> (toggle "Admite comisión" en cada Departamento, Categoría o Marca).
          </p>
        </div>
      )}

      {reglas.length === 0 && hayAlgunEjeHabilitado && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
            Este empleado no tiene comisiones configuradas — no ganará comisión en ninguna venta.
          </p>
        </div>
      )}

      {AMBITOS_ORDEN.map(ambito => {
        const reglasAmbito = reglas.filter(r => r.ambito === ambito)
        const opciones = opcionesPorAmbito[ambito] ?? []
        return (
          <div key={ambito} style={{ marginBottom: 20 }}>
            <span style={secLabel}>{AMBITO_LABEL[ambito]}s</span>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
              {reglasAmbito.length === 0 && addingAmbito !== ambito && (
                <div style={{ padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>Sin reglas asignadas</div>
              )}
              {reglasAmbito.map((r, i) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < reglasAmbito.length - 1 || addingAmbito === ambito ? "1px solid #f3f4f6" : "none" }}>
                  <span style={{ flex: 1, fontSize: 14, color: "#111827" }}>{r.ref}</span>
                  {editandoId === r.id ? (
                    <>
                      <input type="number" min={0} max={100} step={0.1} value={editTasa}
                        onChange={e => setEditTasa(e.target.value)}
                        style={{ ...inp, width: 80, padding: "6px 8px" }} autoFocus />
                      <span style={{ fontSize: 13, color: "#6b7280" }}>%</span>
                      <button onClick={() => confirmEdit(r)} disabled={guardando}
                        style={{ background: "none", border: "none", fontSize: 12, color: "#ea580c", fontWeight: 500, cursor: "pointer" }}>Guardar</button>
                      <button onClick={() => setEditandoId(null)}
                        style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{r.tasa}%</span>
                      <button onClick={() => startEdit(r)} title="Editar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 4, display: "flex" }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => eliminarRegla(r)} title="Eliminar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4, display: "flex" }}>
                        <XIcon size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {addingAmbito === ambito && (
                <div style={{ padding: "10px 12px", background: "#fff7ed" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <select value={nuevaRef} onChange={e => setNuevaRef(e.target.value)}
                      style={{ ...inp, flex: 1, cursor: "pointer" }} autoFocus>
                      <option value="">Selecciona {AMBITO_LABEL[ambito].toLowerCase()}…</option>
                      {opciones.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input type="number" min={0} max={100} step={0.1} placeholder="%"
                      value={nuevaTasa} onChange={e => setNuevaTasa(e.target.value)}
                      style={{ ...inp, width: 80 }} />
                  </div>
                  {opciones.length === 0 && (
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9ca3af" }}>
                      No hay {AMBITO_LABEL[ambito].toLowerCase()}s disponibles (ya asignadas o ninguna habilitada en Catálogos).
                    </p>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                    <button onClick={() => setAddingAmbito(null)} style={{ background: "none", border: "none", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>Cancelar</button>
                    <button onClick={confirmAdd} disabled={!nuevaRef || guardando}
                      style={{ background: "none", border: "none", fontSize: 12, color: "#ea580c", fontWeight: 500, cursor: nuevaRef ? "pointer" : "default", opacity: nuevaRef ? 1 : 0.5 }}>
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>
            {addingAmbito !== ambito && (
              <button onClick={() => startAdd(ambito)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", fontSize: 13, color: "#ea580c", cursor: "pointer" }}>
                <PlusCircle size={14} />
                Agregar {AMBITO_LABEL[ambito].toLowerCase()}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Sección de huella dactilar del empleado ─────────────────────────────────────
// Solo REGISTRA la huella (se guarda en BD). El uso para autorizar acciones se
// implementará después; por ahora dejamos las huellas de empleados listas.
function HuellaEmpleado({ empleadoId, nombre, esNuevo }) {
  const [tiene, setTiene] = useState(false)
  const [modal, setModal] = useState(false)
  const [confirmQuitar, setConfirmQuitar] = useState(false)

  async function refrescar() {
    if (!empleadoId) { setTiene(false); return }
    try { setTiene(await tieneHuellaAPI("empleado", String(empleadoId))) }
    catch { setTiene(false) }
  }

  useEffect(() => { refrescar() }, [empleadoId])

  async function quitar() {
    if (!empleadoId) return
    try {
      const huellas = await listarHuellasAPI("empleado", String(empleadoId))
      for (const h of huellas) await eliminarHuellaAPI(h.id)
      setTiene(false)
    } catch (e) {
      alert("No se pudo quitar la huella: " + (e?.message ?? ""))
    } finally {
      setConfirmQuitar(false)
    }
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Fingerprint size={16} color="#6b7280" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Huella dactilar</span>
      </div>
      {esNuevo ? (
        <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
          Guarda el empleado primero para poder registrar su huella.
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: tiene ? "#16a34a" : "#6b7280" }}>
            {tiene ? "Huella registrada" : "Sin huella registrada"}
          </span>
          <button type="button" onClick={() => setModal(true)}
            style={{ background: "#ea580c", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {tiene ? "Volver a registrar" : "Registrar huella"}
          </button>
          {tiene && (
            <button type="button" onClick={() => setConfirmQuitar(true)}
              style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              Quitar
            </button>
          )}
        </div>
      )}

      {modal && empleadoId && (
        <RegistroHuellaModal
          sujetoTipo="empleado"
          sujetoRef={String(empleadoId)}
          nombre={nombre || "empleado"}
          onCerrar={() => setModal(false)}
          onRegistrada={refrescar}
        />
      )}

      <ConfirmDialog
        open={confirmQuitar}
        title="Quitar huella"
        message={`¿Quitar la huella registrada de ${nombre || "este empleado"}?`}
        confirmLabel="Quitar"
        danger
        onConfirm={quitar}
        onClose={() => setConfirmQuitar(false)}
      />
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ employee, employees, setEmployees, registers, setRegisters, onSave, onToggleActive, isNew, onCancel, pushToast, saving, franjas, rolesPermisos }) {
  const [tab, setTab]           = useState("info")
  const [form, setForm]         = useState(null)
  const [original, setOriginal] = useState(null)

  useEffect(() => {
    if (!employee) { setForm(null); setOriginal(null); return }
    setForm({ ...employee, pinConfirm: "" })
    setOriginal({ ...employee })
    setTab("info")
  }, [employee?.id])

  if (!employee || !form) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <UserCog size={48} color="#d1d5db" />
        <p style={{ margin: 0, fontStyle: "italic", fontSize: 14, color: "#9ca3af" }}>Selecciona un empleado para ver sus detalles</p>
      </div>
    )
  }

  const isDirty = JSON.stringify({ ...form, pinConfirm: "" }) !== JSON.stringify({ ...original, pinConfirm: "" })

  function validate() {
    const errs = {}
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio"
    if (!/^\d{4,6}$/.test(form.pin)) errs.pin = "El PIN debe tener entre 4 y 6 dígitos"
    // PIN duplicado PERMITIDO a propósito: el login identifica al usuario por su
    // selección de nombre + PIN, no solo por PIN. (Backend también lo permite.)
    if (form.pin !== original.pin && form.pin !== (form.pinConfirm ?? ""))
      errs.pinConfirm = "Los PINs no coinciden"
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) {
      // Mostrar el mensaje ESPECÍFICO del primer campo que falla (antes solo salía
      // un genérico "Revisa los campos" y el cajero no sabía qué corregir).
      const primerError = errs.nombre || errs.pin || errs.pinConfirm || "Revisa los campos antes de guardar"
      pushToast(primerError, "error")
      return
    }
    onSave(form)
  }

  const TABS = [
    { id: "info",       label: "Información" },
    { id: "cajas",      label: "Cajas y horario" },
    { id: "comisiones", label: "Comisiones" },
  ]

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <Avatar nombre={form.nombre || "?"} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#111827" }}>
            {isNew ? "Nuevo empleado" : form.nombre || "Nuevo empleado"}
          </h2>
          {!isNew && (
            <span style={{ alignSelf: "flex-start", borderRadius: 9999, padding: "2px 8px", fontSize: 12, fontWeight: 500, ...roleBadgeStyle(form.rol) }}>
              {ROL_LABEL[form.rol] ?? form.rol}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>Activo</span>
          <Toggle checked={form.activo} onChange={() => onToggleActive(form, setForm)} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: "0 24px", borderBottom: "1px solid #e5e7eb", display: "flex", flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "12px 16px", fontSize: 14, cursor: "pointer", background: "none", border: "none",
              borderBottom: tab === t.id ? "2px solid #ea580c" : "2px solid transparent",
              color: tab === t.id ? "#ea580c" : "#6b7280",
              fontWeight: tab === t.id ? 500 : 400,
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {tab === "info"     && <TabInfo form={form} setForm={setForm} employees={employees} original={original} rolesPermisos={rolesPermisos} />}
        {tab === "cajas"    && <TabCajas form={form} setForm={setForm} employees={employees} registers={registers} franjas={franjas} />}
        {tab === "comisiones" && <TabComisiones form={form} pushToast={pushToast} />}
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <button onClick={onCancel} style={btnSecondary}>Cancelar</button>
        <button onClick={handleSave}
          style={{ ...btnPrimary, opacity: isDirty && !saving ? 1 : 0.4, pointerEvents: isDirty && !saving ? "auto" : "none" }}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  )
}

// ── Main Module ────────────────────────────────────────────────────────────────

const NEW_EMP = {
  id: null, nombre: "", alias: "", pin: "", rol: "cajero", activo: true,
  permisos: { ...ROL_PERMISOS_DEFAULT.cajero },
  caja: null,
}

export default function EmployeesModule() {
  const [vista, setVista]         = useState("empleados") // "empleados" | "roles"
  const [employees, setEmployees] = useState([])
  const [registers, setRegisters] = useState([])
  const [franjas, setFranjas]     = useState([])  // franjas de turnos (para el horario del empleado)
  const [turnosCfg, setTurnosCfg] = useState(null) // { modo, franjas } — config global de turnos
  const [rolesPermisos, setRolesPermisos] = useState(null) // plantilla server-side por rol (/caja/roles-permisos)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [selected, setSelected]   = useState(null)
  const [isNew, setIsNew]         = useState(false)
  const [search, setSearch]       = useState("")
  const [hoveredId, setHoveredId] = useState(null)

  const [reassignData, setReassignData]       = useState(null)
  const [menuData, setMenuData]               = useState(null)
  const [pendingSelect, setPendingSelect]     = useState(null)
  const [modal, setModal]                     = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [pinTarget, setPinTarget]             = useState(null)
  const [deleteTarget, setDeleteTarget]       = useState(null)
  const { toasts, push: pushToast }           = useToasts()

  useEffect(() => { load() }, [])

  /** nombre de caja a partir de su id (resuelto contra el catálogo cargado). */
  function nombreDeCaja(cajaId, cajas) {
    if (!cajaId) return null
    return cajas.find(c => String(c.id) === String(cajaId))?.nombre ?? null
  }
  /** caja_id a partir de su nombre (para persistir la asignación). */
  function idDeCaja(nombre) {
    if (!nombre) return null
    return registers.find(c => c.nombre === nombre)?.id ?? null
  }

  async function load() {
    setLoading(true)
    try {
      // Catálogo de cajas + usuarios (modo admin: incluye pin con token admin
      // para validar duplicados). La asignación viaja en u.caja_id.
      const [cajas, users, turnos, roles] = await Promise.all([
        listarCajasAPI().catch(() => []),
        obtenerUsuarios(true),
        obtenerConfigTurnos().catch(() => null),
        obtenerRolesPermisosAPI().catch(() => null),
      ])
      setRegisters(cajas)
      setEmployees(users.map(u => ({ ...u, caja: nombreDeCaja(u.caja_id, cajas) })))
      if (turnos) { setFranjas(turnos.franjas ?? []); setTurnosCfg(turnos) }
      if (roles) setRolesPermisos(roles)
    } catch {
      pushToast("Error al cargar empleados", "error")
    } finally {
      setLoading(false)
    }
  }

  const filtered    = employees.filter(e => e.nombre.toLowerCase().includes(search.toLowerCase()))
  const selectedEmp = employees.find(e => e.id === selected) ?? null

  function trySelect(empId) {
    if (isNew) { setPendingSelect(empId); setModal("unsaved"); return }
    setSelected(empId); setIsNew(false)
  }

  function handleDiscard() {
    setModal(null)
    if (pendingSelect === "new") { setIsNew(true); setSelected(null) }
    else if (pendingSelect !== null) { setSelected(pendingSelect); setIsNew(false) }
    setPendingSelect(null)
  }

  function handleCancel() {
    if (isNew) { setIsNew(false); setSelected(null) }
  }

  async function handleSave(form) {
    const { pinConfirm: _, caja: formCaja, ...apiData } = form
    const cajaId = idDeCaja(formCaja)
    setSaving(true)
    try {
      if (isNew) {
        // Crear el usuario con su caja en un solo POST (el endpoint acepta caja_id).
        const created = await crearUsuario({ ...apiData, caja_id: cajaId })
        setEmployees(es => [...es, { ...created, caja_id: cajaId, caja: formCaja ?? null }])
        setSelected(created.id); setIsNew(false)
      } else {
        // Persistir datos + asignación de caja en un solo PUT.
        const updated = await actualizarUsuario({ ...apiData, caja_id: cajaId })
        // Una caja = 0..1 empleado: si este toma una caja ya asignada a otro,
        // se la quitamos al otro (server + estado).
        if (cajaId) {
          const previo = employees.find(e => e.id !== updated.id && e.caja === formCaja)
          if (previo) await actualizarUsuario({ ...previo, caja_id: null }).catch(() => {})
        }
        setEmployees(es => {
          let next = es.map(e => e.id === updated.id ? { ...updated, caja_id: cajaId, caja: formCaja ?? e.caja } : e)
          if (formCaja) next = next.map(e => e.id !== updated.id && e.caja === formCaja ? { ...e, caja_id: null, caja: null } : e)
          return next
        })
      }
      pushToast("Empleado guardado correctamente ✓")
    } catch (err) {
      pushToast(err?.message || "Error al guardar", "error")
    } finally {
      setSaving(false)
    }
  }

  function handleToggleActive(form, setForm) {
    if (form.activo) {
      const activeAdmins = employees.filter(e => e.activo && e.rol === "admin")
      if (form.rol === "admin" && activeAdmins.length <= 1) {
        pushToast("Debe existir al menos un Admin activo.", "error"); return
      }
      setDeactivateTarget({ form, setForm }); setModal("deactivate")
    } else {
      setForm(f => ({ ...f, activo: true }))
    }
  }

  function confirmDeactivate() {
    deactivateTarget.setForm(f => ({ ...f, activo: false }))
    setModal(null); setDeactivateTarget(null)
  }

  async function handleDelete(emp) {
    const activeAdmins = employees.filter(e => e.activo && e.rol === "admin")
    if (emp.rol === "admin" && activeAdmins.length <= 1) {
      pushToast("No puedes eliminar al único Admin activo.", "error"); return
    }
    try {
      await eliminarUsuario(emp.id)
      setEmployees(es => es.filter(e => e.id !== emp.id))
      if (selected === emp.id) { setSelected(null); setIsNew(false) }
      pushToast("Empleado eliminado")
    } catch (err) {
      pushToast(err?.message || "Error al eliminar", "error")
    }
  }

  async function handleReassign(empId, newCaja, owner) {
    const cajaId = idDeCaja(newCaja)
    try {
      const emp = employees.find(e => e.id === empId)
      if (emp) await actualizarUsuario({ ...emp, caja_id: cajaId })
      if (owner) await actualizarUsuario({ ...owner, caja_id: null }).catch(() => {})
      setEmployees(es => es.map(e => {
        if (e.id === empId) return { ...e, caja_id: cajaId, caja: newCaja }
        if (owner && e.id === owner.id) return { ...e, caja_id: null, caja: null }
        return e
      }))
      const empName = employees.find(e => e.id === empId)?.nombre.split(" ")[0] ?? ""
      pushToast(`Caja reasignada a ${empName} ✓`)
    } catch (err) {
      pushToast(err?.message || "Error al reasignar", "error")
    }
    setReassignData(null)
  }

  function handleMenuAction(action, emp) {
    setMenuData(null)
    if (action === "edit")         { trySelect(emp.id) }
    if (action === "changePin")    { setPinTarget(emp); setModal("changePin") }
    if (action === "delete")       { setDeleteTarget(emp); setModal("delete") }
    if (action === "toggleActive") {
      if (emp.activo) {
        const activeAdmins = employees.filter(e => e.activo && e.rol === "admin")
        if (emp.rol === "admin" && activeAdmins.length <= 1) { pushToast("Debe existir al menos un Admin activo.", "error"); return }
        setDeactivateTarget({
          form: emp,
          setForm: fn => setEmployees(es => es.map(e => e.id === emp.id ? { ...e, activo: fn(emp).activo } : e))
        })
        setModal("deactivate")
      } else {
        setEmployees(es => es.map(e => e.id === emp.id ? { ...e, activo: true } : e))
      }
    }
  }

  // Nuevo empleado: usa la plantilla server-side del rol "cajero" si ya cargó
  // (/caja/roles-permisos), o el fallback estático mientras tanto.
  const displayEmployee = isNew
    ? { ...NEW_EMP, permisos: { ...(rolesPermisos?.cajero ?? ROL_PERMISOS_DEFAULT.cajero) } }
    : selectedEmp
  const reassignEmp     = reassignData ? employees.find(e => e.id === reassignData.empId) : null
  const menuEmp         = menuData     ? employees.find(e => e.id === menuData.empId)     : null

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", margin: -24, height: "calc(100% + 48px)", overflow: "hidden", background: "#f9fafb" }}>

        {/* Toolbar */}
        <div style={{ height: 56, borderBottom: "1px solid #e5e7eb", background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Empleados y permisos</h1>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setVista("empleados")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
                  fontSize: 13.5, fontWeight: 500, cursor: "pointer", border: "none",
                  background: vista === "empleados" ? "#fff7ed" : "transparent",
                  color: vista === "empleados" ? "#c2410c" : "#6b7280",
                }}
              >
                <UsersIcon size={14} /> Empleados
              </button>
              <button
                onClick={() => setVista("roles")}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
                  fontSize: 13.5, fontWeight: 500, cursor: "pointer", border: "none",
                  background: vista === "roles" ? "#fff7ed" : "transparent",
                  color: vista === "roles" ? "#c2410c" : "#6b7280",
                }}
              >
                <ShieldCheck size={14} /> Roles y permisos
              </button>
            </div>
          </div>
          {vista === "empleados" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setModal("turnos")}
                style={{ display: "flex", alignItems: "center", gap: 6, ...btnSecondary, borderRadius: 8 }}
              >
                <Clock size={15} />
                Turnos
              </button>
              <button
                onClick={() => {
                  if (isNew) return
                  if (selected !== null) { setPendingSelect("new"); setModal("unsaved"); return }
                  setIsNew(true); setSelected(null)
                }}
                style={{ display: "flex", alignItems: "center", gap: 6, ...btnPrimary, borderRadius: 8 }}
              >
                <UserPlus size={15} />
                Nuevo empleado
              </button>
            </div>
          )}
        </div>

        {vista === "roles" ? (
          <TabRolesPermisos
            rolesPermisos={rolesPermisos}
            setRolesPermisos={setRolesPermisos}
            employees={employees}
            pushToast={pushToast}
          />
        ) : (
        /* Body */
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* List panel */}
          <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={14} color="#9ca3af" style={{ position: "absolute", left: 10, top: 9 }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar empleado..."
                  style={{ ...inp, paddingLeft: 32, fontSize: 13 }} />
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Cargando…</div>
              ) : filtered.map(emp => {
                const isSel    = !isNew && selected === emp.id
                const isHov    = hoveredId === emp.id
                const badgeSty = roleBadgeStyle(emp.rol)

                return (
                  <div
                    key={emp.id}
                    onClick={() => trySelect(emp.id)}
                    onMouseEnter={() => setHoveredId(emp.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", cursor: "pointer",
                      borderLeft: isSel ? "3px solid #ea580c" : "3px solid transparent",
                      background: isSel ? "#fff7ed" : isHov ? "#f9fafb" : "#fff",
                      position: "relative",
                    }}
                  >
                    <Avatar nombre={emp.nombre} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.nombre}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <span style={{ borderRadius: 9999, padding: "1px 7px", fontSize: 11, fontWeight: 500, ...badgeSty }}>
                          {ROL_LABEL[emp.rol] ?? emp.rol}
                        </span>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>·</span>
                        <span style={{ fontSize: 11, color: emp.caja ? "#6b7280" : "#9ca3af", fontStyle: emp.caja ? "normal" : "italic" }}>
                          {emp.caja ?? "Sin caja"}
                        </span>
                      </div>
                    </div>

                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: emp.activo ? "#4ade80" : "#d1d5db",
                    }} />

                    {isHov && (
                      <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                        <button
                          title="Reasignar caja"
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setReassignData(d => d?.empId === emp.id ? null : { empId: emp.id, rect })
                            setMenuData(null)
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, color: "#6b7280", display: "flex" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#e5e7eb"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <ArrowLeftRight size={14} />
                        </button>
                        <button
                          title="Más acciones"
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setMenuData(d => d?.empId === emp.id ? null : { empId: emp.id, rect })
                            setReassignData(null)
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 4, color: "#6b7280", display: "flex" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#e5e7eb"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detail panel */}
          <div style={{ flex: 1, display: "flex", background: "#fff", overflow: "hidden" }}>
            <DetailPanel
              key={isNew ? "new" : selected}
              employee={displayEmployee}
              employees={employees}
              setEmployees={setEmployees}
              registers={registers}
              setRegisters={setRegisters}
              onSave={handleSave}
              onToggleActive={handleToggleActive}
              isNew={isNew}
              onCancel={handleCancel}
              pushToast={pushToast}
              saving={saving}
              franjas={franjas}
              rolesPermisos={rolesPermisos}
            />
          </div>
        </div>
        )}
      </div>

      {/* Fixed dropdowns */}
      {reassignData && reassignEmp && (
        <ReassignDropdown
          employee={reassignEmp}
          employees={employees}
          registers={registers}
          rect={reassignData.rect}
          onReassign={(newCaja, owner) => handleReassign(reassignData.empId, newCaja, owner)}
          onClose={() => setReassignData(null)}
        />
      )}
      {menuData && menuEmp && (
        <MoreMenu
          employee={menuEmp}
          rect={menuData.rect}
          onAction={handleMenuAction}
          onClose={() => setMenuData(null)}
        />
      )}

      {/* Modals */}
      {modal === "unsaved" && (
        <UnsavedModal
          onDiscard={handleDiscard}
          onKeep={() => { setModal(null); setPendingSelect(null) }}
        />
      )}
      {modal === "deactivate" && deactivateTarget && (
        <DeactivateModal
          nombre={deactivateTarget.form.nombre}
          onConfirm={confirmDeactivate}
          onClose={() => { setModal(null); setDeactivateTarget(null) }}
        />
      )}
      {modal === "changePin" && pinTarget && (
        <ChangePinModal
          employee={pinTarget}
          employees={employees}
          onSave={async pin => {
            try {
              const emp = employees.find(e => e.id === pinTarget.id)
              const updated = await actualizarUsuario({ ...emp, pin })
              setEmployees(es => es.map(e => e.id === pinTarget.id ? { ...updated, caja: e.caja } : e))
              pushToast("PIN actualizado ✓")
            } catch (err) {
              pushToast(err?.message || "Error al cambiar PIN", "error")
            }
            setModal(null); setPinTarget(null)
          }}
          onClose={() => { setModal(null); setPinTarget(null) }}
        />
      )}
      {modal === "delete" && deleteTarget && (
        <DeleteModal
          nombre={deleteTarget.nombre}
          onConfirm={async () => {
            await handleDelete(deleteTarget)
            setModal(null); setDeleteTarget(null)
          }}
          onClose={() => { setModal(null); setDeleteTarget(null) }}
        />
      )}

      {modal === "turnos" && (
        <TurnosConfigModal
          cfgInicial={turnosCfg}
          onClose={() => setModal(null)}
          onGuardado={(cfg) => { setTurnosCfg(cfg); setFranjas(cfg.franjas ?? []); setModal(null) }}
          pushToast={pushToast}
        />
      )}

      <ToastStack toasts={toasts} />
    </>
  )
}

// ── Modal: Configuración de turnos (modo día/turnos + franjas) ──────────────────

function TurnosConfigModal({ cfgInicial, onClose, onGuardado, pushToast }) {
  const [modo, setModo] = useState(cfgInicial?.modo ?? "dia")
  const [franjas, setFranjas] = useState(cfgInicial?.franjas ?? [])
  const [guardando, setGuardando] = useState(false)

  const setFr = (i, patch) => setFranjas(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const addFr = () => setFranjas(fs => [...fs, { id: `franja-${fs.length + 1}`, nombre: "", desde: "08:00", hasta: "14:00" }])
  const delFr = (i) => setFranjas(fs => fs.filter((_, idx) => idx !== i))

  async function guardar() {
    if (modo === "turnos") {
      if (franjas.length === 0) { pushToast("El modo turnos requiere al menos una franja", "error"); return }
      if (franjas.some(f => !f.nombre.trim() || !f.desde || !f.hasta)) {
        pushToast("Completa nombre y horas de cada franja", "error"); return
      }
    }
    setGuardando(true)
    try {
      const saved = await guardarConfigTurnos({ modo, franjas })
      pushToast("Configuración de turnos guardada ✓")
      onGuardado(saved)
    } catch (e) {
      pushToast(e?.message || "No se pudo guardar", "error")
    } finally { setGuardando(false) }
  }

  return (
    <Modal title="Configuración de turnos" onClose={onClose} width={520}>
      {/* Selector de modo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {[
          { v: "dia", t: "Por día (corte continuo por caja)", d: "El corte de cada caja abarca todas sus ventas desde el último cierre, sin importar la hora ni el cajero. Recomendado para horario flexible." },
          { v: "turnos", t: "Por turnos (subdividir por franja)", d: "El corte de cada caja se divide en franjas horarias (matutino, vespertino…). Útil si quieres arquear por turno." },
        ].map(opt => (
          <button key={opt.v} type="button" onClick={() => setModo(opt.v)}
            style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${modo === opt.v ? "#ea580c" : "#e5e7eb"}`,
              background: modo === opt.v ? "#fff7ed" : "#fff",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                border: `5px solid ${modo === opt.v ? "#ea580c" : "#d1d5db"}`,
                background: "#fff",
              }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{opt.t}</span>
            </div>
            <p style={{ margin: "6px 0 0 24px", fontSize: 12, color: "#6b7280" }}>{opt.d}</p>
          </button>
        ))}
      </div>

      {/* Editor de franjas (solo en modo turnos) */}
      {modo === "turnos" && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>
            Franjas horarias
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {franjas.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={f.nombre} onChange={e => setFr(i, { nombre: e.target.value })} placeholder="Nombre"
                  style={{ ...inp, flex: 1 }} />
                <input type="time" value={f.desde} onChange={e => setFr(i, { desde: e.target.value })} style={{ ...inp, width: 110 }} />
                <span style={{ color: "#9ca3af" }}>–</span>
                <input type="time" value={f.hasta} onChange={e => setFr(i, { hasta: e.target.value })} style={{ ...inp, width: 110 }} />
                <button type="button" onClick={() => delFr(i)} title="Eliminar franja"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 6, display: "flex" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addFr}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", fontSize: 13, color: "#ea580c", cursor: "pointer", marginTop: 10 }}>
            <Plus size={14} /> Agregar franja
          </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <button onClick={onClose} style={btnSecondary} disabled={guardando}>Cancelar</button>
        <button onClick={guardar} style={btnPrimary} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  )
}
