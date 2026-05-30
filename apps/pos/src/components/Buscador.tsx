import { useRef, useState, useMemo, useEffect } from "react"
import { buscarProductos, listarPaquetes, type FiltrosBusqueda, type ProductoPOS, type Paquete } from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { prepararLineasPaquete } from "../lib/paquetes"
import { FiltroBar, type FiltroStock } from "./FiltroBar"
import { GridProductos } from "./GridProductos"
import { GridPaquetes } from "./GridPaquetes"
import { ProductoDetalle } from "./ProductoDetalle"

export function Buscador() {
  const { state, dispatch } = usePOS()
  const cartMap = useMemo(
    () => new Map(state.items.map((i) => [i.sku, i.cantidad])),
    [state.items]
  )
  const [query, setQuery] = useState("")
  const [filtros, setFiltros] = useState<FiltrosBusqueda>({})
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos")
  const [resultados, setResultados] = useState<ProductoPOS[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<ProductoPOS | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Paquetes: para el badge 📦 en el grid y para mostrarlos como resultados
  // vendibles. Carga única al montar.
  const [paquetes, setPaquetes] = useState<Paquete[]>([])
  const [aplicandoPkg, setAplicandoPkg] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    listarPaquetes()
      .then((p) => { if (on) setPaquetes(p) })
      .catch(() => {})
    return () => { on = false }
  }, [])

  const skusEnPaquete = useMemo(
    () => new Set(paquetes.flatMap((p) => p.componentes.map((c) => c.sku))),
    [paquetes]
  )

  // Paquetes que coinciden con el texto buscado (por nombre). Solo cuando hay
  // texto, para no saturar el grid con filtros de taxonomía.
  const paquetesCoincidentes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return paquetes.filter((p) => p.nombre.toLowerCase().includes(q))
  }, [query, paquetes])

  const paquetesAplicados = useMemo(
    () => new Set(state.items.map((i) => i.paquete_id).filter(Boolean) as string[]),
    [state.items]
  )

  async function aplicarPaquete(p: Paquete) {
    setAplicandoPkg(p.id)
    setError(null)
    try {
      const res = await prepararLineasPaquete(p)
      if (!res.ok) {
        setError(res.motivo === "sin_stock"
          ? `No se puede armar «${p.nombre}»: sin existencia de ${res.faltantes.join(", ")}.`
          : "No se pudo verificar el inventario del paquete.")
        return
      }
      dispatch({ type: "ADD_PAQUETE", paqueteId: p.id, paqueteNombre: p.nombre, lineas: res.lineas })
    } finally {
      setAplicandoPkg(null)
    }
  }

  async function buscar(q: string, filtrosExtra?: FiltrosBusqueda) {
    const filtrosEfectivos = filtrosExtra ?? filtros
    const texto = q.trim()

    // Si no hay texto ni filtros activos, no buscar
    if (!texto && !filtrosEfectivos.category_id && !filtrosEfectivos.departamento) return

    setBuscando(true)
    setError(null)
    setSeleccionado(null)
    try {
      const res = await buscarProductos({
        ...filtrosEfectivos,
        ...(texto ? { q: texto } : {}),
      })
      setResultados(res)
      // Un único resultado con stock: abrir detalle directamente
      if (res.length === 1 && res[0] && res[0].existencia > 0) {
        setSeleccionado(res[0])
      }
    } catch {
      setError("Error al buscar. Verifica la conexión con el servidor.")
    } finally {
      setBuscando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") buscar(query)
    if (e.key === "Escape") {
      if (seleccionado) { setSeleccionado(null); return }
      setResultados([])
      setQuery("")
      setFiltros({})
    }
  }

  function handleFiltrosChange(nuevos: FiltrosBusqueda) {
    setFiltros(nuevos)
    setSeleccionado(null)
    // Si hay un filtro activo (departamento o categoría), buscar automáticamente
    if (nuevos.departamento || nuevos.category_id) {
      buscar(query, nuevos)
    } else if (!query.trim()) {
      // Filtros limpiados y sin texto: limpiar resultados
      setResultados([])
    }
  }

  function handleVolver() {
    setSeleccionado(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const resultadosFiltrados = resultados.filter((r) => {
    if (filtroStock === "con-stock" && r.existencia <= 0) return false
    if (filtroStock === "sin-stock" && r.existencia > 0) return false
    if (filtros.marca && r.marca !== filtros.marca) return false
    return true
  })

  const tieneResultados = resultadosFiltrados.length > 0

  return (
    <div className="buscador">
      <div className="buscador-input-row">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          className="buscador-input"
          placeholder="🔍  Buscar producto o código de barras…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-primary" onClick={() => buscar(query)} disabled={buscando}>
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {/* Barra de filtros */}
      <FiltroBar
        filtros={filtros}
        onChange={handleFiltrosChange}
        filtroStock={filtroStock}
        onFiltroStockChange={setFiltroStock}
      />

      {error && <p className="error-text">{error}</p>}

      {/* Vista detalle de producto */}
      {seleccionado && (
        <ProductoDetalle
          producto={seleccionado}
          onVolver={handleVolver}
        />
      )}

      {/* Paquetes que coinciden con la búsqueda (se venden como combo) */}
      {!seleccionado && paquetesCoincidentes.length > 0 && (
        <GridPaquetes
          paquetes={paquetesCoincidentes}
          aplicados={paquetesAplicados}
          aplicando={aplicandoPkg}
          onAplicar={aplicarPaquete}
        />
      )}

      {/* Grid de resultados (oculto cuando hay producto seleccionado) */}
      {!seleccionado && tieneResultados && (
        <>
          <p className="resultados-conteo">{resultadosFiltrados.length} producto{resultadosFiltrados.length !== 1 ? "s" : ""} encontrado{resultadosFiltrados.length !== 1 ? "s" : ""}</p>
          <GridProductos
            productos={resultadosFiltrados}
            onSeleccionar={setSeleccionado}
            cartMap={cartMap}
            skusEnPaquete={skusEnPaquete}
            onAgregar={(p) => dispatch({ type: "ADD_ITEM", item: { sku: p.sku, descripcion: p.descripcion, precio: p.precio, precio2: p.precio2, existencia: p.existencia, mayoreoActivo: p.mayoreoActivo, mayoreoMin: p.mayoreoMin } })}
            onQuitar={(sku) => dispatch({ type: "DECREMENT", sku })}
          />
        </>
      )}

      {!seleccionado && !tieneResultados && query && !buscando && (
        <p className="sin-resultados">Sin resultados para "{query}"</p>
      )}
    </div>
  )
}
