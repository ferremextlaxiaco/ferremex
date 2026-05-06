import { useState, useEffect } from "react"

function round2(n) {
  return Math.round(n * 100) / 100
}

function fmtPeso(n) {
  if (!n && n !== 0) return "—"
  return "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function PriceCalcRow({ label, precio, costoSinIva, onPrecioChange }) {
  const [margenLocal, setMargenLocal] = useState("")
  const [margenFocused, setMargenFocused] = useState(false)

  const margenCalculado =
    precio > 0 && costoSinIva > 0
      ? round2(((precio - costoSinIva) / precio) * 100)
      : 0

  function commitMargen() {
    setMargenFocused(false)
    const m = parseFloat(margenLocal)
    if (isNaN(m) || m >= 100) return
    const p = m <= 0 ? costoSinIva : round2(costoSinIva / (1 - m / 100))
    onPrecioChange(p)
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
          value={precio}
          onChange={(e) => onPrecioChange(parseFloat(e.target.value) || 0)}
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
            {row.claveSat && <span style={{ marginLeft: 8 }}>SAT: {row.claveSat}</span>}
          </div>
        </div>
      </div>

      {/* Info del artículo */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Artículo</p>
        {[
          ["Categoría",    [row.categoria, row.departamento].filter(Boolean).join(" › ") || "—"],
          ["Localización", row.localizacion || "—"],
          ["Existencia",   row.existencia ?? 0],
        ].map(([label, val]) => (
          <div key={label} className="cpx-detail-row">
            <span className="cpx-detail-label">{label}</span>
            <span className="cpx-detail-val">{val}</span>
          </div>
        ))}
      </div>

      {/* Ajustes de compra */}
      <div className="cpx-detail-section">
        <p className="cpx-detail-section-title">Ajustes de compra</p>

        {/* Último precio compra — referencia */}
        <div className="cpx-detail-row">
          <span className="cpx-detail-label">Últ. precio compra</span>
          <span className="cpx-detail-val">{fmtPeso(row.ultimoPrecioCompra)}</span>
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
            onChange={(e) => set("factor", parseFloat(e.target.value) || 1)}
          />
        </FieldRow>

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
        <div className="cpx-calc-hint">
          Costo s/IVA: <strong>{fmtPeso(row.costoSinIva)}</strong>
        </div>
        <div className="cpx-calc-header">
          <span className="cpx-calc-label" />
          <span className="cpx-calc-col-label">Venta ($)</span>
          <span className="cpx-calc-col-label">Margen %</span>
        </div>
        {[1, 2, 3, 4].map((n) => (
          <PriceCalcRow
            key={n}
            label={`Precio ${n}`}
            precio={row[`precio${n}`] ?? 0}
            costoSinIva={row.costoSinIva}
            onPrecioChange={(p) => set(`precio${n}`, p)}
          />
        ))}
      </div>

    </div>
  )
}
