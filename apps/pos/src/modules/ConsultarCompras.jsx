import { useState, useEffect, useMemo, useRef } from "react"
import {
  Search, X, Download, Printer, FileText, AlertTriangle,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Ban, Maximize2,
} from "lucide-react"
import { incrementarInventario } from "../lib/client"

// ── Helpers ────────────────────────────────────────────────────────────────────

function r2(n) { return Math.round(n * 100) / 100 }

// ── Persistencia compartida con ComprasModule ─────────────────────────────────

const KEY_HISTORIAL = "pos_historial_compras"

function cargarHistorial() {
  try { return JSON.parse(localStorage.getItem(KEY_HISTORIAL) ?? "[]") } catch { return [] }
}

function guardarHistorial(lista) {
  localStorage.setItem(KEY_HISTORIAL, JSON.stringify(lista))
}

function fmt(n) {
  const s = Math.abs(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? "-$" : "$") + s
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ── Shared style objects ───────────────────────────────────────────────────────

const INPUT_STYLE = {
  border: "1px solid var(--at-border)",
  borderRadius: 5,
  padding: "4px 8px",
  fontSize: 12,
  background: "var(--at-bg-input)",
  color: "var(--at-text)",
  outline: "none",
  height: 28,
}

const MINI_TH = {
  textAlign: "left",
  padding: "3px 5px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--at-text-muted)",
  borderBottom: "1px solid var(--at-border)",
}

const MINI_TD = {
  padding: "4px 5px",
  borderBottom: "1px solid var(--at-border)",
  color: "var(--at-text-soft)",
  fontSize: 11,
}

// ── (datos históricos reales se cargan desde localStorage) ───────────────────

// ── Estado badge ──────────────────────────────────────────────────────────────

function EstadoBadge({ estado }) {
  return estado === "Recibida"
    ? <span style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>Recibida</span>
    : <span style={{ background: "rgba(220,38,38,0.1)",  color: "#dc2626", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>Cancelada</span>
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function ConsultarCompras() {
  const [purchases,       setPurchases]       = useState(() => cargarHistorial())
  const [filters,         setFilters]         = useState({ fechaInicio: "", fechaFin: "", tipo: "", estado: "" })
  const [searchInput,     setSearchInput]     = useState("")
  const [appliedSearch,   setAppliedSearch]   = useState("")
  const [sortCol,         setSortCol]         = useState("fecha")
  const [sortDir,         setSortDir]         = useState("desc")
  const [selectedId,      setSelectedId]      = useState(null)
  const [cancelModal,     setCancelModal]     = useState(null)
  const [cancelMotivo,    setCancelMotivo]    = useState("")
  const [priceCompOpen,   setPriceCompOpen]   = useState(false)
  const [articleModal,    setArticleModal]    = useState(null)
  const [fullscreen,      setFullscreen]      = useState(false)
  const [toast,           setToast]           = useState(null)
  const toastTimer = useRef(null)

  // Recarga desde localStorage al montar (cubre el caso de navegación entre rutas)
  useEffect(() => {
    setPurchases(cargarHistorial())
  }, [])

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg, color = "#16a34a") {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, color })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return
      if (articleModal)       { setArticleModal(null); return }
      if (cancelModal)        { setCancelModal(null); setCancelMotivo(""); return }
      if (fullscreen)         { setFullscreen(false); return }
      if (selectedId !== null) setSelectedId(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedId, cancelModal, articleModal, fullscreen])

  // ── Filtered + sorted ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let r = purchases
    if (filters.fechaInicio) r = r.filter(p => p.fecha >= filters.fechaInicio)
    if (filters.fechaFin)    r = r.filter(p => p.fecha <= filters.fechaFin)
    if (filters.tipo)        r = r.filter(p => p.tipo === filters.tipo)
    if (filters.estado)      r = r.filter(p => p.estado === filters.estado)
    if (appliedSearch.trim()) {
      const q = appliedSearch.trim().toLowerCase()
      r = r.filter(p =>
        p.folio.toLowerCase().startsWith(q) ||
        p.proveedor.toLowerCase().includes(q) ||
        p.articulos.some(a => a.nombre.toLowerCase().includes(q))
      )
    }
    const dir = sortDir === "asc" ? 1 : -1
    return [...r].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (sortCol === "total") { av = +av; bv = +bv }
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [purchases, filters, appliedSearch, sortCol, sortDir])

  // ── Derived values ────────────────────────────────────────────────────────

  const selectedPurchase  = purchases.find(p => p.id === selectedId) ?? null
  const panelOpen         = selectedId !== null
  const anyFilterActive   = !!(filters.fechaInicio || filters.fechaFin || filters.tipo || filters.estado || appliedSearch.trim())
  const totalFiltrado     = filtered.reduce((s, p) => s + p.total, 0)
  const ivaFiltrado       = filtered.reduce((s, p) => s + p.iva, 0)

  const chips = [
    filters.fechaInicio && { key: "fechaInicio", label: `Desde: ${fmtDate(filters.fechaInicio)}` },
    filters.fechaFin    && { key: "fechaFin",    label: `Hasta: ${fmtDate(filters.fechaFin)}` },
    filters.tipo        && { key: "tipo",        label: `Tipo: ${filters.tipo}` },
    filters.estado      && { key: "estado",      label: `Estado: ${filters.estado}` },
    appliedSearch.trim()&& { key: "search",      label: `Búsqueda: "${appliedSearch}"` },
  ].filter(Boolean)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function applySearch() { setAppliedSearch(searchInput) }

  function clearAll() {
    setFilters({ fechaInicio: "", fechaFin: "", tipo: "", estado: "" })
    setSearchInput("")
    setAppliedSearch("")
  }

  function removeChip(key) {
    if (key === "search") { setSearchInput(""); setAppliedSearch(""); return }
    setFilters(f => ({ ...f, [key]: "" }))
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
  }

  function handleRowClick(p) {
    setSelectedId(prev => prev === p.id ? null : p.id)
    setPriceCompOpen(false)
    setFullscreen(false)
  }

  function openCancel(purchase) { setCancelModal(purchase); setCancelMotivo("") }

  async function confirmCancel() {
    if (!cancelModal || cancelMotivo.trim().length < 5) return
    const now = new Date().toISOString()
    setPurchases(prev => {
      const updated = prev.map(p =>
        p.id === cancelModal.id
          ? { ...p, estado: "Cancelada", canceladaEl: now, motivoCancelacion: cancelMotivo.trim() }
          : p
      )
      guardarHistorial(updated)
      return updated
    })

    // Descontar del inventario las unidades que entró esta compra
    const ajustes = (cancelModal.articulos ?? [])
      .filter(a => a.codigo)
      .map(a => ({ sku: a.codigo, delta: -a.cantidad }))
    if (ajustes.length > 0) {
      await incrementarInventario(ajustes).catch(err =>
        console.error("Error al descontar inventario por cancelación:", err)
      )
    }

    showToast(`Compra ${cancelModal.folio} cancelada correctamente`, "#dc2626")
    setCancelModal(null)
    setCancelMotivo("")
  }

  function exportCSV() {
    const header = ["Folio", "Proveedor", "Fecha", "Tipo", "Subtotal", "IVA", "Total", "Estado"]
    const rows = filtered.map(p => [
      p.folio, p.proveedor, p.fecha, p.tipo,
      p.subtotal.toFixed(2), p.iva.toFixed(2), p.total.toFixed(2), p.estado,
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `compras_ferremex_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast("CSV exportado correctamente", "#16a34a")
  }

  function getPriceHistory(nombre) {
    const hits = []
    for (const p of purchases) {
      const match = p.articulos.find(a => a.nombre === nombre)
      if (match) hits.push({ folio: p.folio, proveedor: p.proveedor, fecha: p.fecha, precioUnit: match.precioUnit, isCurrent: p.id === selectedId })
    }
    return hits.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5)
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ marginLeft: 3, opacity: 0.3, fontSize: 10 }}>↕</span>
    return sortDir === "asc"
      ? <ArrowUp   size={11} style={{ marginLeft: 3, color: "var(--at-orange)" }} />
      : <ArrowDown size={11} style={{ marginLeft: 3, color: "var(--at-orange)" }} />
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Root ── */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--at-bg)" }}>

        {/* ── ZONE 1: Filter bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", height: 56, background: "var(--at-bg-panel)", borderBottom: "1px solid var(--at-border)", flexShrink: 0, flexWrap: "nowrap", overflowX: "auto" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)", flexShrink: 0 }}>Filtros</span>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <label style={{ fontSize: 11, color: "var(--at-text-soft)", whiteSpace: "nowrap" }}>Desde</label>
            <input type="date" value={filters.fechaInicio} onChange={e => setFilters(f => ({ ...f, fechaInicio: e.target.value }))} style={INPUT_STYLE} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <label style={{ fontSize: 11, color: "var(--at-text-soft)", whiteSpace: "nowrap" }}>Hasta</label>
            <input type="date" value={filters.fechaFin} onChange={e => setFilters(f => ({ ...f, fechaFin: e.target.value }))} style={INPUT_STYLE} />
          </div>

          <select value={filters.tipo} onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))} style={{ ...INPUT_STYLE, paddingRight: 6 }}>
            <option value="">Tipo: Todos</option>
            <option value="Factura">Factura</option>
            <option value="Nota de Crédito">Nota de Crédito</option>
            <option value="Complemento de Pago">Complemento de Pago</option>
            <option value="Traslado">Traslado</option>
          </select>

          <select value={filters.estado} onChange={e => setFilters(f => ({ ...f, estado: e.target.value }))} style={{ ...INPUT_STYLE, paddingRight: 6 }}>
            <option value="">Estado: Todos</option>
            <option value="Recibida">Recibida</option>
            <option value="Cancelada">Cancelada</option>
          </select>

          {anyFilterActive && (
            <button
              onClick={clearAll}
              style={{ background: "transparent", border: "none", color: "var(--at-text-soft)", fontSize: 12, padding: "5px 10px", borderRadius: 4, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* ── ZONE 2: Search + chips ── */}
        <div style={{ background: "var(--at-bg-panel)", borderBottom: "1px solid var(--at-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, padding: "8px 16px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--at-text-muted)", pointerEvents: "none" }} />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applySearch() } }}
                placeholder="Buscar por folio, proveedor o artículo..."
                style={{ ...INPUT_STYLE, width: "100%", height: 32, paddingLeft: 32 }}
              />
            </div>
            <button
              onClick={applySearch}
              style={{ background: "var(--at-orange)", color: "#fff", border: "none", borderRadius: 5, padding: "0 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, height: 32, whiteSpace: "nowrap" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--at-orange-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--at-orange)"}
            >
              Buscar
            </button>
          </div>

          {chips.length > 0 && (
            <div style={{ display: "flex", gap: 5, padding: "0 16px 8px", flexWrap: "wrap" }}>
              {chips.map(chip => (
                <span key={chip.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(249,99,2,0.06)", color: "#c2410c", border: "1px solid rgba(249,99,2,0.22)", borderRadius: 20, padding: "2px 8px 2px 10px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
                  {chip.label}
                  <button
                    onClick={() => removeChip(chip.key)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", color: "inherit", opacity: 0.6 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0.6"}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 16px", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "var(--at-text-soft)" }}>
            {filtered.length} compra{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={exportCSV}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--at-border)", borderRadius: 5, padding: "5px 11px", fontSize: 12, color: "var(--at-text-soft)", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Download size={13} /> Exportar CSV
          </button>
        </div>

        {/* ── ZONE 3: Main area ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* TABLE */}
          <div style={{ flex: panelOpen ? "0 0 65%" : "1 1 100%", overflow: "auto", transition: "flex 0.25s ease", minWidth: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, padding: 24 }}>
                <p style={{ color: "var(--at-text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
                  {purchases.length === 0
                    ? "No hay compras registradas. Confirma una compra en el módulo de Compras para verla aquí."
                    : "No se encontraron compras con los filtros seleccionados."
                  }
                </p>
                {anyFilterActive && (
                  <button
                    onClick={clearAll}
                    style={{ background: "transparent", border: "1px solid var(--at-orange)", color: "var(--at-orange)", borderRadius: 5, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--at-orange-soft)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--at-bg-panel)", position: "sticky", top: 0, zIndex: 1 }}>
                    {[
                      { col: "folio",     label: "Folio" },
                      { col: "proveedor", label: "Proveedor" },
                      { col: "fecha",     label: "Fecha" },
                      { col: "tipo",      label: "Tipo" },
                      { col: "total",     label: "Total",  right: true },
                      { col: "estado",    label: "Estado" },
                    ].map(({ col, label, right }) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{ textAlign: right ? "right" : "left", padding: "9px 12px", borderBottom: "1px solid var(--at-border)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-soft)", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center" }}>
                          {label}{sortIcon(col)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const sel = p.id === selectedId
                    const can = p.estado === "Cancelada"
                    return (
                      <tr
                        key={p.id}
                        onClick={() => handleRowClick(p)}
                        style={{ cursor: "pointer", opacity: can ? 0.5 : 1, background: sel ? "rgba(249,99,2,0.08)" : "transparent", borderLeft: sel ? "2px solid var(--at-orange)" : "2px solid transparent" }}
                        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(249,99,2,0.04)" }}
                        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent" }}
                      >
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)" }}>
                          <span style={{ fontWeight: 600, textDecoration: can ? "line-through" : "none" }}>{p.folio}</span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)" }}>{p.proveedor}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)", color: "var(--at-text-soft)", whiteSpace: "nowrap" }}>{fmtDate(p.fecha)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)", color: "var(--at-text-soft)" }}>{p.tipo}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(p.total)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--at-border)" }}>
                          <EstadoBadge estado={p.estado} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* DETAIL PANEL */}
          {panelOpen && selectedPurchase && (
            <div style={{ width: "35%", flexShrink: 0, borderLeft: "1px solid var(--at-border)", background: "var(--at-bg-panel)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Panel header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--at-border)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{selectedPurchase.folio}</span>
                  <EstadoBadge estado={selectedPurchase.estado} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button
                    onClick={() => setFullscreen(true)}
                    title="Pantalla completa"
                    style={{ background: "transparent", border: "none", padding: 4, borderRadius: 4, cursor: "pointer", color: "var(--at-text-muted)", display: "flex" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--at-text)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--at-text-muted)"}
                  >
                    <Maximize2 size={14} />
                  </button>
                  <button
                    onClick={() => setSelectedId(null)}
                    title="Cerrar"
                    style={{ background: "transparent", border: "none", padding: 4, borderRadius: 4, cursor: "pointer", color: "var(--at-text-muted)", display: "flex" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--at-text)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--at-text-muted)"}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Panel body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px" }}>

                {/* Sección 1: info */}
                <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{selectedPurchase.proveedor}</p>
                <p style={{ fontSize: 12, color: "var(--at-text-soft)", marginBottom: 2 }}>{fmtDate(selectedPurchase.fecha)}</p>
                <p style={{ fontSize: 12, color: "var(--at-text-soft)" }}>{selectedPurchase.tipo}</p>

                <hr style={{ border: "none", borderTop: "1px solid var(--at-border)", margin: "11px 0" }} />

                {/* Sección 2: artículos */}
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)", marginBottom: 6 }}>Artículos</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {[
                        { h: "Código", right: false },
                        { h: "Artículo", right: false },
                        { h: "Cant.", right: true },
                        { h: "P. Unit.", right: true },
                        { h: "Total", right: true },
                      ].map(({ h, right }) => (
                        <th key={h} style={{ ...MINI_TH, textAlign: right ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPurchase.articulos.map((a, i) => (
                      <tr
                        key={i}
                        onClick={() => setArticleModal(a)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(249,99,2,0.04)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ ...MINI_TD, fontFamily: "monospace" }}>{a.codigo}</td>
                        <td style={{ ...MINI_TD, maxWidth: 100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.nombre}>{a.nombre}</td>
                        <td style={{ ...MINI_TD, textAlign: "right" }}>{a.cantidad}</td>
                        <td style={{ ...MINI_TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(a.precioUnit)}</td>
                        <td style={{ ...MINI_TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(r2(a.precioUnit * a.cantidad))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <hr style={{ border: "none", borderTop: "1px solid var(--at-border)", margin: "11px 0" }} />

                {/* Sección 3: totales */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[
                    { label: "Subtotal", value: fmt(selectedPurchase.subtotal), bold: false },
                    { label: "IVA (16%)", value: fmt(selectedPurchase.iva), bold: false },
                    { label: "Total", value: fmt(selectedPurchase.total), bold: true },
                  ].map(({ label, value, bold }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: bold ? 14 : 12, fontWeight: bold ? 700 : 400 }}>
                      <span style={{ color: bold ? "var(--at-text)" : "var(--at-text-soft)" }}>{label}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Audit line */}
                {selectedPurchase.canceladaEl && (
                  <p style={{ fontSize: 10, color: "var(--at-text-muted)", fontStyle: "italic", marginTop: 8, lineHeight: 1.4 }}>
                    Cancelada el {fmtDateTime(selectedPurchase.canceladaEl)} · Motivo: {selectedPurchase.motivoCancelacion}
                  </p>
                )}

                <hr style={{ border: "none", borderTop: "1px solid var(--at-border)", margin: "11px 0" }} />

                {/* Sección 4: comparativo de precios (colapsable) */}
                <button
                  onClick={() => setPriceCompOpen(v => !v)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "transparent", border: "none", padding: "2px 0", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--at-text-soft)" }}
                >
                  <span>Comparativo de precios por artículo</span>
                  {priceCompOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {priceCompOpen && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
                    {selectedPurchase.articulos.map((a, i) => {
                      const history = getPriceHistory(a.nombre)
                      const name    = a.nombre.length > 30 ? a.nombre.slice(0, 30) + "…" : a.nombre
                      return (
                        <div key={i}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--at-text)", marginBottom: 4 }} title={a.nombre}>{name}</p>
                          {history.length <= 1 ? (
                            <p style={{ fontSize: 11, color: "var(--at-text-muted)", fontStyle: "italic" }}>Sin historial previo de este artículo</p>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr>
                                  <th style={MINI_TH}>Proveedor</th>
                                  <th style={MINI_TH}>Fecha</th>
                                  <th style={{ ...MINI_TH, textAlign: "right" }}>P. Unit.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {history.map((h, j) => (
                                  <tr key={j} style={{ background: h.isCurrent ? "rgba(249,99,2,0.06)" : "transparent", fontWeight: h.isCurrent ? 600 : 400 }}>
                                    <td style={MINI_TD}>{h.proveedor}</td>
                                    <td style={{ ...MINI_TD, whiteSpace: "nowrap" }}>{fmtDate(h.fecha)}</td>
                                    <td style={{ ...MINI_TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(h.precioUnit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Panel footer */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderTop: "1px solid var(--at-border)", flexShrink: 0, flexWrap: "wrap" }}>
                <button
                  onClick={() => showToast("Función disponible próximamente", "#71717a")}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "var(--at-text-soft)", fontSize: 12, padding: "5px 8px", borderRadius: 4, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Printer size={13} /> Imprimir
                </button>
                <button
                  onClick={() => showToast("Función disponible próximamente", "#71717a")}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "var(--at-text-soft)", fontSize: 12, padding: "5px 8px", borderRadius: 4, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <FileText size={13} /> Ver PDF
                </button>
                <div style={{ width: 1, height: 18, background: "var(--at-border)", margin: "0 2px", flexShrink: 0 }} />
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => selectedPurchase.estado !== "Cancelada" && openCancel(selectedPurchase)}
                    title={selectedPurchase.estado === "Cancelada" ? "Esta compra ya fue cancelada" : undefined}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "1px solid rgba(220,38,38,0.3)", color: "#dc2626", fontSize: 12, padding: "4px 9px", borderRadius: 4, cursor: selectedPurchase.estado === "Cancelada" ? "not-allowed" : "pointer", opacity: selectedPurchase.estado === "Cancelada" ? 0.4 : 1, pointerEvents: selectedPurchase.estado === "Cancelada" ? "none" : "auto" }}
                    onMouseEnter={e => { if (selectedPurchase.estado !== "Cancelada") e.currentTarget.style.background = "rgba(220,38,38,0.06)" }}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Ban size={13} /> Cancelar Compra
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ZONE 4: Footer ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", height: 40, background: "var(--at-bg-panel)", borderTop: "1px solid var(--at-border)", flexShrink: 0, fontSize: 12, color: "var(--at-text-soft)" }}>
          <span>Mostrando {filtered.length} compra{filtered.length !== 1 ? "s" : ""}</span>
          <span>
            Total filtrado: <strong style={{ color: "var(--at-text)" }}>{fmt(totalFiltrado)}</strong>
            {" · "}
            IVA incluido: <strong style={{ color: "var(--at-text)" }}>{fmt(ivaFiltrado)}</strong>
          </span>
        </div>
      </div>

      {/* ── MODAL: Pantalla completa ── */}
      {fullscreen && selectedPurchase && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--at-bg-panel)", display: "flex", flexDirection: "column" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid var(--at-border)", flexShrink: 0, background: "var(--at-bg-panel)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{selectedPurchase.folio}</span>
              <EstadoBadge estado={selectedPurchase.estado} />
              <span style={{ fontSize: 13, color: "var(--at-text-soft)" }}>—</span>
              <span style={{ fontSize: 13, color: "var(--at-text-soft)" }}>{selectedPurchase.proveedor}</span>
              <span style={{ fontSize: 13, color: "var(--at-text-muted)" }}>{fmtDate(selectedPurchase.fecha)}</span>
            </div>
            <button
              onClick={() => setFullscreen(false)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--at-border)", borderRadius: 5, padding: "6px 12px", fontSize: 13, color: "var(--at-text-soft)", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <X size={14} /> Salir de pantalla completa
            </button>
          </div>

          {/* Body — dos columnas */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>

            {/* Columna izquierda: info + artículos */}
            <div style={{ flex: "0 0 60%", borderRight: "1px solid var(--at-border)", overflowY: "auto", padding: "24px 28px" }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)" }}>Tipo de documento</span>
                <p style={{ fontSize: 14, color: "var(--at-text)", marginTop: 2 }}>{selectedPurchase.tipo}</p>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--at-border)", margin: "16px 0" }} />

              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)", marginBottom: 10 }}>Artículos</p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--at-bg)", position: "sticky", top: 0 }}>
                    {[
                      { h: "Código",  right: false },
                      { h: "Artículo", right: false },
                      { h: "Cant.",   right: true },
                      { h: "P. Unit.", right: true },
                      { h: "Total",   right: true },
                    ].map(({ h, right }) => (
                      <th key={h} style={{ textAlign: right ? "right" : "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)", borderBottom: "1px solid var(--at-border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.articulos.map((a, i) => (
                    <tr
                      key={i}
                      onClick={() => setArticleModal(a)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(249,99,2,0.04)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--at-border)", fontFamily: "monospace", fontSize: 12, color: "var(--at-text-soft)" }}>{a.codigo}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--at-border)" }}>{a.nombre}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--at-border)", textAlign: "right" }}>{a.cantidad}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--at-border)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(a.precioUnit)}</td>
                      <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--at-border)", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmt(r2(a.precioUnit * a.cantidad))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Columna derecha: totales + comparativo */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 0 }}>

              {/* Totales */}
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--at-text-muted)", marginBottom: 12 }}>Resumen</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Subtotal", value: fmt(selectedPurchase.subtotal), bold: false },
                  { label: "IVA (16%)", value: fmt(selectedPurchase.iva), bold: false },
                  { label: "Total", value: fmt(selectedPurchase.total), bold: true },
                ].map(({ label, value, bold }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 18 : 14, fontWeight: bold ? 700 : 400, padding: bold ? "8px 0 0" : "0", borderTop: bold ? "1px solid var(--at-border)" : "none" }}>
                    <span style={{ color: bold ? "var(--at-text)" : "var(--at-text-soft)" }}>{label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: bold ? "var(--at-orange)" : "var(--at-text)" }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Audit line */}
              {selectedPurchase.canceladaEl && (
                <p style={{ fontSize: 11, color: "var(--at-text-muted)", fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>
                  Cancelada el {fmtDateTime(selectedPurchase.canceladaEl)} · Motivo: {selectedPurchase.motivoCancelacion}
                </p>
              )}

              <hr style={{ border: "none", borderTop: "1px solid var(--at-border)", margin: "20px 0" }} />

              {/* Comparativo de precios (colapsable) */}
              <button
                onClick={() => setPriceCompOpen(v => !v)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "transparent", border: "none", padding: "2px 0", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--at-text-soft)", marginBottom: 8 }}
              >
                <span>Comparativo de precios por artículo</span>
                {priceCompOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {priceCompOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {selectedPurchase.articulos.map((a, i) => {
                    const history = getPriceHistory(a.nombre)
                    return (
                      <div key={i}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--at-text)", marginBottom: 5 }}>{a.nombre}</p>
                        {history.length <= 1 ? (
                          <p style={{ fontSize: 12, color: "var(--at-text-muted)", fontStyle: "italic" }}>Sin historial previo de este artículo</p>
                        ) : (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr>
                                <th style={MINI_TH}>Proveedor</th>
                                <th style={MINI_TH}>Fecha</th>
                                <th style={{ ...MINI_TH, textAlign: "right" }}>P. Unit.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((h, j) => (
                                <tr key={j} style={{ background: h.isCurrent ? "rgba(249,99,2,0.06)" : "transparent", fontWeight: h.isCurrent ? 600 : 400 }}>
                                  <td style={{ ...MINI_TD, fontSize: 12 }}>{h.proveedor}</td>
                                  <td style={{ ...MINI_TD, fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(h.fecha)}</td>
                                  <td style={{ ...MINI_TD, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(h.precioUnit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer con acciones */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", borderTop: "1px solid var(--at-border)", flexShrink: 0, background: "var(--at-bg-panel)" }}>
            <button
              onClick={() => showToast("Función disponible próximamente", "#71717a")}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: "var(--at-text-soft)", fontSize: 13, padding: "6px 10px", borderRadius: 4, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Printer size={14} /> Imprimir
            </button>
            <button
              onClick={() => showToast("Función disponible próximamente", "#71717a")}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", color: "var(--at-text-soft)", fontSize: 13, padding: "6px 10px", borderRadius: 4, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--at-bg-hover)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <FileText size={14} /> Ver PDF
            </button>
            <div style={{ width: 1, height: 20, background: "var(--at-border)", margin: "0 4px", flexShrink: 0 }} />
            <button
              onClick={() => selectedPurchase.estado !== "Cancelada" && openCancel(selectedPurchase)}
              title={selectedPurchase.estado === "Cancelada" ? "Esta compra ya fue cancelada" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid rgba(220,38,38,0.3)", color: "#dc2626", fontSize: 13, padding: "5px 12px", borderRadius: 4, cursor: selectedPurchase.estado === "Cancelada" ? "not-allowed" : "pointer", opacity: selectedPurchase.estado === "Cancelada" ? 0.4 : 1, pointerEvents: selectedPurchase.estado === "Cancelada" ? "none" : "auto" }}
              onMouseEnter={e => { if (selectedPurchase.estado !== "Cancelada") e.currentTarget.style.background = "rgba(220,38,38,0.06)" }}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Ban size={14} /> Cancelar Compra
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Cancelar Compra ── */}
      {cancelModal && (
        <div
          onClick={() => { setCancelModal(null); setCancelMotivo("") }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 128 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", maxWidth: 448, width: "calc(100% - 32px)", padding: 24 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <AlertTriangle size={24} color="#dc2626" />
              <span style={{ fontSize: 16, fontWeight: 700, color: "#18181b" }}>Cancelar Compra</span>
            </div>
            <p style={{ fontSize: 13, color: "#52525b", marginBottom: 4, lineHeight: 1.5 }}>
              Estás por cancelar la compra <strong>{cancelModal.folio}</strong> de <strong>{cancelModal.proveedor}</strong> por <strong>{fmt(cancelModal.total)}</strong>.
            </p>
            <p style={{ fontSize: 12, color: "#71717a", marginBottom: 16, lineHeight: 1.5 }}>
              Esta acción no se puede deshacer. La compra seguirá visible en el historial como Cancelada.
            </p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
              Motivo de cancelación *
            </label>
            <textarea
              rows={3}
              value={cancelMotivo}
              onChange={e => setCancelMotivo(e.target.value)}
              placeholder="Describe el motivo de la cancelación..."
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 13, padding: "7px 10px", resize: "none", outline: "none", fontFamily: "inherit", color: "#18181b", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "#F96302"}
              onBlur={e => e.target.style.borderColor = "#d1d5db"}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => { setCancelModal(null); setCancelMotivo("") }}
                style={{ background: "transparent", border: "1px solid #d1d5db", color: "#52525b", borderRadius: 5, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                Mantener compra
              </button>
              <button
                onClick={confirmCancel}
                disabled={cancelMotivo.trim().length < 5}
                style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 5, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: cancelMotivo.trim().length >= 5 ? "pointer" : "not-allowed", opacity: cancelMotivo.trim().length >= 5 ? 1 : 0.4 }}
                onMouseEnter={e => { if (cancelMotivo.trim().length >= 5) e.currentTarget.style.background = "#b91c1c" }}
                onMouseLeave={e => e.currentTarget.style.background = "#dc2626"}
              >
                Cancelar Compra
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Detalle de artículo ── */}
      {articleModal && (
        <div
          onClick={() => setArticleModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,0.16)", maxWidth: 360, width: "calc(100% - 32px)", padding: 20 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Detalle de artículo</span>
              <button onClick={() => setArticleModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#71717a", display: "flex" }}>
                <X size={15} />
              </button>
            </div>
            {[
              { label: "Código",   value: articleModal.codigo },
              { label: "Artículo", value: articleModal.nombre },
              { label: "Cantidad", value: String(articleModal.cantidad) },
              { label: "P. Unit.", value: fmt(articleModal.precioUnit) },
              { label: "Total",    value: fmt(r2(articleModal.precioUnit * articleModal.cantidad)) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid #f4f4f5" }}>
                <span style={{ fontSize: 12, color: "#71717a", flexShrink: 0, marginRight: 12 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100, display: "flex", alignItems: "center", gap: 10, background: toast.color, color: "#fff", borderRadius: 6, padding: "10px 14px", fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.22)", maxWidth: 340 }}>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button
            onClick={() => { setToast(null); if (toastTimer.current) clearTimeout(toastTimer.current) }}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 4, padding: "2px 3px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center" }}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </>
  )
}
