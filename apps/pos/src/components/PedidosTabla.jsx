import { useState } from "react"
import { Eye, MessageSquare, PauseCircle, Package, X } from "lucide-react"

const STATUS_LABEL = { borrador: "Borrador", enviado: "Enviado", confirmado: "Confirmado", recibido: "Recibido" }
const STATUS_CLS   = { borrador: "pdx-s-borrador", enviado: "pdx-s-enviado", confirmado: "pdx-s-confirmado", recibido: "pdx-s-recibido" }

export default function PedidosTabla({
  rows, proveedor, proveedores, onProveedorChange,
  fecha, onFechaChange, status,
  onQtyChange, onRemove,
  onPonerEnEspera,
  totalArticulos, totalPiezas,
  onPreview, canShare,
  historial, folio,
  onShared,
}) {
  const [expandedId, setExpandedId] = useState(null)

  const totalArticulosHist = rows.length
  const isEmpty = rows.length === 0

  function stockClass(exist, min) {
    if (exist === 0) return "pdx-stock-zero"
    if (exist < min) return "pdx-stock-bajo"
    return "pdx-stock-ok"
  }

  return (
    <>
      {/* ── Center panel ── */}
      <div className="pdx-center">
        {/* Header row */}
        <div className="pdx-center-header">
          <select
            className="pdx-prov-select"
            value={proveedor?.id ?? ""}
            onChange={e => {
              const found = proveedores.find(p => p.id === e.target.value)
              onProveedorChange(found ?? null)
            }}
          >
            <option value="">— Proveedor (requerido) —</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <input
            type="date"
            className="pdx-date-input"
            value={fecha}
            onChange={e => onFechaChange(e.target.value)}
          />

          <span className={`pdx-status ${STATUS_CLS[status] ?? "pdx-s-borrador"}`}>
            {STATUS_LABEL[status] ?? status}
          </span>

          <button
            className="ar-btn-action"
            style={{ marginLeft: "auto" }}
            disabled={isEmpty}
            onClick={onPonerEnEspera}
          >
            <PauseCircle size={14} /> Poner en espera
          </button>
        </div>

        {/* Table */}
        <div className="pdx-table-wrap">
          {isEmpty ? (
            <div className="pdx-empty-state">
              <Package size={48} />
              <p>Busca artículos o usa "Cargar faltantes" para comenzar</p>
            </div>
          ) : (
            <table className="pdx-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Img</th>
                  <th>Clave</th>
                  <th>Descripción</th>
                  <th>Unidad</th>
                  <th className="r">Existencia</th>
                  <th className="r">Mínimo</th>
                  <th className="r" style={{ minWidth: 90 }}>Cantidad</th>
                  <th className="r">Últ. precio</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row._id}>
                    <td>
                      <div className="pdx-art-img">
                        {row.thumbnail
                          ? <img src={row.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }} />
                          : <Package size={16} />
                        }
                      </div>
                    </td>
                    <td style={{ fontFamily: "monospace", color: "var(--at-orange)", fontSize: 12 }}>{row.clave}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{row.descripcion}</td>
                    <td style={{ color: "var(--at-text-soft)", fontSize: 12 }}>{row.unidad}</td>
                    <td className="r">
                      <span className={stockClass(row.existencia, row.minimo)}>{row.existencia}</span>
                    </td>
                    <td className="r" style={{ color: "var(--at-text-soft)" }}>{row.minimo}</td>
                    <td className="r">
                      <input
                        className="pdx-qty-input"
                        type="number"
                        min={1}
                        step={1}
                        value={row.cantidad}
                        onChange={e => onQtyChange(row._id, parseInt(e.target.value, 10) || 1)}
                        onKeyDown={e => {
                          if (e.key === "ArrowUp")   { e.preventDefault(); onQtyChange(row._id, row.cantidad + 1) }
                          if (e.key === "ArrowDown")  { e.preventDefault(); onQtyChange(row._id, Math.max(1, row.cantidad - 1)) }
                        }}
                      />
                    </td>
                    <td className="r" style={{ fontWeight: 600 }}>${row.ultimoPrecioCompra.toFixed(2)}</td>
                    <td>
                      <button className="pdx-del-btn" onClick={() => onRemove(row._id)} title="Quitar del pedido">
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="pdx-table-footer">
          <div className="pdx-footer-totals">
            <span>Artículos: <strong>{totalArticulos}</strong></span>
            <span>Piezas: <strong>{totalPiezas}</strong></span>
          </div>
          <div className="pdx-footer-actions">
            <button className="ar-btn-action" disabled={isEmpty} onClick={onPreview}>
              <Eye size={14} /> Previsualizar
            </button>
            <button
              className="ar-btn-action"
              disabled={!canShare || isEmpty}
              title={!proveedor ? "Selecciona un proveedor primero" : ""}
              onClick={onPreview}
            >
              <MessageSquare size={14} /> Compartir pedido
            </button>
          </div>
        </div>
      </div>

      {/* ── Right panel — Historial ── */}
      <div className="pdx-right">
        <div className="pdx-hist-header">Pedidos recientes</div>
        <div className="pdx-hist-list">
          {historial.length === 0 && (
            <p style={{ padding: 14, fontSize: 12, color: "var(--at-text-muted)", textAlign: "center" }}>
              Sin pedidos previos
            </p>
          )}
          {historial.map(p => {
            const isExp = expandedId === p.id
            const artCount = (p.articulos ?? []).length
            return (
              <div
                key={p.id}
                className={`pdx-hist-item${isExp ? " expanded" : ""}`}
                onClick={() => setExpandedId(isExp ? null : p.id)}
              >
                <div className="pdx-hist-prov">{p.proveedor}</div>
                <div className="pdx-hist-meta">
                  <span>{p.folio}</span>
                  <span>·</span>
                  <span>{artCount} arts.</span>
                  <span>·</span>
                  <span className={`pdx-status ${STATUS_CLS[p.status] ?? "pdx-s-borrador"}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div className="pdx-hist-meta" style={{ marginTop: 1 }}>
                  <span>{p.fecha}</span>
                </div>
                {isExp && (
                  <div className="pdx-hist-arts">
                    {(p.articulos ?? []).map((a, i) => (
                      <div key={i} className="pdx-hist-art-row">
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {a.descripcion ?? a.clave}
                        </span>
                        <span style={{ fontWeight: 700, color: "var(--at-orange)", flexShrink: 0 }}>
                          ×{a.cantidad}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
