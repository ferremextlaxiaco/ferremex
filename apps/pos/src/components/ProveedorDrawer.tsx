import { useState, useEffect, useRef } from "react"
import type { Proveedor } from "../lib/proveedores"
import { soloTelefono } from "../lib/format"

// ── Iconos ────────────────────────────────────────────────────────────────────

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Drawer: formulario de proveedor (compartido entre Proveedores y Artículos) ──

export type ProvForm = {
  num_proveedor: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  dias_credito: number
  limite_credito: number
  rfc: string
  notas: string
}

export const PROV_VACIO: ProvForm = {
  num_proveedor: "",
  nombre: "",
  contacto: "",
  telefono: "",
  email: "",
  dias_credito: 30,
  limite_credito: 0,
  rfc: "",
  notas: "",
}

export function ProveedorDrawer({
  open,
  mode,
  proveedor,
  defaultNum,
  onSave,
  onClose,
}: {
  open: boolean
  mode: "add" | "edit"
  proveedor: Proveedor | null
  defaultNum: string
  onSave: (data: ProvForm & { id?: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<ProvForm>({ ...PROV_VACIO })
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && proveedor) {
      const { id: _id, facturas: _f, ...rest } = proveedor
      setForm(rest)
    } else {
      setForm({ ...PROV_VACIO, num_proveedor: defaultNum })
    }
  }, [open, mode, proveedor, defaultNum])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => firstRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [open, onClose])

  function f<K extends keyof ProvForm>(k: K, v: ProvForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave(mode === "edit" && proveedor ? { ...form, id: proveedor.id } : form)
  }

  return (
    <>
      <div className={`apv-backdrop${open ? " open" : ""}`} onClick={onClose} />
      <div className={`apv-drawer${open ? " open" : ""}`}>
        <div className="apv-drawer-header">
          <span className="apv-drawer-title">
            {mode === "add" ? "Nuevo proveedor" : "Editar proveedor"}
          </span>
          <button type="button" className="apv-drawer-close" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <div className="apv-drawer-body">
          {/* Identificación */}
          <p className="apv-section-title">Identificación</p>
          <div className="ac-grid-3">
            <div className="ac-field">
              <label className="ac-label">Núm. proveedor</label>
              <input className="ac-input" value={form.num_proveedor}
                onChange={(e) => f("num_proveedor", e.target.value)} placeholder="001" />
            </div>
            <div className="ac-field" style={{ gridColumn: "span 2" }}>
              <label className="ac-label">Nombre / empresa *</label>
              <input ref={firstRef} className="ac-input" value={form.nombre}
                onChange={(e) => f("nombre", e.target.value)} placeholder="Nombre del proveedor" />
            </div>
          </div>

          <div className="ac-grid-2" style={{ marginTop: 10 }}>
            <div className="ac-field">
              <label className="ac-label">Contacto</label>
              <input className="ac-input" value={form.contacto}
                onChange={(e) => f("contacto", e.target.value)} placeholder="Lic. Juan García" />
            </div>
            <div className="ac-field">
              <label className="ac-label">Teléfono</label>
              <input className="ac-input" type="tel" inputMode="numeric" maxLength={10} value={form.telefono}
                onChange={(e) => f("telefono", soloTelefono(e.target.value))} placeholder="55 1234 5678" />
            </div>
          </div>

          <div className="ac-field" style={{ marginTop: 10 }}>
            <label className="ac-label">Correo electrónico</label>
            <input className="ac-input" type="email" value={form.email}
              onChange={(e) => f("email", e.target.value)} placeholder="ventas@proveedor.com" />
          </div>

          {/* Crédito */}
          <p className="apv-section-title">Crédito</p>
          <div className="ac-grid-2">
            <div className="ac-field">
              <label className="ac-label">Días de crédito</label>
              <input className="ac-input" type="number" min={0}
                value={form.dias_credito}
                onChange={(e) => f("dias_credito", Number(e.target.value))} />
            </div>
            <div className="ac-field">
              <label className="ac-label">Límite de crédito ($)</label>
              <input className="ac-input" type="number" min={0} step={100}
                value={form.limite_credito}
                onChange={(e) => f("limite_credito", Number(e.target.value))} />
            </div>
          </div>

          {/* Fiscal */}
          <p className="apv-section-title">Datos fiscales</p>
          <div className="ac-field">
            <label className="ac-label">RFC</label>
            <input className="ac-input" value={form.rfc}
              onChange={(e) => f("rfc", e.target.value.toUpperCase())}
              placeholder="XAXX010101000" maxLength={13} />
          </div>

          {/* Notas */}
          <p className="apv-section-title">Notas</p>
          <div className="ac-field">
            <textarea className="ac-input" style={{ minHeight: 72, resize: "vertical" }}
              value={form.notas}
              onChange={(e) => f("notas", e.target.value)}
              placeholder="Condiciones especiales, observaciones…" />
          </div>
        </div>

        <div className="apv-drawer-footer">
          <button type="button" className="ac-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ac-btn-save" onClick={handleSave}
            disabled={!form.nombre.trim()}>
            {mode === "add" ? "Agregar proveedor" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </>
  )
}
