import { useState, useEffect, useRef } from "react"
import { UNIDADES_SAT } from "../lib/unidades-sat"
import { subirImagenArticulo } from "../lib/client"

// ── Catálogo de claves SAT de productos (principales para ferretería) ────────

// Catálogo basado en las claves SAT reales del inventario Ferremex
const CLAVES_SAT = [
  // Herramienta manual — más frecuentes del catálogo
  { clave: "27111602", nombre: "Martillos" },
  { clave: "27111700", nombre: "Dados y cubos para llaves" },
  { clave: "27111701", nombre: "Dados y accesorios para matraca" },
  { clave: "27111734", nombre: "Puntas para destornillador" },
  { clave: "27111801", nombre: "Cintas de medición" },
  { clave: "27111900", nombre: "Cinceles y punzones" },
  { clave: "27111500", nombre: "Arcos para segueta y herramientas de corte" },
  { clave: "27112000", nombre: "Picos, palas y herramientas de jardín" },
  { clave: "27112004", nombre: "Herramientas agrícolas" },
  { clave: "27112100", nombre: "Abrazaderas y prensas" },
  { clave: "27112105", nombre: "Juegos de pinzas y destornilladores" },
  { clave: "27112200", nombre: "Herramientas para construcción y varilla" },
  { clave: "27112700", nombre: "Adaptadores para matraca" },
  { clave: "27112800", nombre: "Brocas tipo auger" },
  { clave: "27112841", nombre: "Brocas para metal" },
  { clave: "27113100", nombre: "Acopladores y conectores mecánicos" },
  // Herramienta eléctrica y accesorios
  { clave: "23131503", nombre: "Cardas y discos para esmeril" },
  { clave: "23271700", nombre: "Antorchas para soldadura y corte" },
  { clave: "26101400", nombre: "Carbones y repuestos para herramienta eléctrica" },
  { clave: "31191506", nombre: "Adaptadores para discos abrasivos" },
  // Electricidad
  { clave: "26121600", nombre: "Grapas para alambre" },
  { clave: "26121635", nombre: "Cable de uso rudo" },
  { clave: "39101600", nombre: "Focos incandescentes" },
  { clave: "39111500", nombre: "Focos y lámparas" },
  { clave: "39111501", nombre: "Lámparas LED" },
  { clave: "39111504", nombre: "Lámparas fluorescentes" },
  { clave: "39121440", nombre: "Extensiones eléctricas con portalámpara" },
  { clave: "39121522", nombre: "Apagadores de superficie" },
  { clave: "39121704", nombre: "Apagadores y accesorios eléctricos" },
  { clave: "39122200", nombre: "Apagadores e interruptores" },
  { clave: "31162800", nombre: "Clavijas y contactos eléctricos" },
  // Tornillería, fijación y herrajes
  { clave: "31151500", nombre: "Cuerdas y sogas" },
  { clave: "31151600", nombre: "Cadenas" },
  { clave: "31161500", nombre: "Puntas y accesorios para destornillador" },
  { clave: "31161503", nombre: "Pijas y tornillos multiusos" },
  { clave: "31161700", nombre: "Tuercas galvanizadas" },
  { clave: "31162000", nombre: "Clavos para concreto" },
  { clave: "31162103", nombre: "Taquetes y anclajes" },
  { clave: "31162402", nombre: "Cerraduras con manija" },
  { clave: "31162403", nombre: "Bisagras" },
  { clave: "31162600", nombre: "Bandolas, pasadores y seguros" },
  { clave: "46171501", nombre: "Candados de hierro" },
  { clave: "31261601", nombre: "Lonas y cubiertas" },
  { clave: "31211904", nombre: "Brochas y pinceles" },
  // Plomería y fontanería
  { clave: "40141608", nombre: "Accesorios para regadera y baño" },
  { clave: "40141700", nombre: "Tubería y accesorios de PVC" },
  { clave: "40142000", nombre: "Mangueras para jardín y baño" },
  { clave: "40172600", nombre: "Adaptadores CPVC con inserto metálico" },
  { clave: "40172601", nombre: "Adaptadores PVC" },
  { clave: "40172609", nombre: "Adaptadores CPVC con inserto de latón" },
  { clave: "40172610", nombre: "Adaptadores PPR" },
  { clave: "30181700", nombre: "Brazos y accesorios para regadera" },
  { clave: "30181800", nombre: "Accesorios para mezcladora de fregadero" },
  // Materiales y construcción
  { clave: "24101507", nombre: "Carretillas y accesorios" },
  { clave: "24121500", nombre: "Empaques, sellos y refacciones" },
  { clave: "21101800", nombre: "Abrazaderas para manguera y fumigadora" },
  // Seguridad personal
  { clave: "46181500", nombre: "Equipo de protección personal" },
  { clave: "46181504", nombre: "Botas de seguridad" },
  // Otros
  { clave: "53101600", nombre: "Ropa de trabajo" },
  { clave: "56121900", nombre: "Exhibidores y estantes" },
]

