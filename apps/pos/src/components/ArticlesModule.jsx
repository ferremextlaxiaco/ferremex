import { useState, useRef, useCallback } from "react"
import { listarArticulos, crearArticulo, actualizarArticulo, eliminarArticulo } from "../lib/client"
import ArticleDrawer from "./ArticleDrawer"
import ArticleDeleteModal from "./ArticleDeleteModal"

// ── Iconos inline ─────────────────────────────────────────────────────────────

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}
function IconRefresh({ spinning }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={spinning ? { animation: "ar-spin 0.7s linear infinite", display: "block" } : {}}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ArticlesModule() {
  const [articles, setArticles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState("add")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState("")
  const [hasBuscado, setHasBuscado] = useState(false)
  const [saving, setSaving] = useState(false)

  const claveCounter = useRef(1)

  const selected = articles.find((a) => a.id === selectedId) ?? null

  // ── Carga ─────────────────────────────────────────────────────────────────────

  const cargar = useCallback(async (q, indicadorRefresh = false) => {
    if (!q) return
    if (indicadorRefresh) setRefreshing(true)
    else setLoading(true)
    setHasBuscado(true)
    setError(null)
    try {
      const data = await listarArticulos(q)
      setArticles(data)
      setSelectedId(null)
    } catch (e) {
      setError(e.message ?? "Error al cargar artículos")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  function handleSearch(value) {
    setSearch(value)
    if (!value) {
      setArticles([])
      setHasBuscado(false)
      setError(null)
      setSelectedId(null)
    }
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Enter") cargar(search)
  }

  function handleRefresh() {
    if (search) cargar(search, true)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async function handleSave(data) {
    setSaving(true)
    try {
      if (drawerMode === "add") {
        const nuevo = await crearArticulo(data)
        setArticles((prev) => [...prev, nuevo].sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es")))
        setSelectedId(nuevo.id)
      } else {
        const actualizado = await actualizarArticulo({ ...data, id: selectedId })
        setArticles((prev) => prev.map((a) => (a.id === selectedId ? actualizado : a)))
      }
      setDrawerOpen(false)
    } catch (e) {
      alert("Error al guardar: " + (e.message ?? "Error desconocido"))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    try {
      await eliminarArticulo(selectedId)
      setArticles((prev) => prev.filter((a) => a.id !== selectedId))
      setSelectedId(null)
      setDeleteOpen(false)
    } catch (e) {
      alert("Error al eliminar: " + (e.message ?? "Error desconocido"))
    }
  }

  function getNextClave(categoria, departamento) {
    const prefix = (categoria?.[0] ?? "X").toUpperCase() + (departamento?.[0] ?? "X").toUpperCase()
    return prefix + (claveCounter.current++).toString().padStart(4, "0")
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="ar-root">

      {/* Header: título + 4 botones */}
      <div className="ar-header">
        <div>
          <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Artículos</p>
          <p className="ar-header-meta">
            {loading ? "Buscando…" : hasBuscado ? `${articles.length} artículo${articles.length !== 1 ? "s" : ""}` : " "}
          </p>
        </div>

        <div className="ar-header-actions">
          <button className="ar-btn-add" onClick={() => { setDrawerMode("add"); setDrawerOpen(true) }}>
            <IconPlus /> Agregar
          </button>
          <button className="ar-btn-action" disabled={!selectedId}
            onClick={() => { setDrawerMode("edit"); setDrawerOpen(true) }}>
            <IconPencil /> Editar
          </button>
          <button className="ar-btn-action" onClick={handleRefresh}>
            <IconRefresh spinning={refreshing} /> Refrescar
          </button>
          <div className="ar-toolbar-divider" />
          <button className="ar-btn-action ar-btn-danger" disabled={!selectedId}
            onClick={() => setDeleteOpen(true)}>
            <IconTrash /> Eliminar
          </button>
        </div>
      </div>

      {/* Buscador + botón Buscar */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
          <span style={{
            position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
            color: "var(--at-text-muted)", pointerEvents: "none", display: "flex",
          }}>
            <IconSearch />
          </span>
          <input
            type="text"
            className="ar-input"
            placeholder="Buscar por clave, descripción, categoría…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ paddingLeft: "32px" }}
          />
        </div>
        <button className="ar-btn-action" onClick={() => cargar(search)}
          disabled={!search || loading}>
          <IconSearch /> Buscar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "rgba(220,38,38,0.06)", border: "1px solid var(--at-red)",
          borderRadius: "var(--at-radius)", padding: "10px 14px",
          color: "var(--at-red)", fontSize: "13px", flexShrink: 0,
        }}>
          {error} —{" "}
          <button onClick={() => cargar(search)} style={{
            background: "none", border: "none", color: "var(--at-red)",
            textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: "13px",
          }}>Reintentar</button>
        </div>
      )}

      {/* Contenido: lista izquierda + detalle derecha */}
      <div className="ar-content">

        {/* Panel izquierdo */}
        <div className="ar-list-panel">
          {loading ? (
            <p className="ar-empty">Buscando artículos…</p>
          ) : !hasBuscado ? (
            <p className="ar-empty">Presiona Buscar o Enter para encontrar artículos</p>
          ) : articles.length === 0 ? (
            <p className="ar-empty">No se encontraron artículos para &ldquo;{search}&rdquo;</p>
          ) : articles.map((a) => {
            const sel = a.id === selectedId
            return (
              <div key={a.id}
                className={`ar-list-item${sel ? " selected" : ""}`}
                onClick={() => setSelectedId((prev) => prev === a.id ? null : a.id)}
              >
                <div className="ar-list-thumb">
                  {a.thumbnail && <img src={a.thumbnail} alt="" />}
                </div>
                <div className="ar-list-info">
                  <p className="ar-list-code">{a.clave}</p>
                  <p className="ar-list-name">{a.descripcion}</p>
                  <p className="ar-list-cat">
                    {[a.categoria, a.departamento].filter(Boolean).join(" › ")}
                  </p>
                </div>
                <div className="ar-list-right">
                  <p className="ar-list-price">${a.precio1.toFixed(2)}</p>
                  <p className={`ar-list-stock${(a.existencia ?? 0) > 0 ? " ok" : (a.existencia ?? 0) < 0 ? " neg" : " zero"}`}>
                    {a.existencia ?? 0} en stock
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Panel derecho: detalle */}
        <div className="ar-detail-panel">
          {!selected ? (
            <div className="ar-detail-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <p>Selecciona un art&iacute;culo para ver sus detalles</p>
            </div>
          ) : (
            <div className="ar-detail-view">

              {/* Imagen + existencia */}
              <div className="ar-detail-hero">
                <div className="ar-detail-hero-img">
                  {selected.thumbnail
                    ? <img src={selected.thumbnail} alt={selected.descripcion} />
                    : <span className="ar-detail-hero-noimg">Sin imagen</span>
                  }
                </div>
                <div className="ar-detail-hero-stock">
                  <p className="ar-detail-hero-stock-num">{selected.existencia ?? 0}</p>
                  <p className="ar-detail-hero-stock-label">en stock</p>
                  {(selected.inventarioMin > 0) && (
                    <p className="ar-detail-hero-stock-minmax">
                      Mín {selected.inventarioMin} · Máx {selected.inventarioMax || "—"}
                    </p>
                  )}
                </div>
              </div>

              {/* Inventario y ubicación */}
              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Inventario y Ubicaci&oacute;n</p>
                <div className="ar-detail-rows">
                  {[
                    ["Mínimo",      selected.inventarioMin ?? "—"],
                    ["Máximo",      selected.inventarioMax ?? "—"],
                    ["Localización", selected.localizacion || "—"],
                    ["Peso",            selected.peso ? `${selected.peso} kg` : "—"],
                    ["Venta a Granel",  selected.ventaGranel ? "Sí" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Identificación */}
              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Identificaci&oacute;n</p>
                <div className="ar-detail-rows">
                  {[
                    ["Clave",        <span style={{ fontFamily: "monospace" }}>{selected.clave || "—"}</span>],
                    ["Clave Alterna", selected.claveAlterna || "—"],
                    ["Clave SAT",    selected.claveSat || "—"],
                    ["Categoría", selected.categoria || "—"],
                    ["Departamento", selected.departamento || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unidades */}
              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Unidades</p>
                <div className="ar-detail-rows">
                  {[
                    ["U. de Compra", selected.unidadCompra],
                    ["U. de Venta",  selected.unidadVenta],
                    ["Factor",       selected.factor],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fiscal */}
              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Fiscal</p>
                <div className="ar-detail-rows">
                  {[
                    ["IVA",           selected.aplicarIva ? "Aplica IVA 16%" : "Exento"],
                    ["Precio Compra", `$${(selected.precioCompra ?? 0).toFixed(2)}`],
                    ["Precio Neto",   selected.precioNeto ? "Sí (sin IVA)" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Precios de venta */}
              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Precios de Venta</p>
                <div className="ar-detail-price-grid">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="ar-detail-price-item">
                      <p className="ar-detail-price-label">Precio {n}</p>
                      <p className="ar-detail-price-value">${(selected[`precio${n}`] ?? 0).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Spinner flotante (no bloqueante) */}
      {refreshing && (
        <div className="ar-spinner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--at-orange)" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </div>
      )}

      <ArticleDrawer
        open={drawerOpen}
        mode={drawerMode}
        article={drawerMode === "edit" ? selected : null}
        articles={articles}
        saving={saving}
        onSave={handleSave}
        onClose={() => setDrawerOpen(false)}
        getNextClave={getNextClave}
      />

      {deleteOpen && selected && (
        <ArticleDeleteModal
          article={selected}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  )
}
