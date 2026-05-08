import { useState, useEffect, useRef } from "react"
import { UNIDADES_SAT } from "../lib/unidades-sat"
import { subirImagenArticulo } from "../lib/client"

function round2(n) { return Math.round(n * 100) / 100 }

function calcCostos(form) {
  const base   = Number(form.precioCompra) || 0
  const factor = Number(form.factor) || 1
  let costoSinIva, costoConIva
  if (form.precioNeto && form.aplicarIva) {
    costoConIva = base
    costoSinIva = round2(base / 1.16)
  } else {
    costoSinIva = base
    costoConIva = form.aplicarIva ? round2(base * 1.16) : base
  }
  const costoCalc = round2(costoSinIva / factor)
  const precio4   = form.aplicarIva ? round2(costoCalc * 1.16) : costoCalc
  return { costoSinIva, costoConIva, costoCalc, precio4 }
}

function PrecioRow({ label, required, value, onChange, readOnly, costoCalc, error }) {
  const precio = Number(value) || 0
  const margen = precio > 0 && costoCalc > 0
    ? round2(((precio - costoCalc) / precio) * 100) : null
  return (
    <div className="ar-pr-row">
      <span className="ar-pr-label">{label}{required ? " *" : ""}</span>
      <input
        type="number" min="0" step="0.01" placeholder="0.00"
        className={`ar-input ar-pr-input${readOnly ? " ar-input-ro" : ""}${error ? " error" : ""}`}
        value={value} readOnly={readOnly} tabIndex={readOnly ? -1 : 0}
        onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
      />
      <span className={`ar-pr-pct${margen !== null && margen < 0 ? " neg" : ""}`}>
        {margen !== null ? `${margen.toFixed(1)}%` : "—"}
        {readOnly && <span className="ar-pr-eq">equilibrio</span>}
      </span>
      {error && <p className="ar-error" style={{ gridColumn: "1/-1", margin: "0" }}>{error}</p>}
    </div>
  )
}

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
  const [uploading, setUploading] = useState(0)
  const firstInputRef = useRef(null)
  const fileInputRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && article) {
      const iva = (article.aplicarIva ?? true) ? 1.16 : 1
      setForm({
        ...EMPTY_FORM, ...article,
        // Convertir a c/IVA para que el usuario vea el precio de venta real
        precio1: article.precio1 ? round2(article.precio1 * iva) : "",
        precio2: article.precio2 ? round2(article.precio2 * iva) : "",
        precio3: article.precio3 ? round2(article.precio3 * iva) : "",
      })
    } else {
      setForm(EMPTY_FORM)
    }
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
    // Los precios en form están en c/IVA → guardamos s/IVA (consistente con el resto del sistema)
    const iva = form.aplicarIva ? 1.16 : 1
    const { costoCalc } = calcCostos(form)
    onSave({
      ...form,
      clave: form.clave.trim(),
      descripcion: form.descripcion.trim(),
      factor: Number(form.factor),
      precioCompra: Number(form.precioCompra) || 0,
      precio1: round2((Number(form.precio1) || 0) / iva),
      precio2: round2((Number(form.precio2) || 0) / iva),
      precio3: round2((Number(form.precio3) || 0) / iva),
      precio4: costoCalc,   // break-even s/IVA (= costoSinIva / factor)
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

          {/* Precio de compra + neto */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
            <div style={{ flex: "0 0 160px" }}>
              <Field label={
                form.precioNeto && form.aplicarIva ? "Precio de Compra (c/IVA)" : "Precio de Compra (s/IVA)"
              }>
                <input type="number" min="0" step="0.01" className="ar-input"
                  value={form.precioCompra} onChange={(e) => f("precioCompra", e.target.value)}
                  placeholder="0.00" />
              </Field>
            </div>
            <div style={{ paddingBottom: "2px" }}>
              <Toggle id="ar-neto" checked={form.precioNeto} onChange={(v) => f("precioNeto", v)}
                label="Precio neto (incluye IVA)" />
            </div>
          </div>

          {/* Resumen de costos */}
          {(() => {
            const c = calcCostos(form)
            if (!form.aplicarIva || !Number(form.precioCompra)) return null
            return (
              <div className="ar-costo-resumen">
                <span>Costo s/IVA: <strong>${c.costoSinIva.toFixed(2)}</strong></span>
                <span>Costo c/IVA: <strong>${c.costoConIva.toFixed(2)}</strong></span>
                {Number(form.factor) > 1 && (
                  <span>Por unidad de venta: <strong>${c.costoCalc.toFixed(2)}</strong></span>
                )}
              </div>
            )
          })()}

          {/* Precios de venta */}
          {(() => {
            const c = calcCostos(form)
            return (
              <div>
                <div className="ar-precios-v2-header">
                  <span className="ar-label">Precios de Venta</span>
                  <span className={`ar-iva-badge${form.aplicarIva ? "" : " sin"}`}>
                    {form.aplicarIva ? "c/IVA 16%" : "sin IVA"}
                  </span>
                  <span className="ar-margen-col-header">Margen</span>
                </div>
                <div className="ar-pr-rows">
                  {[1, 2, 3].map((n) => (
                    <PrecioRow key={n}
                      label={`Precio ${n}`} required={n === 1}
                      value={form[`precio${n}`]}
                      onChange={(v) => f(`precio${n}`, v)}
                      costoCalc={c.costoCalc}
                      error={n === 1 ? errors.precio1 : undefined}
                    />
                  ))}
                  <PrecioRow key={4}
                    label="Precio 4" value={c.precio4.toFixed(2)}
                    readOnly costoCalc={c.costoCalc}
                  />
                </div>
              </div>
            )
          })()}

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
                  setUploading((n) => n + 1)
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const img = new Image()
                    img.onload = () => {
                      // Comprimir con Canvas
                      const MAX = 1200
                      const canvas = document.createElement("canvas")
                      let w = img.width, h = img.height
                      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX } }
                      else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX } }
                      canvas.width = w; canvas.height = h
                      canvas.getContext("2d").drawImage(img, 0, 0, w, h)
                      const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

                      // Mostrar preview local inmediatamente — sin esperar al servidor
                      setForm((prev) => ({
                        ...prev,
                        imagenes: [...(prev.imagenes || []), dataUrl],
                      }))

                      // Subir al servidor y reemplazar la preview con la URL real
                      subirImagenArticulo(dataUrl)
                        .then((url) => {
                          setForm((prev) => {
                            const idx = prev.imagenes.indexOf(dataUrl)
                            if (idx === -1) return prev
                            const next = [...prev.imagenes]
                            next[idx] = url
                            return { ...prev, imagenes: next }
                          })
                        })
                        .catch(() => { /* mantiene el base64 como preview */ })
                        .finally(() => setUploading((n) => n - 1))
                    }
                    img.src = ev.target.result
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
              disabled={uploading > 0}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {uploading > 0 ? "Subiendo…" : "Agregar"}
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="ar-drawer-footer">
          <button type="button" className="ar-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ar-btn-save" onClick={handleSave}
            disabled={saving || uploading > 0}
            style={(saving || uploading > 0) ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
            {uploading > 0 ? "Subiendo imágenes…" : saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </>
  )
}
