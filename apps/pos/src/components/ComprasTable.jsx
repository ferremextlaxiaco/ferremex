import { useState } from "react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPeso(n) {
  return "$" + Number(n || 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

// Small inline number input for table cells
function CellNum({ value, onChange, min = 0, step = "0.01" }) {
  return (
    <input
      className="cpx-cell-input"
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  )
}

// Small inline toggle checkbox
function CellToggle({ checked, onChange, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      className={`cpx-cell-toggle${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      {checked ? "Sí" : "No"}
    </button>
  )
}

// Status badge
const STATUS_META = {
  borrador:    { label: "Borrador",   cls: "cpx-status-borrador"  },
  en_espera:   { label: "En espera",  cls: "cpx-status-espera"    },
  confirmada:  { label: "Confirmada", cls: "cpx-status-confirmada" },
}

// ── Header: proveedor + fecha + status ────────────────────────────────────────

function TableHeader({ proveedor, proveedores, onProveedorChange, fecha, onFechaChange, numFactura, onNumFacturaChange }) {
  return (
    <div className="cpx-table-header">
      {/* Proveedor */}
      <div className="cpx-th-field">
        <label className="cpx-th-label">Proveedor</label>
        <select
          className="cpx-th-select"
          value={proveedor?.id ?? ""}
          onChange={(e) => {
            const found = proveedores.find((p) => p.id === e.target.value)
            onProveedorChange(found ?? null)
          }}
        >
          <option value="">— Seleccionar —</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {/* Fecha */}
      <div className="cpx-th-field">
        <label className="cpx-th-label">Fecha de compra</label>
        <input
          type="date"
          className="cpx-th-select"
          value={fecha}
          onChange={(e) => onFechaChange(e.target.value)}
        />
      </div>

      {/* Núm. factura — alineado a la derecha */}
      <div className="cpx-th-field" style={{ marginLeft: "auto" }}>
        <label className="cpx-th-label">Núm. factura</label>
        <input
          type="text"
          className="cpx-th-select"
          placeholder="Ej. F-2024-001"
          value={numFactura ?? ""}
          onChange={(e) => onNumFacturaChange(e.target.value)}
          style={{ minWidth: 130 }}
        />
      </div>
    </div>
  )
}

// ── Tabla de artículos ────────────────────────────────────────────────────────

const COL_HEADS = [
  { key: "clave",       label: "Clave",       w: 90,  num: false },
  { key: "descripcion", label: "Descripción", w: 300, num: false },
  { key: "cantidad",    label: "Cant.",        w: 72,  num: true  },
  { key: "costoSinIva", label: "Costo s/IVA",  w: 110, num: true  },
  { key: "costoConIva", label: "Costo c/IVA",  w: 110, num: true  },
  { key: "variacion",   label: "Var.",         w: 72,  num: true  },
  { key: "importe",     label: "Importe",      w: 110, num: true  },
]

function PriceIndicator({ costo, ultimoPrecio }) {
  if (!ultimoPrecio || ultimoPrecio === 0 || costo === ultimoPrecio) return null
  const diff    = costo - ultimoPrecio
  const pct     = Math.abs((diff / ultimoPrecio) * 100).toFixed(1)
  const subio   = diff > 0
  return (
    <span className={`cpx-price-ind ${subio ? "up" : "down"}`} title={`Último: ${fmtPeso(ultimoPrecio)}`}>
      {subio ? "▲" : "▼"} {pct}%
    </span>
  )
}

function ArticleRow({ row, selected, onClick, onChange, onDelete, pendingDelete, onConfirmDelete, onCancelDelete }) {
  const set = (field, val) => onChange(row._id, { [field]: val })

  return (
    <tr
      className={`cpx-tr${selected ? " selected" : ""}`}
      onClick={onClick}
    >
      {/* Clave */}
      <td className="cpx-td cpx-td-mono">{row.clave}</td>

      {/* Descripción */}
      <td className="cpx-td cpx-td-desc">{row.descripcion}</td>

      {/* Cantidad */}
      <td className="cpx-td cpx-td-num" onClick={(e) => e.stopPropagation()}>
        <CellNum value={row.cantidad} min={1} step="1"
          onChange={(v) => set("cantidad", Math.max(1, Math.round(v)))} />
      </td>

      {/* Costo s/IVA */}
      <td className="cpx-td cpx-td-num cpx-td-calc">{fmtPeso(row.costoSinIva)}</td>

      {/* Costo c/IVA — solo si aplica IVA */}
      <td className="cpx-td cpx-td-num cpx-td-calc">
        {row.aplicarIva ? fmtPeso(row.costoConIva) : <span style={{ color: "var(--at-text-muted)" }}>—</span>}
      </td>

      {/* Variación vs último precio de compra — ambos en base s/IVA */}
      <td className="cpx-td cpx-td-num">
        <PriceIndicator costo={row.costoSinIva} ultimoPrecio={row.ultimoPrecioCompra} />
      </td>

      {/* Importe = cantidad × costo c/IVA */}
      <td className="cpx-td cpx-td-num cpx-td-importe">{fmtPeso(row.costoConIva * row.cantidad)}</td>

      {/* Eliminar */}
      <td className="cpx-td cpx-td-del" onClick={(e) => e.stopPropagation()}>
        {pendingDelete ? (
          <div className="cpx-del-confirm">
            <button className="cpx-del-yes" onClick={onConfirmDelete} title="Confirmar">✓</button>
            <button className="cpx-del-no"  onClick={onCancelDelete}  title="Cancelar">✕</button>
          </div>
        ) : (
          <button className="cpx-del-btn" onClick={onDelete} title="Quitar artículo">
            ✕
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Componente exportado ──────────────────────────────────────────────────────

export default function ComprasTable({
  rows, selectedId, onRowClick, onRowChange, onRowDelete,
  proveedor, proveedores, onProveedorChange,
  fecha, onFechaChange,
  numFactura, onNumFacturaChange,
  status,
  subtotal, ivaTotal, total,
  onPonerEnEspera, onConfirmar,
}) {
  // Track which row has its delete pending (inline confirmation)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  function handleDeleteClick(id) {
    setPendingDeleteId(id)
  }
  function handleConfirmDelete(id) {
    setPendingDeleteId(null)
    onRowDelete(id)
  }
  function handleCancelDelete() {
    setPendingDeleteId(null)
  }

  const isEmpty = rows.length === 0

  return (
    <div className="cpx-center">
      {/* Header: proveedor + fecha + status */}
      <TableHeader
        proveedor={proveedor}
        proveedores={proveedores}
        onProveedorChange={onProveedorChange}
        fecha={fecha}
        onFechaChange={onFechaChange}
        numFactura={numFactura}
        onNumFacturaChange={onNumFacturaChange}
      />

      {/* Scrollable table */}
      <div className="cpx-table-scroll">
        {isEmpty ? (
          <div className="cpx-table-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <p>Busca un artículo en el panel izquierdo y haz clic para agregarlo</p>
          </div>
        ) : (
          <table className="cpx-table">
            <thead>
              <tr>
                {COL_HEADS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.w, textAlign: c.num ? "right" : "left" }}>{c.label}</th>
                ))}
                <th style={{ minWidth: 54 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ArticleRow
                  key={row._id}
                  row={row}
                  selected={row._id === selectedId}
                  onClick={() => onRowClick(row._id)}
                  onChange={onRowChange}
                  onDelete={() => handleDeleteClick(row._id)}
                  pendingDelete={pendingDeleteId === row._id}
                  onConfirmDelete={() => handleConfirmDelete(row._id)}
                  onCancelDelete={handleCancelDelete}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: totales + acciones */}
      <div className="cpx-table-footer">
        <div className="cpx-totals">
          <span className="cpx-total-item">
            Subtotal: <strong>{fmtPeso(subtotal)}</strong>
          </span>
          <span className="cpx-total-item">
            IVA: <strong>{fmtPeso(ivaTotal)}</strong>
          </span>
          <span className="cpx-total-item cpx-total-main">
            Total: <strong>{fmtPeso(total)}</strong>
          </span>
        </div>
        <div className="cpx-footer-actions">
          <button
            className="cpx-btn-confirmar"
            disabled={isEmpty || !proveedor}
            onClick={onConfirmar}
            title={!proveedor ? "Selecciona un proveedor primero" : undefined}
          >
            Confirmar compra
          </button>
        </div>
      </div>
    </div>
  )
}
