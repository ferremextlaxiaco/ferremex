import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import {
  listarArticulos,
  listarArticulosDeCatalogo,
  listarCatalogos,
  crearArticulo,
  actualizarArticulo,
  eliminarArticulo,
} from "../lib/client"
import ArticleDrawer from "./ArticleDrawer"
import ArticleDeleteModal from "./ArticleDeleteModal"
import { useToasts } from "../hooks/useToasts"

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
function IconFilter() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}

const PAGE_SIZE = 40

// ── Componente principal ──────────────────────────────────────────────────────

export default function ArticlesModule() {
  const { toasts, push: pushToast } = useToasts()
  // ── Artículos ────────────────────────────────────────────────────────────────
  const [articles,   setArticles]   = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState("add")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState(null)
  const [search,     setSearch]     = useState("")
  const [hasBuscado, setHasBuscado] = useState(false)
  const [saving,     setSaving]     = useState(false)

  // ── Taxonomía ────────────────────────────────────────────────────────────────
  const [taxonomy,     setTaxonomy]     = useState({ depts: [], cats: [], marcas: [] })
  const [taxLoading,   setTaxLoading]   = useState(true)
  const [filterDept,   setFilterDept]   = useState("")  // dep-id
  const [filterCat,    setFilterCat]    = useState("")  // cat-id
  const [filterMarca,  setFilterMarca]  = useState("")  // mar-id

  const [page, setPage] = useState(0)
  const listPanelRef = useRef(null)
  const claveCounter = useRef(1)
  const selected = articles.find((a) => a.id === selectedId) ?? null

  const totalPages  = Math.max(1, Math.ceil(articles.length / PAGE_SIZE))
  const pagedArticles = useMemo(
    () => articles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [articles, page]
  )

  // Cargar taxonomía al montar (para los selects en cascada)
  useEffect(() => {
    listarCatalogos()
      .then(data => setTaxonomy(data))
      .catch(() => {})
      .finally(() => setTaxLoading(false))
  }, [])

  // Opciones en cascada derivadas de la taxonomía
  const catOptions   = taxonomy.cats.filter(c => !filterDept || c.depId === filterDept)
  const marcaOptions = taxonomy.marcas.filter(m => !filterCat || m.catId === filterCat)

  // Nombres resueltos para los filtros activos
  const depNombre = taxonomy.depts.find(d => d.id === filterDept)?.nombre ?? ""
  const catNombre = taxonomy.cats.find(c => c.id === filterCat)?.nombre   ?? ""
  const marNombre = taxonomy.marcas.find(m => m.id === filterMarca)?.nombre ?? ""

  const hayFiltros = filterDept || filterCat || filterMarca

  // ── Motor de búsqueda ────────────────────────────────────────────────────────

  const buscar = useCallback(async (q, dept, cat, mar, indicadorRefresh = false) => {
    const hayTaxo = dept || cat || mar
    const hayText = q?.trim()
    if (!hayTaxo && !hayText) return

    if (indicadorRefresh) setRefreshing(true)
    else setLoading(true)
    setHasBuscado(true)
    setError(null)
    setSelectedId(null)

    try {
      let data
      if (hayText) {
        // Búsqueda de texto → API, luego post-filtro por taxonomía en JS
        data = await listarArticulos(q)
        if (hayTaxo) {
          data = data.filter(a => {
            if (dept && a.departamento !== dept) return false
            if (cat  && a.categoria    !== cat)  return false
            if (mar  && a.marca        !== mar)   return false
            return true
          })
        }
      } else {
        // Solo filtros de taxonomía → endpoint dedicado
        data = await listarArticulosDeCatalogo(dept, cat)
        // Post-filtro por marca en JS (metadata.marca puede estar vacío)
        if (mar) data = data.filter(a => a.marca === mar)
      }
      setArticles(data)
      setPage(0)
    } catch (e) {
      setError(e.message ?? "Error al cargar artículos")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Auto-disparo cuando cambian los filtros de taxonomía
  useEffect(() => {
    if (filterDept || filterCat || filterMarca) {
      buscar(search, depNombre, catNombre, marNombre)
    }
    // Solo cuando cambian los selects, no el texto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDept, filterCat, filterMarca])

  // ── Handlers de UI ───────────────────────────────────────────────────────────

  function handleSearch(value) {
    setSearch(value)
    if (!value && !hayFiltros) {
      setArticles([])
      setHasBuscado(false)
      setError(null)
      setSelectedId(null)
    }
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Enter") buscar(search, depNombre, catNombre, marNombre)
  }

  function handleBuscar() {
    buscar(search, depNombre, catNombre, marNombre)
  }

  function handleRefresh() {
    buscar(search, depNombre, catNombre, marNombre, true)
  }

  function handleDeptChange(e) {
    setFilterDept(e.target.value)
    setFilterCat("")
    setFilterMarca("")
  }

  function handleCatChange(e) {
    setFilterCat(e.target.value)
    setFilterMarca("")
  }

  function goPage(delta) {
    const np = Math.min(Math.max(page + delta, 0), totalPages - 1)
    setPage(np)
    setSelectedId(null)
    listPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  function limpiarFiltros() {
    setFilterDept("")
    setFilterCat("")
    setFilterMarca("")
    if (!search.trim()) {
      setArticles([])
      setHasBuscado(false)
      setError(null)
      setSelectedId(null)
    }
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
      pushToast("Error al guardar: " + (e.message ?? "Error desconocido"), "error")
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
      pushToast("Error al eliminar: " + (e.message ?? "Error desconocido"), "error")
    }
  }

  function getNextClave(categoria, departamento) {
    const prefix = (categoria?.[0] ?? "X").toUpperCase() + (departamento?.[0] ?? "X").toUpperCase()
    return prefix + (claveCounter.current++).toString().padStart(4, "0")
  }

  // Descripción del estado actual para el subtítulo
  function subtitulo() {
    if (loading) return "Buscando…"
    if (!hasBuscado) return " "
    const n = articles.length
    if (n === 0) return "Sin resultados"
    const desde = page * PAGE_SIZE + 1
    const hasta = Math.min((page + 1) * PAGE_SIZE, n)
    const parts = [`${desde}–${hasta} de ${n} artículo${n !== 1 ? "s" : ""}`]
    if (depNombre) parts.push(depNombre)
    if (catNombre) parts.push(catNombre)
    if (marNombre) parts.push(marNombre)
    return parts.join(" · ")
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="ar-root">

      {/* Encabezado */}
      <div className="ar-header">
        <div>
          <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Artículos</p>
          <p className="ar-header-meta">{subtitulo()}</p>
        </div>
        <div className="ar-header-actions">
          <button className="ar-btn-add" onClick={() => { setDrawerMode("add"); setDrawerOpen(true) }}>
            <IconPlus /> Agregar
          </button>
          <button className="ar-btn-action" disabled={!selectedId}
            onClick={() => { setDrawerMode("edit"); setDrawerOpen(true) }}>
            <IconPencil /> Editar
          </button>
          <button className="ar-btn-action" onClick={handleRefresh}
            disabled={!hasBuscado || loading}>
            <IconRefresh spinning={refreshing} /> Refrescar
          </button>
          <div className="ar-toolbar-divider" />
          <button className="ar-btn-action ar-btn-danger" disabled={!selectedId}
            onClick={() => setDeleteOpen(true)}>
            <IconTrash /> Eliminar
          </button>
        </div>
      </div>

      {/* Fila de búsqueda */}
      <div className="ar-search-row">
        <div className="ar-search-input-wrap">
          <span className="ar-search-icon"><IconSearch /></span>
          <input
            type="text"
            className="ar-input"
            placeholder="Buscar por clave, descripción…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            style={{ paddingLeft: "32px" }}
          />
        </div>
        <button className="ar-btn-action" onClick={handleBuscar}
          disabled={(!search.trim() && !hayFiltros) || loading}>
          <IconSearch /> Buscar
        </button>
      </div>

      {/* Filtros en cascada */}
      <div className="ar-filter-row">
        <IconFilter />
        <select
          className="ar-filter-select"
          value={filterDept}
          onChange={handleDeptChange}
          disabled={taxLoading}
        >
          <option value="">Todos los departamentos</option>
          {taxonomy.depts.map(d => (
            <option key={d.id} value={d.id}>{d.nombre} ({d.articulos})</option>
          ))}
        </select>

        <select
          className="ar-filter-select"
          value={filterCat}
          onChange={handleCatChange}
          disabled={taxLoading || catOptions.length === 0}
        >
          <option value="">Todas las categorías</option>
          {catOptions.map(c => (
            <option key={c.id} value={c.id}>{c.nombre} ({c.articulos})</option>
          ))}
        </select>

        <select
          className="ar-filter-select"
          value={filterMarca}
          onChange={e => setFilterMarca(e.target.value)}
          disabled={taxLoading || marcaOptions.length === 0}
        >
          <option value="">Todas las marcas</option>
          {marcaOptions.map(m => (
            <option key={m.id} value={m.id}>{m.nombre} ({m.articulos})</option>
          ))}
        </select>

        {hayFiltros && (
          <button className="ar-filter-clear" onClick={limpiarFiltros} title="Limpiar filtros">
            ✕ Limpiar
          </button>
        )}

        {taxLoading && (
          <span className="ar-filter-loading">Cargando catálogos…</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="ar-error-bar">
          {error} —{" "}
          <button onClick={handleBuscar} className="ar-error-retry">Reintentar</button>
        </div>
      )}

      {/* Contenido: lista + detalle */}
      <div className="ar-content">

        {/* Panel izquierdo — lista */}
        <div className="ar-list-panel" ref={listPanelRef}>
          {loading ? (
            <p className="ar-empty">Buscando artículos…</p>
          ) : !hasBuscado ? (
            <p className="ar-empty">Selecciona un filtro o escribe para buscar</p>
          ) : articles.length === 0 ? (
            <p className="ar-empty">
              No se encontraron artículos
              {search ? ` para «${search}»` : ""}
              {depNombre ? ` en ${depNombre}` : ""}
              {catNombre ? ` › ${catNombre}` : ""}
            </p>
          ) : (
            <>
              {pagedArticles.map((a) => {
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
                        {[a.departamento, a.categoria, a.marca].filter(Boolean).join(" › ")}
                      </p>
                    </div>
                    <div className="ar-list-right">
                      <p className="ar-list-price">${(a.aplicarIva ? a.precio1 * 1.16 : a.precio1).toFixed(2)}</p>
                      <p className={`ar-list-stock${(a.existencia ?? 0) > 0 ? " ok" : (a.existencia ?? 0) < 0 ? " neg" : " zero"}`}>
                        {a.existencia ?? 0} en stock
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="ar-pagination">
                  <button
                    className="ar-pag-btn"
                    disabled={page === 0}
                    onClick={() => goPage(-1)}
                  >
                    ‹ Anterior
                  </button>
                  <span className="ar-pag-info">
                    Página {page + 1} de {totalPages}
                  </span>
                  <button
                    className="ar-pag-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => goPage(1)}
                  >
                    Siguiente ›
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Panel derecho — detalle */}
        <div className="ar-detail-panel">
          {!selected ? (
            <div className="ar-detail-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <p>Selecciona un artículo para ver sus detalles</p>
            </div>
          ) : (
            <div className="ar-detail-view">

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

              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Inventario y Ubicación</p>
                <div className="ar-detail-rows">
                  {[
                    ["Mínimo",        selected.inventarioMin ?? "—"],
                    ["Máximo",        selected.inventarioMax ?? "—"],
                    ["Localización",  selected.localizacion || "—"],
                    ["Peso",          selected.peso ? `${selected.peso} kg` : "—"],
                    ["Venta a Granel", selected.ventaGranel ? "Sí" : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Identificación</p>
                <div className="ar-detail-rows">
                  {[
                    ["Descripción",   selected.descripcion || "—"],
                    ["Marca",         selected.marca || "—"],
                    ["Proveedor",     selected.proveedor || "—"],
                    ["Categoría",     selected.categoria || "—"],
                    ["Departamento",  selected.departamento || "—"],
                    ["Clave",         <span style={{ fontFamily: "monospace" }}>{selected.clave || "—"}</span>],
                    ["Clave Alterna", selected.claveAlterna || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

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

              <div className="ar-detail-section">
                <p className="ar-detail-section-title">Fiscal</p>
                <div className="ar-detail-rows">
                  {[
                    ["IVA",           selected.aplicarIva ? "Aplica IVA 16%" : "Exento"],
                    ["Precio Compra", `$${(selected.precioCompra ?? 0).toFixed(2)}`],
                    ["Precio Neto",   selected.precioNeto ? "Sí (sin IVA)" : "No"],
                    ["Clave SAT",     selected.claveSat || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="ar-detail-row">
                      <span className="ar-detail-label">{label}</span>
                      <span className="ar-detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ar-detail-section">
                <p className="ar-detail-section-title">
                  Precios de Venta
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: "var(--at-text-muted)" }}>
                    {selected.aplicarIva ? "(c/IVA 16%)" : "(sin IVA)"}
                  </span>
                </p>
                <div className="ar-detail-price-grid">
                  {[1, 2, 3, 4].map((n) => {
                    const base = selected[`precio${n}`] ?? 0
                    const con  = selected.aplicarIva ? base * 1.16 : base
                    return (
                      <div key={n} className="ar-detail-price-item">
                        <p className="ar-detail-price-label">Precio {n}</p>
                        <p className="ar-detail-price-value">${con.toFixed(2)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {selected.especificaciones?.length > 0 && (
                <div className="ar-detail-section">
                  <p className="ar-detail-section-title">Especificaciones</p>
                  <div className="ar-detail-rows">
                    {selected.especificaciones.map((esp, i) => (
                      <div key={i} className="ar-detail-row">
                        <span className="ar-detail-label">{esp.clave}</span>
                        <span className="ar-detail-value">{esp.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

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

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 5000, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              background: t.type === "error" ? "#dc2626" : "#16a34a",
              color: "#fff", borderRadius: 8, padding: "10px 18px",
              fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
              minWidth: 200, maxWidth: 360,
            }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
