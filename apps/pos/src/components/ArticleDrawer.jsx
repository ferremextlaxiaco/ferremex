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

// value = precio s/IVA (siempre, igual que como se guarda en DB)
// El input muestra c/IVA cuando aplicarIva=true; onChange convierte de vuelta a s/IVA
function PrecioRow({ label, required, value, onChange, readOnly, costoCalc, aplicarIva, error }) {
  const precioSinIva = Number(value) || 0
  const precioDisplay = aplicarIva ? round2(precioSinIva * 1.16) : precioSinIva
  // Margen sobre precio s/IVA vs costo s/IVA — sin conversiones, sin error de redondeo
  const margen = readOnly ? 0
    : precioSinIva > 0 && costoCalc > 0
      ? round2(((precioSinIva - costoCalc) / precioSinIva) * 100) : null
  return (
    <>
      <span className="ar-pr-label">{label}{required ? " *" : ""}</span>
      <input
        type="number" min="0" step="0.01" placeholder="0.00"
        className={`ar-input${readOnly ? " ar-input-ro" : ""}${error ? " error" : ""}`}
        value={precioDisplay || ""} readOnly={readOnly} tabIndex={readOnly ? -1 : 0}
        onChange={readOnly ? undefined : (e) => {
          // Usuario ingresa c/IVA → almacenamos s/IVA
          const v = Number(e.target.value) || 0
          onChange(aplicarIva ? round2(v / 1.16) : v)
        }}
      />
      <span className={`ar-pr-pct${margen !== null && margen < 0 ? " neg" : ""}`}>
        {margen !== null ? `${margen.toFixed(1)}%` : "—"}
        {readOnly && <span className="ar-pr-eq">equilibrio</span>}
      </span>
      {error && <p className="ar-error" style={{ gridColumn: "1/-1", margin: 0 }}>{error}</p>}
    </>
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
  clave: "", claveAlterna: "", descripcion: "", marca: "", proveedor: "",
  categoria: "", departamento: "",
  unidadCompra: "H87", unidadVenta: "H87", factor: 1,
  aplicarIva: true,
  precioCompra: "", precioNeto: false,
  precio1: "", precio2: "", precio3: "", precio4: "",
  claveSat: "",
  inventarioMin: "", inventarioMax: "",
  localizacion: "", peso: "",
  ventaGranel: false, imagenes: [],
  especificaciones: [],
  mayoreoActivo: false, mayoreoMin: "",
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

export default function ArticleDrawer({ open, mode, article, articles, onSave, onClose, getNextClave, saving = false, onCrearPromocion }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [uploading, setUploading] = useState(0)
  const firstInputRef = useRef(null)
  const fileInputRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && article) {
      setForm({
        ...EMPTY_FORM, ...article,
        // precios se guardan s/IVA en DB — se cargan tal cual, PrecioRow convierte al mostrar
        imagenes: article.imagenes?.length > 0
          ? article.imagenes
          : article.thumbnail ? [article.thumbnail] : [],
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
    setForm((prev) => {
      const next = { ...prev, [name]: value }
      // Los precios se guardan s/IVA — no necesitan ajustarse al cambiar toggles.
      // PrecioRow convierte a c/IVA solo para mostrar.
      return next
    })
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
    // precios ya están en s/IVA — se guardan directamente
    const { costoCalc } = calcCostos(form)
    onSave({
      ...form,
      clave: form.clave.trim(),
      descripcion: form.descripcion.trim(),
      factor: Number(form.factor),
      precioCompra: Number(form.precioCompra) || 0,
      precio1: Number(form.precio1) || 0,
      precio2: Number(form.precio2) || 0,
      precio3: Number(form.precio3) || 0,
      precio4: costoCalc,   // break-even s/IVA
      inventarioMin: Number(form.inventarioMin) || 0,
      inventarioMax: Number(form.inventarioMax) || 0,
      peso: Number(form.peso) || 0,
      mayoreoActivo: form.mayoreoActivo,
      mayoreoMin: Number(form.mayoreoMin) || 0,
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Atajo: crear una promoción para este artículo (solo si ya existe). */}
            {mode === "edit" && onCrearPromocion && (
              <button
                type="button"
                className="ar-btn-action"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => onCrearPromocion({ sku: form.clave, descripcion: form.descripcion })}
                title="Crear una promoción para este artículo"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Crear promoción
              </button>
            )}
            <button type="button" className="ar-drawer-close" onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ar-drawer-body">

          {/* Identificación */}
          <p className="ar-section-title">Identificación</p>

          <Field label="Descripción" error={errors.descripcion}>
            <input
              ref={firstInputRef}
              type="text" className={`ar-input${errors.descripcion ? " error" : ""}`}
              value={form.descripcion} onChange={(e) => f("descripcion", e.target.value)}
              placeholder="Nombre completo del artículo" />
          </Field>

          <Field label="Marca">
            <input type="text" className="ar-input" value={form.marca}
              onChange={(e) => f("marca", e.target.value)} placeholder="Ej: Truper, Urrea, Pretul" />
          </Field>

          <Field label="Proveedor">
            <input type="text" className="ar-input" value={form.proveedor}
              onChange={(e) => f("proveedor", e.target.value)} placeholder="Ej: Truper, Cintac, Foset" />
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

          <Field label="Clave" error={errors.clave}>
            <div className="ar-clave-row">
              <input
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

          {/* Precio de compra + toggles */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
            <div style={{ flex: "0 0 160px" }}>
              <Field label="Precio de Compra">
                <input type="number" min="0" step="0.01" className="ar-input"
                  value={form.precioCompra} onChange={(e) => f("precioCompra", e.target.value)}
                  placeholder="0.00" />
              </Field>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "2px" }}>
              <Toggle id="ar-iva" checked={form.aplicarIva} onChange={(v) => f("aplicarIva", v)} label="Aplicar IVA" />
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
              // Un solo grid para header + filas — garantiza alineación perfecta de columnas
              <div className="ar-pr-rows">
                {/* Fila de cabecera dentro del mismo grid */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ar-label" style={{ margin: 0 }}>Precios de Venta</span>
                  {form.aplicarIva && <span className="ar-iva-badge">c/IVA 16%</span>}
                </div>
                <span />
                <span className="ar-margen-col-header">Margen</span>

                {[1, 2, 3].map((n) => (
                  <PrecioRow key={n}
                    label={`Precio ${n}`} required={n === 1}
                    value={form[`precio${n}`]}
                    onChange={(v) => f(`precio${n}`, v)}
                    costoCalc={c.costoCalc}
                    aplicarIva={form.aplicarIva}
                    error={n === 1 ? errors.precio1 : undefined}
                  />
                ))}
                <PrecioRow key={4}
                  label="Precio 4" value={c.costoCalc}
                  readOnly costoCalc={c.costoCalc} aplicarIva={form.aplicarIva}
                />
              </div>
            )
          })()}

          {/* Fiscal */}
          <p className="ar-section-title">Fiscal</p>

          <Field label="Clave SAT">
            <input type="text" className="ar-input" value={form.claveSat}
              onChange={(e) => f("claveSat", e.target.value)} placeholder="Ej: 31161501" />
          </Field>

          {/* Catálogo */}
          <p className="ar-section-title">Catálogo</p>

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

          {/* Precio de mayoreo */}
          <p className="ar-section-title">Mayoreo</p>

          <Toggle id="ar-mayoreo" checked={form.mayoreoActivo} onChange={(v) => f("mayoreoActivo", v)}
            label="Activar precio de mayoreo (Precio 2 automático)" />

          {form.mayoreoActivo && (
            <Field
              label="Cantidad mínima para mayoreo"
              tooltip="A partir de esta cantidad se aplica Precio 2 automáticamente"
            >
              <input
                type="number" min="2" step="1" className="ar-input"
                value={form.mayoreoMin}
                onChange={(e) => f("mayoreoMin", e.target.value)}
                placeholder="Ej: 12"
              />
            </Field>
          )}

          {/* Especificaciones */}
          <p className="ar-section-title">Especificaciones</p>

          <div className="ar-specs-list">
            {(form.especificaciones || []).map((esp, i) => (
              <div key={i} className="ar-spec-row">
                <input
                  type="text" className="ar-input ar-spec-key"
                  placeholder="Ej: Material"
                  value={esp.clave}
                  onChange={(e) => {
                    const next = [...form.especificaciones]
                    next[i] = { ...next[i], clave: e.target.value }
                    f("especificaciones", next)
                  }}
                />
                <input
                  type="text" className="ar-input ar-spec-val"
                  placeholder="Ej: Acero inoxidable"
                  value={esp.valor}
                  onChange={(e) => {
                    const next = [...form.especificaciones]
                    next[i] = { ...next[i], valor: e.target.value }
                    f("especificaciones", next)
                  }}
                />
                <button
                  type="button" className="ar-spec-remove"
                  onClick={() => f("especificaciones", form.especificaciones.filter((_, j) => j !== i))}
                  title="Quitar">✕</button>
              </div>
            ))}
            <button
              type="button" className="ar-spec-add"
              onClick={() => f("especificaciones", [...(form.especificaciones || []), { clave: "", valor: "" }])}>
              + Agregar especificación
            </button>
          </div>

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
