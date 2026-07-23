import { useRef, useState, useMemo, useEffect } from "react"
import { buscarProductos, listarPaquetes, type FiltrosBusqueda, type ProductoPOS, type Paquete } from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { prepararLineasPaquete } from "../lib/paquetes"
import { FiltroBar, type FiltroStock } from "./FiltroBar"
import { GridProductos } from "./GridProductos"
import { GridPaquetes } from "./GridPaquetes"
import { ProductoDetalle } from "./ProductoDetalle"
import { DesglosePaqueteModal } from "./DesglosePaqueteModal"
import { PresentacionSelectorModal } from "./PresentacionSelectorModal"
import { nombreUnidad } from "../lib/unidades-sat"
import type { OpcionPresentacion } from "../lib/client"
import { factorABase, factorDesdeMenor, nivelesDesdeLegacy, nivelBase } from "../lib/niveles"

export function Buscador() {
  const { state, dispatch } = usePOS()
  const cartMap = useMemo(
    () => new Map(state.items.map((i) => [i.sku, i.cantidad])),
    [state.items]
  )
  const [query, setQuery] = useState("")
  // Texto REALMENTE buscado (solo se actualiza al ejecutar buscar() — Enter o
  // botón Buscar), a diferencia de `query` que cambia en cada tecla. Los
  // paquetes se filtran contra este, igual que los productos, para no mostrar
  // resultados prematuros con una sola letra tecleada.
  const [queryBuscada, setQueryBuscada] = useState("")
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
  const [paqueteDesglose, setPaqueteDesglose] = useState<Paquete | null>(null)
  // Artículo con cadena de N niveles de unidad (Pieza→Bolsa→Caja…, inventario
  // real o informativo tipo Arena): producto cuyo selector de nivel está abierto.
  const [nivelesSel, setNivelesSel] = useState<ProductoPOS | null>(null)

  // Cadena de N niveles del producto (Pieza→Bolsa→Caja…) — si el backend no
  // trajo `nivelesUnidad` (respuesta vieja en caché), se deriva en cliente del
  // mismo shape legacy. Nunca queda sin cadena equivalente.
  const cadenaNiveles = useMemo(() => {
    if (!nivelesSel) return []
    return nivelesSel.nivelesUnidad?.length
      ? nivelesSel.nivelesUnidad
      : nivelesDesdeLegacy(nivelesSel)
  }, [nivelesSel])

  // Presentaciones sintéticas para el selector: una opción POR NIVEL de la
  // cadena. Con INVENTARIO REAL, el tope/agotado es por existencia (piezas
  // reales ÷ factorABase(nivel), piso) y el backend valida/bloquea. Con
  // INVENTARIO INFORMATIVO (ej. Arena), no hay tope: el agotado es el switch
  // manual `nivel.agotado`, y la venta nunca se bloquea por stock.
  const presentacionesNiveles = useMemo<OpcionPresentacion[]>(() => {
    if (!nivelesSel || cadenaNiveles.length === 0) return []
    const informativo = !!nivelesSel.inventarioInformativo
    // `producto.existencia` ya viene del backend expresada en la unidad MÁS
    // PEQUEÑA de la cadena (ej. Pieza — ver existenciaEnUnidadMenor en
    // packages/api). El tope de cada nivel se calcula dividiendo entre
    // `factorDesdeMenor` (cuántas piezas componen 1 unidad de ese nivel).
    const existenciaMenor = nivelesSel.existencia
    // `factor` (hacia la BASE DE INVENTARIO real, ej. Bolsa si así factura el
    // proveedor) es el que se envía al backend para descontar/validar stock —
    // no cambia. El texto "≈ N unidad" del selector, en cambio, siempre se
    // expresa hacia el nivel INMEDIATO ANTERIOR en la cadena (ej. Caja ≈ 5
    // Bolsa, Bolsa ≈ 10 Pieza): es el mismo factor ya capturado en "Factor (×
    // nivel anterior)" del drawer, sin acumular niveles adicionales.
    const nombreBase = nombreUnidad(nivelBase(cadenaNiveles)?.nombre ?? "")
    return cadenaNiveles.map((nivel, idx) => {
      const factor = factorABase(cadenaNiveles, nivel.id)
      const factorMenorNivel = factorDesdeMenor(cadenaNiveles, nivel.id)
      const anterior = idx > 0 ? cadenaNiveles[idx - 1] : null
      return {
        id: nivel.id,
        nombre: nombreUnidad(nivel.nombre),
        precio: nivel.precio1,
        factor,
        agotado: informativo ? !!nivel.agotado : Math.floor(existenciaMenor / factorMenorNivel) <= 0,
        unidadBase: nombreBase,
        factorMenor: nivel.factorDesdeAnterior ?? undefined,
        unidadMenor: anterior ? nombreUnidad(anterior.nombre) : undefined,
      }
    })
  }, [nivelesSel, cadenaNiveles])

  // Confirma la venta por CUALQUIER nivel de la cadena (inventario real o
  // informativo). Todas usan el SKU REAL del producto como `skuBase`: el
  // `sku` de la línea en el carrito es compuesto (`real::nivelId`) para que
  // cada nivel pueda vivir como su propia línea — necesario para la
  // auto-consolidación (ver lib/niveles.ts, consolidarCarrito; se salta sola
  // si el artículo es informativo). `factorNivelABase`/`cadenaNiveles` viajan
  // en la línea para que el reducer pueda consolidar sin re-consultar el
  // producto, y para que ModalCobro arme `unidad_compra_factor` al cobrar.
  function agregarPorNivel({ producto, presentacion, cantidad }:
    { producto: ProductoPOS; presentacion: OpcionPresentacion; cantidad: number }) {
    const nivel = cadenaNiveles.find((n) => n.id === presentacion.id)
    if (!nivel) return
    const esBase = nivel.esBaseInventario
    const informativo = !!producto.inventarioInformativo
    // `factor` (hacia la BASE de inventario real, ej. Bolsa) alimenta
    // `unidad_compra_factor` — lo que el backend usa para descontar del
    // inventory item real. `factorMenorNivel` (hacia Pieza, la unidad en que
    // ya viene `producto.existencia`) es el correcto para el TOPE mostrado en
    // la línea del carrito — no deben confundirse.
    const factor = presentacion.factor ?? 1
    const factorMenorNivel = factorDesdeMenor(cadenaNiveles, nivel.id)
    const skuLinea = `${producto.sku}::${nivel.id}`
    dispatch({
      type: "ADD_ITEM",
      item: {
        sku: skuLinea,
        descripcion: `${producto.descripcion} — ${presentacion.nombre}`,
        precio: nivel.precio1,
        precio2: nivel.precio2,
        precio3: nivel.precio3,
        precio4: nivel.precio4,
        impuesto: producto.impuesto,
        // Inventario informativo: sin tope (estimado, nunca bloquea). Inventario
        // real: tope en la MISMA unidad que se está capturando (existencia ya
        // en Pieza ÷ factorMenorNivel, piso).
        existencia: informativo ? Number.MAX_SAFE_INTEGER : Math.floor(producto.existencia / factorMenorNivel),
        // El mayoreo solo tiene sentido en el nivel donde ya existía (el de
        // inventario/compra); en el nivel base (venta suelta) no aplica.
        mayoreoActivo: esBase ? false : nivel.mayoreoActivo,
        mayoreoMin: esBase ? undefined : nivel.mayoreoMin,
        marca: producto.marca,
        departamento: producto.departamento,
        categoria: producto.categoria,
        proveedor: producto.proveedor,
        proveedor_id: producto.proveedor_id,
        inventarioInformativo: informativo,
        // El backend generaliza el descuento/validación de inventario vía
        // `unidad_compra_factor`; con informativo, salta la validación de
        // stock pero descuenta igual (puede ir a negativo) — ver /caja/ventas.
        ...(!esBase || informativo ? { esUnidadCompra: true, unidadCompraNombre: presentacion.nombre, compraVentaFactor: factor } : {}),
        nivelId: nivel.id,
        factorNivelABase: factor,
        cadenaNiveles,
        skuBase: producto.sku,
      },
    })
    if (cantidad !== 1) {
      dispatch({ type: "SET_CANTIDAD", sku: skuLinea, cantidad })
    }
    // Si se abrió desde el detalle del producto, regresa a resultados (mismo
    // comportamiento que handleAgregar en ProductoDetalle).
    setSeleccionado(null)
  }
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

  // Paquetes que coinciden con el texto REALMENTE buscado (por nombre) — solo
  // se actualiza al presionar Enter/Buscar (queryBuscada), no en cada tecla
  // (igual que la búsqueda de productos, buscar()).
  const paquetesCoincidentes = useMemo(() => {
    const q = queryBuscada.trim().toLowerCase()
    if (!q) return []
    return paquetes.filter((p) => p.nombre.toLowerCase().includes(q))
  }, [queryBuscada, paquetes])

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
    setQueryBuscada(q)

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
      setQueryBuscada("")
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
    // Marcas seleccionadas (múltiples): el producto debe ser de alguna de ellas.
    if (filtros.marcas && filtros.marcas.length > 0) {
      if (!filtros.marcas.includes(r.marca ?? "")) return false
    } else if (filtros.marca && r.marca !== filtros.marca) {
      // Compat: filtro de marca única (legacy).
      return false
    }
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
          onSeleccionarCompraVenta={setNivelesSel}
        />
      )}

      {/* Paquetes que coinciden con la búsqueda (se venden como combo) */}
      {!seleccionado && paquetesCoincidentes.length > 0 && (
        <GridPaquetes
          paquetes={paquetesCoincidentes}
          aplicados={paquetesAplicados}
          aplicando={aplicandoPkg}
          onAplicar={aplicarPaquete}
          onVerDesglose={setPaqueteDesglose}
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
            onSeleccionarNiveles={setNivelesSel}
            onAgregar={(p) => dispatch({ type: "ADD_ITEM", item: { sku: p.sku, descripcion: p.descripcion, precio: p.precio, precio2: p.precio2, precio3: p.precio3, precio4: p.precio4, impuesto: p.impuesto, existencia: p.existencia, mayoreoActivo: p.mayoreoActivo, mayoreoMin: p.mayoreoMin, marca: p.marca, departamento: p.departamento, categoria: p.categoria, proveedor: p.proveedor, proveedor_id: p.proveedor_id, granel: p.granel, unidadVenta: p.unidadVenta } })}
            onEncargar={(p) => dispatch({ type: "ADD_ITEM", item: { sku: p.sku, descripcion: p.descripcion, precio: p.precio, precio2: p.precio2, precio3: p.precio3, precio4: p.precio4, impuesto: p.impuesto, existencia: p.existencia, mayoreoActivo: p.mayoreoActivo, mayoreoMin: p.mayoreoMin, marca: p.marca, departamento: p.departamento, categoria: p.categoria, proveedor: p.proveedor, proveedor_id: p.proveedor_id, granel: p.granel, unidadVenta: p.unidadVenta, esEncargo: true } })}
            onQuitar={(sku) => dispatch({ type: "DECREMENT", sku })}
          />
        </>
      )}

      {!seleccionado && !tieneResultados && query && !buscando && (
        <p className="sin-resultados">Sin resultados para "{query}"</p>
      )}

      {/* Modal de desglose del paquete (artículos, precios, ahorro) */}
      <DesglosePaqueteModal paquete={paqueteDesglose} onClose={() => setPaqueteDesglose(null)} />

      {/* Selector de nivel/presentación (cadena de N niveles de unidad) */}
      <PresentacionSelectorModal
        producto={nivelesSel}
        presentacionesOverride={presentacionesNiveles}
        subtitulo="¿Cómo lo vendes?"
        onConfirmar={agregarPorNivel}
        onClose={() => setNivelesSel(null)}
      />
    </div>
  )
}
