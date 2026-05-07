import { useState, useEffect, useRef } from "react"
import { UNIDADES_SAT } from "../lib/unidades-sat"

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
// aplicarIva=true → muestra y edita c/IVA; guarda dividiendo entre 1.16.
function PriceCalcRow({ label, precio, costoSinIva, onPrecioChange, readOnly = false, aplicarIva = false }) {
  const [margenLocal, setMargenLocal] = useState("")
  const [margenFocused, setMargenFocused] = useState(false)

  const factor       = aplicarIva ? 1.16 : 1
  const precioDisplay = round2(precio * factor)       // lo que ve el usuario

  const margenCalculado =
    precioDisplay > 0 && costoSinIva > 0
      ? round2(((precioDisplay - costoSinIva) / precioDisplay) * 100)
      : 0

  function commitMargen() {
    setMargenFocused(false)
    const m = parseFloat(margenLocal)
    if (isNaN(m) || m >= 100) return
    const pConIva = m <= 0 ? costoSinIva : round2(costoSinIva / (1 - m / 100))
    onPrecioChange(round2(pConIva / factor))  // guarda s/IVA
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
        <input
          className="cpx-calc-input"
          type="number"
          min="0"
          step="0.01"
          value={precioDisplay}
          onChange={(e) => {
            const cIva = parseFloat(e.target.value) || 0
            onPrecioChange(round2(cIva / factor))  // guarda s/IVA
          }}
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

export default function ComprasDetailPanel({ row, onRowChange }) {
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

  return (
    <div className="cpx-right">

      {/* Hero: imagen + nombre */}
      <div className="cpx-detail-hero">
        <div className="cpx-detail-thumb">
          {row.thumbnail
            ? <img src={row.thumbnail} alt="" />
            : <span className="cpx-detail-noimg">?</span>
          }
        </div>
        <div>
          <div className="cpx-detail-nombre">{row.descripcion}</div>
          <div style={{ fontSize: 11, color: "var(--at-text-muted)", marginTop: 2 }}>
            {row.clave}
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
            ["Existencia",   row.existencia ?? 0],
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
          <input
            className="cpx-dp-input"
            type="number"
            min="0"
            step="0.01"
            value={row.costo}
            onChange={(e) => set("costo", parseFloat(e.target.value) || 0)}
          />
        </FieldRow>

        {/* Factor — editable */}
        <FieldRow label="Factor">
          <input
            className="cpx-dp-input"
            type="number"
            min="0.001"
            step="any"
            value={row.factor}
            onChange={(e) => {
              const newFactor     = parseFloat(e.target.value) || 1
              const oldCostoCalc  = row.costoCalc ?? row.costoSinIva
              const newCostoCalc  = round2(row.costoSinIva / newFactor)
              const ivaMult       = row.aplicarIva ? 1.16 : 1
              const updates       = { factor: newFactor }
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
          <input
            className="cpx-dp-input"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={row.descuento}
            onChange={(e) => set("descuento", Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
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

    </div>
  )
}
