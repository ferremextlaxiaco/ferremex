import { useState, useEffect, useMemo } from "react"
import { Percent, Download, Trophy } from "lucide-react"
import { obtenerReporteComisionesAPI, obtenerUsuarios } from "../lib/client"
import { formatMXN } from "../lib/format"
import { useToasts } from "../hooks/useToasts"

function slugDate(d) { return d.toISOString().slice(0, 10) }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function isoToday() { return slugDate(new Date()) }

const PRESETS = [
  { label: "Hoy", fn: () => ({ desde: isoToday(), hasta: isoToday() }) },
  { label: "Ayer", fn: () => { const a = slugDate(addDays(new Date(), -1)); return { desde: a, hasta: a } } },
  { label: "7 días", fn: () => ({ desde: slugDate(addDays(new Date(), -6)), hasta: isoToday() }) },
  { label: "Mes", fn: () => ({ desde: isoToday().slice(0, 7) + "-01", hasta: isoToday() }) },
]

function downloadCSV(rows) {
  const header = ["Vendedor", "Comisión total", "# Ventas", "Comisión promedio"]
  const lineas = rows.map((r) => [r.vendedor, r.comision_total.toFixed(2), r.num_ventas, r.comision_promedio.toFixed(2)])
  const csv = [header, ...lineas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `comisiones_${isoToday()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ComisionesReporte() {
  const { toasts, push } = useToasts()
  const [rango, setRango] = useState(() => PRESETS[0].fn())
  const [vendedor, setVendedor] = useState("")
  const [usuarios, setUsuarios] = useState([])
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let on = true
    obtenerUsuarios().then((u) => { if (on) setUsuarios(u) }).catch(() => {})
    return () => { on = false }
  }, [])

  useEffect(() => {
    let on = true
    setCargando(true)
    obtenerReporteComisionesAPI(rango.desde, rango.hasta, vendedor || undefined)
      .then((r) => { if (on) setFilas(r) })
      .catch(() => { if (on) { setFilas([]); push("No se pudo cargar el reporte", "error") } })
      .finally(() => { if (on) setCargando(false) })
    return () => { on = false }
  }, [rango, vendedor])

  const totalGeneral = useMemo(() => filas.reduce((s, f) => s + f.comision_total, 0), [filas])
  const top = filas[0] ?? null

  const chipStyle = (active) => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
    background: active ? "#f96302" : "#f4f4f5", color: active ? "#fff" : "#6b7280",
  })

  return (
    <div className="rep-pane">
      <div className="rep-pane-header">
        <h2 className="rep-pane-titulo"><Percent size={18} className="text-orange-500" /> Comisiones por vendedor</h2>
        <button className="rep-export-btn" onClick={() => downloadCSV(filas)} disabled={filas.length === 0}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="rep-filtros">
        <div className="rep-filtro-grupo">
          <span className="rep-filtro-label">Período</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {PRESETS.map((p) => {
              const r = p.fn()
              const active = rango.desde === r.desde && rango.hasta === r.hasta
              return (
                <button key={p.label} onClick={() => setRango(r)} style={chipStyle(active)}>{p.label}</button>
              )
            })}
          </div>
        </div>

        <div className="rep-filtro-grupo">
          <span className="rep-filtro-label">Desde</span>
          <input type="date" className="rep-input" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} />
        </div>
        <div className="rep-filtro-grupo">
          <span className="rep-filtro-label">Hasta</span>
          <input type="date" className="rep-input" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} />
        </div>

        <div className="rep-filtro-grupo">
          <span className="rep-filtro-label">Vendedor</span>
          <select className="rep-input" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.nombre}>{u.alias || u.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rep-kpis">
        <div className="rep-kpi-card">
          <span className="rep-kpi-label">Comisión total del período</span>
          <span className="rep-kpi-valor">{formatMXN(totalGeneral)}</span>
        </div>
        <div className="rep-kpi-card">
          <span className="rep-kpi-label"><Trophy size={13} style={{ verticalAlign: "-2px" }} /> Vendedor top</span>
          <span className="rep-kpi-valor">{top ? top.vendedor : "—"}</span>
        </div>
      </div>

      {cargando ? (
        <div className="rep-vacio">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="rep-vacio">No hay comisiones generadas en este período.</div>
      ) : (
        <table className="rep-tabla">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Comisión total</th>
              <th># Ventas</th>
              <th>Comisión promedio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.vendedor}>
                <td>{f.vendedor}</td>
                <td className="rep-td-mono">{formatMXN(f.comision_total)}</td>
                <td className="rep-td-mono">{f.num_ventas}</td>
                <td className="rep-td-mono">{formatMXN(f.comision_promedio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 5000, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map((t) => (
            <div key={t.id} style={{
              background: t.type === "error" ? "#dc2626" : "#16a34a",
              color: "#fff", borderRadius: 8, padding: "10px 18px",
              fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
              minWidth: 200, maxWidth: 360,
            }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
