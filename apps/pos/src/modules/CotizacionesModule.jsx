import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Search, RotateCcw, CheckCircle2, X, ArrowRight, Printer } from "lucide-react"
import { listarCotizaciones } from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import { formatMXN as fmt } from "../lib/format"

/**
 * Módulo admin de Cotizaciones — lista de cotizaciones guardadas.
 *
 * Módulo "gordo" autocontenido (como SalesHistory): KPIs + filtros + tabla +
 * drawer de detalle. "Cargar en venta" navega a /venta?cotizacion=<folio> para
 * precargarla en el panel de venta (cierra el ciclo desde el admin).
 *
 * Contrato de conexión: datos vía client.ts (listarCotizaciones), navegación con
 * useNavigate, feedback por toasts.
 */

function fmtFecha(iso) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function EstadoBadge({ c }) {
  if (c.estado === "convertida") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
        color: "#15803d", background: "rgba(22,163,74,0.12)", padding: "2px 8px", borderRadius: 999,
      }}>
        <CheckCircle2 size={11} /> Vendida{c.folio_venta ? ` · ${c.folio_venta}` : ""}
      </span>
    )
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
      color: "#b45309", background: "rgba(245,158,11,0.14)", padding: "2px 8px", borderRadius: 999,
    }}>
      <RotateCcw size={11} /> Vigente
    </span>
  )
}

