import { useState, useRef } from "react"
import { Eye, MessageSquare, PauseCircle, Package, X, Plus } from "lucide-react"

const STATUS_LABEL = { borrador: "Borrador", enviado: "Enviado", confirmado: "Confirmado", recibido: "Recibido" }
const STATUS_CLS   = { borrador: "pdx-s-borrador", enviado: "pdx-s-enviado", confirmado: "pdx-s-confirmado", recibido: "pdx-s-recibido" }

const UM_OPTIONS = ["PZA", "CJA", "KG", "ML", "M", "PAR", "ROLLO", "LITRO", "JUEGO", "PAQ", "M2"]

// ── Free Item Inline Form ────────────────────────────────────────────────────

function FreeItemForm({ onAdd, onCancel }) {
  const [clave,       setClave]       = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [unidad,      setUnidad]      = useState("PZA")
  const [cantidad,    setCantidad]    = useState(1)
  const [notas,       setNotas]       = useState("")
  const [imgMode,     setImgMode]     = useState("file")   // "file" | "url"
  const [imgUrl,      setImgUrl]      = useState("")
  const [imgPreview,  setImgPreview]  = useState(null)
  const [errors,      setErrors]      = useState({})
  const fileRef = useRef(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setImgPreview(ev.target.result)
    reader.readAsDataURL(file)
    setImgUrl("")
  }

  function validate() {
    const errs = {}
    if (!descripcion.trim()) errs.descripcion = true
    if (!cantidad || cantidad < 1) errs.cantidad = true
    return errs
  }

  function handleAdd() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const imagenUrl = imgMode === "file" ? (imgPreview || null) : (imgUrl.trim() || null)

    onAdd({
      clave:       clave.trim() || null,
      descripcion: descripcion.trim(),
      unidad,
      cantidad:    Number(cantidad),
      notas:       notas.trim() || null,
      imagenUrl,
    })
  }

  return (
    <div className="pdx-free-form-wrap">
      <div className="pdx-free-form-title">Artículo libre</div>

      {/* Image upload */}
      <div style={{ marginBottom: 12 }}>
        <div className="pdx-free-label" style={{ marginBottom: 6 }}>Imagen <span style={{ fontWeight: 400, color: "var(--at-text-muted)" }}>(opcional)</span></div>
        <div className="pdx-img-tabs">
          <button
            type="button"
            className={`pdx-img-tab${imgMode === "file" ? " active" : ""}`}
            onClick={() => setImgMode("file")}
          >Subir archivo</button>
          <button
            type="button"
            className={`pdx-img-tab${imgMode === "url" ? " active" : ""}`}
            onClick={() => setImgMode("url")}
          >URL de imagen</button>
        </div>
        {imgMode === "file" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ fontSize: 12 }}
              onChange={handleFileChange}
            />
            {imgPreview && (
              <img
                src={imgPreview}
                alt="preview"
                style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: "1px solid var(--at-border)" }}
              />
            )}
          </div>
        ) : (
          <input
            type="url"
            className="pdx-free-input"
            placeholder="https://ejemplo.com/imagen.jpg"
            value={imgUrl}
            onChange={e => setImgUrl(e.target.value)}
            style={{ width: "100%" }}
          />
        )}
      </div>

      <div className="pdx-free-form-grid">
        {/* SKU (optional) */}
        <div className="pdx-free-field">
          <label className="pdx-free-label">Clave / SKU <span style={{ fontWeight: 400, color: "var(--at-text-muted)" }}>(opcional)</span></label>
          <input
            className="pdx-free-input"
            placeholder="Ej. MT-001"
            value={clave}
            onChange={e => setClave(e.target.value)}
          />
        </div>

        {/* Unit of measure */}
        <div className="pdx-free-field">
          <label className="pdx-free-label">Unidad de medida</label>
          <select
            className="pdx-free-select"
            value={unidad}
            onChange={e => setUnidad(e.target.value)}
          >
            {UM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Description (full width) */}
        <div className="pdx-free-field pdx-free-form-full">
          <label className="pdx-free-label">
            Descripción <span style={{ color: "var(--at-red, #dc2626)" }}>*</span>
            <span style={{ fontWeight: 400, color: "var(--at-text-muted)", marginLeft: 6 }}>{descripcion.length}/120</span>
          </label>
          <input
            className={`pdx-free-input${errors.descripcion ? " error" : ""}`}
            placeholder="Descripción del artículo…"
            maxLength={120}
            value={descripcion}
            onChange={e => { setDescripcion(e.target.value); setErrors(prev => ({ ...prev, descripcion: false })) }}
          />
          {errors.descripcion && (
            <span style={{ fontSize: 11, color: "var(--at-red, #dc2626)" }}>La descripción es obligatoria</span>
          )}
        </div>

        {/* Quantity */}
        <div className="pdx-free-field">
          <label className="pdx-free-label">Cantidad <span style={{ color: "var(--at-red, #dc2626)" }}>*</span></label>
          <input
            type="number"
            className={`pdx-free-input${errors.cantidad ? " error" : ""}`}
            min={1}
            step={1}
            value={cantidad}
            onChange={e => { setCantidad(parseInt(e.target.value, 10) || 1); setErrors(prev => ({ ...prev, cantidad: false })) }}
          />
          {errors.cantidad && (
            <span style={{ fontSize: 11, color: "var(--at-red, #dc2626)" }}>Ingresa una cantidad válida</span>
          )}
        </div>

        {/* Notes (full width) */}
        <div className="pdx-free-field pdx-free-form-full">
          <label className="pdx-free-label">
            Notas <span style={{ fontWeight: 400, color: "var(--at-text-muted)" }}>(opcional)</span>
            <span style={{ fontWeight: 400, color: "var(--at-text-muted)", marginLeft: 6 }}>{notas.length}/80</span>
          </label>
          <input
            className="pdx-free-input"
            placeholder="Especificaciones, medidas, etc."
            maxLength={80}
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>
      </div>

      <div className="pdx-free-form-footer">
        <button className="ar-btn-action" onClick={onCancel}>Cancelar</button>
        <button
          className="ar-btn-add"
          style={{ background: "var(--at-orange)", borderColor: "var(--at-orange)" }}
          onClick={handleAdd}
        >
          Agregar al pedido
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PedidosTabla({
  rows,
  freeItems = [],
  onAddFreeItem,
  onRemoveFreeItem,
  proveedor, proveedores, onProveedorChange,
  fecha, onFechaChange, status,
  onQtyChange, onRemove,
  onPonerEnEspera,
  totalArticulos, totalPiezas,
  onPreview, canShare,
  folio,
}) {
  const [showFreeForm,     setShowFreeForm]      = useState(false)
  const [pendingDeleteId,  setPendingDeleteId]   = useState(null)   // catalog row
  const [pendingFreeDelId, setPendingFreeDelId]  = useState(null)   // free item

  const isEmpty = rows.length === 0 && freeItems.length === 0

  function stockClass(exist, min) {
    if (exist === 0) return "pdx-stock-zero"
    if (exist < min) return "pdx-stock-bajo"
    return "pdx-stock-ok"
  }

  function handleAddFreeItem(item) {
    onAddFreeItem?.(item)
    setShowFreeForm(false)
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

        {/* Table scroll area */}
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
                  <th>Notas</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {/* Catalog rows */}
                {rows.map(row => (
                  <>
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
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{row.descripcion}</td>
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
                      <td style={{ color: "var(--at-text-muted)", fontSize: 11 }}>—</td>
                      <td>
                        <button
                          className="pdx-del-btn"
                          onClick={() => setPendingDeleteId(row._id)}
                          title="Quitar del pedido"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                    {pendingDeleteId === row._id && (
                      <tr key={`${row._id}-confirm`}>
                        <td colSpan={10}>
                          <div className="pdx-free-del-confirm">
                            <span>¿Quitar <strong>{row.descripcion}</strong> del pedido?</span>
                            <button
                              className="ar-btn-action"
                              style={{ padding: "3px 10px", fontSize: 12, color: "var(--at-red, #dc2626)", borderColor: "var(--at-red, #dc2626)" }}
                              onClick={() => { onRemove(row._id); setPendingDeleteId(null) }}
                            >
                              Sí, quitar
                            </button>
                            <button
                              className="ar-btn-action"
                              style={{ padding: "3px 10px", fontSize: 12 }}
                              onClick={() => setPendingDeleteId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}

                {/* Free items */}
                {freeItems.map(item => (
                  <>
                    <tr key={item._id} style={{ background: "rgba(249,99,2,0.04)" }}>
                      <td>
                        <div className="pdx-art-img">
                          {item.imagenUrl
                            ? <img src={item.imagenUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }} />
                            : <Package size={16} />
                          }
                        </div>
                      </td>
                      <td style={{ fontFamily: "monospace", color: "var(--at-orange)", fontSize: 12 }}>
                        {item.clave || "—"}
                      </td>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.descripcion}
                        <span className="pdx-free-badge">libre</span>
                      </td>
                      <td style={{ color: "var(--at-text-soft)", fontSize: 12 }}>{item.unidad || "PZA"}</td>
                      <td className="r" style={{ color: "var(--at-text-muted)" }}>—</td>
                      <td className="r" style={{ color: "var(--at-text-muted)" }}>—</td>
                      <td className="r" style={{ fontWeight: 700 }}>{item.cantidad}</td>
                      <td className="r" style={{ color: "var(--at-text-muted)" }}>—</td>
                      <td style={{ color: "var(--at-text-muted)", fontSize: 11 }}>{item.notas || ""}</td>
                      <td>
                        <button
                          className="pdx-del-btn"
                          onClick={() => setPendingFreeDelId(item._id)}
                          title="Quitar artículo libre"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                    {pendingFreeDelId === item._id && (
                      <tr key={`${item._id}-confirm`} style={{ background: "rgba(249,99,2,0.04)" }}>
                        <td colSpan={10}>
                          <div className="pdx-free-del-confirm">
                            <span>¿Eliminar este artículo libre del pedido?</span>
                            <button
                              className="ar-btn-action"
                              style={{ padding: "3px 10px", fontSize: 12, color: "var(--at-red, #dc2626)", borderColor: "var(--at-red, #dc2626)" }}
                              onClick={() => { onRemoveFreeItem?.(item._id); setPendingFreeDelId(null) }}
                            >
                              Sí, eliminar
                            </button>
                            <button
                              className="ar-btn-action"
                              style={{ padding: "3px 10px", fontSize: 12 }}
                              onClick={() => setPendingFreeDelId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* "+ Agregar artículo libre" button + inline form */}
        <div style={{ borderTop: "1px solid var(--at-border)", flexShrink: 0 }}>
          {!showFreeForm && (
            <div style={{ padding: "10px 14px" }}>
              <button
                className="ar-btn-action"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
                disabled={freeItems.length >= 50}
                title={freeItems.length >= 50 ? "Máximo 50 artículos libres" : undefined}
                onClick={() => setShowFreeForm(true)}
              >
                <Plus size={14} /> Agregar artículo libre
              </button>
            </div>
          )}
          {showFreeForm && (
            <FreeItemForm
              onAdd={handleAddFreeItem}
              onCancel={() => setShowFreeForm(false)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="pdx-table-footer">
          <div className="pdx-footer-totals">
            <span>Artículos: <strong>{totalArticulos}</strong></span>
            <span>Piezas: <strong>{totalPiezas}</strong></span>
            {freeItems.length > 0 && (
              <span style={{ color: "var(--at-orange)", fontSize: 11 }}>
                +{freeItems.length} libre{freeItems.length !== 1 ? "s" : ""}
              </span>
            )}
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
    </>
  )
}
