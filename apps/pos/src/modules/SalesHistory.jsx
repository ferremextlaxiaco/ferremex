import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  Clock, User, CreditCard, Receipt, UserRound, Printer, Ban, Truck,
  Package, Search, AlertTriangle, Loader, ArrowRightLeft, Banknote, Wallet, FileText,
} from "lucide-react"
import { listarVentas, buscarProductos, listarCatalogos, cancelarVenta, obtenerEntregaPorFolio } from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import { usePOS } from "../lib/pos-store"
import { formatMXNAbs as fmt } from "../lib/format"
import { FacturarBoton } from "../components/FacturarBoton"
import { TicketsEntrega } from "../components/TicketsEntrega"
import NotaVentaModal from "../components/NotaVentaModal"
import SelectorClienteModal from "../components/SelectorClienteModal"
import { CambioWizard } from "../components/CambioWizard"

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso) {
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
}

function groupKey(iso) {
  return iso.slice(0, 10)
}

function slugDate(d) { return d.toISOString().slice(0, 10) }

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function startOfDay(d) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

function isoToday() { return slugDate(new Date()) }

function downloadCSV(rows) {
  const header = ["Folio", "Fecha", "Cajero", "Cliente", "Total", "Efectivo", "Transferencia", "Tarjeta", "Crédito", "Puntos", "Cambio", "Estado"]
  const lines = [header.join(","), ...rows.map(v =>
    [v.folio, v.fecha, v.cajero, `"${(v.cliente_nombre || "Público en general").replace(/"/g, '""')}"`, v.total, v.pago_efectivo, v.pago_transferencia, v.pago_tarjeta ?? 0, v.pago_credito, v.pago_puntos ?? 0, v.cambio, v.estado ?? "vigente"].join(",")
  )]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url; a.download = "ventas.csv"; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}


// ── Toast ──────────────────────────────────────────────────────────────────────

function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 3000, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "success" ? "#16a34a" : t.type === "error" ? "#dc2626" : "#1e293b",
          color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)", minWidth: 220, maxWidth: 360,
          animation: "fadeSlideIn 0.2s ease",
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── ArticuloPicker modal ────────────────────────────────────────────────────────

const ART_PAGE = 15

