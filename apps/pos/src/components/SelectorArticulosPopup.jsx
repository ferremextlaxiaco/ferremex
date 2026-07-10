import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Search, X, Filter, ImageOff, Check, Plus, Package } from "lucide-react"
import { listarArticulos, listarArticulosDeCatalogo } from "../lib/client"
import { formatMXN } from "../lib/format"

/**
 * Popup de selección de artículos con estilo cristal (glassmorphism).
 *
 * Buscador por texto + filtros de taxonomía Dept→Cat→Marca en cascada + grid de
 * resultados con miniaturas + paginación. Extraído de PaquetesPanel para reusarse
 * en otros módulos (Ajuste de Inventario, etc.).
 *
 * `anchorMode` controla el posicionamiento:
 *   - "drawer": fijo a la izquierda de un drawer lateral (uso original en Paquetes).
 *   - "inline": anclado bajo la barra de búsqueda del módulo (uso en Inventario).
 *
 * Cumple el Contrato de Conexión: datos por client.ts (listarArticulos /
 * listarArticulosDeCatalogo), taxonomía recibida por props (cargada vía
 * listarCatalogos por el dueño del estado), feedback vía pushToast.
 *
 * Modos:
 *   - clic-inmediato (default): un clic en una card llama onAgregar(art).
 *   - multiSelect: la card marca/desmarca (onToggle); un footer "Agregar N
 *     seleccionados" llama onConfirmarSeleccion(). La selección la posee el
 *     padre (controlada vía `seleccionados`), para que persista al cerrar/reabrir.
 *
 * Props:
 *   open, onClose, onAgregar(art), yaAgregados (Set de SKUs ya en la lista),
 *   taxonomy ({depts, cats, marcas}), taxLoading, pushToast,
 *   anchorMode ("drawer" | "inline"), titulo, agregarTitulo.
 *   multiSelect, seleccionados (Set de SKUs), onToggle(art), onConfirmarSeleccion().
 */

const SEL_PAGE_SIZE = 40 // mismo tamaño de página que ArticlesModule

