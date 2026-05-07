import { useState, useEffect, useRef } from "react"
import { UNIDADES_SAT } from "../lib/unidades-sat"

function UnidadSatSelect({ value, onChange }) {
  return (
    <select
      className="ar-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {UNIDADES_SAT.map((u) => (
        <option key={u.clave} value={u.clave}>
          {u.clave} — {u.nombre}
        </option>
      ))}
    </select>
  )
}

const EMPTY_FORM = {
  clave: "", claveAlterna: "", descripcion: "",
  categoria: "", departamento: "",
  unidadCompra: "H87", unidadVenta: "H87", factor: 1,
  aplicarIva: true,
  precioCompra: "", precioNeto: false,
  precio1: "", precio2: "", precio3: "", precio4: "",
  claveSat: "",
  inventarioMin: "", inventarioMax: "",
  localizacion: "", peso: "",
  ventaGranel: false, imagenes: [],
}

function Toggle({ id, checked, onChange, label }) {
  return (
    <label className="ar-toggle" htmlFor={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`ar-toggle-track${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked) } }}
      >
        <span className="ar-toggle-thumb" />
      </button>
      {label && <span className="ar-toggle-label">{label}</span>}
    </label>
  )
}

function Field({ label, error, children, tooltip }) {
  return (
    <div className="ar-field">
      <label className="ar-label">
        {label}
        {tooltip && (
          <span className="ar-tooltip-icon" title={tooltip}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
        )}
      </label>
      {children}
      {error && <p className="ar-error">{error}</p>}
    </div>
  )
}

export default function ArticleDrawer({ open, mode, article, articles, onSave, onClose, getNextClave, saving = false }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const firstInputRef = useRef(null)
  const fileInputRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(mode === "edit" && article ? { ...EMPTY_FORM, ...article } : EMPTY_FORM)
    setErrors({})
  }, [open, mode, article])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => firstInputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function f(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  function handleGenerarClave() {
    f("clave", getNextClave(form.categoria, form.departamento))
  }

  function validate() {
    const errs = {}
    const clave = form.clave.trim()
    if (!clave) {
      errs.clave = "La clave es obligatoria"
    } else if (articles.some((a) => a.clave.toLowerCase() === clave.toLowerCase() && a.id !== article?.id)) {
      errs.clave = "Esta clave ya existe. Usa Generar Clave para crear una única."
    }
    if (!form.descripcion.trim()) errs.descripcion = "La descripción es obligatoria"
    if (!form.precio1 || Number(form.precio1) <= 0) errs.precio1 = "El precio debe ser mayor a 0"
    if (!form.factor || Number(form.factor) <= 0) errs.factor = "El factor debe ser mayor a 0"
    return errs
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    onSave({
      ...form,
      clave: form.clave.trim(),
      descripcion: form.descripcion.trim(),
      factor: Number(form.factor),
      precioCompra: Number(form.precioCompra) || 0,
      precio1: Number(form.precio1),
      precio2: Number(form.precio2) || 0,
      precio3: Number(form.precio3) || 0,
      precio4: Number(form.precio4) || 0,
      inventarioMin: Number(form.inventarioMin) || 0,
      inventarioMax: Number(form.inventarioMax) || 0,
      peso: Number(form.peso) || 0,
    })
  }

  return (
    <>
      <div className={`ar-backdrop${open ? " open" : ""}`} onClick={onClose} />

      <div className={`ar-drawer${open ? " open" : ""}`}>
        {/* Header */}
        <div className="ar-drawer-header">
          <span className="ar-drawer-title">
            {mode === "add" ? "Nuevo Artículo" : "Editar Artículo"}
          </span>
          <button type="button" className="ar-drawer-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="ar-drawer-body">

          {/* Identificación */}
          <p className="ar-section-title">Identificación</p>

          <Field label="Clave" error={errors.clave}>
            <div className="ar-clave-row">
              <input
                ref={firstInputRef}
                type="text"
                className={`ar-input${errors.clave ? " error" : ""}`}
                value={form.clave}
                onChange={(e) => f("clave", e.target.value)}
                placeholder="Ej: FT0001"
              />
              <button type="button" className="ar-btn-generar" onClick={handleGenerarClave}>
                Generar Clave
              </button>
            </div>
          </Field>

          <Field label="Clave Alterna">
            <input type="text" className="ar-input" value={form.claveAlterna}
              onChange={(e) => f("claveAlterna", e.target.value)}
              placeholder="Código de proveedor u otro" />
          </Field>

          <Field label="Descripción" error={errors.descripcion}>
            <input type="text" className={`ar-input${errors.descripcion ? " error" : ""}`}
              value={form.descripcion} onChange={(e) => f("descripcion", e.target.value)}
              placeholder="Nombre completo del artículo" />
          </Field>

          <div className="ar-grid-2">
            <Field label="Categoría">
              <input type="text" className="ar-input" value={form.categoria}
                onChange={(e) => f("categoria", e.target.value)} placeholder="Ej: Ferretería" />
            </Field>
            <Field label="Departamento">
              <input type="text" className="ar-input" value={form.departamento}
                onChange={(e) => f("departamento", e.target.value)} placeholder="Ej: Tornillos" />
            </Field>
          </div>

          {/* Unidades */}
          <p className="ar-section-title">Unidades</p>

          <div className="ar-grid-3">
            <Field label="U. Compra">
              <UnidadSatSelect value={form.unidadCompra} onChange={(v) => f("unidadCompra", v)} />
            </Field>
            <Field label="U. Venta">
              <UnidadSatSelect value={form.unidadVenta} onChange={(v) => f("unidadVenta", v)} />
            </Field>
            <Field
              label="Factor"
              error={errors.factor}
              tooltip="Unidades de venta por unidad de compra. Ej: 1 Rollo = 50 m"
            >
              <input type="number" min="0.001" step="any"
                className={`ar-input${errors.factor ? " error" : ""}`}
                value={form.factor} onChange={(e) => f("factor", e.target.value)} />
            </Field>
          </div>

          {/* Precios */}
          <p className="ar-section-title">Precios</p>

          <Toggle id="ar-iva" checked={form.aplicarIva} onChange={(v) => f("aplicarIva", v)} label="Aplicar IVA" />

          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
            <div style={{ width: "160px" }}>
              <Field label="Precio de Compra">
                <input type="number" min="0" step="0.01" className="ar-input"
                  value={form.precioCompra} onChange={(e) => f("precioCompra", e.target.value)}
                  placeholder="0.00" />
              </Field>
            </div>
            <div style={{ paddingBottom: "2px" }}>
              <Toggle id="ar-neto" checked={form.precioNeto} onChange={(v) => f("precioNeto", v)} label="Precio neto (sin IVA)" />
            </div>
          </div>

          <div>
            <p className="ar-label" style={{ marginBottom: "8px" }}>Precios de Venta</p>
            <div className="ar-precio-grid">
              {[1, 2, 3, 4].map((n) => (
                <Field key={n} label={`Precio ${n}${n === 1 ? " *" : ""}`} error={n === 1 ? errors.precio1 : undefined}>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    className={`ar-input${n === 1 && errors.precio1 ? " error" : ""}`}
                    value={form[`precio${n}`]} onChange={(e) => f(`precio${n}`, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>

          {/* Catálogo */}
          <p className="ar-section-title">Catálogo</p>

          <Field label="Clave SAT">
            <input type="text" className="ar-input" value={form.claveSat}
              onChange={(e) => f("claveSat", e.target.value)} placeholder="Ej: 31161501" />
          </Field>

          <div className="ar-grid-2">
            <Field label="Inventario Mínimo">
              <input type="number" min="0" className="ar-input" value={form.inventarioMin}
                onChange={(e) => f("inventarioMin", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Inventario Máximo">
              <input type="number" min="0" className="ar-input" value={form.inventarioMax}
                onChange={(e) => f("inventarioMax", e.target.value)} placeholder="0" />
            </Field>
          </div>

          <Field label="Localización">
            <input type="text" className="ar-input" value={form.localizacion}
              onChange={(e) => f("localizacion", e.target.value)} placeholder="Pasillo 3, Estante B" />
          </Field>

          <Field label="Peso (kg)">
            <input type="number" min="0" step="0.001" className="ar-input"
              value={form.peso} onChange={(e) => f("peso", e.target.value)} placeholder="0.000" />
          </Field>

          <Toggle id="ar-granel" checked={form.ventaGranel} onChange={(v) => f("ventaGranel", v)}
            label="Permite cantidades fraccionadas" />

          {/* Imágenes */}
          <p className="ar-section-title">Imágenes</p>

          <div className="ar-images-row">
            {form.imagenes.length === 0 && (
              <div className="ar-img-placeholder">Sin imagen</div>
            )}
            {form.imagenes.map((src, i) => (
              <div key={i} className="ar-img-thumb">
                <img src={src} alt="" />
                <button
                  type="button"
                  className="ar-img-remove"
                  title="Quitar imagen"
                  onClick={() => f("imagenes", form.imagenes.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                files.forEach((file) => {
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    setForm((prev) => ({
                      ...prev,
                      imagenes: [...(prev.imagenes || []), ev.target.result],
                    }))
                  }
                  reader.readAsDataURL(file)
                })
                e.target.value = ""
              }}
            />
            <button
              type="button"
              className="ar-btn-add-img"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Agregar
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="ar-drawer-footer">
          <button type="button" className="ar-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ar-btn-save" onClick={handleSave} disabled={saving}
            style={saving ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  )
}