function ArticuloPicker({ onSelect, onClose }) {
  const [query, setQuery]       = useState("")
  const [catalogos, setCatalogos] = useState(null)
  const [dept, setDept]         = useState(null)
  const [cat, setCat]           = useState(null)
  const [marca, setMarca]       = useState(null)
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado]   = useState(false)
  const [pagina, setPagina]     = useState(1)
  const inputRef = useRef(null)
  const debRef   = useRef(null)

  useEffect(() => {
    listarCatalogos().then(setCatalogos)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    function esc(e) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  function selDept(d) { setDept(d); setCat(null); setMarca(null) }
  function selCat(c)  { setCat(c);  setMarca(null) }

  const catsOpts   = catalogos && dept  ? catalogos.cats.filter(c => c.depId === dept.id)  : []
  const marcasOpts = catalogos && cat   ? catalogos.marcas.filter(m => m.catId === cat.id) : []

  async function buscar(q, ctx) {
    setBuscando(true); setBuscado(true); setPagina(1)
    try {
      const params = {}
      if (q.trim()) params.q = q.trim()
      if (ctx.cat?.medusaId)   params.category_id  = ctx.cat.medusaId
      else if (ctx.dept)       params.departamento  = ctx.dept.nombre
      let res = await buscarProductos(params)
      // El backend /caja/productos NO filtra por marca (solo q/category_id/
      // departamento). La marca se acota en cliente sobre el campo `marca` que ya
      // trae cada producto — mismo patrón que el Buscador de la pantalla de venta.
      if (ctx.marca?.nombre) {
        res = res.filter((p) => (p.marca ?? "") === ctx.marca.nombre)
      }
      setResultados(res)
    } finally { setBuscando(false) }
  }

  function onQueryChange(e) {
    const v = e.target.value
    setQuery(v)
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => buscar(v, { dept, cat, marca }), 350)
  }

  function handleDept(d) {
    const next = d?.id ? d : null
    setDept(next); setCat(null); setMarca(null)
    clearTimeout(debRef.current)
    buscar(query, { dept: next, cat: null, marca: null })
  }
  function handleCat(c) {
    const next = c?.id ? c : null
    setCat(next); setMarca(null)
    clearTimeout(debRef.current)
    buscar(query, { dept, cat: next, marca: null })
  }
  function handleMarca(m) {
    const next = m?.id ? m : null
    setMarca(next)
    clearTimeout(debRef.current)
    buscar(query, { dept, cat, marca: next })
  }

  const totalPags = Math.max(1, Math.ceil(resultados.length / ART_PAGE))
  const slice = resultados.slice((pagina - 1) * ART_PAGE, pagina * ART_PAGE)

  const selStyle = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 6,
    padding: "6px 8px", fontSize: 13, background: "#fff",
    color: "var(--text)", outline: "none", cursor: "pointer",
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: "fixed", inset: 0, zIndex: 4000,
        background: "rgba(0,0,0,0.48)", display: "flex",
        alignItems: "flex-start", justifyContent: "center", paddingTop: 48,
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 14, width: "min(820px, 96vw)",
        maxHeight: "82vh", display: "flex", flexDirection: "column",
        boxShadow: "0 12px 48px rgba(0,0,0,0.26)",
      }}>

        {/* Header */}
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", flex: 1 }}>Buscar artículo</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1, padding: "0 2px" }}>✕</button>
        </div>

        {/* Search input */}
        <div style={{ padding: "10px 14px 0" }}>
          <input
            ref={inputRef}
            value={query}
            onChange={onQueryChange}
            onKeyDown={e => { if (e.key === "Enter") { clearTimeout(debRef.current); buscar(query, { dept, cat, marca }) } }}
            placeholder="Nombre, descripción o SKU..."
            style={{
              width: "100%", border: "1.5px solid var(--border)", borderRadius: 8,
              padding: "8px 12px", fontSize: 14, outline: "none",
              boxSizing: "border-box", color: "var(--text)",
            }}
          />
        </div>

        {/* Taxonomy selects */}
        {catalogos && (
          <div style={{ padding: "8px 14px", display: "flex", flexDirection: "row", gap: 6 }}>
            <select value={dept?.id ?? ""} style={selStyle}
              onChange={e => {
                const d = catalogos.depts.find(x => x.id === e.target.value) ?? null
                handleDept(d ?? { id: "" })
              }}>
              <option value="">— Departamento —</option>
              {catalogos.depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
            <select value={cat?.id ?? ""} style={{ ...selStyle, opacity: catsOpts.length ? 1 : 0.45 }}
              disabled={!catsOpts.length}
              onChange={e => {
                const c = catsOpts.find(x => x.id === e.target.value) ?? null
                handleCat(c ?? { id: "" })
              }}>
              <option value="">— Categoría —</option>
              {catsOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={marca?.id ?? ""} style={{ ...selStyle, opacity: marcasOpts.length ? 1 : 0.45 }}
              disabled={!marcasOpts.length}
              onChange={e => {
                const m = marcasOpts.find(x => x.id === e.target.value) ?? null
                handleMarca(m ?? { id: "" })
              }}>
              <option value="">— Marca —</option>
              {marcasOpts.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Results list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 4px" }}>
          {buscando && (
            <div style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontSize: 13 }}>Buscando…</div>
          )}
          {!buscando && buscado && resultados.length === 0 && (
            <div style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontSize: 13 }}>Sin resultados</div>
          )}
          {!buscando && !buscado && (
            <div style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontSize: 13 }}>
              Escribe o selecciona un departamento para buscar
            </div>
          )}
          {!buscando && slice.map(art => (
            <button
              key={art.sku}
              onClick={() => onSelect(art)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "7px 8px", border: "none", background: "transparent",
                cursor: "pointer", borderRadius: 8, textAlign: "left",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: 7,
                overflow: "hidden", background: "#f0f0f0",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {art.thumbnail
                  ? <img src={art.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <Package size={20} color="#a1a1aa" />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {art.descripcion}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                  SKU: {art.sku} · Stock: {art.existencia}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--orange)", flexShrink: 0 }}>
                {fmt(art.precio)}
              </div>
            </button>
          ))}
        </div>

        {/* Footer: pagination or count */}
        <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
          {totalPags > 1 ? (
            <>
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                style={{ fontSize: 12, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 6, cursor: pagina === 1 ? "default" : "pointer", background: "#fff", color: pagina === 1 ? "var(--text-muted)" : "var(--text)" }}>
                ← Anterior
              </button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {pagina} / {totalPags} &nbsp;·&nbsp; {resultados.length} resultados
              </span>
              <button onClick={() => setPagina(p => Math.min(totalPags, p + 1))} disabled={pagina === totalPags}
                style={{ fontSize: 12, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 6, cursor: pagina === totalPags ? "default" : "pointer", background: "#fff", color: pagina === totalPags ? "var(--text-muted)" : "var(--text)" }}>
                Siguiente →
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 auto" }}>
              {buscado && !buscando ? `${resultados.length} resultado${resultados.length !== 1 ? "s" : ""}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filter panel ───────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Hoy", fn: () => ({ desde: isoToday(), hasta: isoToday() }) },
  { label: "Ayer", fn: () => { const a = slugDate(addDays(new Date(), -1)); return { desde: a, hasta: a } } },
  { label: "7 días", fn: () => ({ desde: slugDate(addDays(new Date(), -6)), hasta: isoToday() }) },
  { label: "Mes", fn: () => ({ desde: isoToday().slice(0,7) + "-01", hasta: isoToday() }) },
]

const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta", "Crédito", "Puntos", "Saldo a favor", "Mixto", "Contra entrega"]

const FP_KEY = "pos_sales_filters"
function loadFilters() {
  // Merge con defaults: usuarios con filtros viejos en localStorage no traen los
  // campos nuevos (cliente / clienteTodoPeriodo); el merge evita `undefined`.
  try {
    const saved = JSON.parse(localStorage.getItem(FP_KEY) ?? "null")
    return saved ? { ...defaultFilters(), ...saved } : defaultFilters()
  } catch { return defaultFilters() }
}
function defaultFilters() {
  return { desde: isoToday(), hasta: isoToday(), articulo: "", monto: "", cajero: "", metodo: "", cliente: "", clienteTodoPeriodo: false, estados: { vigente: true, cancelada: true } }
}

function FilterPanel({ filters, onChange, cajeros = [] }) {
  const [artModal, setArtModal] = useState(false)
  const [artObj, setArtObj]     = useState(null)
  const [cliModal, setCliModal] = useState(false)

  useEffect(() => { if (!filters.articulo) setArtObj(null) }, [filters.articulo])

  function set(k, v) { onChange({ ...filters, [k]: v }) }

  function handleArticuloSelect(art) {
    setArtObj(art)
    onChange({ ...filters, articulo: art.descripcion })
    setArtModal(false)
  }

  function clearArticulo() {
    setArtObj(null)
    onChange({ ...filters, articulo: "" })
  }

  function toggleEstado(k) {
    onChange({ ...filters, estados: { ...filters.estados, [k]: !filters.estados[k] } })
  }

  const chipStyle = (active, color) => ({
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none",
    background: active ? (color || "var(--orange)") : "var(--panel-bg, #f4f4f5)",
    color: active ? "#fff" : "var(--text-muted)",
  })

  const inputStyle = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 8px",
    fontSize: 12, background: "#fff", color: "var(--text)", outline: "none", boxSizing: "border-box",
  }

  const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, display: "block" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 12px" }}>

      {/* Presets */}
      <div style={filters.clienteTodoPeriodo ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
        <span style={labelStyle}>Período</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {PRESETS.map(p => {
            const r = p.fn()
            const active = filters.desde === r.desde && filters.hasta === r.hasta
            return (
              <button key={p.label} onClick={() => onChange({ ...filters, ...r })} style={chipStyle(active)}>
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rango de fechas — se desactiva visualmente si "todo el periodo" está activo */}
      <div style={filters.clienteTodoPeriodo ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
        <span style={labelStyle}>Rango de fechas</span>
        {filters.clienteTodoPeriodo && (
          <div style={{ fontSize: 11, color: "var(--orange)", marginBottom: 4 }}>
            Desactivado: mostrando todo el historial del cliente.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", width: 38, flexShrink: 0 }}>Desde</span>
            <input type="date" value={filters.desde} onChange={e => set("desde", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", width: 38, flexShrink: 0 }}>Hasta</span>
            <input type="date" value={filters.hasta} onChange={e => set("hasta", e.target.value)} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Artículo */}
      <div>
        <span style={labelStyle}>Artículo</span>
        {artObj ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
            borderRadius: 6, padding: "5px 8px", background: "#fff",
          }}>
            <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 5, overflow: "hidden", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {artObj.thumbnail
                ? <img src={artObj.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <Package size={14} color="#a1a1aa" />
              }
            </div>
            <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
              {artObj.descripcion}
            </span>
            <button onClick={clearArticulo} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setArtModal(true)} style={{
            ...inputStyle, textAlign: "left", cursor: "pointer",
            color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6,
          }}>
            <Search size={13} />
            <span>Seleccionar artículo…</span>
          </button>
        )}
        {artModal && <ArticuloPicker onSelect={handleArticuloSelect} onClose={() => setArtModal(false)} />}
      </div>

      {/* Monto */}
      <div>
        <span style={labelStyle}>Monto (±10%)</span>
        <input type="number" value={filters.monto} onChange={e => set("monto", e.target.value)}
          placeholder="ej. 500" style={inputStyle} />
      </div>

      {/* Cajero */}
      <div>
        <span style={labelStyle}>Cajero</span>
        <select value={filters.cajero} onChange={e => set("cajero", e.target.value)} style={inputStyle}>
          <option value="">Todos</option>
          {cajeros.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Cliente + "todo el periodo" */}
      <div>
        <span style={labelStyle}>Cliente</span>
        {filters.cliente?.trim() ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--border)",
            borderRadius: 6, padding: "6px 8px", background: "#fff",
          }}>
            <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontWeight: 600 }}>
              {filters.cliente}
            </span>
            <button onClick={() => setCliModal(true)} title="Cambiar cliente"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--orange)", fontSize: 12, fontWeight: 600, padding: "0 2px" }}>
              Cambiar
            </button>
            <button onClick={() => set("cliente", "")} title="Quitar filtro de cliente"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setCliModal(true)} style={{
            ...inputStyle, textAlign: "left", cursor: "pointer", color: "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            Buscar cliente…
            <Search size={12} />
          </button>
        )}
        <label style={{
          display: "flex", alignItems: "center", gap: 7, marginTop: 7,
          fontSize: 12, color: "var(--text-muted)", cursor: "pointer", userSelect: "none",
        }}>
          <input
            type="checkbox"
            checked={!!filters.clienteTodoPeriodo}
            onChange={e => set("clienteTodoPeriodo", e.target.checked)}
            style={{ cursor: "pointer" }}
          />
          Todo el periodo (ignora el rango de fechas)
        </label>

        <SelectorClienteModal
          open={cliModal}
          onClose={() => setCliModal(false)}
          onSelect={(c) => { set("cliente", c ? c.nombre : ""); setCliModal(false) }}
        />
      </div>

      {/* Método de pago */}
      <div>
        <span style={labelStyle}>Método de pago</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {METODOS_PAGO.map(m => (
            <button key={m} onClick={() => set("metodo", filters.metodo === m ? "" : m)} style={chipStyle(filters.metodo === m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Estado */}
      <div>
        <span style={labelStyle}>Estado</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => toggleEstado("vigente")} style={chipStyle(filters.estados.vigente, "#16a34a")}>
            Vigente
          </button>
          <button onClick={() => toggleEstado("cancelada")} style={chipStyle(filters.estados.cancelada, "#dc2626")}>
            Cancelada
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Active filter chips ────────────────────────────────────────────────────────

function ActiveChips({ filters, applied, onRemove }) {
  const chips = []
  if (applied.desde || applied.hasta) {
    const label = applied.desde === applied.hasta
      ? fmtDate(applied.desde)
      : `${applied.desde} – ${applied.hasta}`
    chips.push({ k: "fecha", label })
  }
  if (applied.articulo) chips.push({ k: "articulo", label: `Artículo: "${applied.articulo}"` })
  if (applied.monto) chips.push({ k: "monto", label: `Monto ≈ $${applied.monto}` })
  if (applied.cajero) chips.push({ k: "cajero", label: `Cajero: ${applied.cajero}` })
  if (applied.metodo) chips.push({ k: "metodo", label: applied.metodo })
  if (!applied.estados?.vigente) chips.push({ k: "ev", label: "Sin vigentes" })
  if (!applied.estados?.cancelada) chips.push({ k: "ec", label: "Sin canceladas" })

  if (!chips.length) return null

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 0" }}>
      {chips.map(c => (
        <span key={c.k} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "rgba(249,99,2,0.10)", color: "var(--orange)", border: "1px solid rgba(249,99,2,0.25)",
          borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 500,
        }}>
          {c.label}
          <button onClick={() => onRemove(c.k)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--orange)", fontSize: 13, lineHeight: 1 }}>×</button>
        </span>
      ))}
    </div>
  )
}

// ── Estado badge ───────────────────────────────────────────────────────────────

function EstadoBadge({ estado }) {
  // Estado "por_cobrar" (venta contra entrega sin liquidar) → badge naranja.
  if (estado === "por_cobrar") {
    return (
      <span style={{
        background: "rgba(234,88,12,0.12)", color: "#ea580c",
        borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
      }}>
        Por cobrar
      </span>
    )
  }
  const ok = estado !== "cancelada"
  return (
    <span style={{
      background: ok ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.10)",
      color: ok ? "#16a34a" : "#dc2626",
      borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {ok ? "Vigente" : "Cancelada"}
    </span>
  )
}

// ── Payment method label ───────────────────────────────────────────────────────

/** True si la venta es contra entrega (a domicilio, pago diferido). */
function esContraEntrega(v) {
  return v.metodo_pago === "contra_entrega"
}
/** True si la contra entrega ya se cobró (liquidó). */
function entregaCobrada(v) {
  return esContraEntrega(v) && v.estado === "cobrada"
}
/** True si la contra entrega sigue pendiente de cobro. */
function entregaPorCobrar(v) {
  return esContraEntrega(v) && v.estado === "por_cobrar"
}
/** True si la venta es un envío a domicilio con pago en tienda (total o abono). */
function esEntregaPagada(v) {
  return v.entrega_domicilio === "pagada"
}
/** True si la venta tiene una entrega a domicilio (pagada o contra entrega). */
function tieneEntrega(v) {
  return esContraEntrega(v) || esEntregaPagada(v)
}
/** Resta a cobrar al entregar (0 si no hay entrega o ya se pagó todo). */
function restaEntrega(v) {
  if (!tieneEntrega(v)) return 0
  return Number(v.entrega_total) || 0
}
/** True si un envío pagado dejó resta por cobrar al entregar (abono parcial). */
function entregaPagadaConResta(v) {
  return esEntregaPagada(v) && restaEntrega(v) > 0.005 && v.estado === "por_cobrar"
}
/** True si la entrega tiene algo por cobrar al entregar (contra entrega pendiente
 *  o envío pagado con resta). Es cuando "marcar como pagado" tiene sentido. */
function cobroPendienteEntrega(v) {
  return v.estado !== "cancelada" && (entregaPorCobrar(v) || entregaPagadaConResta(v))
}

const METODO_LABEL = {
  efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta",
  credito: "Crédito", puntos: "Puntos",
}

function metodoVenta(v) {
  // Contra entrega: mientras está por cobrar muestra "Contra entrega"; una vez
  // liquidada muestra el método real con que se cobró (guardado en cobro_metodo).
  if (esContraEntrega(v)) {
    if (v.estado === "cobrada") {
      return `Contra entrega · ${METODO_LABEL[v.cobro_metodo] ?? v.cobro_metodo ?? "cobrada"}`
    }
    return "Contra entrega"
  }
  const pagos = [
    v.pago_efectivo > 0 && "Efectivo",
    v.pago_transferencia > 0 && "Transferencia",
    (v.pago_tarjeta ?? 0) > 0 && "Tarjeta",
    v.pago_credito > 0 && "Crédito",
    (v.pago_puntos ?? 0) > 0 && "Puntos",
    (v.pago_saldo_cambio ?? 0) > 0 && "Saldo a favor",
  ].filter(Boolean)
  if (pagos.length === 0) return "—"
  if (pagos.length === 1) return pagos[0]
  return "Mixto"
}

// ── Venta card (detailed view) ─────────────────────────────────────────────────

/**
 * Chip de cliente de la venta: nombre del cliente (venta nominativa) o "Público
 * en general" si no hubo cliente. Permite distinguir de un vistazo qué ventas
 * son facturables a un cliente específico.
 */
function ClienteChip({ nombre }) {
  const esNominativa = !!(nombre && String(nombre).trim())
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
      background: esNominativa ? "rgba(234,88,12,0.10)" : "var(--bg-hover, #f3f4f6)",
      color: esNominativa ? "#c2410c" : "var(--text-muted, #9ca3af)",
    }}>
      {esNominativa ? <Receipt size={12} /> : <UserRound size={12} />}
      {esNominativa ? nombre : "Público en general"}
    </span>
  )
}

function VentaCard({ v, onClick }) {
  const metodo = metodoVenta(v)
  const vigente = v.estado !== "cancelada"

  // Barra lateral: naranja mientras la contra entrega está por cobrar, verde una
  // vez cobrada (o venta normal vigente), rojo si cancelada.
  const accentColor = !vigente ? "#dc2626" : entregaPorCobrar(v) ? "#ea580c" : "#16a34a"
  // Total mostrado: para contra entrega, el monto real a cobrar (entrega_total),
  // no el `total` (que es 0 hoy para que el corte cuadre).
  const totalMostrar = esContraEntrega(v) ? (v.entrega_total ?? v.total) : v.total

  // Flete ligado a la venta (lo adjunta el GET desde la ficha de entrega). Se
  // muestra como una subtarjeta UNIDA debajo de la venta (misma barra de color,
  // sin separación, borde punteado). El flete NO va en el total de la venta.
  const flete = v.flete && Number(v.flete.precio) > 0.005 ? v.flete : null

  const card = (
    <div onClick={() => onClick(v)} style={{
      background: "#fff", border: "1px solid var(--border)",
      // Si hay flete, la venta y el flete forman un bloque: la venta pierde el
      // radio inferior para "pegarse" a la subtarjeta.
      borderRadius: flete ? "10px 10px 0 0" : 10,
      borderBottom: flete ? "none" : "1px solid var(--border)",
      padding: "12px 14px",
      cursor: "pointer", display: "flex", gap: 12, alignItems: "stretch",
      transition: "box-shadow 0.15s", boxShadow: flete ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
      borderLeft: `4px solid ${accentColor}`,
      position: "relative",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = flete ? "none" : "0 3px 12px rgba(0,0,0,0.10)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = flete ? "none" : "0 1px 3px rgba(0,0,0,0.04)"}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>{v.folio}</span>
          <EstadoBadge estado={v.estado} />
          {!vigente && v.motivo_cancelacion && (
            <span style={{ fontSize: 12, color: "#dc2626", fontStyle: "italic" }}>— {v.motivo_cancelacion}</span>
          )}
        </div>
        {/* Row 2 */}
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 3, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 0" }}>
          <span style={{ marginRight: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {fmtTime(v.fecha)}</span>
          <span style={{ marginRight: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><User size={13} /> {v.cajero}</span>
          <span style={{
            marginRight: 12, display: "inline-flex", alignItems: "center", gap: 4,
            color: entregaPorCobrar(v) ? "#ea580c" : "inherit",
            fontWeight: esContraEntrega(v) ? 600 : 400,
          }}>
            {esContraEntrega(v) ? <Truck size={13} /> : <CreditCard size={13} />} {metodo}
          </span>
          <ClienteChip nombre={v.cliente_nombre} />
        </div>
        {/* Row 3 — items preview */}
        <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {v.items.map(i => `${i.cantidad}× ${i.descripcion}`).join(" · ")}
        </div>
      </div>
      {/* Total */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", minWidth: 80 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{fmt(totalMostrar)}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{v.items.length} art.</span>
      </div>
    </div>
  )

  // Sin flete: la tarjeta va sola.
  if (!flete) return card

  // Con flete: bloque venta + subtarjeta de flete UNIDA (misma barra de color a la
  // izquierda, pegada abajo, borde superior punteado como "hilo" que las une).
  const fleteEstado =
    flete.estado === "cobrado" ? { txt: "Cobrado", color: "#16a34a" }
    : flete.estado === "al_entregar" ? { txt: "Se cobra al entregar", color: "#ea580c" }
    : { txt: "Por cobrar", color: "#ea580c" }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {card}
      <div onClick={() => onClick(v)} style={{
        background: "#fff7ed", border: "1px solid var(--border)", borderTop: "1px dashed #fdba74",
        borderRadius: "0 0 10px 10px", borderLeft: `4px solid ${accentColor}`,
        padding: "7px 14px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 3px 12px rgba(0,0,0,0.10)"}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"}
      >
        <Banknote size={14} style={{ color: "#c2410c", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#9a3412" }}>Flete</span>
        <span style={{ fontSize: 11, color: fleteEstado.color, fontWeight: 500 }}>· {fleteEstado.txt}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>· ligado a {v.folio}</span>
        <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 700, color: "#9a3412" }}>{fmt(flete.precio)}</span>
      </div>
    </div>
  )
}

// ── Compact table ──────────────────────────────────────────────────────────────

function CompactTable({ ventas, sort, onSort, onRowClick }) {
  const cols = [
    { k: "folio",   label: "Folio" },
    { k: "hora",    label: "Hora" },
    { k: "cajero",  label: "Cajero" },
    { k: "cliente", label: "Cliente" },
    { k: "metodo",  label: "Pago" },
    { k: "items",   label: "Art." },
    { k: "total",   label: "Total" },
    { k: "estado",  label: "Estado" },
  ]

  const thStyle = (k) => ({
    padding: "6px 10px", textAlign: k === "total" ? "right" : "left",
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    color: "var(--text-muted)", borderBottom: "1px solid var(--border)", cursor: "pointer",
    background: "#fafafa", whiteSpace: "nowrap",
  })

  const tdStyle = (right) => ({
    padding: "8px 10px", fontSize: 13, color: "var(--text)",
    borderBottom: "1px solid var(--border)", textAlign: right ? "right" : "left",
  })

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c.k} style={thStyle(c.k)} onClick={() => onSort(c.k)}>
              {c.label}
              {sort.col === c.k && <span style={{ marginLeft: 3 }}>{sort.asc ? "↑" : "↓"}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ventas.map(v => (
          <tr key={v.folio} onClick={() => onRowClick(v)} style={{ cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <td style={{ ...tdStyle(), fontFamily: "monospace", fontSize: 12 }}>{v.folio}</td>
            <td style={tdStyle()}>{fmtTime(v.fecha)}</td>
            <td style={tdStyle()}>{v.cajero}</td>
            <td style={{ ...tdStyle(), color: v.cliente_nombre ? "#c2410c" : "var(--text-muted)", fontWeight: v.cliente_nombre ? 600 : 400 }}>
              {v.cliente_nombre ? v.cliente_nombre : "Público en general"}
            </td>
            <td style={tdStyle()}>{metodoVenta(v)}</td>
            <td style={tdStyle()}>{v.items.length}</td>
            <td style={{ ...tdStyle(true), fontWeight: 700 }}>{fmt(v.total)}</td>
            <td style={tdStyle()}><EstadoBadge estado={v.estado} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Sale detail drawer ─────────────────────────────────────────────────────────

function SaleDrawer({ venta, onClose, onCancel, onCambio, onToast }) {
  const navigate = useNavigate()
  const { state } = usePOS()
  const puedeAnular = !!state.cajero?.permisos?.puede_anular
  // Reimpresión de los dos tickets de entrega (solo ventas contra entrega).
  const [ticketsEntrega, setTicketsEntrega] = useState(null) // { venta, ficha } | null
  const [cargandoFicha, setCargandoFicha] = useState(false)
  // Nota de venta imprimible (hoja carta, estética factura). true = modal abierto.
  const [notaVenta, setNotaVenta] = useState(false)

  useEffect(() => {
    function esc(e) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  async function reimprimirEntrega() {
    if (!venta || cargandoFicha) return
    setCargandoFicha(true)
    try {
      const ficha = await obtenerEntregaPorFolio(venta.folio)
      if (ficha) setTicketsEntrega({ venta, ficha })
    } catch { /* noop — best-effort */ } finally {
      setCargandoFicha(false)
    }
  }

  if (!venta) return null

  const vigente = venta.estado !== "cancelada"
  const contraEntrega = esContraEntrega(venta)
  const metodo = metodoVenta(venta)
  // Total real de la venta (para contra entrega, el monto a cobrar, no el 0 de hoy).
  const totalReal = contraEntrega ? (venta.entrega_total ?? venta.total) : venta.total

  const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }
  const labelC = { color: "var(--text-muted)", flex: 1 }
  const valueC = { color: "var(--text)", fontWeight: 500 }

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1500 }} />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 560, maxWidth: "92vw", background: "#fff",
        zIndex: 1501, boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
        animation: "slideInRight 0.2s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>{venta.folio}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fmtDateTime(venta.fecha)}</div>
          </div>
          <EstadoBadge estado={venta.estado} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", padding: "0 4px" }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Metadata */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>Datos de la venta</div>
            <div style={rowStyle}><span style={labelC}>Cajero</span><span style={valueC}>{venta.cajero}</span></div>
            <div style={rowStyle}>
              <span style={labelC}>Cliente</span>
              <span style={{ ...valueC, color: venta.cliente_nombre ? "#c2410c" : "var(--text-muted)", fontWeight: venta.cliente_nombre ? 600 : 400 }}>
                {venta.cliente_nombre ? venta.cliente_nombre : "Público en general"}
              </span>
            </div>
            <div style={rowStyle}><span style={labelC}>Turno</span><span style={valueC}>{venta.turno_id}</span></div>
            <div style={rowStyle}>
              <span style={labelC}>Método de pago</span>
              <span style={{ ...valueC, color: entregaPorCobrar(venta) ? "#ea580c" : "var(--text)", fontWeight: contraEntrega ? 600 : 500 }}>{metodo}</span>
            </div>
            {contraEntrega && (
              <div style={rowStyle}>
                <span style={labelC}>Entrega</span>
                <span style={{ ...valueC, color: entregaCobrada(venta) ? "#16a34a" : "#ea580c", fontWeight: 600 }}>
                  {entregaCobrada(venta) ? "Cobrada y entregada" : "Por cobrar (a domicilio)"}
                </span>
              </div>
            )}
            {esEntregaPagada(venta) && (
              <div style={rowStyle}>
                <span style={labelC}>Entrega</span>
                <span style={{ ...valueC, color: entregaPagadaConResta(venta) ? "#ea580c" : "#16a34a", fontWeight: 600 }}>
                  {entregaPagadaConResta(venta) ? "Abono · resta al entregar" : "Pagada · a domicilio"}
                </span>
              </div>
            )}
            {venta.motivo_cancelacion && (
              <div style={rowStyle}><span style={labelC}>Motivo cancelación</span><span style={{ ...valueC, color: "#dc2626" }}>{venta.motivo_cancelacion}</span></div>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>Artículos</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["SKU","Descripción","Qty","P. unit","Subtotal"].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", padding: "3px 6px", borderBottom: "1px solid var(--border)", textAlign: (h === "Descripción" || h === "SKU") ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venta.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ padding: "5px 6px", fontSize: 11, color: "#ea580c", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{it.sku ?? "—"}</td>
                    <td style={{ padding: "5px 6px", fontSize: 12, color: "var(--text)", borderBottom: "1px solid var(--border)" }}>{it.descripcion}</td>
                    <td style={{ padding: "5px 6px", fontSize: 12, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{it.cantidad}</td>
                    <td style={{ padding: "5px 6px", fontSize: 12, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{fmt(it.precio_unitario)}</td>
                    <td style={{ padding: "5px 6px", fontSize: 12, fontWeight: 600, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{fmt(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>Totales</div>
            {venta.pago_efectivo > 0 && <div style={rowStyle}><span style={labelC}>Efectivo</span><span style={valueC}>{fmt(venta.pago_efectivo)}</span></div>}
            {venta.pago_transferencia > 0 && <div style={rowStyle}><span style={labelC}>Transferencia</span><span style={valueC}>{fmt(venta.pago_transferencia)}</span></div>}
            {(venta.pago_tarjeta ?? 0) > 0 && <div style={rowStyle}><span style={labelC}>Tarjeta</span><span style={valueC}>{fmt(venta.pago_tarjeta)}</span></div>}
            {venta.pago_credito > 0 && <div style={rowStyle}><span style={labelC}>Crédito</span><span style={valueC}>{fmt(venta.pago_credito)}</span></div>}
            {(venta.pago_puntos ?? 0) > 0 && (
              <div style={rowStyle}>
                <span style={labelC}>Puntos{(venta.puntos_canjeados ?? 0) > 0 ? ` (${venta.puntos_canjeados} pts)` : ""}</span>
                <span style={valueC}>{fmt(venta.pago_puntos)}</span>
              </div>
            )}
            {(venta.pago_saldo_cambio ?? 0) > 0 && (
              <div style={rowStyle}>
                <span style={labelC}>Saldo a favor</span>
                <span style={valueC}>{fmt(venta.pago_saldo_cambio)}</span>
              </div>
            )}
            {venta.cambio > 0 && <div style={rowStyle}><span style={labelC}>Cambio</span><span style={valueC}>{fmt(venta.cambio)}</span></div>}
            {/* Contra entrega: no hubo cobro hoy; el monto se cobra al entregar. */}
            {contraEntrega && (
              <div style={rowStyle}>
                <span style={labelC}>{entregaCobrada(venta) ? `Cobrado (${METODO_LABEL[venta.cobro_metodo] ?? venta.cobro_metodo ?? "—"})` : "Por cobrar al entregar"}</span>
                <span style={{ ...valueC, color: entregaCobrada(venta) ? "#16a34a" : "#ea580c", fontWeight: 600 }}>{fmt(totalReal)}</span>
              </div>
            )}
            {/* Envío pagado con abono parcial: resta que cobra el repartidor. */}
            {entregaPagadaConResta(venta) && (
              <div style={rowStyle}>
                <span style={labelC}>Resta a cobrar al entregar</span>
                <span style={{ ...valueC, color: "#ea580c", fontWeight: 600 }}>{fmt(restaEntrega(venta))}</span>
              </div>
            )}
            <div style={{ ...rowStyle, borderBottom: "none", paddingTop: 8 }}>
              <span style={{ ...labelC, fontWeight: 700, fontSize: 13, color: "var(--text)" }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{fmt(totalReal)}</span>
            </div>
          </div>

          {/* Audit trail */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 8 }}>Auditoría</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", marginTop: 3, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>Venta registrada</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDateTime(venta.fecha)} · {venta.cajero}</div>
                </div>
              </div>
              {entregaPorCobrar(venta) && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ea580c", marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>Por cobrar (contra entrega)</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>El material salió; el pago se registra al entregar a domicilio.</div>
                  </div>
                </div>
              )}
              {entregaCobrada(venta) && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>Cobrada y entregada</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {fmt(totalReal)} · {METODO_LABEL[venta.cobro_metodo] ?? venta.cobro_metodo ?? "—"}
                      {venta.cobro_fecha ? ` · ${fmtDateTime(venta.cobro_fecha)}` : ""}
                    </div>
                  </div>
                </div>
              )}
              {esEntregaPagada(venta) && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: entregaPagadaConResta(venta) ? "#ea580c" : "#16a34a", marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
                      {entregaPagadaConResta(venta) ? "Abono — envío a domicilio" : "Pagada — envío a domicilio"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {entregaPagadaConResta(venta)
                        ? `Abonó en tienda; resta ${fmt(restaEntrega(venta))} a cobrar al entregar. Seguimiento en "Entregas a domicilio".`
                        : `El material se pagó en tienda y se envía a domicilio. Seguimiento en "Entregas a domicilio".`}
                    </div>
                  </div>
                </div>
              )}
              {venta.estado === "cancelada" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", marginTop: 3, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>Cancelada</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{venta.motivo_cancelacion ?? "Sin motivo registrado"}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Marcar como pagado: solo cuando la entrega tiene cobro pendiente. El
              cobro/liquidación vive en "Entregas a domicilio" — este botón lleva
              allá y abre esa entrega directamente (folio por query string). */}
          {(cobroPendienteEntrega(venta) || tieneEntrega(venta)) && (
            <div style={{ display: "flex", gap: 8, flex: "1 1 100%" }}>
              {cobroPendienteEntrega(venta) && (
                <button onClick={() => navigate(`/admin/entregas-por-cobrar?folio=${encodeURIComponent(venta.folio)}`)} style={{
                  flex: 1, background: "#16a34a", border: "1px solid #15803d", borderRadius: 6,
                  padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#fff",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                  <Wallet size={14} /> Marcar como pagado
                </button>
              )}
              {/* Entrega a domicilio (contra entrega o pagada): reimprime los DOS
                  comprobantes (cliente + repartidor). */}
              {tieneEntrega(venta) && (
                <button onClick={reimprimirEntrega} disabled={cargandoFicha} style={{
                  flex: 1, background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.3)", borderRadius: 6,
                  padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: cargandoFicha ? "default" : "pointer", color: "#ea580c",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: cargandoFicha ? 0.6 : 1,
                }}>
                  <Truck size={14} /> {cargandoFicha ? "Cargando…" : "Reimprimir"}
                </button>
              )}
            </div>
          )}
          {!tieneEntrega(venta) && (
            <button onClick={() => window.print()} style={{
              flex: 1, background: "var(--panel-bg, #f4f4f5)", border: "1px solid var(--border)", borderRadius: 6,
              padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text)",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}><Printer size={14} /> Reimprimir</button>
          )}
          {/* Facturar SIEMPRE disponible. Para ventas a público en general, el
              FacturarBoton pide elegir cliente y reasigna la venta antes de timbrar.
              Si ya está facturada, muestra "Ver factura". */}
          <FacturarBoton
            folio={venta.folio}
            cliente={venta.cliente_id ? { id: venta.cliente_id, nombre: venta.cliente_nombre } : null}
            facturaInicial={venta.factura ?? null}
            variant="compact"
          />
          {vigente && (
            <button onClick={() => onCambio(venta)} style={{
              flex: 1, background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 6,
              padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#2563eb",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}><ArrowRightLeft size={14} /> Cambiar artículo</button>
          )}
          {/* Nota de venta formal (hoja carta, estética factura sin sellos). Para
              cualquier venta: convierte el ticket en un documento imprimible. */}
          <button onClick={() => setNotaVenta(true)} style={{
            flex: 1, background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.3)", borderRadius: 6,
            padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#ea580c",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}><FileText size={14} /> Nota de venta</button>
          {vigente && puedeAnular && (
            <button onClick={() => onCancel(venta)} style={{
              flex: 1, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6,
              padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#dc2626",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}><Ban size={14} /> Cancelar</button>
          )}
        </div>
      </div>

      {/* Reimpresión de los dos comprobantes de entrega (cliente + repartidor). */}
      {ticketsEntrega && (
        <TicketsEntrega
          venta={ticketsEntrega.venta}
          ficha={ticketsEntrega.ficha}
          onCerrar={() => setTicketsEntrega(null)}
        />
      )}

      {/* Nota de venta: modal de opciones + visor PDF (hoja carta). */}
      {notaVenta && (
        <NotaVentaModal
          venta={venta}
          onClose={() => setNotaVenta(false)}
          pushToast={onToast}
        />
      )}
    </>
  )
}

// ── Cancellation modal (2-step) ────────────────────────────────────────────────

function CancelModal({ venta, onClose, onConfirm }) {
  const [step, setStep] = useState(1)
  const [tipo, setTipo] = useState("total") // "total" | "parcial"
  const [motivo, setMotivo] = useState("")
  const [refund, setRefund] = useState("efectivo")
  const [sel, setSel] = useState({}) // item index → qty
  const [motivoParcial, setMotivoParcial] = useState("")

  useEffect(() => {
    function esc(e) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  if (!venta) return null

  const btnPrimary = {
    background: "var(--orange)", color: "#fff", border: "none", borderRadius: 6,
    padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  }
  const btnSecondary = {
    background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
    padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-muted)",
  }
  const btnDanger = {
    background: "#dc2626", color: "#fff", border: "none", borderRadius: 6,
    padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  }

  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }
  const inputStyle = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 6,
    padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box",
  }

  function handleConfirm() {
    if (tipo === "total") {
      if (!motivo.trim()) return
      onConfirm({ tipo: "total", motivo, refund })
    } else {
      const itemsSel = Object.entries(sel).filter(([, q]) => q > 0)
      if (!itemsSel.length || !motivoParcial.trim()) return
      onConfirm({ tipo: "parcial", items: itemsSel, motivo: motivoParcial })
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, width: 480, maxWidth: "95vw", zIndex: 2001,
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>Cancelar venta</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{venta.folio}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[1, 2].map(s => (
              <div key={s} style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: step >= s ? "#dc2626" : "var(--panel-bg, #f4f4f5)",
                color: step >= s ? "#fff" : "var(--text-muted)",
              }}>{s}</div>
            ))}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", marginLeft: 8 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {step === 1 && (
            <div>
              <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 16 }}>¿Qué tipo de cancelación deseas realizar?</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { k: "total", label: "Cancelación total", desc: "Cancela todos los artículos de la venta" },
                  { k: "parcial", label: "Devolución parcial", desc: "Selecciona artículos específicos a devolver" },
                ].map(op => (
                  <button key={op.k} onClick={() => setTipo(op.k)} style={{
                    flex: 1, background: tipo === op.k ? "rgba(220,38,38,0.07)" : "transparent",
                    border: tipo === op.k ? "2px solid #dc2626" : "1px solid var(--border)",
                    borderRadius: 8, padding: "12px", cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: tipo === op.k ? "#dc2626" : "var(--text)", marginBottom: 4 }}>{op.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{op.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && tipo === "total" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Motivo de cancelación *</label>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej. Artículo equivocado, cliente desistió..." style={inputStyle} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Tipo de devolución</label>
                <select value={refund} onChange={e => setRefund(e.target.value)} style={inputStyle}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="nota_credito">Nota de crédito</option>
                </select>
              </div>
              <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>Se cancelarán {venta.items.length} artículo(s)</div>
                <div style={{ fontSize: 12, color: "#dc2626" }}>Total: {fmt(venta.total)}</div>
              </div>
            </div>
          )}

          {step === 2 && tipo === "parcial" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Selecciona los artículos a devolver:</div>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {venta.items.map((it, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < venta.items.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!sel[i]} onChange={e => setSel(s => ({ ...s, [i]: e.target.checked ? it.cantidad : 0 }))} />
                    <span style={{ flex: 1, fontSize: 12, color: "var(--text)" }}>{it.descripcion}</span>
                    {sel[i] > 0 && (
                      <input type="number" min={1} max={it.cantidad} value={sel[i] || ""}
                        onChange={e => setSel(s => ({ ...s, [i]: Number(e.target.value) }))}
                        style={{ width: 52, border: "1px solid var(--border)", borderRadius: 4, padding: "2px 5px", fontSize: 12, textAlign: "center" }} />
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 60, textAlign: "right" }}>{fmt(it.subtotal)}</span>
                  </label>
                ))}
              </div>
              <div>
                <label style={labelStyle}>Motivo *</label>
                <input value={motivoParcial} onChange={e => setMotivoParcial(e.target.value)}
                  placeholder="Ej. Artículo defectuoso..." style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          {step === 1
            ? <button onClick={() => setStep(2)} style={btnPrimary}>Continuar →</button>
            : <button onClick={handleConfirm} style={btnDanger}>Confirmar cancelación</button>
          }
        </div>
      </div>
    </>
  )
}

// ── Main module ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function SalesHistory() {
  // Filters (draft = what's shown in panel; applied = what's active)
  const [filters, setFilters] = useState(loadFilters)
  const [applied, setApplied] = useState(loadFilters)

  // Data
  const [allVentas, setAllVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Carga las ventas del rango aplicado (no todo el historial). Reutilizable por
  // el efecto inicial, el botón "Recargar" y tras cancelar una venta.
  const recargar = useCallback(() => {
    setLoading(true)
    setFetchError(null)
    // "Todo el periodo" (checkbox del filtro por cliente): ignora el rango de
    // fechas y trae TODAS las ventas, para ver el historial completo del cliente.
    const todoPeriodo = applied.clienteTodoPeriodo
    const desde = todoPeriodo ? undefined : (applied.desde || undefined)
    const hasta = todoPeriodo ? undefined : (applied.hasta || undefined)
    return listarVentas(desde, hasta)
      .then(data => { setAllVentas(data.map(v => ({ ...v, estado: v.estado ?? "vigente" }))); setLoading(false) })
      .catch(err => { setFetchError(err.message ?? "Error al cargar ventas"); setLoading(false) })
  }, [applied.desde, applied.hasta, applied.clienteTodoPeriodo])

  useEffect(() => { recargar() }, [recargar])

  // Cajeros derived from loaded data
  const cajeros = useMemo(() => [...new Set(allVentas.map(v => v.cajero))].sort(), [allVentas])

  // UI state
  const [panelOpen, setPanelOpen] = useState(true)
  const [view, setView] = useState("detallada") // "detallada" | "compacta"
  const [sort, setSort] = useState({ col: "fecha", asc: false })
  const [page, setPage] = useState(1)
  const [searchFolio, setSearchFolio] = useState("")
  const [drawer, setDrawer] = useState(null) // venta | null
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cambioTarget, setCambioTarget] = useState(null) // venta | null — abre CambioWizard
  const { toasts, push: pushToast } = useToasts()

  // Persist filters
  useEffect(() => {
    localStorage.setItem(FP_KEY, JSON.stringify(filters))
  }, [filters])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = allVentas

    // Folio search (toolbar)
    if (searchFolio.trim()) {
      const q = searchFolio.trim().toLowerCase()
      list = list.filter(v => v.folio.toLowerCase().includes(q) ||
        v.items.some(i => i.descripcion.toLowerCase().includes(q)))
    } else {
      // Apply panel filters. El rango de fechas se OMITE cuando "todo el periodo"
      // está activo (el historial completo del cliente, sin importar la fecha).
      if (!applied.clienteTodoPeriodo) {
        if (applied.desde) list = list.filter(v => v.fecha.slice(0, 10) >= applied.desde)
        if (applied.hasta) list = list.filter(v => v.fecha.slice(0, 10) <= applied.hasta)
      }
      // Filtro por cliente: coincidencia parcial (case-insensitive) sobre el
      // nombre del cliente de la venta. "Público en general" (sin cliente) no
      // coincide con ninguna búsqueda de cliente.
      if (applied.cliente?.trim()) {
        const q = applied.cliente.trim().toLowerCase()
        list = list.filter(v => (v.cliente_nombre || "").toLowerCase().includes(q))
      }
      if (applied.articulo.trim()) {
        const q = applied.articulo.trim().toLowerCase()
        list = list.filter(v => v.items.some(i => i.descripcion.toLowerCase().includes(q)))
      }
      if (applied.monto) {
        const m = parseFloat(applied.monto)
        if (!isNaN(m)) list = list.filter(v => v.total >= m * 0.9 && v.total <= m * 1.1)
      }
      if (applied.cajero) list = list.filter(v => v.cajero === applied.cajero)
      if (applied.metodo) {
        list = list.filter(v => {
          // "Contra entrega" agrupa todas las ventas contra entrega (por cobrar y
          // cobradas), sin importar el método real con que se liquidaron.
          if (applied.metodo === "Contra entrega") return esContraEntrega(v)
          const met = metodoVenta(v)
          return met === applied.metodo
        })
      }
      if (!applied.estados?.vigente) list = list.filter(v => v.estado === "cancelada")
      if (!applied.estados?.cancelada) list = list.filter(v => v.estado !== "cancelada")
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av, bv
      if (sort.col === "folio") { av = a.folio; bv = b.folio }
      else if (sort.col === "hora") { av = a.fecha; bv = b.fecha }
      else if (sort.col === "cajero") { av = a.cajero; bv = b.cajero }
      else if (sort.col === "cliente") { av = a.cliente_nombre || "￿"; bv = b.cliente_nombre || "￿" }
      else if (sort.col === "metodo") { av = metodoVenta(a); bv = metodoVenta(b) }
      else if (sort.col === "items") { av = a.items.length; bv = b.items.length }
      else if (sort.col === "total") { av = a.total; bv = b.total }
      else if (sort.col === "estado") { av = a.estado ?? "vigente"; bv = b.estado ?? "vigente" }
      else { av = a.fecha; bv = b.fecha }
      if (av < bv) return sort.asc ? -1 : 1
      if (av > bv) return sort.asc ? 1 : -1
      return 0
    })

    return list
  }, [allVentas, searchFolio, applied, sort])



  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map()
    for (const v of paginated) {
      const k = groupKey(v.fecha)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(v)
    }
    return map
  }, [paginated])

  // Búsqueda automática: cada cambio en el panel de filtros se aplica al instante
  // (sin botón "Buscar"). `applied` sigue a `filters`; los filtros de fecha/cliente
  // disparan recarga vía `recargar`, el resto filtra sobre `allVentas` en cliente.
  useEffect(() => {
    setApplied({ ...filters })
    setPage(1)
  }, [filters])

  function handleClear() {
    const def = defaultFilters()
    setFilters(def)
    setApplied(def)
    setPage(1)
    setSearchFolio("")
  }

  function handleRemoveChip(k) {
    if (k === "fecha") { setApplied(a => ({ ...a, desde: "", hasta: "" })); setFilters(f => ({ ...f, desde: "", hasta: "" })) }
    else if (k === "articulo") { setApplied(a => ({ ...a, articulo: "" })); setFilters(f => ({ ...f, articulo: "" })) }
    else if (k === "monto") { setApplied(a => ({ ...a, monto: "" })); setFilters(f => ({ ...f, monto: "" })) }
    else if (k === "cajero") { setApplied(a => ({ ...a, cajero: "" })); setFilters(f => ({ ...f, cajero: "" })) }
    else if (k === "metodo") { setApplied(a => ({ ...a, metodo: "" })); setFilters(f => ({ ...f, metodo: "" })) }
    else if (k === "ev") { setApplied(a => ({ ...a, estados: { ...a.estados, vigente: true } })) }
    else if (k === "ec") { setApplied(a => ({ ...a, estados: { ...a.estados, cancelada: true } })) }
    setPage(1)
  }

  function handleSort(col) {
    setSort(s => s.col === col ? { col, asc: !s.asc } : { col, asc: true })
  }

  async function handleCancelConfirm(cfg) {
    // Capturar folio antes de cualquier setState (evita leer cancelTarget tras reset).
    const folio = cancelTarget?.folio
    if (!folio) return
    try {
      // Persistir en el backend (marca cancelada + reintegra inventario).
      await cancelarVenta(folio, cfg.motivo)
      setAllVentas(prev => prev.map(v =>
        v.folio !== folio ? v : { ...v, estado: "cancelada", motivo_cancelacion: cfg.motivo }
      ))
      if (drawer?.folio === folio) {
        setDrawer(d => ({ ...d, estado: "cancelada", motivo_cancelacion: cfg.motivo }))
      }
      setCancelTarget(null)
      pushToast(`Venta ${folio} cancelada`, "success")
    } catch (err) {
      pushToast(err?.message || `No se pudo cancelar la venta ${folio}`, "error")
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--panel-bg, #f4f4f5)", fontFamily: "system-ui, sans-serif" }}>

      {/* Toolbar */}
      <div style={{
        height: 56, background: "#fff", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0,
      }}>
        {/* Title */}
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", flexShrink: 0 }}>Consulta de ventas</span>

        {/* Folio / article search */}
        <div style={{ flex: 1, maxWidth: 320, position: "relative" }}>
          <input
            value={searchFolio}
            onChange={e => { setSearchFolio(e.target.value); setPage(1) }}
            placeholder="Buscar folio o artículo..."
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 6,
              padding: "5px 10px 5px 30px", fontSize: 12, color: "var(--text)", outline: "none",
              boxSizing: "border-box", background: "#fafafa",
            }}
          />
          <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          {searchFolio && (
            <button onClick={() => { setSearchFolio(""); setPage(1) }} style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            }}>×</button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {[["detallada", "Detallada"], ["compacta", "Compacta"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{
              background: view === k ? "var(--orange)" : "#fff",
              color: view === k ? "#fff" : "var(--text-muted)",
              border: "none", padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>

        {/* Reload */}
        <button onClick={() => {
          recargar()
          pushToast("Actualizando ventas…", "info")
        }} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: 6,
          padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 5,
        }} title="Recargar ventas">
          🔄
        </button>

        {/* Export */}
        <button onClick={() => { downloadCSV(filtered); pushToast("CSV exportado", "success") }} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: 6,
          padding: "5px 10px", fontSize: 12, cursor: "pointer", color: "var(--text)", display: "flex", alignItems: "center", gap: 5,
        }}>
          ⬇ CSV
        </button>

        {/* KPI de conteo: empujado al extremo derecho de la barra con margin-left auto. */}
        <div style={{
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          padding: "10px 16px", minWidth: 100, marginLeft: "auto",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Ventas</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{filtered.length}</div>
        </div>

        {/* Limpiar filtros: entre el contador de ventas y el toggle de filtros. La
            búsqueda es automática (cada cambio se aplica), así que solo queda Limpiar. */}
        <button onClick={handleClear} style={{
          background: "var(--panel-bg, #f4f4f5)", border: "1px solid var(--border)", borderRadius: 6,
          padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--text)",
          flexShrink: 0,
        }}>Limpiar</button>

        {/* Panel toggle: al extremo derecho, del lado del panel de filtros que controla. */}
        <button onClick={() => setPanelOpen(o => !o)} style={{
          background: "none", border: "1px solid var(--border)", borderRadius: 6,
          padding: "4px 8px", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
        }}>
          {panelOpen ? "Filtros ▶" : "Filtros ◀"}
        </button>

      </div>

      {/* Body. row-reverse: el contenido queda a la izquierda y el panel de
          filtros a la derecha (el JSX mantiene panel-primero por claridad). */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row-reverse", overflow: "hidden" }}>

        {/* Filter panel (a la derecha) */}
        {panelOpen && (
          <div style={{
            width: 260, flexShrink: 0, background: "#fff", borderLeft: "1px solid var(--border)",
            overflowY: "auto",
          }}>
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              cajeros={cajeros}
            />
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Active chips */}
          {!searchFolio && (
            <div style={{ padding: "0 16px", background: "#fff", borderBottom: filtered.length ? "none" : "1px solid var(--border)" }}>
              <ActiveChips filters={filters} applied={applied} onRemove={handleRemoveChip} />
            </div>
          )}

          {/* List / table */}
          <div style={{ flex: 1, overflowY: "auto", padding: view === "detallada" ? 16 : 0 }}>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", color: "var(--text-muted)", gap: 8 }}>
                <Loader size={26} className="spin" />
                <span style={{ fontSize: 14 }}>Cargando ventas…</span>
              </div>
            ) : fetchError ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", color: "#dc2626", gap: 8 }}>
                <AlertTriangle size={26} />
                <span style={{ fontSize: 14 }}>{fetchError}</span>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", color: "var(--text-muted)", gap: 8 }}>
                <Search size={32} />
                <span style={{ fontSize: 14 }}>Sin resultados con los filtros actuales</span>
                <button onClick={handleClear} style={{ fontSize: 12, color: "var(--orange)", background: "none", border: "none", cursor: "pointer" }}>Limpiar filtros</button>
              </div>
            ) : view === "detallada" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {[...grouped.entries()].map(([dateKey, ventas]) => (
                  <div key={dateKey}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                      {fmtDate(dateKey)} · {ventas.length} venta{ventas.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ventas.map(v => <VentaCard key={v.folio} v={v} onClick={setDrawer} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <CompactTable ventas={paginated} sort={sort} onSort={handleSort} onRowClick={setDrawer} />
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: "10px 16px", borderTop: "1px solid var(--border)", background: "#fff",
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>‹</button>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}>›</button>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sale drawer */}
      <SaleDrawer
        venta={drawer}
        onClose={() => setDrawer(null)}
        onCancel={v => { setCancelTarget(v); setDrawer(null) }}
        onCambio={v => { setCambioTarget(v); setDrawer(null) }}
        onToast={pushToast}
      />

      {/* Cancel modal */}
      {cancelTarget && (
        <CancelModal
          venta={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
        />
      )}

      {/* Cambio de artículo */}
      {cambioTarget && (
        <CambioWizard
          folioInicial={cambioTarget.folio}
          onClose={() => setCambioTarget(null)}
          onCompletado={(cambio) => {
            setCambioTarget(null)
            pushToast(`Cambio ${cambio.folio_cambio} procesado correctamente`, "success")
            recargar()
          }}
        />
      )}

      {/* Toasts */}
      <ToastStack toasts={toasts} />

      {/* Animations */}
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  )
}
