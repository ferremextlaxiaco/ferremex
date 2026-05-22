import { useState, useEffect } from "react"
import { Search, Zap, Loader } from "lucide-react"
import { listarCatalogos, listarArticulos } from "../lib/client"

function normalizar(art) {
  return {
    ...art,
    minimo:             art.inventarioMin ?? 0,
    unidad:             art.unidadVenta  || art.unidadCompra || "Pieza",
    ultimoPrecioCompra: art.precioCompra ?? 0,
  }
}

export default function PedidosFiltros({
  filtros, onFiltrosChange,
  rows,
  searchQ, setSearchQ,
  onAddArticulo, onCargarFaltantes,
}) {
  const [searchResults, setSearchResults] = useState([])
  const [searched,      setSearched]      = useState(false)
  const [searching,     setSearching]     = useState(false)
  const [taxonomia,     setTaxonomia]     = useState(null)

  useEffect(() => {
    listarCatalogos().then(setTaxonomia).catch(() => {})
  }, [])

  // Opciones derivadas en cascada
  const deptItem   = taxonomia?.depts.find(d => d.nombre === filtros.departamento) ?? null
  const catsOpts   = deptItem ? (taxonomia?.cats.filter(c => c.depId === deptItem.id) ?? []) : []
  const catItem    = catsOpts.find(c => c.nombre === filtros.categoria) ?? null
  const marcasOpts = catItem  ? (taxonomia?.marcas.filter(m => m.catId === catItem.id) ?? []) : []

  function setDept(val) {
    onFiltrosChange(prev => ({ ...prev, departamento: val, categoria: "", marca: "" }))
  }
  function setCat(val) {
    onFiltrosChange(prev => ({ ...prev, categoria: val, marca: "" }))
  }
  function setMarca(val) {
    onFiltrosChange(prev => ({ ...prev, marca: val }))
  }

  async function doSearch() {
    const q = searchQ.trim()
    if (!q) { setSearchResults([]); setSearched(false); return }
    setSearching(true)
    try {
      const arts = await listarArticulos(q)
      setSearchResults(arts.map(normalizar))
      setSearched(true)
    } catch {
      setSearchResults([])
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  const addedIds = new Set(rows.map(r => r.articuloId))

  return (
    <div className="pdx-left">
      <p className="pdx-panel-title">Filtros rápidos</p>

      <div className="pdx-toggle-row">
        <span className="pdx-toggle-label">Solo artículos bajo mínimo</span>
        <button
          type="button"
          role="switch"
          aria-checked={filtros.soloFaltantes}
          className={`pdx-toggle${filtros.soloFaltantes ? " on" : ""}`}
          onClick={() => onFiltrosChange(prev => ({ ...prev, soloFaltantes: !prev.soloFaltantes }))}
        >
          <span className="pdx-toggle-thumb" />
        </button>
      </div>

      <div className="pdx-filter-row">
        <span className="pdx-filter-label">Departamento</span>
        <select
          className="pdx-select"
          value={filtros.departamento}
          onChange={e => setDept(e.target.value)}
        >
          <option value="">Todos</option>
          {(taxonomia?.depts ?? []).map(d => (
            <option key={d.id} value={d.nombre}>{d.nombre}</option>
          ))}
        </select>
      </div>

      <div className="pdx-filter-row">
        <span className="pdx-filter-label">Categoría</span>
        <select
          className="pdx-select"
          value={filtros.categoria}
          onChange={e => setCat(e.target.value)}
          disabled={!filtros.departamento}
        >
          <option value="">Todas</option>
          {catsOpts.map(c => (
            <option key={c.id} value={c.nombre}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <div className="pdx-filter-row">
        <span className="pdx-filter-label">Marca</span>
        <select
          className="pdx-select"
          value={filtros.marca}
          onChange={e => setMarca(e.target.value)}
          disabled={!filtros.categoria}
        >
          <option value="">Todas</option>
          {marcasOpts.map(m => (
            <option key={m.id} value={m.nombre}>{m.nombre}</option>
          ))}
        </select>
      </div>

      <button
        className="ar-btn-add"
        style={{ width: "100%", justifyContent: "center", gap: 6 }}
        disabled={!filtros.departamento && !filtros.categoria && !filtros.marca}
        onClick={onCargarFaltantes}
      >
        <Zap size={14} /> Cargar faltantes
      </button>

      <div className="pdx-divider" />

      <p className="pdx-panel-title">Búsqueda manual</p>

      <div className="pdx-search-bar">
        <input
          className="pdx-search-input"
          placeholder="Clave o nombre…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doSearch()}
        />
        <button
          className="ar-btn-action"
          style={{ padding: "6px 10px", flexShrink: 0 }}
          disabled={searching}
          onClick={doSearch}
        >
          {searching
            ? <Loader size={14} style={{ animation: "spin 1s linear infinite" }} />
            : <Search size={14} />}
        </button>
      </div>

      {searched && searchResults.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--at-text-muted)", textAlign: "center" }}>Sin resultados</p>
      )}

      {searchResults.length > 0 && (
        <div className="pdx-results-list">
          {searchResults.map(art => {
            const isAdded = addedIds.has(art.id)
            const bajo    = art.existencia < art.minimo
            return (
              <div
                key={art.id}
                className={`pdx-result-item${isAdded ? " added" : ""}`}
                onClick={() => !isAdded && onAddArticulo(art)}
                title={isAdded ? "Ya está en el pedido" : "Clic para agregar"}
              >
                <div className="pdx-ri-sku">{art.clave}</div>
                <div className="pdx-ri-name">{art.descripcion}</div>
                <div className="pdx-ri-meta">
                  <span className={bajo ? "pdx-ri-bajo" : ""}>
                    {bajo ? `⚠ ${art.existencia}/${art.minimo}` : `${art.existencia} en stock`}
                  </span>
                  <span>${art.ultimoPrecioCompra.toFixed(2)}</span>
                  {isAdded && <span style={{ color: "var(--at-green)", fontWeight: 700 }}>✓ Agregado</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