export default function SelectorArticulosPopup({
  open,
  onClose,
  onAgregar,
  yaAgregados,
  taxonomy,
  taxLoading,
  pushToast,
  anchorMode = "drawer",
  titulo = "Buscar artículos",
  agregarTitulo = "Agregar",
  multiSelect = false,
  seleccionados,
  onToggle,
  onConfirmarSeleccion,
}) {
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [hasBuscado, setHasBuscado] = useState(false)
  const [fDept, setFDept] = useState("")   // dep-id
  const [fCat, setFCat] = useState("")     // cat-id
  const [fMarca, setFMarca] = useState("") // mar-id
  // Filtro de existencia CÍCLICO: "todos" → "con-stock" → "sin-stock" → "todos".
  const [fStock, setFStock] = useState("todos")
  const [page, setPage] = useState(0)
  const inputRef = useRef(null)
  const gridRef = useRef(null)

  // Cascada derivada de la taxonomía (mismo patrón que ArticlesModule)
  const cats = (taxonomy?.cats ?? []).filter((c) => !fDept || c.depId === fDept)
  const marcas = (taxonomy?.marcas ?? []).filter((m) => !fCat || m.catId === fCat)
  const depNombre = (taxonomy?.depts ?? []).find((d) => d.id === fDept)?.nombre ?? ""
  const catNombre = (taxonomy?.cats ?? []).find((c) => c.id === fCat)?.nombre ?? ""
  const marNombre = (taxonomy?.marcas ?? []).find((m) => m.id === fMarca)?.nombre ?? ""
  const hayFiltros = fDept || fCat || fMarca

  const buscar = useCallback(async (texto, dep, cat, mar) => {
    const q = (texto ?? "").trim()
    const hayTaxo = dep || cat || mar
    if (!q && !hayTaxo) { setResultados([]); setHasBuscado(false); return }
    setBuscando(true); setHasBuscado(true)
    try {
      let data
      if (q) {
        data = await listarArticulos(q)
        if (hayTaxo) {
          data = data.filter((a) => {
            if (dep && a.departamento !== dep) return false
            if (cat && a.categoria !== cat) return false
            if (mar && a.marca !== mar) return false
            return true
          })
        }
      } else {
        data = await listarArticulosDeCatalogo(dep, cat)
        if (mar) data = data.filter((a) => a.marca === mar)
      }
      setResultados(data)
      setPage(0) // nueva búsqueda → volver a la primera página
    } catch {
      pushToast?.("Error al buscar artículos", "error")
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [pushToast])

  // Filtro de existencia sobre los resultados ya cargados (sin re-buscar).
  const resultadosFiltrados = useMemo(() => {
    if (fStock === "con-stock") return resultados.filter((a) => (a.existencia ?? 0) > 0)
    if (fStock === "sin-stock") return resultados.filter((a) => (a.existencia ?? 0) <= 0)
    return resultados
  }, [resultados, fStock])

  // Paginación de resultados (mismo patrón useMemo + slice que ArticlesModule)
  const totalPages = Math.max(1, Math.ceil(resultadosFiltrados.length / SEL_PAGE_SIZE))
  const pageItems = useMemo(
    () => resultadosFiltrados.slice(page * SEL_PAGE_SIZE, (page + 1) * SEL_PAGE_SIZE),
    [resultadosFiltrados, page]
  )
  function goPage(delta) {
    setPage((p) => {
      const np = Math.min(Math.max(p + delta, 0), totalPages - 1)
      return np
    })
    gridRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Auto-buscar al cambiar filtros de taxonomía
  useEffect(() => {
    if (!open) return
    if (fDept || fCat || fMarca) buscar(busqueda, depNombre, catNombre, marNombre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fDept, fCat, fMarca, open])

  // Foco al abrir
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])

  if (!open) return null

  return (
    <div className={`pk-sel-popup pk-sel-${anchorMode}`} onClick={(e) => e.stopPropagation()}>
      <div className="pk-sel-header">
        <span className="pk-sel-title"><Search size={16} /> {titulo}</span>
        <button className="pk-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      </div>

      {/* Búsqueda por texto */}
      <div className="pk-sel-search">
        <Search size={15} className="pk-search-icon" />
        <input
          ref={inputRef}
          className="pk-input" style={{ paddingLeft: 32 }}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") buscar(busqueda, depNombre, catNombre, marNombre) }}
          placeholder="Buscar por clave o descripción…"
        />
        <button className="pk-btn-sec" onClick={() => buscar(busqueda, depNombre, catNombre, marNombre)} disabled={buscando}>
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {/* Filtros de taxonomía en cascada */}
      <div className="pk-sel-filtros">
        <Filter size={13} style={{ color: "#9ca3af", flexShrink: 0 }} />
        <select className="pk-sel-select" value={fDept} disabled={taxLoading}
          onChange={(e) => { setFDept(e.target.value); setFCat(""); setFMarca("") }}>
          <option value="">Todos los departamentos</option>
          {(taxonomy?.depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <select className="pk-sel-select" value={fCat} disabled={taxLoading || cats.length === 0}
          onChange={(e) => { setFCat(e.target.value); setFMarca("") }}>
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="pk-sel-select" value={fMarca} disabled={taxLoading || marcas.length === 0}
          onChange={(e) => setFMarca(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        {/* Filtro de existencia CÍCLICO: clic alterna todos → con → sin existencia. */}
        <button
          type="button"
          className={`pk-sel-stock-btn${fStock !== "todos" ? " on" : ""}`}
          onClick={() => { setFStock(fStock === "todos" ? "con-stock" : fStock === "con-stock" ? "sin-stock" : "todos"); setPage(0) }}
          title="Clic para alternar: Todos → Con existencia → Sin existencia"
        >
          <Package size={14} /> {
            fStock === "con-stock" ? "Con existencia"
            : fStock === "sin-stock" ? "Sin existencia"
            : "Existencia"
          }
        </button>
        {(hayFiltros || fStock !== "todos") && (
          <button className="pk-filter-clear" onClick={() => { setFDept(""); setFCat(""); setFMarca(""); setFStock("todos"); setPage(0); if (!busqueda.trim()) { setResultados([]); setHasBuscado(false) } }}>
            ✕
          </button>
        )}
      </div>

      {/* Contador de resultados (ya filtrados por existencia) */}
      {hasBuscado && !buscando && resultadosFiltrados.length > 0 && (
        <div className="pk-sel-count">
          {resultadosFiltrados.length} artículo{resultadosFiltrados.length !== 1 ? "s" : ""}
          {fStock !== "todos" && <> ({fStock === "con-stock" ? "con existencia" : "sin existencia"})</>}
          {totalPages > 1 && <> · pág. {page + 1}/{totalPages}</>}
        </div>
      )}

      {/* Grid de resultados con imágenes */}
      <div className="pk-sel-grid" ref={gridRef}>
        {buscando ? (
          <p className="pk-sel-empty">Buscando…</p>
        ) : !hasBuscado ? (
          <p className="pk-sel-empty">Escribe o elige un filtro para buscar artículos.</p>
        ) : resultados.length === 0 ? (
          <p className="pk-sel-empty">Sin resultados.</p>
        ) : resultadosFiltrados.length === 0 ? (
          <p className="pk-sel-empty">
            Ningún artículo {fStock === "con-stock" ? "con existencia" : "sin existencia"} en estos resultados.
          </p>
        ) : (
          pageItems.map((a) => {
            const sku = a.clave || a.claveAlterna
            const yaEnLista = yaAgregados?.has(sku)
            const marcado = multiSelect && seleccionados?.has(sku)
            // En multiSelect: clic alterna la marca (salvo que ya esté en la lista).
            // En clic-inmediato: clic agrega y cierra (comportamiento de Paquetes).
            const onClickCard = () => {
              if (yaEnLista) return
              if (multiSelect) onToggle?.(a)
              else onAgregar?.(a)
            }
            return (
              <button
                key={a.id}
                className={`pk-sel-card${yaEnLista ? " agregado" : ""}${marcado ? " marcado" : ""}`}
                onClick={onClickCard}
                disabled={yaEnLista}
                title={yaEnLista ? "Ya está en la lista" : marcado ? "Quitar de la selección" : agregarTitulo}
              >
                {/* En multiSelect, un checkbox a la izquierda comunica la selección múltiple. */}
                {multiSelect && (
                  <span className={`pk-sel-check${marcado || yaEnLista ? " on" : ""}`} aria-hidden="true">
                    {(marcado || yaEnLista) && <Check size={13} strokeWidth={3} />}
                  </span>
                )}
                <div className="pk-sel-card-img">
                  {a.thumbnail ? <img src={a.thumbnail} alt="" loading="lazy" /> : <ImageOff size={20} />}
                </div>
                <div className="pk-sel-card-info">
                  <span className="pk-sel-card-name">{a.descripcion}</span>
                  <span className="pk-sel-card-meta">
                    <span className="pk-sel-card-sku">{sku}</span> · {formatMXN(a.precio1 ?? 0)} ·{" "}
                    <span className={(a.existencia ?? 0) > 0 ? "pk-stock-ok" : "pk-stock-zero"}>{a.existencia ?? 0} stk</span>
                  </span>
                </div>
                {/* En clic-inmediato (Paquetes) se conserva el botón +/✓ a la derecha. */}
                {!multiSelect && (
                  <span className="pk-sel-card-action">
                    {yaEnLista ? <Check size={16} /> : <Plus size={16} />}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Paginación */}
      {hasBuscado && !buscando && totalPages > 1 && (
        <div className="pk-sel-pag">
          <button className="pk-sel-pag-btn" disabled={page === 0} onClick={() => goPage(-1)}>
            ‹ Anterior
          </button>
          <span className="pk-sel-pag-info">Página {page + 1} de {totalPages}</span>
          <button className="pk-sel-pag-btn" disabled={page >= totalPages - 1} onClick={() => goPage(1)}>
            Siguiente ›
          </button>
        </div>
      )}

      {/* Footer de selección múltiple: confirma todo el lote marcado de una vez */}
      {multiSelect && (
        <div className="pk-sel-footer">
          <span className="pk-sel-footer-count">
            {seleccionados?.size ?? 0} seleccionado{(seleccionados?.size ?? 0) !== 1 ? "s" : ""}
          </span>
          <button
            className="pk-sel-footer-btn"
            disabled={!seleccionados || seleccionados.size === 0}
            onClick={() => onConfirmarSeleccion?.()}
          >
            <Check size={15} /> Agregar seleccionados
          </button>
        </div>
      )}
    </div>
  )
}
