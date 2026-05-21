import { useState, useRef } from "react"
import { Plus, Save, Trash2, ChevronDown, FileText } from "lucide-react"
import PedidosFiltros  from "./PedidosFiltros"
import PedidosTabla    from "./PedidosTabla"
import PedidosPreview  from "./PedidosPreview"
import OCConfirmModal  from "./OCConfirmModal"
import { listarFaltantes } from "../lib/client"

// ── Mock data ─────────────────────────────────────────────────────────────────

const PROVEEDORES = [
  { id: "prov-1", nombre: "Truper",              telefono: "800-800-8787",  dias_credito: 30 },
  { id: "prov-2", nombre: "Urrea Herramientas",  telefono: "800-714-4800",  dias_credito: 15 },
  { id: "prov-3", nombre: "Volteck",             telefono: "55-5123-4567",  dias_credito: 0  },
]


const HISTORIAL_MOCK = [
  {
    id: "ped-h1",
    folio: "PED-20260501-001",
    fecha: "2026-05-01",
    proveedor: "Truper",
    proveedorId: "prov-1",
    status: "recibido",
    articulos: [
      { clave: "MT001", descripcion: "Martillo de Carpintero 16 oz", cantidad: 12 },
      { clave: "DS002", descripcion: "Desarmador Phillips #2", cantidad: 20 },
      { clave: "TQ005", descripcion: "Taquetes Fischer #10", cantidad: 30 },
    ],
  },
  {
    id: "ped-h2",
    folio: "PED-20260508-001",
    fecha: "2026-05-08",
    proveedor: "Urrea Herramientas",
    proveedorId: "prov-2",
    status: "confirmado",
    articulos: [
      { clave: "CM003", descripcion: "Cinta Métrica 5m", cantidad: 8 },
      { clave: "LL006", descripcion: 'Llave Stilson 14"', cantidad: 6 },
    ],
  },
  {
    id: "ped-h3",
    folio: "PED-20260515-001",
    fecha: "2026-05-15",
    proveedor: "Volteck",
    proveedorId: "prov-3",
    status: "enviado",
    articulos: [
      { clave: "EX004", descripcion: "Extensión Eléctrica 10m", cantidad: 10 },
      { clave: "FO007", descripcion: "Foco LED 9W E27", cantidad: 36 },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

let _folioCount = 0
function genFolio() {
  _folioCount++
  const d   = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `PED-${ymd}-${String(_folioCount).padStart(3, "0")}`
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ── OC number counter (localStorage, resets daily) ────────────────────────────

function getNextOCNumber() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  let stored
  try { stored = JSON.parse(localStorage.getItem("ferremex_oc_counter") ?? "{}") } catch { stored = {} }
  const count = stored.date === today ? (stored.count + 1) : 1
  localStorage.setItem("ferremex_oc_counter", JSON.stringify({ date: today, count }))
  return `OC-${today}-${String(count).padStart(3, "0")}`
}

// ── Image pre-loader ──────────────────────────────────────────────────────────

async function imageToDataUri(url) {
  if (!url) return null
  // If it's already a data URI (e.g. from free item file upload), return as-is
  if (url.startsWith("data:")) return url
  try {
    const abs  = url.startsWith("http") ? url : window.location.origin + url
    const resp = await fetch(abs)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise(res => {
      const r = new FileReader()
      r.onload  = () => res(r.result)
      r.onerror = () => res(null)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

async function buildImageMap(allItems) {
  const map = {}
  await Promise.all(allItems.map(async item => {
    const url = item.thumbnail || item.imagenUrl || null
    if (url) {
      const key = item._id || item.articuloId
      map[key] = await imageToDataUri(url)
      // Also key by articuloId for catalog items
      if (item.articuloId && item.articuloId !== key) {
        map[item.articuloId] = map[key]
      }
    }
  }))
  return map
}

// ── Status badge (shared) ─────────────────────────────────────────────────────

const STATUS_LABEL = { borrador: "Borrador", enviado: "Enviado", confirmado: "Confirmado", recibido: "Recibido" }
const STATUS_CLS   = { borrador: "pdx-s-borrador", enviado: "pdx-s-enviado", confirmado: "pdx-s-confirmado", recibido: "pdx-s-recibido" }

// ── Faltantes modal ───────────────────────────────────────────────────────────

function FaltantesModal({ faltantes, rows, onConfirm, onClose }) {
  const addedIds = new Set(rows.map(r => r.articuloId))
  const [sel, setSel] = useState(() => new Set(faltantes.map(a => a.id)))

  function toggle(id) {
    setSel(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSel(prev => prev.size === faltantes.length ? new Set() : new Set(faltantes.map(a => a.id)))
  }

  function confirm() {
    const arts = faltantes.filter(a => sel.has(a.id))
    onConfirm(arts)
  }

  return (
    <div className="pdx-modal-overlay" onClick={onClose}>
      <div className="pdx-modal" onClick={e => e.stopPropagation()}>
        <div className="pdx-modal-header">
          <span className="pdx-modal-titulo">Cargar faltantes</span>
          <button className="pdx-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pdx-modal-body">
          <p className="pdx-modal-subtitle">
            Se encontraron <strong>{faltantes.length}</strong> artículo{faltantes.length !== 1 ? "s" : ""} con los filtros actuales.
          </p>
          {faltantes.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--at-text-muted)", fontSize: 13 }}>
              No hay artículos bajo mínimo con los filtros seleccionados.
            </p>
          ) : faltantes.map(art => {
            const sugerida = Math.max(1, art.minimo - art.existencia)
            const checked  = sel.has(art.id)
            const yaEnPed  = addedIds.has(art.id)
            return (
              <div key={art.id} className="pdx-faltante-item" style={{ opacity: yaEnPed ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  className="pdx-falt-check"
                  checked={checked}
                  disabled={yaEnPed}
                  onChange={() => toggle(art.id)}
                />
                <div className="pdx-falt-info">
                  <div className="pdx-falt-name">{art.descripcion}</div>
                  <div className="pdx-falt-meta">
                    <span>SKU: {art.clave}</span>
                    <span>Existencia: <strong style={{ color: art.existencia === 0 ? "var(--at-red)" : "#d97706" }}>{art.existencia}</strong></span>
                    <span>Mínimo: {art.minimo}</span>
                    {yaEnPed && <span style={{ color: "var(--at-green)", fontWeight: 700 }}>✓ Ya en pedido</span>}
                  </div>
                </div>
                <div className="pdx-falt-qty" title="Cantidad sugerida a pedir">+{sugerida}</div>
              </div>
            )
          })}
        </div>
        <div className="pdx-modal-footer">
          <button className="ar-btn-action" onClick={toggleAll}>
            {sel.size === faltantes.length ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ar-btn-action" onClick={onClose}>Cancelar</button>
            <button className="ar-btn-add" disabled={sel.size === 0} onClick={confirm}>
              Confirmar y agregar ({sel.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mis Pedidos tab ───────────────────────────────────────────────────────────

function MisPedidos({ pedidos, onStatusChange }) {
  const [filtro, setFiltro] = useState("todos")
  const statuses = ["todos", "borrador", "enviado", "confirmado", "recibido"]

  const visible = filtro === "todos" ? pedidos : pedidos.filter(p => p.status === filtro)

  return (
    <div className="pdx-mis-root">
      <div className="pdx-status-pills">
        {statuses.map(s => (
          <button
            key={s}
            className={`pdx-status-pill${filtro === s ? " active" : ""}`}
            onClick={() => setFiltro(s)}
          >
            {s === "todos" ? "Todos" : STATUS_LABEL[s]}
            {s !== "todos" && (
              <span style={{ marginLeft: 6, fontWeight: 400 }}>
                ({pedidos.filter(p => p.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="pdx-mis-table-wrap">
        <table className="pdx-mis-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Artículos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--at-text-muted)", padding: "24px" }}>
                  Sin pedidos en esta categoría
                </td>
              </tr>
            ) : visible.map(p => (
              <tr key={p.id}>
                <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--at-orange)" }}>{p.folio}</td>
                <td style={{ color: "var(--at-text-soft)", fontSize: 13 }}>{p.fecha}</td>
                <td style={{ fontWeight: 600 }}>{p.proveedor}</td>
                <td style={{ color: "var(--at-text-soft)" }}>
                  {(p.articulos ?? []).length} artículos
                </td>
                <td>
                  <span className={`pdx-status ${STATUS_CLS[p.status] ?? "pdx-s-borrador"}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>
                <td>
                  <div className="pdx-mis-actions">
                    <button className="ar-btn-action" style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => alert(`Ver pedido ${p.folio}`)}>Ver</button>
                    {p.status === "enviado" && (
                      <button className="ar-btn-action" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => alert(`Reenviar ${p.folio}`)}>Reenviar</button>
                    )}
                    {(p.status === "enviado" || p.status === "confirmado") && (
                      <button className="ar-btn-action" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => onStatusChange(p.id, "recibido")}>Marcar recibido</button>
                    )}
                    {p.status === "borrador" && (
                      <button className="ar-btn-action" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => onStatusChange(p.id, "enviado")}>Marcar enviado</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main module ───────────────────────────────────────────────────────────────

export default function PedidosModule() {
  const [activeTab,   setActiveTab]   = useState("nuevo")
  const [rows,        setRows]        = useState([])
  const [freeItems,   setFreeItems]   = useState([])
  const [proveedor,   setProveedor]   = useState(null)
  const [fecha,       setFecha]       = useState(todayISO)
  const [status,      setStatus]      = useState("borrador")
  const [folio,       setFolio]       = useState(genFolio)
  const [espera,      setEspera]      = useState([])
  const [showEspera,  setShowEspera]  = useState(false)
  const [pedidos,     setPedidos]     = useState(HISTORIAL_MOCK)
  const [showPreview, setShowPreview] = useState(false)
  const [showFalt,       setShowFalt]       = useState(false)
  const [faltantes,      setFaltantes]      = useState([])
  const [cargandoFalt,   setCargandoFalt]   = useState(false)
  const [showOCModal, setShowOCModal] = useState(false)
  const [ocNumber,    setOcNumber]    = useState(null)
  const [filtros,     setFiltros]     = useState({
    soloFaltantes: true, departamento: "", categoria: "", marca: "",
  })
  const [searchQ,  setSearchQ]  = useState("")
  const [toast,    setToast]    = useState(null)
  const toastRef = useRef(null)

  function showToast(msg, tipo = "") {
    clearTimeout(toastRef.current)
    setToast({ msg, tipo })
    toastRef.current = setTimeout(() => setToast(null), 2800)
  }

  function resetOrder() {
    setRows([])
    setFreeItems([])
    setProveedor(null)
    setFecha(todayISO())
    setStatus("borrador")
    setFolio(genFolio())
  }

  function addArticulo(art) {
    // Normaliza tanto artículos del mock como de la API real
    const minimo      = art.minimo      ?? art.inventarioMin  ?? 0
    const existencia  = art.existencia  ?? 0
    const unidad      = art.unidad      ?? art.unidadVenta    ?? art.unidadCompra ?? "Pieza"
    const precioRef   = art.ultimoPrecioCompra ?? art.precioCompra ?? 0

    setRows(prev => {
      const existing = prev.find(r => r.articuloId === art.id)
      if (existing) {
        showToast(`+1 ${art.descripcion}`)
        return prev.map(r => r.articuloId === art.id ? { ...r, cantidad: r.cantidad + 1 } : r)
      }
      const sugerida = Math.max(1, minimo - existencia)
      return [...prev, {
        _id:                uid(),
        articuloId:         art.id,
        clave:              art.clave,
        descripcion:        art.descripcion,
        unidad,
        existencia,
        minimo,
        ultimoPrecioCompra: precioRef,
        thumbnail:          art.thumbnail ?? null,
        cantidad:           sugerida,
      }]
    })
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r._id !== id))
    showToast("Artículo eliminado del pedido")
  }

  function updateQty(id, qty) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, cantidad: Math.max(1, qty) } : r))
  }

  // ── Free item handlers ────────────────────────────────────────────────────

  function addFreeItem(item) {
    setFreeItems(prev => [...prev, { _id: uid(), _isFree: true, ultimoPrecioCompra: 0, ...item }])
    showToast("Artículo libre agregado")
  }

  function removeFreeItem(id) {
    setFreeItems(prev => prev.filter(f => f._id !== id))
    showToast("Artículo libre eliminado")
  }

  // ── OC generation ─────────────────────────────────────────────────────────

  async function handleGenerarOC(prefs) {
    const oc = getNextOCNumber()
    setOcNumber(oc)

    const allItems = [...rows, ...freeItems]
    const imageMap = await buildImageMap(allItems)

    // Lazy-load @react-pdf/renderer to avoid blocking initial bundle
    const { pdf }        = await import("@react-pdf/renderer")
    const { OCDocument } = await import("./OCDocument")

    const blob = await pdf(
      <OCDocument
        rows={rows}
        freeItems={freeItems}
        imageMap={imageMap}
        proveedor={prefs.proveedor}
        ocNumber={oc}
        fechaEmision={new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}
        fechaEntrega={prefs.fechaEntrega}
        mostrarPrecios={prefs.mostrarPrecios}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    return oc  // Returned to OCConfirmModal to show in "generated" state
  }

  // ── Other handlers ────────────────────────────────────────────────────────

  function handlePonerEnEspera() {
    if (rows.length === 0 && freeItems.length === 0) return
    setEspera(prev => [...prev, { id: uid(), rows, freeItems, proveedor, fecha, folio, status }])
    resetOrder()
    showToast("Pedido puesto en espera")
    setShowEspera(false)
  }

  function handleRetomar(item) {
    if (rows.length > 0 || freeItems.length > 0) {
      setEspera(prev => [...prev, { id: uid(), rows, freeItems, proveedor, fecha, folio, status }])
    }
    setRows(item.rows)
    setFreeItems(item.freeItems ?? [])
    setProveedor(item.proveedor)
    setFecha(item.fecha)
    setFolio(item.folio)
    setStatus(item.status)
    setEspera(prev => prev.filter(e => e.id !== item.id))
    setShowEspera(false)
    showToast("Pedido retomado")
  }

  function handleGuardar() {
    if ((rows.length === 0 && freeItems.length === 0) || !proveedor) return
    const allItems = [
      ...rows.map(r => ({ clave: r.clave, descripcion: r.descripcion, cantidad: r.cantidad })),
      ...freeItems.map(f => ({ clave: f.clave, descripcion: f.descripcion + " [libre]", cantidad: f.cantidad })),
    ]
    const ped = {
      id: uid(), folio, fecha,
      proveedor: proveedor.nombre, proveedorId: proveedor.id,
      articulos: allItems,
      status,
    }
    setPedidos(prev => [ped, ...prev])
    showToast("Borrador guardado", "ok")
  }

  function handleCancelar() {
    if (!window.confirm("¿Cancelar este pedido? Los datos no guardados se perderán.")) return
    resetOrder()
    showToast("Pedido cancelado")
  }

  function handleShared() {
    setStatus("enviado")
    showToast("Pedido compartido — estado: Enviado", "ok")
  }

  async function abrirFaltantes() {
    setCargandoFalt(true)
    try {
      let arts = await listarFaltantes()
      // Aplicar filtros de departamento/categoría/marca sobre los resultados
      if (filtros.departamento) arts = arts.filter(a => a.departamento === filtros.departamento)
      if (filtros.categoria)    arts = arts.filter(a => a.categoria    === filtros.categoria)
      if (filtros.marca)        arts = arts.filter(a => a.marca        === filtros.marca)
      // Normalizar campos
      setFaltantes(arts.map(a => ({
        ...a,
        minimo:             a.inventarioMin ?? 0,
        unidad:             a.unidadVenta || a.unidadCompra || "Pieza",
        ultimoPrecioCompra: a.precioCompra ?? 0,
      })))
      setShowFalt(true)
    } catch {
      showToast("Error al cargar faltantes", "error")
    } finally {
      setCargandoFalt(false)
    }
  }

  const totalArticulos = rows.length + freeItems.length
  const totalPiezas    = [...rows, ...freeItems].reduce((s, r) => s + r.cantidad, 0)
  const canSave        = (rows.length > 0 || freeItems.length > 0) && !!proveedor
  const canShare       = (rows.length > 0 || freeItems.length > 0) && !!proveedor
  const hasItems       = rows.length > 0 || freeItems.length > 0

  return (
    <div className="pdx-root">
      {/* Topbar */}
      <div className="pdx-topbar">
        <div className="pdx-topbar-title">
          <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Pedidos</p>
          <p className="pdx-topbar-subtitle">Gestión de pedidos a proveedores</p>
        </div>

        <div className="pdx-tabs">
          <button className={`pdx-tab${activeTab === "nuevo" ? " active" : ""}`}   onClick={() => setActiveTab("nuevo")}>Nuevo Pedido</button>
          <button className={`pdx-tab${activeTab === "pedidos" ? " active" : ""}`} onClick={() => setActiveTab("pedidos")}>Mis Pedidos</button>
        </div>

        <div className="pdx-topbar-spacer" />

        {/* En espera */}
        <div className="pdx-espera-wrap">
          <button
            className="ar-btn-action"
            onClick={() => setShowEspera(v => !v)}
          >
            En espera
            {espera.length > 0 && <ChevronDown size={13} />}
            {espera.length > 0 && <span className="pdx-espera-badge">{espera.length}</span>}
          </button>
          {showEspera && espera.length > 0 && (
            <div className="pdx-espera-dropdown">
              <div className="pdx-espera-dropdown-header">Pedidos en espera</div>
              <div className="pdx-espera-list">
                {espera.map(e => (
                  <div key={e.id} className="pdx-espera-item">
                    <div>
                      <div className="pdx-espera-prov">{e.proveedor?.nombre ?? "Sin proveedor"}</div>
                      <div className="pdx-espera-meta">{e.rows.length} arts · {e.folio}</div>
                    </div>
                    <button
                      className="ar-btn-action"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => handleRetomar(e)}
                    >
                      Retomar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ar-toolbar-divider" />

        {/* Generar OC button */}
        <button
          className="ar-btn-add"
          style={{ background: "var(--at-orange)", borderColor: "var(--at-orange)" }}
          disabled={!hasItems}
          title={!hasItems ? "Agrega artículos al pedido primero" : undefined}
          onClick={() => setShowOCModal(true)}
        >
          <FileText size={14} /> Generar OC
        </button>

        <div className="ar-toolbar-divider" />

        <button className="ar-btn-add" onClick={resetOrder}>
          <Plus size={14} /> Nuevo pedido
        </button>

        <button className="ar-btn-action" disabled={!canSave} onClick={handleGuardar}>
          <Save size={14} /> Guardar borrador
        </button>

        <div className="ar-toolbar-divider" />

        <button className="ar-btn-action ar-btn-danger" disabled={!hasItems} onClick={handleCancelar}>
          <Trash2 size={14} /> Cancelar pedido
        </button>
      </div>

      {/* Toast */}
      {toast && <div className={`pdx-toast${toast.tipo ? " " + toast.tipo : ""}`}>{toast.msg}</div>}

      {/* Faltantes modal — loading */}
      {cargandoFalt && (
        <div className="pdx-modal-overlay">
          <div className="pdx-modal" style={{ width: 280, minHeight: "auto", padding: "32px 24px", alignItems: "center", gap: 16 }}>
            <div className="pdx-loading-spinner" />
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--at-text)", margin: 0 }}>
              Cargando faltantes…
            </p>
            <p style={{ fontSize: 12, color: "var(--at-text-muted)", margin: 0, textAlign: "center" }}>
              Consultando inventario en la base de datos
            </p>
          </div>
        </div>
      )}

      {showFalt && (
        <FaltantesModal
          faltantes={faltantes}
          rows={rows}
          onConfirm={arts => {
            arts.forEach(addArticulo)
            setShowFalt(false)
            showToast(`${arts.length} artículo${arts.length !== 1 ? "s" : ""} agregados al pedido`, "ok")
          }}
          onClose={() => setShowFalt(false)}
        />
      )}

      {/* Preview modal */}
      {showPreview && (
        <PedidosPreview
          rows={rows}
          proveedor={proveedor}
          fecha={fecha}
          folio={folio}
          onClose={() => setShowPreview(false)}
          onShared={handleShared}
        />
      )}

      {/* OC Confirm Modal */}
      {showOCModal && (
        <OCConfirmModal
          open={showOCModal}
          proveedores={PROVEEDORES}
          initialProveedor={proveedor}
          ocNumber={ocNumber}
          onClose={() => { setShowOCModal(false); setOcNumber(null) }}
          onGenerate={handleGenerarOC}
        />
      )}

      {/* Content */}
      {activeTab === "nuevo" ? (
        <div className="pdx-body">
          <PedidosFiltros
            filtros={filtros}
            onFiltrosChange={setFiltros}
            rows={rows}
            searchQ={searchQ}
            setSearchQ={setSearchQ}
            onAddArticulo={addArticulo}
            onCargarFaltantes={abrirFaltantes}
          />
          <PedidosTabla
            rows={rows}
            freeItems={freeItems}
            onAddFreeItem={addFreeItem}
            onRemoveFreeItem={removeFreeItem}
            proveedor={proveedor}
            proveedores={PROVEEDORES}
            onProveedorChange={setProveedor}
            fecha={fecha}
            onFechaChange={setFecha}
            status={status}
            onQtyChange={updateQty}
            onRemove={removeRow}
            onPonerEnEspera={handlePonerEnEspera}
            totalArticulos={totalArticulos}
            totalPiezas={totalPiezas}
            onPreview={() => setShowPreview(true)}
            canShare={canShare}
            folio={folio}
          />
        </div>
      ) : (
        <MisPedidos
          pedidos={pedidos}
          onStatusChange={(id, s) => setPedidos(prev => prev.map(p => p.id === id ? { ...p, status: s } : p))}
        />
      )}
    </div>
  )
}
