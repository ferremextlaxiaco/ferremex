import { useEffect, useState, useMemo } from "react"
import { Search, X, Check } from "lucide-react"
import { listarCatalogos } from "../lib/client"

/**
 * Toolbar del módulo de Ajuste de Inventario.
 *
 * Dos vías para cargar artículos al ajuste:
 *  1. Buscador por nombre/clave/código (texto = fonético, número = SKU exacto).
 *  2. Filtros de taxonomía Dept→Cat→Marca (cascada vía listarCatalogos) para
 *     agregar al ajuste TODOS los artículos de una categoría de golpe (por lote).
 *
 * Presentacional: recibe callbacks por props (onBuscar, onCargarLote, onConfirmar,
 * onLimpiar). No tiene estado de negocio; solo el de su propia UI (query, filtros).
 */
export function InventarioToolbar({
  buscando,
  cargandoLote,
  numCambios,
  hayCambios,
  guardando,
  onBuscar,
  onCargarLote,
  onConfirmar,
  onLimpiar,
}) {
  const [query, setQuery] = useState("")
  const [taxonomia, setTaxonomia] = useState({ depts: [], cats: [], marcas: [] })
  const [filtros, setFiltros] = useState({ departamento: "", categoria: "", marca: "" })

  // Cargar taxonomía una vez (única fuente: listarCatalogos).
  useEffect(() => {
    let on = true
    listarCatalogos()
      .then((d) => { if (on) setTaxonomia(d) })
      .catch(() => { /* sin taxonomía los filtros quedan vacíos; el buscador sigue */ })
    return () => { on = false }
  }, [])

  // Cascada Dept→Cat→Marca (patrón canónico del POS).
  const deptItem = useMemo(
    () => taxonomia.depts.find((d) => d.nombre === filtros.departamento) ?? null,
    [taxonomia.depts, filtros.departamento]
  )
  const catsOpts = useMemo(
    () => (deptItem ? taxonomia.cats.filter((c) => c.depId === deptItem.id) : []),
    [taxonomia.cats, deptItem]
  )
  const catItem = useMemo(
    () => catsOpts.find((c) => c.nombre === filtros.categoria) ?? null,
    [catsOpts, filtros.categoria]
  )
  const marcasOpts = useMemo(
    () => (catItem ? taxonomia.marcas.filter((m) => m.catId === catItem.id) : []),
    [taxonomia.marcas, catItem]
  )

  function setDepartamento(v) { setFiltros({ departamento: v, categoria: "", marca: "" }) }
  function setCategoria(v) { setFiltros((f) => ({ ...f, categoria: v, marca: "" })) }
  function setMarca(v) { setFiltros((f) => ({ ...f, marca: v })) }

  function buscar() {
    const t = query.trim()
    if (t) onBuscar(t)
  }

  function cargarLote() {
    if (!filtros.departamento && !filtros.categoria) return
    onCargarLote(filtros)
  }

  const selectCls =
    "border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-orange-500 disabled:opacity-50 disabled:bg-gray-50"

  return (
    <div className="flex flex-col gap-3">
      {/* Fila 1: título + buscador + confirmar */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900 mr-auto">Ajuste de Inventario</h2>

        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              autoComplete="off"
              placeholder="Buscar por nombre, clave o código…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buscar() }}
              className="w-72 border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            onClick={buscar}
            disabled={buscando || !query.trim()}
            className="flex items-center gap-1.5 bg-orange-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            <Search size={15} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>

        <button
          onClick={onConfirmar}
          disabled={guardando || !hayCambios}
          className={`flex items-center gap-1.5 bg-green-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-green-700
            ${guardando || !hayCambios ? "opacity-40 pointer-events-none" : ""}`}
        >
          <Check size={16} /> {guardando ? "Guardando…" : "Confirmar ajuste"}
          {hayCambios && (
            <span className="bg-white text-green-700 rounded-full text-xs font-bold px-1.5 min-w-[20px] text-center">
              {numCambios}
            </span>
          )}
        </button>
      </div>

      {/* Fila 2: filtros de taxonomía (cargar por lote) + limpiar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide mr-1">Por categoría:</span>
        <select className={selectCls} value={filtros.departamento} onChange={(e) => setDepartamento(e.target.value)}>
          <option value="">Departamento…</option>
          {taxonomia.depts.map((d) => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
        </select>
        <select className={selectCls} value={filtros.categoria} onChange={(e) => setCategoria(e.target.value)} disabled={!deptItem}>
          <option value="">Categoría…</option>
          {catsOpts.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>
        <select className={selectCls} value={filtros.marca} onChange={(e) => setMarca(e.target.value)} disabled={!catItem}>
          <option value="">Marca (opcional)…</option>
          {marcasOpts.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
        </select>
        <button
          onClick={cargarLote}
          disabled={cargandoLote || (!filtros.departamento && !filtros.categoria)}
          className="bg-white border border-gray-300 text-gray-700 rounded-lg px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          {cargandoLote ? "Cargando…" : "Agregar al ajuste"}
        </button>

        <button
          onClick={onLimpiar}
          className="ml-auto flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 px-3 py-2.5"
          title="Vaciar la lista de ajuste"
        >
          <X size={15} /> Limpiar todo
        </button>
      </div>
    </div>
  )
}
