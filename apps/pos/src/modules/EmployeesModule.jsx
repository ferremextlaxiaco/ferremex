import { useState, useEffect, useRef } from "react"
import {
  UserPlus, Search, ArrowLeftRight, MoreVertical, UserCog,
  Eye, EyeOff, PlusCircle, AlertTriangle,
} from "lucide-react"
import { obtenerUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario } from "../lib/client"
import { useToasts } from "../hooks/useToasts"

// ── Constants ──────────────────────────────────────────────────────────────────

const INIT_REGISTERS = [
  { id: 1, nombre: "Caja Principal", descripcion: "Caja principal del mostrador",       activa: true  },
  { id: 2, nombre: "Caja 1",         descripcion: "",                                   activa: true  },
  { id: 3, nombre: "Caja Express",   descripcion: "Para ventas rápidas menores a $500", activa: true  },
  { id: 4, nombre: "Caja Bodega",    descripcion: "Fuera de servicio",                  activa: false },
]

const LS_REGISTERS  = "pos_cajas_catalogo"
const LS_ASIGNACION = "pos_cajas_asignaciones"

function loadRegisters() {
  try { const s = localStorage.getItem(LS_REGISTERS);  return s ? JSON.parse(s) : INIT_REGISTERS } catch { return INIT_REGISTERS }
}
function loadAsignaciones() {
  try { const s = localStorage.getItem(LS_ASIGNACION); return s ? JSON.parse(s) : {} } catch { return {} }
}
function saveAsignaciones(employees) {
  const map = {}
  employees.forEach(e => { if (e.caja) map[e.id] = e.caja })
  localStorage.setItem(LS_ASIGNACION, JSON.stringify(map))
}

const ROL_PERMISOS_DEFAULT = {
  admin:      { puede_vender: true,  puede_cotizar: true,  puede_anular: true,  puede_ver_corte: true,  puede_ver_admin: true  },
  supervisor: { puede_vender: true,  puede_cotizar: true,  puede_anular: true,  puede_ver_corte: true,  puede_ver_admin: false },
  cajero:     { puede_vender: true,  puede_cotizar: false, puede_anular: false, puede_ver_corte: true,  puede_ver_admin: false },
}

const PERMISOS_LABELS = [
  { key: "puede_vender",    label: "Registrar ventas" },
  { key: "puede_cotizar",   label: "Crear cotizaciones" },
  { key: "puede_anular",    label: "Anular ventas" },
  { key: "puede_ver_corte", label: "Ver corte de caja" },
  { key: "puede_ver_admin", label: "Acceder al panel de administración" },
]

const ROL_LABEL = { admin: "Admin", supervisor: "Supervisor", cajero: "Cajero" }

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
    const dup = employees.find(e => e.id !== employee.id && e.pin === pin)
    if (dup) return `Este PIN ya está en uso por ${dup.nombre}`
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

function TabInfo({ form, setForm, employees, original }) {
  const [showPin, setShowPin] = useState(false)
  const [pinModified, setPinMod] = useState(false)
  const [errors, setErrors] = useState({})
  const otherPins = employees.filter(e => e.id !== form.id).map(e => e.pin)

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (k === "rol") next.permisos = { ...ROL_PERMISOS_DEFAULT[v] }
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
    </div>
  )
}

// ── Tab: Cajas ─────────────────────────────────────────────────────────────────

