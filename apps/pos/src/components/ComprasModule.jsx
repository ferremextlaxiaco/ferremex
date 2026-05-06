import { useState, useRef, useCallback, useEffect } from "react"
import { listarArticulos } from "../lib/client"
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

function calcRow(row) {
  const base = Number(row.costo) || 0
  const desc = Number(row.descuento) || 0
  const costoConDesc = base * (1 - desc / 100)
  const costoSinIva = round2(costoConDesc)
  const costoConIva = row.aplicarIva ? round2(costoSinIva * 1.16) : costoSinIva
  return { ...row, costoSinIva, costoConIva }
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
    categoria: art.categoria || "",
    departamento: art.departamento || "",
    cantidad: 1,
    aplicarIva: art.aplicarIva ?? true,
    costo: art.precioCompra ?? 0,
    descuento: 0,
    precioNeto: art.precioNeto ?? false,
    precio1: art.precio1 ?? 0,
    precio2: art.precio2 ?? 0,
    precio3: art.precio3 ?? 0,
    precio4: art.precio4 ?? 0,
  })
}

// ── Datos de demostración ─────────────────────────────────────────────────────

const PROVEEDOR_SEED = { id: "prov-001", nombre: "Truper" }

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
  // Carga inicial desde localStorage (o seed si no hay nada guardado)
  const _inicial = cargarActual()

  const [rows,       setRows]       = useState(_inicial?.rows      ?? SEED_ROWS)
  const [selectedId, setSelectedId] = useState((_inicial?.rows ?? SEED_ROWS)[0]?._id ?? null)
  const [proveedor,  setProveedor]  = useState(_inicial?.proveedor ?? PROVEEDOR_SEED)
  const [fecha,      setFecha]      = useState(_inicial?.fecha     ?? new Date().toISOString().slice(0, 10))
  const [status,     setStatus]     = useState(_inicial?.status    ?? "borrador")
  const [pausadas,   setPausadas]   = useState(cargarPausadas)
  const [showPausadas, setShowPausadas] = useState(false)

  // Search
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [hasBuscado, setHasBuscado] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Toast
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)

  function showToast(msg, tipo = "ok") {
    clearTimeout(toastRef.current)
    setToast({ msg, tipo })
    toastRef.current = setTimeout(() => setToast(null), 2800)
  }

  // ── Auto-guardado en localStorage ────────────────────────────────────────────

  // Guarda la compra actual en cada cambio (protege contra cortes de luz)
  useEffect(() => {
    if (rows.length === 0 && !proveedor) {
      localStorage.removeItem(KEY_ACTUAL)
    } else {
      localStorage.setItem(KEY_ACTUAL, JSON.stringify({ rows, proveedor, fecha, status }))
    }
  }, [rows, proveedor, fecha, status])

  // Guarda lista de compras en espera en cada cambio
  useEffect(() => {
    localStorage.setItem(KEY_PAUSADAS, JSON.stringify(pausadas))
  }, [pausadas])

  // ── Totales ─────────────────────────────────────────────────────────────────

  const subtotal = rows.reduce((s, r) => s + r.costoSinIva * r.cantidad, 0)
  const ivaTotal = rows.reduce((s, r) => s + (r.costoConIva - r.costoSinIva) * r.cantidad, 0)
  const total    = rows.reduce((s, r) => s + r.costoConIva * r.cantidad, 0)

  // ── Búsqueda de artículos ────────────────────────────────────────────────────

  const buscar = useCallback(async (q) => {
    if (!q.trim()) return
    setBuscando(true)
    setHasBuscado(true)
    setSearchError(null)
    try {
      const data = await listarArticulos(q)
      setSearchResults(data)
    } catch (e) {
      setSearchError(e.message ?? "Error al buscar")
      setSearchResults([])
    } finally {
      setBuscando(false)
    }
  }, [])

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
      prev.map((r) => (r._id === id ? calcRow({ ...r, ...updates }) : r))
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
        fecha_pausa: new Date().toISOString(),
        status,
      },
    ])
    setRows([])
    setSelectedId(null)
    setProveedor(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setStatus("borrador")
    showToast("Compra puesta en espera")
  }

  function handleRetomarPausada(p) {
    if (rows.length > 0) {
      if (!confirm("¿Retomar esta compra? La compra actual se perderá.")) return
    }
    setRows(p.rows)
    setProveedor(p.proveedor)
    setFecha(p.fecha)
    setStatus(p.status)
    setSelectedId(p.rows[0]?._id ?? null)
    setPausadas((prev) => prev.filter((x) => x.id !== p.id))
    setShowPausadas(false)
    showToast("Compra retomada")
  }

  function handleConfirmar() {
    if (!proveedor) {
      showToast("Selecciona un proveedor antes de confirmar", "error")
      return
    }
    if (rows.length === 0) {
      showToast("Agrega artículos antes de confirmar", "error")
      return
    }
    setStatus("confirmada")
    showToast("Compra confirmada")
  }

  function handleNuevaCompra() {
    if (
      rows.length > 0 &&
      !confirm("¿Iniciar una nueva compra? Se perderá la compra actual si no la guardas.")
    )
      return
    setRows([])
    setSelectedId(null)
    setProveedor(null)
    setFecha(new Date().toISOString().slice(0, 10))
    setStatus("borrador")
  }

  function handleCancelar() {
    if (!confirm("¿Cancelar esta compra? Esta acción no se puede deshacer.")) return
    setRows([])
    setSelectedId(null)
    setStatus("borrador")
    showToast("Compra cancelada")
  }

  const selectedRow = rows.find((r) => r._id === selectedId) ?? null

  // ── Popup de búsqueda ─────────────────────────────────────────────────────────

  const [popupOpen, setPopupOpen] = useState(false)
  const searchWrapRef = useRef(null)

  // Cierra el popup al hacer clic fuera
  useEffect(() => {
    function onClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setPopupOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function handleSearchInput(val) {
    setSearch(val)
    if (!val.trim()) {
      setPopupOpen(false)
      setHasBuscado(false)
      setSearchResults([])
    }
  }

  async function handleBuscar() {
    if (!search.trim()) return
    setPopupOpen(true)
    await buscar(search)
  }

  function handleSelectArticle(art) {
    handleAddArticle(art)
    setPopupOpen(false)
    setSearch("")
    setSearchResults([])
    setHasBuscado(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="cpx-root">

      {/* Top bar */}
      <div className="cpx-topbar">
        {/* Título */}
        <p className="admin-seccion-titulo" style={{ marginBottom: 0, flexShrink: 0 }}>Compras</p>

        {/* Búsqueda popup — centro del topbar */}
        <div className="cpx-search-wrap" ref={searchWrapRef}>
          <div className="cpx-search-bar">
            <svg className="cpx-search-icon" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="cpx-search-input"
              placeholder="Buscar artículo para agregar…"
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              onFocus={() => { if (hasBuscado && searchResults.length > 0) setPopupOpen(true) }}
            />
            {buscando && <span className="cpx-search-spinner">⟳</span>}
            {search && (
              <button className="cpx-search-clear" onClick={() => handleSearchInput("")}>✕</button>
            )}
            <button
              className="cpx-search-btn"
              onClick={handleBuscar}
              disabled={!search.trim() || buscando}
            >
              Buscar
            </button>
          </div>

          {/* Popup de resultados */}
          {popupOpen && (
            <div className="cpx-search-popup">
              {buscando ? (
                <p className="cpx-popup-hint">Buscando…</p>
              ) : searchError ? (
                <p className="cpx-popup-hint cpx-popup-error">{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p className="cpx-popup-hint">Sin resultados para &ldquo;{search}&rdquo;</p>
              ) : (
                <>
                  <p className="cpx-popup-count">{searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} — haz clic para agregar</p>
                  {searchResults.map((art) => (
                    <div
                      key={art.id}
                      className="cpx-popup-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectArticle(art)}
                    >
                      <div className="cpx-art-thumb">
                        {art.thumbnail
                          ? <img src={art.thumbnail} alt="" />
                          : <span className="cpx-art-noimg">{(art.clave || "?")[0]}</span>
                        }
                      </div>
                      <div className="cpx-art-info">
                        <div className="cpx-art-code">{art.clave}</div>
                        <div className="cpx-art-name">{art.descripcion}</div>
                        <div className="cpx-art-cat">
                          {[art.categoria, art.departamento].filter(Boolean).join(" › ")}
                        </div>
                      </div>
                      <div className="cpx-popup-price">
                        ${(art.precioCompra ?? 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Acciones — derecha del topbar */}
        <div className="cpx-topbar-actions">
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
          <button className="ar-btn-action" disabled={rows.length === 0}>
            Imprimir
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

      {/* Panel compras en espera */}
      {showPausadas && pausadas.length > 0 && (
        <div className="cpx-pausadas-panel">
          <p className="cpx-pausadas-title">Compras en espera</p>
          {pausadas.map((p) => {
            const fechaP = new Date(p.fecha_pausa).toLocaleString("es-MX", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })
            const tot = p.rows.reduce((s, r) => s + r.costoConIva * r.cantidad, 0)
            return (
              <div key={p.id} className="cpx-pausada-item">
                <div className="cpx-pausada-info">
                  <span className="cpx-pausada-prov">{p.proveedor?.nombre ?? "Sin proveedor"}</span>
                  <span className="cpx-pausada-meta">
                    {p.rows.length} artículos · ${tot.toLocaleString("es-MX", { minimumFractionDigits: 2 })} · {fechaP}
                  </span>
                </div>
                <button className="ar-btn-action" onClick={() => handleRetomarPausada(p)}>
                  Retomar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Two-column layout */}
      <div className="cpx-layout">

        {/* CENTER — tabla de compra */}
        <ComprasTable
          rows={rows}
          selectedId={selectedId}
          onRowClick={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onRowChange={handleRowChange}
          onRowDelete={handleRowDelete}
          proveedor={proveedor}
          onProveedorChange={setProveedor}
          fecha={fecha}
          onFechaChange={setFecha}
          status={status}
          subtotal={subtotal}
          ivaTotal={ivaTotal}
          total={total}
          onPonerEnEspera={handlePonerEnEspera}
          onConfirmar={handleConfirmar}
        />

        {/* RIGHT — detalle + calculadora */}
        <ComprasDetailPanel
          row={selectedRow}
          onRowChange={handleRowChange}
        />
      </div>
    </div>
  )
}