function KpiCard({ label, valor }) {
  return (
    <div style={{ background: "var(--bg-panel,#fff)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{valor}</div>
    </div>
  )
}

export default function CotizacionesModule() {
  const navigate = useNavigate()
  const { toasts, push } = useToasts()
  const [cotizaciones, setCotizaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("") // "" | "vigente" | "convertida"
  const [drawer, setDrawer] = useState(null)

  const recargar = useCallback(() => {
    setCargando(true)
    setError(null)
    return listarCotizaciones()
      .then((d) => { setCotizaciones(d); setCargando(false) })
      .catch((e) => { setError(e.message ?? "No se pudieron cargar las cotizaciones"); setCargando(false) })
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const filtradas = useMemo(() => {
    let list = cotizaciones
    if (filtroEstado) list = list.filter((c) => c.estado === filtroEstado)
    const q = busqueda.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) => c.folio.toLowerCase().includes(q) || (c.cliente_nombre ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [cotizaciones, filtroEstado, busqueda])

  const kpis = useMemo(() => {
    const total = cotizaciones.reduce((s, c) => s + c.total, 0)
    const vigentes = cotizaciones.filter((c) => c.estado === "vigente").length
    const convertidas = cotizaciones.filter((c) => c.estado === "convertida").length
    const tasa = cotizaciones.length ? Math.round((convertidas / cotizaciones.length) * 100) : 0
    return { count: cotizaciones.length, total, vigentes, convertidas, tasa }
  }, [cotizaciones])

  function cargarEnVenta(c) {
    navigate(`/venta?cotizacion=${encodeURIComponent(c.folio)}`)
  }

  return (
    <div className="cot-admin" style={{ padding: 20, height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <FileText size={22} style={{ color: "var(--orange,#F96302)" }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>Cotizaciones</h1>
        <button
          onClick={recargar}
          style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--bg-panel,#fff)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text)",
          }}
        >
          <RotateCcw size={14} /> Recargar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Cotizaciones" valor={kpis.count} />
        <KpiCard label="Monto cotizado" valor={fmt(kpis.total)} />
        <KpiCard label="Vigentes" valor={kpis.vigentes} />
        <KpiCard label="Convertidas" valor={`${kpis.convertidas} (${kpis.tasa}%)`} />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            placeholder="Buscar por folio o cliente…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8,
              padding: "9px 12px 9px 34px", fontSize: 13, background: "var(--bg-input,#fff)", color: "var(--text)",
            }}
          />
        </div>
        <div style={{ display: "flex", background: "var(--bg-hover,#f1f1f3)", borderRadius: 8, padding: 3 }}>
          {[["", "Todas"], ["vigente", "Vigentes"], ["convertida", "Vendidas"]].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFiltroEstado(val)}
              style={{
                padding: "6px 14px", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: filtroEstado === val ? "var(--bg-panel,#fff)" : "transparent",
                color: filtroEstado === val ? "var(--text)" : "var(--text-muted)",
                boxShadow: filtroEstado === val ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {cargando ? (
        <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>Cargando cotizaciones…</p>
      ) : error ? (
        <p style={{ color: "#dc2626", textAlign: "center", padding: 40 }}>{error}</p>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 50, color: "var(--text-muted)" }}>
          <FileText size={32} style={{ opacity: 0.4 }} />
          <p>{busqueda || filtroEstado ? "Sin resultados" : "No hay cotizaciones guardadas"}</p>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-hover,#f1f1f3)" }}>
                {["Folio", "Fecha", "Cliente", "Artículos", "Total", "Estado", ""].map((h, i) => (
                  <th key={h || `col-${i}`} style={{
                    textAlign: i >= 3 && i <= 4 ? "right" : "left", fontSize: 11, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)",
                    padding: "10px 12px", borderBottom: "1px solid var(--border)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((c) => (
                <tr
                  key={c.folio}
                  onClick={() => setDrawer(c)}
                  style={{ cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover,#f7f7f8)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.folio}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--text-muted)" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text)" }}>{c.cliente_nombre || "Público en general"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", color: "var(--text)" }}>{c.items.length}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "right", color: "var(--text)" }}>{fmt(c.total)}</td>
                  <td style={{ padding: "10px 12px" }}><EstadoBadge c={c} /></td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); cargarEnVenta(c) }}
                      title="Cargar en el panel de venta"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
                        color: "var(--orange,#F96302)", background: "rgba(249,99,2,0.1)",
                        border: "1px solid rgba(249,99,2,0.25)", borderRadius: 7, padding: "5px 10px", cursor: "pointer",
                      }}
                    >
                      Cargar <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer de detalle */}
      {drawer && <CotizacionDrawer c={drawer} onClose={() => setDrawer(null)} onCargar={() => cargarEnVenta(drawer)} />}

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 60, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: "10px 16px", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600,
            background: t.type === "error" ? "#dc2626" : t.type === "info" ? "#374151" : "#16a34a",
          }}>{t.msg}</div>
        ))}
      </div>
    </div>
  )
}

function CotizacionDrawer({ c, onClose, onCargar }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1500 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "92vw", background: "#fff",
        zIndex: 1501, boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>{c.folio}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fmtFecha(c.fecha)}</div>
          </div>
          <EstadoBadge c={c} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <div style={{ marginBottom: 16 }}>
            <Row label="Cliente" value={c.cliente_nombre || "Público en general"} />
            <Row label="Cajero" value={c.cajero} />
            {c.estado === "convertida" && c.folio_venta && <Row label="Venta" value={c.folio_venta} />}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Artículos</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Descripción", "Cant", "P.U.", "Subtotal"].map((h, i) => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", padding: "3px 6px", borderBottom: "1px solid var(--border)", textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.items.map((it, i) => (
                <tr key={`${it.sku}-${i}`}>
                  <td style={{ padding: "5px 6px", fontSize: 12, color: "var(--text)", borderBottom: "1px solid var(--border)" }}>{it.descripcion}</td>
                  <td style={{ padding: "5px 6px", fontSize: 12, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{it.cantidad}</td>
                  <td style={{ padding: "5px 6px", fontSize: 12, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{fmt(it.precio_unitario)}</td>
                  <td style={{ padding: "5px 6px", fontSize: 12, fontWeight: 600, textAlign: "right", borderBottom: "1px solid var(--border)" }}>{fmt(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <span style={{ fontWeight: 700, color: "var(--text)" }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{fmt(c.total)}</span>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--bg-hover,#f4f4f5)", border: "1px solid var(--border)", borderRadius: 7,
            padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text)",
          }}>
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={onCargar} style={{
            flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--orange,#F96302)", border: "none", borderRadius: 7,
            padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#fff",
          }}>
            Cargar en venta <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500 }}>{value}</span>
    </div>
  )
}