// ── Carga dinámica del catálogo SAT completo ─────────────────────────────────
// Empieza con la lista local (75 entradas) y la reemplaza con el JSON completo
// en cuanto esté disponible en /static/claves-sat.json (generado con
// `bun run generar:catalogo-sat` desde packages/api).

let _catalogoCache = null   // null = no cargado aún

function useCatalogoSat() {
  const [catalogo, setCatalogo] = useState(CLAVES_SAT)

  useEffect(() => {
    if (_catalogoCache) { setCatalogo(_catalogoCache); return }
    fetch("/static/claves-sat.json")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          _catalogoCache = data
          setCatalogo(data)
        }
      })
      .catch(() => { /* usa fallback local */ })
  }, [])

  return catalogo
}

// ── Campo de clave SAT de producto ───────────────────────────────────────────

function ClaveSatSearch({ value, onChange }) {
  const catalogo = useCatalogoSat()
  const match = catalogo.find((c) => c.clave === value)

  return (
    <div className="cpx-claveSat-wrap">
      <div className="cpx-claveSat-box">
        <input
          className="cpx-claveSat-input"
          placeholder="Ej. 27111701"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {value && (
        <div className={`cpx-claveSat-hint${match ? "" : " unknown"}`}>
          {match ? match.nombre : "Clave no encontrada en catálogo local"}
        </div>
      )}
    </div>
  )
}


function round2(n) {
  return Math.round(n * 100) / 100
}

