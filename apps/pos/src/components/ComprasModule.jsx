import { useState, useRef, useCallback, useEffect } from "react"
import { listarArticulos, actualizarArticulo, incrementarInventario } from "../lib/client"
import { loadProveedores, agregarFactura } from "../lib/proveedores"
import ComprasTable from "./ComprasTable"
import ComprasDetailPanel from "./ComprasDetailPanel"

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── Historial de compras (compartido con ConsultarCompras) ────────────────────

const KEY_HISTORIAL = "pos_historial_compras"

function cargarHistorial() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORIAL) ?? "[]") } catch { return [] }
}

function guardarHistorial(lista) {
  localStorage.setItem(KEY_HISTORIAL, JSON.stringify(lista))
}

function calcRow(row) {
  const base   = Number(row.costo)   || 0
  const factor = Number(row.factor)  || 1
  const desc   = Number(row.descuento) || 0
  // El factor divide el costo en unidades de venta; costoSinIva = precio de compra tal cual
  const costoBase = round2(base * (1 - desc / 100))

  let costoSinIva, costoConIva
  if (row.precioNeto && row.aplicarIva) {
    costoConIva = costoBase
    costoSinIva = round2(costoBase / 1.16)
  } else {
    costoSinIva = costoBase
    costoConIva = row.aplicarIva ? round2(costoSinIva * 1.16) : costoSinIva
  }
  // costoCalc = base para la calculadora de precios (por unidad de venta)
  const costoCalc = round2(costoSinIva / factor)
  // Precio 4 = costo c/IVA por unidad de venta.
  // Cuando precioNeto=true, usar costoConIva/factor para evitar doble redondeo
  // (70 ÷ 1.16 → round2 → × 1.16 produce 69.99 en vez de 70.00).
  const precio4 = !row.aplicarIva
    ? costoCalc
    : row.precioNeto
      ? round2(costoConIva / factor)
      : round2(costoCalc * 1.16)
  return { ...row, costoSinIva, costoConIva, costoCalc, precio4 }
}

function articleToRow(art) {
  return calcRow({
    _id: uuid(),
    articuloId: art.id,
    clave: art.clave || "",
    claveSat: art.claveSat || "",
    descripcion: art.descripcion || "",
    localizacion: art.localizacion || "",
    factor: art.factor ?? 1,
    existencia: art.existencia ?? 0,
    ultimoPrecioCompra: art.precioCompra ?? 0,
    thumbnail: art.thumbnail || null,
    imagenes: art.imagenes ?? [],
    categoria: art.categoria || "",
    departamento: art.departamento || "",
    marca: art.marca || "",
    especificaciones: art.especificaciones ?? [],
    inventarioMin: art.inventarioMin ?? 0,
    inventarioMax: art.inventarioMax ?? 0,
    peso: art.peso ?? 0,
    ventaGranel: art.ventaGranel ?? false,
    claveAlterna: art.claveAlterna || "",
    cantidad: 1,
    aplicarIva: art.aplicarIva ?? true,
    costo: art.precioCompra ?? 0,
    descuento: 0,
    precioNeto: art.precioNeto ?? false,
    unidadSat:      art.unidadSat      || "H87",
    unidadSatVenta: art.unidadSatVenta || "H87",
    precio1: art.precio1 ?? 0,
    precio2: art.precio2 ?? 0,
    precio3: art.precio3 ?? 0,
    precio4: art.precio4 ?? 0,
  })
}

// ── Datos de demostración ─────────────────────────────────────────────────────

const SEED_ROWS = [
  calcRow({
    _id: "seed-1",
    articuloId: "art-seed-1",
    clave: "MT0001",
    claveSat: "27111701",
    descripcion: "Martillo de carpintero 16 oz",
    localizacion: "Pasillo A-3",
    factor: 1,
    existencia: 15,
    ultimoPrecioCompra: 42.00,
    thumbnail: null,
    categoria: "Herramientas",
    departamento: "Manuales",
    cantidad: 2,
    aplicarIva: true,
    costo: 42.00,
    descuento: 5,
    precioNeto: false,
    unidadSat: "H87", unidadSatVenta: "H87",
    precio1: 68.00,
    precio2: 62.00,
    precio3: 56.00,
    precio4: 50.00,
  }),
  calcRow({
    _id: "seed-2",
    articuloId: "art-seed-2",
    clave: "DS0002",
    claveSat: "27111702",
    descripcion: "Desarmador Phillips #2",
    localizacion: "Pasillo B-1",
    factor: 1,
    existencia: 30,
    ultimoPrecioCompra: 16.00,
    thumbnail: null,
    categoria: "Herramientas",
    departamento: "Manuales",
    cantidad: 5,
    aplicarIva: true,
    costo: 16.00,
    descuento: 0,
    precioNeto: false,
    unidadSat: "H87", unidadSatVenta: "H87",
    precio1: 26.00,
    precio2: 24.00,
    precio3: 22.00,
    precio4: 19.00,
  }),
  calcRow({
    _id: "seed-3",
    articuloId: "art-seed-3",
    clave: "CM0003",
    claveSat: "41111506",
    descripcion: "Cinta métrica 5 m",
    localizacion: "Pasillo A-1",
    factor: 1,
    existencia: 8,
    ultimoPrecioCompra: 22.00,
    thumbnail: null,
    categoria: "Medición",
    departamento: "Instrumentos",
    cantidad: 3,
    aplicarIva: true,
    costo: 22.00,
    descuento: 10,
    precioNeto: false,
    unidadSat: "H87", unidadSatVenta: "H87",
    precio1: 39.00,
    precio2: 36.00,
    precio3: 33.00,
    precio4: 29.00,
  }),
]