function TabCajas({ form, setForm, employees, setEmployees, registers, setRegisters }) {
  const [editingId, setEditingId]             = useState(null)
  const [editBuf, setEditBuf]                 = useState({})
  const [addingNew, setAddingNew]             = useState(false)
  const [newBuf, setNewBuf]                   = useState({ nombre: "", descripcion: "" })
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  function startEdit(reg) { setEditingId(reg.id); setEditBuf({ nombre: reg.nombre, descripcion: reg.descripcion, activa: reg.activa }); setAddingNew(false) }
  function saveEdit() {
    if (!editBuf.nombre.trim()) return
    setRegisters(rs => rs.map(r => r.id === editingId ? { ...r, ...editBuf, nombre: editBuf.nombre.trim() } : r))
    setEditingId(null)
  }
  function saveNew() {
    if (!newBuf.nombre.trim()) return
    setRegisters(rs => [...rs, { id: Date.now(), nombre: newBuf.nombre.trim(), descripcion: newBuf.descripcion.trim(), activa: true }])
    setAddingNew(false); setNewBuf({ nombre: "", descripcion: "" })
  }
  function deleteRegister(reg) {
    setRegisters(rs => rs.filter(r => r.id !== reg.id))
    if (form.caja === reg.nombre) setForm(f => ({ ...f, caja: null }))
    setEmployees(es => es.map(e => e.caja === reg.nombre ? { ...e, caja: null } : e))
    setDeleteConfirmId(null)
  }

  const sorted       = [...registers.filter(r => r.activa), ...registers.filter(r => !r.activa)]
  const assignedOwner = form.caja ? employees.find(e => e.id !== form.id && e.caja === form.caja) : null

  const secLabel = { fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 0, display: "block" }
  const rowInput = { border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", fontSize: 13, outline: "none", flex: 1, boxSizing: "border-box" }

  return (
    <div>
      <span style={secLabel}>Cajas de Ferremex</span>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
        {sorted.map((reg, i) => (
          <div key={reg.id} style={{ opacity: reg.activa ? 1 : 0.6 }}>
            {editingId === reg.id ? (
              <div style={{ padding: "10px 12px", borderBottom: i < sorted.length - 1 ? "1px solid #f3f4f6" : "none", background: "#fff7ed" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={editBuf.nombre} onChange={e => setEditBuf(b => ({ ...b, nombre: e.target.value }))} style={rowInput} placeholder="Nombre" />
                  <input value={editBuf.descripcion} onChange={e => setEditBuf(b => ({ ...b, descripcion: e.target.value }))} style={rowInput} placeholder="Descripción" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
                    <Toggle checked={editBuf.activa} onChange={() => setEditBuf(b => ({ ...b, activa: !b.activa }))} />
                    Activa
                  </label>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>Cancelar</button>
                  <button onClick={saveEdit} style={{ background: "none", border: "none", fontSize: 12, color: "#ea580c", fontWeight: 500, cursor: "pointer" }}>Guardar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < sorted.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: reg.activa ? "#4ade80" : "#d1d5db", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reg.nombre}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reg.descripcion}</div>
                </div>
                {deleteConfirmId === reg.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>¿Eliminar?</span>
                    <button onClick={() => deleteRegister(reg)} style={{ background: "none", border: "none", fontSize: 12, color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>Sí</button>
                    <button onClick={() => setDeleteConfirmId(null)} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>No</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { startEdit(reg); setDeleteConfirmId(null) }} style={{ background: "none", border: "none", fontSize: 12, color: "#ea580c", cursor: "pointer" }}>editar</button>
                    <button onClick={() => { setDeleteConfirmId(reg.id); setEditingId(null) }} style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>eliminar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {addingNew && (
          <div style={{ padding: "10px 12px", borderTop: "1px solid #f3f4f6", background: "#fff7ed" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={newBuf.nombre} onChange={e => setNewBuf(b => ({ ...b, nombre: e.target.value }))}
                style={rowInput} placeholder="Nombre de la caja" autoFocus />
              <input value={newBuf.descripcion} onChange={e => setNewBuf(b => ({ ...b, descripcion: e.target.value }))}
                style={rowInput} placeholder="Descripción" />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button onClick={() => setAddingNew(false)} style={{ background: "none", border: "none", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>Cancelar</button>
              <button onClick={saveNew} style={{ background: "none", border: "none", fontSize: 12, color: "#ea580c", fontWeight: 500, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        )}
      </div>
      {!addingNew && (
        <button onClick={() => { setAddingNew(true); setEditingId(null) }}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", fontSize: 13, color: "#ea580c", cursor: "pointer", marginBottom: 24 }}>
          <PlusCircle size={14} />
          Nueva caja
        </button>
      )}

      <span style={{ ...secLabel, marginTop: 8 }}>Caja asignada a {(form.nombre || "EMPLEADO").toUpperCase()}</span>
      <select value={form.caja ?? ""} onChange={e => setForm(f => ({ ...f, caja: e.target.value || null }))}
        style={{ ...inp, cursor: "pointer" }}>
        <option value="">Sin asignar</option>
        {registers.filter(r => r.activa).map(r => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
      </select>
      {assignedOwner && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10 }}>
          <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
            <strong>{form.caja}</strong> ya está asignada a {assignedOwner.nombre}. Al guardar, se le quitará la asignación.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Tab: Permisos ──────────────────────────────────────────────────────────────

function TabPermisos({ form, setForm }) {
  function toggle(key) {
    setForm(f => ({ ...f, permisos: { ...f.permisos, [key]: !f.permisos?.[key] } }))
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
        Permisos de acceso para <strong>{form.nombre || "este empleado"}</strong>. Al cambiar el Rol en Información se aplican los valores predeterminados automáticamente, pero puedes ajustarlos individualmente aquí.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PERMISOS_LABELS.map(({ key, label }) => (
          <label key={key} onClick={() => toggle(key)}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
              borderRadius: 8, cursor: "pointer", userSelect: "none",
              background: form.permisos?.[key] ? "#fff7ed" : "#f9fafb",
              border: `1px solid ${form.permisos?.[key] ? "#fed7aa" : "#e5e7eb"}`,
            }}>
            <Toggle checked={!!form.permisos?.[key]} onChange={() => {}} />
            <span style={{ fontSize: 14, color: "#374151", flex: 1 }}>{label}</span>
            {form.permisos?.[key]
              ? <span style={{ fontSize: 11, color: "#ea580c", fontWeight: 500 }}>Habilitado</span>
              : <span style={{ fontSize: 11, color: "#9ca3af" }}>Desactivado</span>}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ employee, employees, setEmployees, registers, setRegisters, onSave, onToggleActive, isNew, onCancel, pushToast, saving }) {
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
    const dup = employees.find(e => e.id !== form.id && e.pin === form.pin)
    if (dup) errs.pin = `Este PIN ya está en uso por ${dup.nombre}`
    if (form.pin !== original.pin && form.pin !== (form.pinConfirm ?? ""))
      errs.pinConfirm = "Los PINs no coinciden"
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { pushToast("Revisa los campos antes de guardar", "error"); return }
    onSave(form)
  }

  const TABS = [
    { id: "info",     label: "Información" },
    { id: "cajas",    label: "Cajas" },
    { id: "permisos", label: "Permisos" },
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
        {tab === "info"     && <TabInfo form={form} setForm={setForm} employees={employees} original={original} />}
        {tab === "cajas"    && <TabCajas form={form} setForm={setForm} employees={employees} setEmployees={setEmployees} registers={registers} setRegisters={setRegisters} />}
        {tab === "permisos" && <TabPermisos form={form} setForm={setForm} />}
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
  const [employees, setEmployees] = useState([])
  const [registers, setRegisters] = useState(loadRegisters)
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

  useEffect(() => {
    localStorage.setItem(LS_REGISTERS, JSON.stringify(registers))
  }, [registers])

  async function load() {
    setLoading(true)
    try {
      // Modo admin: incluye el pin (con token admin) para validar duplicados.
      const users = await obtenerUsuarios(true)
      const asignaciones = loadAsignaciones()
      setEmployees(users.map(u => ({ ...u, caja: asignaciones[u.id] ?? null })))
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
    setSaving(true)
    try {
      if (isNew) {
        const created = await crearUsuario(apiData)
        setEmployees(es => {
          const next = [...es, { ...created, caja: formCaja ?? null }]
          saveAsignaciones(next)
          return next
        })
        setSelected(created.id); setIsNew(false)
      } else {
        const updated = await actualizarUsuario(apiData)
        setEmployees(es => {
          let next = es.map(e => e.id === updated.id ? { ...updated, caja: formCaja ?? e.caja } : e)
          if (formCaja) next = next.map(e => e.id !== updated.id && e.caja === formCaja ? { ...e, caja: null } : e)
          saveAsignaciones(next)
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
      setEmployees(es => {
        const next = es.filter(e => e.id !== emp.id)
        saveAsignaciones(next)
        return next
      })
      if (selected === emp.id) { setSelected(null); setIsNew(false) }
      pushToast("Empleado eliminado")
    } catch (err) {
      pushToast(err?.message || "Error al eliminar", "error")
    }
  }

  function handleReassign(empId, newCaja, owner) {
    setEmployees(es => {
      const next = es.map(e => {
        if (e.id === empId) return { ...e, caja: newCaja }
        if (owner && e.id === owner.id) return { ...e, caja: null }
        return e
      })
      saveAsignaciones(next)
      return next
    })
    const empName = employees.find(e => e.id === empId)?.nombre.split(" ")[0] ?? ""
    pushToast(`Caja reasignada a ${empName} ✓`)
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

  const displayEmployee = isNew ? NEW_EMP : selectedEmp
  const reassignEmp     = reassignData ? employees.find(e => e.id === reassignData.empId) : null
  const menuEmp         = menuData     ? employees.find(e => e.id === menuData.empId)     : null

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", margin: -24, height: "calc(100% + 48px)", overflow: "hidden", background: "#f9fafb" }}>

        {/* Toolbar */}
        <div style={{ height: 56, borderBottom: "1px solid #e5e7eb", background: "#fff", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" }}>Empleados y permisos</h1>
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

        {/* Body */}
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
            />
          </div>
        </div>
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

      <ToastStack toasts={toasts} />
    </>
  )
}