function fmtPeso(n) {
  if (!n && n !== 0) return "—"
  return "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Dropdown unidades SAT ─────────────────────────────────────────────────────

function UnidadDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = UNIDADES_SAT.find((u) => u.clave === value) ?? UNIDADES_SAT[0]

  useEffect(() => {
    function onOut(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", onOut)
    return () => document.removeEventListener("mousedown", onOut)
  }, [open])

  return (
    <div className="cpx-unidad-wrap" ref={wrapRef}>
      <button
        type="button"
        className="cpx-unidad-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <span><strong>{selected.clave}</strong> — {selected.nombre}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </svg>
      </button>
      {open && (
        <div className="cpx-unidad-list">
          {UNIDADES_SAT.map((u) => (
            <div
              key={u.clave}
              className={`cpx-unidad-opt${u.clave === value ? " active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(u.clave); setOpen(false) }}
            >
              <span className="cpx-unidad-clave">{u.clave}</span>
              <span className="cpx-unidad-nombre">{u.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Campo numérico con 2 decimales (punto) y paso por unidad ─────────────────

function NumField({ value, onChange, min = 0, max, step = 1, className = "cpx-dp-input", disabled }) {
  const [local,   setLocal]   = useState("")
  const [focused, setFocused] = useState(false)

  const numVal  = Number(value) || 0
  const display = focused ? local : numVal.toFixed(2)

  function clamp(n) {
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    return round2(n)
  }

  function commit(str) {
    const n = parseFloat(String(str).replace(",", "."))
    onChange(clamp(isNaN(n) ? numVal : n))
    setFocused(false)
  }

  function nudge(dir) {
    const cur  = parseFloat(String(focused ? local : numVal).replace(",", ".")) || numVal
    const next = clamp(cur + dir * step)
    setLocal(next.toFixed(2))
    setFocused(true)
    onChange(next)
  }

  return (
    <div className="cpx-numfield-wrap">
      <input
        className={className}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={display}
        onFocus={(e) => { setLocal(numVal.toFixed(2)); setFocused(true); e.target.select() }}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e)  => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp"   || e.key === "+") { e.preventDefault(); nudge(+1) }
          if (e.key === "ArrowDown" || e.key === "-") { e.preventDefault(); nudge(-1) }
          if (e.key === "Enter") commit(focused ? local : String(numVal))
        }}
      />
      <div className="cpx-numfield-spinners">
        <button type="button" tabIndex={-1} disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); nudge(+1) }}>▴</button>
        <button type="button" tabIndex={-1} disabled={disabled}
          onMouseDown={(e) => { e.preventDefault(); nudge(-1) }}>▾</button>
      </div>
    </div>
  )
}

// ── Toggle estilo switch ──────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }) {
  return (
    <label className="cpx-dp-toggle-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`cpx-dp-toggle${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="cpx-dp-toggle-thumb" />
      </button>
      {label && <span className="cpx-dp-toggle-label">{label}</span>}
    </label>
  )
}

// ── Fila de campo editable en el panel ───────────────────────────────────────

function FieldRow({ label, children }) {
  return (
    <div className="cpx-dp-field-row">
      <span className="cpx-detail-label">{label}</span>
      <div className="cpx-dp-field-input">{children}</div>
    </div>
  )
}

// ── Fila de precio + margen en la calculadora ─────────────────────────────────

// precio y costoSinIva siempre se reciben SIN IVA.
// aplicarIva=true → muestra c/IVA; guarda s/IVA. Margen en s/IVA vs s/IVA.
function PriceCalcRow({ label, precio, costoSinIva, onPrecioChange, readOnly = false, aplicarIva = false }) {
  const [margenLocal, setMargenLocal] = useState("")
  const [margenFocused, setMargenFocused] = useState(false)

  const factor        = aplicarIva ? 1.16 : 1
  const precioDisplay = round2(precio * factor)   // lo que ve el usuario (c/IVA)

  // Margen s/IVA vs s/IVA — no cambia al activar/desactivar IVA
  const margenCalculado =
    precio > 0 && costoSinIva > 0
      ? round2(((precio - costoSinIva) / precio) * 100)
      : 0

  function commitMargen() {
    setMargenFocused(false)
    const m = parseFloat(margenLocal)
    if (isNaN(m) || m >= 100) return
    // Calcula s/IVA directamente — sin factor IVA en la fórmula
    const p = m <= 0 ? costoSinIva : round2(costoSinIva / (1 - m / 100))
    onPrecioChange(p)
  }

  if (readOnly) {
    return (
      <div className="cpx-calc-row cpx-calc-row-readonly">
        <span className="cpx-calc-label">{label}</span>
        <div className="cpx-calc-field cpx-calc-field-ro">
          <span className="cpx-calc-prefix">$</span>
          <span className="cpx-calc-ro-val">{precioDisplay.toFixed(2)}</span>
        </div>
        <div className="cpx-calc-field cpx-calc-field-ro">
          <span className="cpx-calc-ro-val">0.00</span>
          <span className="cpx-calc-suffix">%</span>
        </div>
      </div>
    )
  }

  return (
    <div className="cpx-calc-row">
      <span className="cpx-calc-label">{label}</span>
      <div className="cpx-calc-field">
        <span className="cpx-calc-prefix">$</span>
        <NumField
          className="cpx-calc-input"
          value={precioDisplay}
          min={0}
          step={1}
          onChange={(cIva) => onPrecioChange(round2(cIva / factor))}
        />
      </div>
      <div className="cpx-calc-field">
        <input
          className="cpx-calc-input"
          type="number"
          step="0.01"
          value={margenFocused ? margenLocal : margenCalculado}
          onFocus={() => { setMargenLocal(String(margenCalculado)); setMargenFocused(true) }}
          onBlur={commitMargen}
          onChange={(e) => setMargenLocal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitMargen() }}
        />
        <span className="cpx-calc-suffix">%</span>
      </div>
    </div>
  )
}

// ── Panel derecho ─────────────────────────────────────────────────────────────

export default function ComprasDetailPanel({ row, onRowChange, onGuardar, guardando }) {
  const [uploading, setUploading]     = useState(0)
  const [newEsp, setNewEsp]           = useState({ clave: "", valor: "" })
  const fileInputRef                  = useRef(null)
  const rowRef                        = useRef(row)

  useEffect(() => { rowRef.current = row }, [row])

  if (!row) {
    return (
      <div className="cpx-right cpx-right-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <p>Haz clic en una fila para ver el detalle y ajustar precios</p>
      </div>
    )
  }

  function set(field, val) {
    onRowChange(row._id, { [field]: val })
  }

  function handleAddImagen(files) {
    Array.from(files).forEach((file) => {
      setUploading((n) => n + 1)
      const reader = new FileReader()
      reader.onload = (ev) => {
        const img = new Image()
        img.onload = () => {
          const MAX = 1200
          const canvas = document.createElement("canvas")
          let w = img.width, h = img.height
          if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX } }
          else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX } }
          canvas.width = w; canvas.height = h
          canvas.getContext("2d").drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

          const cur = rowRef.current
          const nextImagenes = [...(cur.imagenes || []), dataUrl]
          const nextThumb    = cur.thumbnail ?? dataUrl
          onRowChange(cur._id, { imagenes: nextImagenes, thumbnail: nextThumb })

          subirImagenArticulo(dataUrl)
            .then((url) => {
              const r = rowRef.current
              const idx = (r.imagenes || []).indexOf(dataUrl)
              if (idx === -1) return
              const next = [...r.imagenes]
              next[idx] = url
              onRowChange(r._id, {
                imagenes:  next,
                thumbnail: r.thumbnail === dataUrl ? url : r.thumbnail,
              })
            })
            .catch(() => {})
            .finally(() => setUploading((n) => n - 1))
        }
        img.src = ev.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="cpx-right">

      {/* Hero: nombre + clave + existencia */}
      <div className="cpx-detail-hero">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div className="cpx-detail-nombre" style={{ flex: 1, minWidth: 0 }}>{row.descripcion}</div>
            <span className={`cpx-exist-badge${(row.existencia ?? 0) > 0 ? " ok" : ""}`}>
              {row.existencia ?? 0} stock
            </span>
          </div>
          <div style={{ fontSize: 15, color: "var(--at-text-muted)", marginTop: 4, fontWeight: 500 }}>
            {row.clave}{row.claveAlterna ? ` · ${row.claveAlterna}` : ""}
          </div>
        </div>
      </div>

      {/* Info del artículo — 2 columnas */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Artículo</p>
        <div className="cpx-art-info-grid">
          {[
            ["Categoría",    row.categoria    || "—"],
            ["Departamento", row.departamento || "—"],
            ["Localización", row.localizacion || "—"],
            ["Marca",        row.marca        || "—"],
          ].map(([label, val]) => (
            <div key={label} className="cpx-art-info-cell">
              <span className="cpx-detail-label">{label}</span>
              <span className="cpx-detail-val">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ajustes de compra */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Ajustes de compra</p>

        {/* Clave SAT del producto */}
        <FieldRow label="Clave SAT">
          <ClaveSatSearch
            value={row.claveSat || ""}
            onChange={(v) => set("claveSat", v)}
          />
        </FieldRow>

        {/* Último precio compra — referencia */}
        <div className="cpx-detail-row">
          <span className="cpx-detail-label">Últ. precio compra s/IVA</span>
          <span className="cpx-detail-val">{fmtPeso(row.ultimoPrecioCompra)}</span>
        </div>
        <div className="cpx-detail-row">
          <span className="cpx-detail-label">Últ. precio compra c/IVA</span>
          <span className="cpx-detail-val">
            {fmtPeso(row.aplicarIva
              ? round2((row.ultimoPrecioCompra || 0) * 1.16)
              : (row.ultimoPrecioCompra || 0)
            )}
          </span>
        </div>

        {/* Costo — editable */}
        <FieldRow label="Costo unitario">
          <NumField value={row.costo} min={0} step={1} onChange={(v) => set("costo", v)} />
        </FieldRow>

        {/* Factor — editable */}
        <FieldRow label="Factor">
          <NumField
            value={row.factor}
            min={0.001}
            step={1}
            onChange={(newFactor) => {
              const fct          = Math.max(0.001, newFactor || 1)
              const oldCostoCalc = row.costoCalc ?? row.costoSinIva
              const newCostoCalc = round2(row.costoSinIva / fct)
              const ivaMult      = row.aplicarIva ? 1.16 : 1
              const updates      = { factor: fct }
              ;[1, 2, 3].forEach((n) => {
                const base = row[`precio${n}`] ?? 0
                if (base > 0 && oldCostoCalc > 0) {
                  const displayOld = base * ivaMult
                  const margin     = (displayOld - oldCostoCalc) / displayOld
                  if (margin < 1 && margin >= 0) {
                    const displayNew = round2(newCostoCalc / (1 - margin))
                    updates[`precio${n}`] = round2(displayNew / ivaMult)
                  }
                }
              })
              onRowChange(row._id, updates)
            }}
          />
        </FieldRow>

        {/* Unidad SAT — cuando factor > 1 muestra compra y venta por separado */}
        {(row.factor ?? 1) <= 1 ? (
          <FieldRow label="Unidad SAT">
            <UnidadDropdown
              value={row.unidadSat ?? "H87"}
              onChange={(v) => set("unidadSat", v)}
            />
          </FieldRow>
        ) : (
          <>
            <FieldRow label="Unidad compra">
              <UnidadDropdown
                value={row.unidadSat ?? "H87"}
                onChange={(v) => set("unidadSat", v)}
              />
            </FieldRow>
            <FieldRow label="Unidad venta">
              <UnidadDropdown
                value={row.unidadSatVenta ?? "H87"}
                onChange={(v) => set("unidadSatVenta", v)}
              />
            </FieldRow>
          </>
        )}

        {/* Descuento — editable */}
        <FieldRow label="Descuento %">
          <NumField
            value={row.descuento}
            min={0}
            max={100}
            step={1}
            onChange={(v) => set("descuento", v)}
          />
        </FieldRow>

        {/* IVA — toggle */}
        <div className="cpx-detail-row" style={{ marginTop: 6 }}>
          <span className="cpx-detail-label">Aplicar IVA (16%)</span>
          <Toggle checked={row.aplicarIva} onChange={(v) => set("aplicarIva", v)} />
        </div>

        {/* Precio neto — toggle */}
        <div className="cpx-detail-row">
          <span className="cpx-detail-label">Precio neto</span>
          <Toggle checked={row.precioNeto} onChange={(v) => set("precioNeto", v)} />
        </div>

        {/* Costos calculados — resultado */}
        <div className="cpx-dp-costos">
          <div className="cpx-dp-costo-item">
            <span>Sin IVA</span>
            <strong>{fmtPeso(row.costoSinIva)}</strong>
          </div>
          <div className="cpx-dp-costo-item accent">
            <span>Con IVA</span>
            <strong>{fmtPeso(row.costoConIva)}</strong>
          </div>
        </div>
      </div>

      {/* Calculadora de precios */}
      <div className="cpx-detail-section cpx-calc-section">
        <p className="cpx-detail-section-title">Calculadora de precios</p>

        {(() => {
          const factor      = row.factor ?? 1
          const costoCalc   = row.costoCalc ?? row.costoSinIva
          const unidadNombre = factor > 1
            ? (UNIDADES_SAT.find((u) => u.clave === (row.unidadSatVenta ?? "H87"))?.nombre ?? "unidad")
            : null
          return (
            <>
              {unidadNombre && (
                <p className="cpx-calc-unidad-hint">
                  Precio por <strong>{unidadNombre}</strong>
                  <span style={{ color: "var(--at-text-muted)", marginLeft: 6 }}>
                    (÷ {factor} unidades)
                  </span>
                </p>
              )}
              <div className="cpx-calc-header">
                <span className="cpx-calc-label" />
                <span className="cpx-calc-col-label">Venta {row.aplicarIva ? "(c/IVA)" : "($)"}</span>
                <span className="cpx-calc-col-label">Margen %</span>
              </div>
              {[1, 2, 3].map((n) => (
                <PriceCalcRow
                  key={n}
                  label={`Precio ${n}`}
                  precio={row[`precio${n}`] ?? 0}
                  costoSinIva={costoCalc}
                  aplicarIva={row.aplicarIva}
                  onPrecioChange={(p) => set(`precio${n}`, p)}
                />
              ))}
              <PriceCalcRow
                label="Precio 4"
                precio={row.precio4 ?? 0}
                costoSinIva={costoCalc}
                aplicarIva={false}
                onPrecioChange={() => {}}
                readOnly
              />
            </>
          )
        })()}
      </div>

      {/* Catálogo / inventario */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Catálogo</p>
        <FieldRow label="Inv. Mínimo">
          <input
            className="cpx-dp-input"
            type="number"
            min="0"
            step="1"
            value={row.inventarioMin ?? ""}
            placeholder="—"
            onChange={(e) => set("inventarioMin", e.target.value === "" ? null : parseInt(e.target.value, 10))}
          />
        </FieldRow>
        <FieldRow label="Inv. Máximo">
          <input
            className="cpx-dp-input"
            type="number"
            min="0"
            step="1"
            value={row.inventarioMax ?? ""}
            placeholder="—"
            onChange={(e) => set("inventarioMax", e.target.value === "" ? null : parseInt(e.target.value, 10))}
          />
        </FieldRow>
        <FieldRow label="Peso (kg)">
          <input
            className="cpx-dp-input"
            type="number"
            min="0"
            step="0.001"
            value={row.peso ?? ""}
            placeholder="—"
            onChange={(e) => set("peso", e.target.value === "" ? null : parseFloat(e.target.value))}
          />
        </FieldRow>
        <div className="cpx-detail-row" style={{ marginTop: 4 }}>
          <span className="cpx-detail-label">Venta granel</span>
          <Toggle checked={row.ventaGranel ?? false} onChange={(v) => set("ventaGranel", v)} />
        </div>
      </div>

      {/* Especificaciones */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Especificaciones</p>
        <div className="cpx-specs-tabla">
          {(row.especificaciones || []).map((esp, i) => (
            <div key={i} className="cpx-detail-row cpx-spec-row">
              <span className="cpx-detail-label">{esp.clave}</span>
              <span className="cpx-detail-val" style={{ flex: 1 }}>{esp.valor}</span>
              <button
                type="button"
                className="cpx-spec-remove"
                title="Eliminar"
                onClick={() => set("especificaciones", (row.especificaciones || []).filter((_, j) => j !== i))}
              >✕</button>
            </div>
          ))}
        </div>
        <div className="cpx-spec-add-row">
          <input
            className="cpx-dp-input"
            style={{ flex: 1, width: "auto" }}
            placeholder="Nombre"
            value={newEsp.clave}
            onChange={(e) => setNewEsp((p) => ({ ...p, clave: e.target.value }))}
          />
          <input
            className="cpx-dp-input"
            style={{ flex: 1, width: "auto" }}
            placeholder="Valor"
            value={newEsp.valor}
            onChange={(e) => setNewEsp((p) => ({ ...p, valor: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEsp.clave.trim()) {
                set("especificaciones", [...(row.especificaciones || []), { clave: newEsp.clave.trim(), valor: newEsp.valor.trim() }])
                setNewEsp({ clave: "", valor: "" })
              }
            }}
          />
          <button
            type="button"
            className="cpx-spec-add-btn"
            disabled={!newEsp.clave.trim()}
            onClick={() => {
              set("especificaciones", [...(row.especificaciones || []), { clave: newEsp.clave.trim(), valor: newEsp.valor.trim() }])
              setNewEsp({ clave: "", valor: "" })
            }}
          >+</button>
        </div>
      </div>

      {/* Imágenes */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Imágenes</p>
        <div className="cpx-imagenes-row">
          {(row.imagenes?.length > 0
            ? row.imagenes
            : row.thumbnail ? [row.thumbnail] : []
          ).map((src, i) => (
            <div key={i} className={`cpx-imagen-thumb${src === row.thumbnail ? " cpx-thumb-active" : ""}`}>
              <img src={src} alt="" />
              <div className="cpx-imagen-actions">
                {src !== row.thumbnail && (
                  <button
                    type="button"
                    className="cpx-img-btn"
                    title="Usar como miniatura"
                    onClick={() => set("thumbnail", src)}
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11">
                      <path d="M8 1l1.9 3.8 4.2.6-3 2.9.7 4.2L8 10.5l-3.8 2 .7-4.2-3-2.9 4.2-.6z"/>
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className="cpx-img-btn cpx-img-remove"
                  title="Quitar"
                  onClick={() => {
                    const nextImagenes = (row.imagenes || []).filter((_, j) => j !== i)
                    const nextThumb    = src === row.thumbnail ? (nextImagenes[0] ?? null) : row.thumbnail
                    onRowChange(row._id, { imagenes: nextImagenes, thumbnail: nextThumb })
                  }}
                >✕</button>
              </div>
            </div>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { handleAddImagen(e.target.files); e.target.value = "" }}
          />
          <button
            type="button"
            className="cpx-btn-add-img"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading > 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {uploading > 0 ? "Subiendo…" : "Agregar"}
          </button>
        </div>
      </div>

      {/* Footer — guardar */}
      <div className="cpx-dp-footer">
        <button
          className="ar-btn-add cpx-dp-save-btn"
          onClick={onGuardar}
          disabled={guardando}
        >
          {guardando ? "Guardando…" : "✓ Guardar cambios"}
        </button>
      </div>

    </div>
  )
}