// ── Persistencia localStorage ─────────────────────────────────────────────────

const KEY_ACTUAL   = "pos_compra_actual"
const KEY_PAUSADAS = "pos_compras_pausadas"

function cargarActual() {
  try {
    const raw = localStorage.getItem(KEY_ACTUAL)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function cargarPausadas() {
  try {
    const raw = localStorage.getItem(KEY_PAUSADAS)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ── Icono reloj ───────────────────────────────────────────────────────────────


// ── Componente principal ──────────────────────────────────────────────────────

export default function ComprasModule() {
  // Carga inicial desde localStorage (o seed si nunca se ha guardado nada)
  const _inicial    = cargarActual()
  const _primerVez  = _inicial === null
  const _initRows   = _primerVez ? SEED_ROWS : (_inicial.rows   ?? [])

  const [rows,       setRows]       = useState(_initRows)
  const [selectedId, setSelectedId] = useState(_initRows[0]?._id ?? null)
  // El proveedor se elige del catálogo real (BD). Ya no hay seed con id ficticio:
  // el usuario debe seleccionar un proveedor del catálogo cargado async.
  const [proveedor,  setProveedor]  = useState(_primerVez ? null : _inicial.proveedor)
  const [proveedores, setProveedores] = useState([])

  // Catálogo de proveedores desde la BD (módulo ferremex_proveedores).
  useEffect(() => {
    let activo = true
    loadProveedores()
      .then((lista) => { if (activo) setProveedores(lista) })
      .catch(() => { if (activo) setProveedores([]) })
    return () => { activo = false }
  }, [])
  const [fecha,      setFecha]      = useState(_primerVez ? new Date().toISOString().slice(0, 10) : (_inicial.fecha ?? new Date().toISOString().slice(0, 10)))
  const [status,     setStatus]     = useState(_primerVez ? "borrador" : (_inicial.status ?? "borrador"))
  const [numFactura, setNumFactura] = useState(_primerVez ? "" : (_inicial.numFactura ?? ""))
  const [pausadas,         setPausadas]         = useState(cargarPausadas)
  const [showPausadas,     setShowPausadas]     = useState(false)
  const [pagoModal,        setPagoModal]        = useState(null)
  const [editandoArticulo, setEditandoArticulo] = useState(false)
  const [showCompraModal,  setShowCompraModal]  = useState(false)
  const [refPrecios,    setRefPrecios]    = useState(null)
  const refPreciosRef  = useRef(null)    // acceso sincrónico en handleRowChange
  const snapshotMapRef = useRef({})      // { [_id]: snap } — nunca se sobreescribe

  // Modal de confirmación personalizado
  const [confirmModal, setConfirmModal] = useState(null) // { mensaje, onAceptar }
  function pedirConfirm(mensaje, onAceptar) {
    setConfirmModal({ mensaje, onAceptar })
  }

  // Search
  const [search,       setSearch]       = useState("")
  const [results,      setResults]      = useState([])
  const [popupOpen,    setPopupOpen]    = useState(false)
  const [page,         setPage]         = useState(0)
  const [hiIdx,        setHiIdx]        = useState(-1)
  const [searching,    setSearching]    = useState(false)
  const [searchError,  setSearchError]  = useState(null)
  const [queryChanged, setQueryChanged] = useState(false)
  const searchWrapRef  = useRef(null)
  const searchInputRef = useRef(null)
  const PAGE_SIZE = 12

  // Toast
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)

  function showToast(msg, tipo = "ok") {
    clearTimeout(toastRef.current)
    setToast({ msg, tipo })
    toastRef.current = setTimeout(() => setToast(null), 2800)
  }

  // ── Auto-guardado en localStorage ────────────────────────────────────────────

  // Siempre guarda (incluso cuando está vacío) para que al recargar no vuelvan los datos de prueba
  useEffect(() => {
    localStorage.setItem(KEY_ACTUAL, JSON.stringify({ rows, proveedor, fecha, status, numFactura }))
  }, [rows, proveedor, fecha, status, numFactura])

  // Guarda lista de compras en espera en cada cambio
  useEffect(() => {
    localStorage.setItem(KEY_PAUSADAS, JSON.stringify(pausadas))
  }, [pausadas])

  // ── Totales ─────────────────────────────────────────────────────────────────

  const subtotal = rows.reduce((s, r) => s + r.costoSinIva * r.cantidad, 0)
  const ivaTotal = rows.reduce((s, r) => s + (r.costoConIva - r.costoSinIva) * r.cantidad, 0)
  const total    = rows.reduce((s, r) => s + r.costoConIva * r.cantidad, 0)

  // ── Búsqueda de artículos ────────────────────────────────────────────────────

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || searching) return
    setSearching(true)
    setSearchError(null)
    setQueryChanged(false)
    try {
      const data = await listarArticulos(q)
      // Auto-add por SKU exacto
      const qLow  = q.trim().toLowerCase()
      const exact = data.find((a) =>
        a.clave?.toLowerCase() === qLow || a.claveAlterna?.toLowerCase() === qLow
      )
      if (exact) {
        handleAddArticle(exact)
        setSearch("")
        setPopupOpen(false)
        return
      }
      setResults(data)
      setPage(0)
      setHiIdx(data.length > 0 ? 0 : -1)
      setPopupOpen(true)
    } catch (e) {
      setSearchError(e.message ?? "Error al buscar")
      setResults([])
      setPopupOpen(true)
    } finally {
      setSearching(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching])

  // ── CRUD de filas ────────────────────────────────────────────────────────────

  function handleAddArticle(art) {
    setRows((prev) => {
      const existing = prev.find((r) => r.articuloId === art.id)
      if (existing) {
        showToast(`+1 ${art.descripcion}`)
        return prev.map((r) =>
          r._id === existing._id
            ? calcRow({ ...r, cantidad: r.cantidad + 1 })
            : r
        )
      }
      const newRow = articleToRow(art)
      setSelectedId(newRow._id)
      showToast(`Agregado: ${art.descripcion}`)
      return [...prev, newRow]
    })
  }

  function handleRowChange(id, updates) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._id !== id) return r
        const merged = { ...r, ...updates }

        // Cuando cambia el costo o el descuento, mantener márgenes y ajustar precios 1-3.
        // Escalar siempre desde el snapshot original para evitar acumulación de redondeo:
        // ir C→C'→C con ratio incremental da C±ε; con ratio desde snapshot da C exacto.
        if ("costo" in updates || "descuento" in updates) {
          const snap     = refPreciosRef.current
          const snapCalc = snap?.costoCalc ?? 0
          const newCalc  = calcRow(merged).costoCalc
          if (snapCalc > 0) {
            const ratio = newCalc / snapCalc
            ;[1, 2, 3].forEach((n) => {
              const p = snap[`precio${n}`] ?? 0
              if (p > 0) merged[`precio${n}`] = round2(p * ratio)
            })
          }
        }

        // Cuando cambia aplicarIva o precioNeto, escalar igualmente para conservar márgenes.
        if ("aplicarIva" in updates || "precioNeto" in updates) {
          const oldCalc = calcRow(r).costoCalc
          const newCalc = calcRow(merged).costoCalc
          if (oldCalc > 0 && newCalc !== oldCalc) {
            const ratio = newCalc / oldCalc
            ;[1, 2, 3].forEach((n) => {
              const p = merged[`precio${n}`] ?? 0
              if (p > 0) merged[`precio${n}`] = round2(p * ratio)
            })
          }
        }

        return calcRow(merged)
      })
    )
  }

  function handleRowDelete(id) {
    setRows((prev) => {
      const next = prev.filter((r) => r._id !== id)
      if (selectedId === id) setSelectedId(next.length > 0 ? next[0]._id : null)
      return next
    })
    showToast("Artículo eliminado de la compra")
  }

  // ── Flujo de compra ──────────────────────────────────────────────────────────

  function handlePonerEnEspera() {
    if (rows.length === 0) return
    setPausadas((prev) => [
      ...prev,
      {
        id: uuid(),
        rows,
        proveedor,
        fecha,
        numFactura,
        fecha_pausa: new Date().toISOString(),
        status,
      },
    ])
    setRows([])
    setSelectedId(null)
    setProveedor(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setStatus("borrador")
    setNumFactura("")
    showToast("Compra puesta en espera")
  }

  function handleRetomarPausada(p) {
    // Si hay compra en curso, la ponemos en espera automáticamente antes de retomar
    if (rows.length > 0) {
      setPausadas((prev) => [
        ...prev,
        { id: uuid(), rows, proveedor, fecha, numFactura, fecha_pausa: new Date().toISOString(), status },
      ])
    }
    _retomarPausada(p)
  }
  function _retomarPausada(p) {
    setRows(p.rows)
    setProveedor(p.proveedor)
    setFecha(p.fecha)
    setStatus(p.status)
    setNumFactura(p.numFactura ?? "")
    setSelectedId(p.rows[0]?._id ?? null)
    setPausadas((prev) => prev.filter((x) => x.id !== p.id))
    setShowPausadas(false)
    showToast("Compra retomada")
  }

  function handleConfirmar() {
    if (rows.length === 0) {
      showToast("Agrega artículos antes de confirmar", "error")
      return
    }
    const faltantes = []
    if (!proveedor)           faltantes.push("Proveedor")
    if (!numFactura.trim())   faltantes.push("Número de factura")
    if (faltantes.length > 0) {
      setPagoModal({ tipo: "error", faltantes })
      return
    }
    // Validar folio duplicado contra el historial de compras
    const folioBuscado = numFactura.trim()
    const duplicado = cargarHistorial().find(
      (c) => c.folio === folioBuscado && c.estado !== "Cancelada"
    )
    if (duplicado) {
      setPagoModal({
        tipo: "error",
        faltantes: [],
        mensajeError: `El folio "${folioBuscado}" ya fue registrado el ${duplicado.fecha} (${duplicado.proveedor}). Verifica el número de factura.`,
      })
      return
    }
    setPagoModal({ tipo: "pago", formaPago: "efectivo", plazo: proveedor.dias_credito ?? 30 })
  }

  async function ejecutarConfirmar() {
    // Guardar precios actualizados de todos los artículos antes de confirmar
    const provNombre = proveedor?.nombre ?? ""
    await Promise.allSettled(rows.map((r) => guardarArticuloDesdeRow(r, provNombre)))

    // Incrementar stock: suma la cantidad comprada al inventario existente de cada SKU
    const ajustesStock = rows
      .filter((r) => r.clave && !r.articuloId.startsWith("art-seed"))
      .map((r) => ({ sku: r.clave, delta: r.cantidad }))
    if (ajustesStock.length > 0) {
      await incrementarInventario(ajustesStock).catch((err) =>
        console.error("Error al actualizar inventario:", err)
      )
    }

    if (pagoModal.formaPago === "credito" && proveedor) {
      // Registra la cuenta por pagar como factura del proveedor en la BD
      // (módulo ferremex_proveedores), vía el subrecurso de facturas.
      await agregarFactura(proveedor.id, {
        numero_factura: numFactura,
        fecha_emision:  fecha,
        dias_credito:   proveedor.dias_credito ?? 30,
        monto:          round2(total),
        descripcion:    `Compra de ${rows.length} artículo${rows.length !== 1 ? "s" : ""}`,
        pagada:         false,
      }).catch((err) => console.error("Error al registrar factura de proveedor:", err))
    }
    // Registrar en historial compartido con Consultar Compras
    const registroCompra = {
      id:       uuid(),
      folio:    numFactura.trim() || `COMP-${fecha}-${Date.now().toString().slice(-4)}`,
      proveedor: proveedor?.nombre ?? "",
      // Etapa 2: enlace por ID real al catálogo (ferremex_proveedores). El nombre
      // se conserva para mostrar/compatibilidad; el id es la referencia estable.
      proveedorId: proveedor?.id ?? null,
      fecha,
      tipo:     "Factura",
      estado:   "Recibida",
      articulos: rows.map(r => ({
        codigo:       r.clave         || "",
        nombre:       r.descripcion   || "",
        cantidad:     r.cantidad,
        precioUnit:   round2(r.costoSinIva),
        categoria:    r.categoria     || "",
        departamento: r.departamento  || "",
        marca:        r.marca         || "",
      })),
      subtotal: round2(subtotal),
      iva:      round2(ivaTotal),
      total:    round2(total),
      canceladaEl:       null,
      motivoCancelacion: null,
    }
    guardarHistorial([registroCompra, ...cargarHistorial()])

    limpiarSnapshots()
    setRows([])
    setSelectedId(null)
    setProveedor(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setStatus("borrador")
    setNumFactura("")
    showToast("Compra confirmada")
    setPagoModal(null)
  }

  function limpiarSnapshots() {
    snapshotMapRef.current = {}
    refPreciosRef.current  = null
    setRefPrecios(null)
  }

  function handleNuevaCompra() {
    if (rows.length > 0) {
      pedirConfirm("¿Iniciar una nueva compra? Se perderá la compra actual si no la guardas.", () => {
        limpiarSnapshots()
        setRows([]); setSelectedId(null); setProveedor(null)
        setFecha(new Date().toISOString().slice(0, 10)); setStatus("borrador"); setNumFactura("")
      })
      return
    }
    limpiarSnapshots()
    setRows([]); setSelectedId(null); setProveedor(null)
    setFecha(new Date().toISOString().slice(0, 10)); setStatus("borrador"); setNumFactura("")
  }

  function handleCancelar() {
    pedirConfirm("¿Cancelar esta compra? Esta acción no se puede deshacer.", () => {
      limpiarSnapshots()
      setRows([]); setSelectedId(null); setStatus("borrador"); setNumFactura("")
      showToast("Compra cancelada")
    })
  }

  const selectedRow = rows.find((r) => r._id === selectedId) ?? null

  // Snapshot de precios por artículo — se captura UNA sola vez al seleccionar por primera vez.
  // Usar un mapa keyed por _id garantiza que volver a un artículo ya visitado
  // restaura el snapshot original, no los precios ya modificados.
  useEffect(() => {
    if (!selectedRow) return
    const id = selectedRow._id
    if (!snapshotMapRef.current[id]) {
      // Aplicar round2 a todos los valores para que la precisión del snapshot
      // sea idéntica a la que producirá el escalado posterior. Sin esto,
      // precios con decimales extendidos del backend (ej. 68.5344...) generan
      // refDisplay distinto al display actual después de round2, produciendo
      // falsos deltas de ±$0.01 al regresar al costo original.
      snapshotMapRef.current[id] = {
        precio1:    round2(selectedRow.precio1   ?? 0),
        precio2:    round2(selectedRow.precio2   ?? 0),
        precio3:    round2(selectedRow.precio3   ?? 0),
        precio4:    round2(selectedRow.precio4   ?? 0),
        costoCalc:  round2(selectedRow.costoCalc ?? 0),
        // Guardar el IVA histórico para que la referencia "Últ. precio c/IVA"
        // no cambie al activar/desactivar el toggle en la compra actual.
        aplicarIva: selectedRow.aplicarIva ?? false,
      }
    }
    const snap = snapshotMapRef.current[id]
    refPreciosRef.current = snap
    setRefPrecios(snap)
  }, [selectedRow?._id])

  async function guardarArticuloDesdeRow(row, proveedorNombre) {
    if (!row?.articuloId || row.articuloId.startsWith("art-seed")) return
    await actualizarArticulo({
      id: row.articuloId,
      clave: row.clave,
      claveAlterna: row.claveAlterna || "",
      descripcion: row.descripcion,
      marca: row.marca || "",
      ...(proveedorNombre !== undefined && { proveedor: proveedorNombre }),
      categoria: row.categoria || "",
      departamento: row.departamento || "",
      unidadCompra: row.unidadSat || "H87",
      unidadVenta: row.unidadSatVenta || "H87",
      factor: row.factor ?? 1,
      aplicarIva: row.aplicarIva ?? true,
      precioCompra: row.ultimoPrecioCompra ?? 0,
      precioNeto: row.precioNeto ?? false,
      precio1: row.precio1 ?? 0,
      precio2: row.precio2 ?? 0,
      precio3: row.precio3 ?? 0,
      precio4: row.precio4 ?? 0,
      claveSat: row.claveSat || "",
      inventarioMin: row.inventarioMin ?? 0,
      inventarioMax: row.inventarioMax ?? 0,
      localizacion: row.localizacion || "",
      peso: row.peso ?? 0,
      ventaGranel: row.ventaGranel ?? false,
      thumbnail: row.thumbnail,
      imagenes: row.imagenes ?? [],
      especificaciones: row.especificaciones ?? [],
    })
  }

  function handleGuardarArticulo() {
    if (!selectedRow) return
    // Los cambios ya están aplicados en la fila de esta compra (onRowChange es en tiempo real).
    // El backend se actualiza solo al confirmar la compra — no antes.
    showToast("Cambios guardados en esta compra")
  }

  // Cierra popup al hacer clic fuera
  useEffect(() => {
    function onOut(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target))
        setPopupOpen(false)
    }
    document.addEventListener("mousedown", onOut)
    return () => document.removeEventListener("mousedown", onOut)
  }, [])

  function selectArticle(art) {
    handleAddArticle(art)
    setSearch("")
    setPopupOpen(false)
    // No limpiamos results para que el botón "Última búsqueda" siga activo
  }

  // Paginación
  const totalPages  = Math.ceil(results.length / PAGE_SIZE)
  const pageResults = results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const globalOffset = page * PAGE_SIZE

  function goPage(delta) {
    const np = Math.min(Math.max(page + delta, 0), totalPages - 1)
    setPage(np)
    setHiIdx(np * PAGE_SIZE)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="cpx-root">

      {/* Top bar */}
      <div className="cpx-topbar">
        {/* Título */}
        <p className="admin-seccion-titulo" style={{ marginBottom: 0, flexShrink: 0 }}>Compras</p>

        {/* Buscador — centro del topbar */}
        <div className="cpx-search-wrap" ref={searchWrapRef}>
          <div className="cpx-search-row">
            <div className="cpx-search-bar">
              <svg className="cpx-search-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchInputRef}
                className="cpx-search-input"
                placeholder="Buscar por nombre, clave o código de barras…"
                value={search}
                autoComplete="off"
                onChange={(e) => {
                  setSearch(e.target.value)
                  setQueryChanged(true)
                  if (!e.target.value.trim()) { setPopupOpen(false); setResults([]) }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    if (queryChanged) { doSearch(search) }
                    else if (hiIdx >= 0 && results[hiIdx]) { selectArticle(results[hiIdx]) }
                    else { doSearch(search) }
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault()
                    if (hiIdx < results.length - 1) {
                      const ni = hiIdx + 1
                      setHiIdx(ni)
                      const np = Math.floor(ni / PAGE_SIZE)
                      if (np !== page) setPage(np)
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    if (hiIdx > 0) {
                      const ni = hiIdx - 1
                      setHiIdx(ni)
                      const np = Math.floor(ni / PAGE_SIZE)
                      if (np !== page) setPage(np)
                    }
                  } else if (e.key === "Escape") {
                    setPopupOpen(false)
                  }
                }}
              />
              {searching && <span className="cpx-search-spinner" />}
              {search && !searching && (
                <button className="cpx-search-clear" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearch(""); setResults([]); setPopupOpen(false) }}>✕</button>
              )}
            </div>
            <button
              className="cpx-search-btn"
              onMouseDown={(e) => e.preventDefault()}
              disabled={(!search.trim() && results.length === 0) || searching}
              onClick={() => {
                if (search.trim()) doSearch(search)
                else setPopupOpen(true)
              }}
            >
              Última búsqueda
            </button>
          </div>

          {/* Popup de resultados */}
          {popupOpen && (
            <div className="cpx-search-popup">
              {/* Header */}
              <div className="cpx-popup-header">
                <span className="cpx-popup-count">
                  {searching ? "Buscando…"
                    : searchError ? "Error"
                    : `${results.length} resultado${results.length !== 1 ? "s" : ""}`}
                </span>
                {!searching && !searchError && results.length > 0 && (
                  <span className="cpx-popup-hint-txt">
                    Clic = seleccionar · Doble clic o Enter = agregar
                  </span>
                )}
                <button className="cpx-popup-close" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setPopupOpen(false); setSearch("") }}>✕ Cerrar</button>
              </div>

              {/* Lista */}
              <div className="cpx-popup-list">
                {searchError ? (
                  <div className="cpx-popup-empty">{searchError}</div>
                ) : results.length === 0 && !searching ? (
                  <div className="cpx-popup-empty">
                    No se encontraron artículos para «{search}»
                  </div>
                ) : pageResults.map((art, i) => {
                  const globalIdx = globalOffset + i
                  const isAdded   = rows.some((r) => r.articuloId === art.id)
                  const stock     = art.existencia ?? 0
                  return (
                    <div
                      key={art.id}
                      className={`cpx-popup-item${globalIdx === hiIdx ? " hi" : ""}${isAdded ? " added" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (isAdded) return
                        setHiIdx(globalIdx)
                        searchInputRef.current?.focus()
                      }}
                      onDoubleClick={() => { if (!isAdded) selectArticle(art) }}
                    >
                      <div className="cpx-pi-thumb">
                        {art.thumbnail
                          ? <img src={art.thumbnail} alt="" loading="lazy" />
                          : <span className="cpx-pi-noimg">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="2"/><polyline points="21,15 16,10 5,21"/></svg>
                            </span>
                        }
                      </div>
                      <span className="cpx-pi-sku">{art.clave}</span>
                      <span className="cpx-pi-desc" title={art.descripcion}>{art.descripcion}</span>
                      <span className={`cpx-pi-stock ${stock > 0 ? "ok" : "zero"}`}>{stock}</span>
                      <span className="cpx-pi-price">${(art.aplicarIva ? (art.precio1 ?? 0) * 1.16 : (art.precio1 ?? 0)).toFixed(2)}</span>
                      {isAdded
                        ? <span className="cpx-pi-check">✓</span>
                        : <button className="cpx-pi-add"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); selectArticle(art) }}
                            title="Agregar">+</button>
                      }
                    </div>
                  )
                })}
              </div>

              {/* Footer paginación */}
              {totalPages > 1 && (
                <div className="cpx-popup-footer">
                  <button className="cpx-pag-nav" disabled={page === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => { e.stopPropagation(); goPage(-1) }}>
                    ‹ Anterior
                  </button>
                  <span className="cpx-pag-info">Página {page + 1} de {totalPages}</span>
                  <button className="cpx-pag-nav" disabled={page >= totalPages - 1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => { e.stopPropagation(); goPage(1) }}>
                    Siguiente ›
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acciones — derecha del topbar */}
        <div className="cpx-topbar-actions">
          {/* Botón editar artículo — muestra/oculta el panel */}
          <button
            className={`ar-btn-action${editandoArticulo ? " active" : ""}`}
            disabled={!selectedRow}
            onClick={() => setEditandoArticulo((v) => !v)}
          >
            Editar artículo
          </button>

          <div className="ar-toolbar-divider" />

          <button
            className="ar-btn-action"
            disabled={rows.length === 0}
            onClick={handlePonerEnEspera}
          >
            Poner compra en espera
          </button>

          {/* Botón reloj con badge de compras en espera */}
          <div className="cpx-clock-wrap">
            <button
              className={`cpx-btn-clock${showPausadas ? " active" : ""}`}
              onClick={() => setShowPausadas((v) => !v)}
              title="Ver compras en espera"
            />
            {pausadas.length > 0 && (
              <span className="cpx-clock-badge">{pausadas.length}</span>
            )}
          </div>

          <div className="ar-toolbar-divider" />
          <button className="ar-btn-add" onClick={handleNuevaCompra}>
            + Nueva compra
          </button>
          <div className="ar-toolbar-divider" />
          <button
            className="ar-btn-action ar-btn-danger"
            disabled={rows.length === 0}
            onClick={handleCancelar}
          >
            Cancelar compra
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`cpx-toast${toast.tipo === "error" ? " error" : ""}`}>
          {toast.msg}
        </div>
      )}

      {/* Modal compras en espera */}
      {showPausadas && (
        <div className="cpx-modal-overlay" onClick={() => setShowPausadas(false)}>
          <div className="cpx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpx-modal-header">
              <span className="cpx-modal-titulo">Compras en espera</span>
              <button className="cpx-modal-close" onClick={() => setShowPausadas(false)}>✕</button>
            </div>
            <div className="cpx-modal-body">
              {pausadas.length === 0 ? (
                <p className="cpx-modal-empty">No hay compras en espera.</p>
              ) : pausadas.map((p) => {
                const fechaP = new Date(p.fecha_pausa).toLocaleString("es-MX", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })
                const tot = p.rows.reduce((s, r) => s + r.costoConIva * r.cantidad, 0)
                return (
                  <div key={p.id} className="cpx-pausada-item">
                    <div className="cpx-pausada-info">
                      <span className="cpx-pausada-prov">
                        {p.proveedor?.nombre ?? "Sin proveedor"}
                        {p.numFactura ? ` — Factura ${p.numFactura}` : ""}
                      </span>
                      <span className="cpx-pausada-meta">
                        {p.rows.length} artículos · ${tot.toLocaleString("es-MX", { minimumFractionDigits: 2 })} · {fechaP}
                      </span>
                    </div>
                    <div className="cpx-pausada-btns">
                      <button
                        className="ar-btn-action ar-btn-danger"
                        onClick={() => pedirConfirm(
                          `¿Eliminar la compra en espera de "${p.proveedor?.nombre ?? "Sin proveedor"}"? Esta acción no se puede deshacer.`,
                          () => setPausadas((prev) => prev.filter((x) => x.id !== p.id))
                        )}
                      >
                        Eliminar
                      </button>
                      <button className="ar-btn-action" onClick={() => handleRetomarPausada(p)}>
                        Retomar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación personalizado */}
      {confirmModal && (
        <div className="cpx-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="cpx-modal cpx-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpx-modal-header">
              <span className="cpx-modal-titulo">Confirmar acción</span>
            </div>
            <div className="cpx-confirm-body">
              <p className="cpx-confirm-msg">{confirmModal.mensaje}</p>
              <div className="cpx-confirm-btns">
                <button className="ar-btn-action" onClick={() => setConfirmModal(null)}>
                  Cancelar
                </button>
                <button className="ar-btn-action ar-btn-danger" onClick={() => {
                  confirmModal.onAceptar()
                  setConfirmModal(null)
                }}>
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de forma de pago */}
      {pagoModal && (
        <div className="cpx-modal-overlay" onClick={() => setPagoModal(null)}>
          <div className="cpx-modal cpx-pago-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpx-modal-header">
              <span className="cpx-modal-titulo">
                {pagoModal.tipo === "error" ? "Campos requeridos" : "Confirmar compra"}
              </span>
              <button className="cpx-modal-close" onClick={() => setPagoModal(null)}>✕</button>
            </div>

            {pagoModal.tipo === "error" ? (
              /* ── Pantalla de error: folio duplicado o campos faltantes ── */
              <div className="cpx-pago-body">
                {pagoModal.mensajeError ? (
                  <p className="cpx-pago-error-msg">{pagoModal.mensajeError}</p>
                ) : (
                  <>
                    <p className="cpx-pago-error-msg">
                      Para confirmar la compra debes completar los siguientes campos:
                    </p>
                    <ul className="cpx-pago-faltantes">
                      {pagoModal.faltantes.map((f) => (
                        <li key={f}>
                          <span className="cpx-pago-faltante-dot" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="cpx-pago-footer">
                  <button className="ar-btn-add" onClick={() => setPagoModal(null)}>
                    Entendido
                  </button>
                </div>
              </div>
            ) : (
              /* ── Pantalla de forma de pago ── */
              <div className="cpx-pago-body">
                <div className="cpx-pago-resumen">
                  <div className="cpx-pago-resumen-item">
                    <span>Proveedor</span><strong>{proveedor?.nombre}</strong>
                  </div>
                  <div className="cpx-pago-resumen-item">
                    <span>Factura</span><strong>{numFactura}</strong>
                  </div>
                  <div className="cpx-pago-resumen-item">
                    <span>Total</span>
                    <strong style={{ color: "var(--at-orange)", fontSize: 17 }}>
                      ${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>

                <p className="cpx-pago-label">Forma de pago</p>
                <div className="cpx-pago-opciones">
                  {[
                    { id: "efectivo",      label: "Efectivo",      icon: "💵" },
                    { id: "transferencia", label: "Transferencia",  icon: "🏦" },
                    { id: "credito",       label: "Crédito",        icon: "📋" },
                  ].map(({ id, label, icon }) => (
                    <button
                      key={id}
                      className={`cpx-pago-opcion${pagoModal.formaPago === id ? " active" : ""}`}
                      onClick={() => setPagoModal((p) => ({ ...p, formaPago: id }))}
                    >
                      <span className="cpx-pago-icon">{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>

                {pagoModal.formaPago === "credito" && (
                  <div className="cpx-pago-credito-info">
                    <div className="cpx-pago-credito-row">
                      <span>Plazo de pago</span>
                      <strong>{proveedor?.dias_credito ?? 30} días</strong>
                    </div>
                    <div className="cpx-pago-credito-row">
                      <span>Fecha de vencimiento</span>
                      <strong>{(() => {
                        const d = new Date(fecha + "T12:00:00")
                        d.setDate(d.getDate() + (proveedor?.dias_credito ?? 30))
                        return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
                      })()}</strong>
                    </div>
                    <p className="cpx-pago-credito-nota">
                      El plazo se configura en el módulo de Proveedores.
                    </p>
                  </div>
                )}

                <div className="cpx-pago-footer">
                  <button className="ar-btn-action" onClick={() => setPagoModal(null)}>
                    Cancelar
                  </button>
                  <button className="ar-btn-add" onClick={ejecutarConfirmar}>
                    Confirmar compra
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Layout: tabla (siempre) + panel derecho (solo al editar) */}
      <div className={`cpx-layout${editandoArticulo ? " editing" : ""}`}>

        <ComprasTable
          rows={rows}
          selectedId={selectedId}
          onRowClick={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onRowChange={handleRowChange}
          onRowDelete={handleRowDelete}
          proveedor={proveedor}
          proveedores={proveedores}
          onProveedorChange={setProveedor}
          fecha={fecha}
          onFechaChange={setFecha}
          numFactura={numFactura}
          onNumFacturaChange={setNumFactura}
          status={status}
          subtotal={subtotal}
          ivaTotal={ivaTotal}
          total={total}
          onPonerEnEspera={handlePonerEnEspera}
          onConfirmar={handleConfirmar}
        />

        {editandoArticulo && (
          <ComprasDetailPanel
            row={selectedRow}
            onRowChange={handleRowChange}
            onGuardar={handleGuardarArticulo}
            refPrecios={refPrecios}
          />
        )}
      </div>
    </div>
  )
}
