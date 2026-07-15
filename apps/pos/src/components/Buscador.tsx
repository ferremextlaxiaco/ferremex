import { useRef, useState, useMemo, useEffect } from "react"
import { buscarProductos, listarPaquetes, type FiltrosBusqueda, type ProductoPOS, type Paquete } from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { prepararLineasPaquete } from "../lib/paquetes"
import { FiltroBar, type FiltroStock } from "./FiltroBar"
import { GridProductos } from "./GridProductos"
import { GridPaquetes } from "./GridPaquetes"
import { ProductoDetalle } from "./ProductoDetalle"
import { DesglosePaqueteModal } from "./DesglosePaqueteModal"
import { PresentacionSelectorModal, ID_PRESENTACION_BASE } from "./PresentacionSelectorModal"
import { nombreUnidad } from "../lib/unidades-sat"
import type { PresentacionGranel } from "../lib/client"

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
  const [paqueteDesglose, setPaqueteDesglose] = useState<Paquete | null>(null)
  // Artículo especial (a granel): producto cuyo selector de presentación está abierto.
  const [granelSel, setGranelSel] = useState<ProductoPOS | null>(null)
  // Unidad de compra ≠ unidad de venta (ej. Rollo=50 Metros): producto cuyo
  // selector "¿por metro o por rollo?" está abierto.
  const [compraVentaSel, setCompraVentaSel] = useState<ProductoPOS | null>(null)

  // Id reservado para la opción "unidad de compra completa" (ej. 1 Rollo).
  const ID_UNIDAD_COMPRA = "__unidad_compra__"

  // Presentaciones sintéticas para el selector: unidad de VENTA suelta (usa
  // precioVenta1-4, cantidad libre) + unidad de COMPRA completa (usa precio1-4,
  // cantidad = factor). Ambos juegos de precio son independientes — capturados a
  // mano en ArticleDrawer, sin relación matemática (ni multiplicar por factor).
  // Reutiliza PresentacionSelectorModal, pero a diferencia del granel el
  // inventario es REAL — se agrega con el SKU real del producto (no compuesto),
  // así el backend la trata como venta normal: valida y descuenta el stock real.
  const presentacionesCompraVenta = useMemo<PresentacionGranel[]>(() => {
    if (!compraVentaSel) return []
    const factor = compraVentaSel.factor ?? 1
    const precioUnidadVenta = compraVentaSel.precioVenta1 ?? 0
    const precioUnidadCompra = compraVentaSel.precio
    const stockAlcanzaCompra = compraVentaSel.existencia >= factor
    return [
      {
        id: ID_PRESENTACION_BASE,
        nombre: nombreUnidad(compraVentaSel.unidadVenta ?? ""),
        precio: precioUnidadVenta,
        factor: 1,
        agotado: compraVentaSel.existencia <= 0,
      },
      {
        id: ID_UNIDAD_COMPRA,
        nombre: nombreUnidad(compraVentaSel.unidadCompra ?? ""),
        precio: precioUnidadCompra,
        factor,
        agotado: !stockAlcanzaCompra,
      },
    ]
  }, [compraVentaSel])

  // Confirma la venta por unidad de venta suelta o por unidad de compra completa.
  // AMBAS usan el SKU REAL del producto (inventario real, sin sku compuesto).
  // "Unidad de venta": cantidad = piezas/metros sueltos, precio = precioVenta1-4,
  // tope = existencia real tal cual. "Unidad de compra": cantidad = número de
  // BOLSAS (no piezas — así precio × cantidad cobra correctamente), precio =
  // precio1-4 (por bolsa), tope = existencia real ÷ factor (bolsas completas
  // disponibles). El backend usa `compraVentaFactor` para descontar
  // cantidad × factor piezas reales del inventario (bloqueante, ver /caja/ventas).
  function agregarCompraVenta({ producto, presentacion, cantidad }:
    { producto: ProductoPOS; presentacion: PresentacionGranel; cantidad: number }) {
    const esUnidadCompra = presentacion.id === ID_UNIDAD_COMPRA
    const factor = producto.factor ?? 1
    dispatch({
      type: "ADD_ITEM",
      item: {
        sku: producto.sku,
        descripcion: `${producto.descripcion} — ${presentacion.nombre}`,
        // Unidad de compra usa precio1-4 (ya son los que trae `producto`); unidad
        // de venta usa precioVenta1-4 en su lugar — juegos independientes.
        precio: esUnidadCompra ? producto.precio : (producto.precioVenta1 ?? producto.precio),
        precio2: esUnidadCompra ? producto.precio2 : producto.precioVenta2,
        precio3: esUnidadCompra ? producto.precio3 : producto.precioVenta3,
        precio4: esUnidadCompra ? producto.precio4 : producto.precioVenta4,
        impuesto: producto.impuesto,
        // Tope de cantidad en la MISMA unidad que se está capturando: piezas
        // sueltas, o bolsas completas disponibles (piezas reales ÷ factor).
        existencia: esUnidadCompra ? Math.floor(producto.existencia / factor) : producto.existencia,
        // El mayoreo (Precio2/mayoreoMin) solo tiene sentido dentro del juego de
        // precios de COMPRA — al vender por unidad de venta suelta no aplica.
        mayoreoActivo: esUnidadCompra ? producto.mayoreoActivo : false,
        mayoreoMin: esUnidadCompra ? producto.mayoreoMin : undefined,
        marca: producto.marca,
        departamento: producto.departamento,
        categoria: producto.categoria,
        proveedor: producto.proveedor,
        proveedor_id: producto.proveedor_id,
        ...(esUnidadCompra
          ? { esUnidadCompra: true, unidadCompraNombre: presentacion.nombre, compraVentaFactor: factor }
          : {}),
      },
    })
    if (cantidad !== 1) {
      dispatch({ type: "SET_CANTIDAD", sku: producto.sku, cantidad })
    }
    // Si se abrió desde el detalle del producto, regresa a resultados (mismo
    // comportamiento que handleAgregar en ProductoDetalle).
    setSeleccionado(null)
  }

  // Agrega al carrito una línea de artículo especial con la presentación elegida.
  // El precio de la línea = precio de la presentación (ya c/IVA desde el backend).
  // `granelFactor` = equivalencia en unidad base para el descuento informativo.
  function agregarGranel({ producto, presentacion, cantidad }:
    { producto: ProductoPOS; presentacion: PresentacionGranel; cantidad: number }) {
    dispatch({
      type: "ADD_ITEM",
      item: {
        // SKU compuesto (padre + presentación) para que cada presentación sea su
        // propia línea en el carrito (m³ y carretilla no se fusionan).
        sku: `${producto.sku}::${presentacion.id}`,
        descripcion: `${producto.descripcion} — ${presentacion.nombre}`,
        precio: presentacion.precio,
        impuesto: producto.impuesto,
        existencia: 0,
        marca: producto.marca,
        departamento: producto.departamento,
        categoria: producto.categoria,
        proveedor: producto.proveedor,
        proveedor_id: producto.proveedor_id,
        // Marca de artículo especial: inventario informativo (no se topa), y datos
        // de la presentación para el ticket y el descuento del inventario base.
        esGranel: true,
        presentacion: presentacion.nombre,
        granelFactor: presentacion.factor ?? null,
        // El SKU REAL del producto (sin sufijo) — lo necesita el backend para el
        // descuento de inventario. Lo pasamos vía granelSku para separarlo del sku
        // compuesto de la línea.
        granelSku: producto.sku,
      },
    })
    // Si se pidió una cantidad != 1, ajustamos la línea recién creada.
    if (cantidad !== 1) {
      dispatch({ type: "SET_CANTIDAD", sku: `${producto.sku}::${presentacion.id}`, cantidad })
    }
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
          onSeleccionarCompraVenta={setCompraVentaSel}
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
            onSeleccionarGranel={setGranelSel}
            onSeleccionarCompraVenta={setCompraVentaSel}
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

      {/* Selector de presentación para artículo especial (a granel) */}
      <PresentacionSelectorModal
        producto={granelSel}
        onConfirmar={agregarGranel}
        onClose={() => setGranelSel(null)}
      />

      {/* Selector metro-vs-rollo (unidad de compra ≠ unidad de venta, inventario real) */}
      <PresentacionSelectorModal
        producto={compraVentaSel}
        presentacionesOverride={presentacionesCompraVenta}
        subtitulo="¿Por unidad suelta o completa?"
        onConfirmar={agregarCompraVenta}
        onClose={() => setCompraVentaSel(null)}
      />
    </div>
  )
}
