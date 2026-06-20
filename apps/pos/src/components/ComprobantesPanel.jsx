import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  FileStack, Search, RefreshCw, Loader2,
  XCircle, CheckCircle2, AlertTriangle, FolderDown, Receipt, Globe2,
} from "lucide-react"
import {
  listarComprobantesAPI, obtenerArchivoComprobanteAPI, obtenerConfigFacturacionAPI,
} from "../lib/client"
import { formatMXN } from "../lib/format"
import VisorComprobante from "./VisorComprobante"

/**
 * Tab "Comprobantes" — historial de TODOS los CFDIs emitidos (nominativas +
 * globales), leído de Facturama + cruce con ventas. Permite:
 *  - Filtrar por rango de fecha / tipo / estado / texto (folio, UUID, RFC).
 *  - Seleccionar con checkbox y DESCARGAR EL LOTE (PDF+XML) a una carpeta del
 *    equipo (File System Access API; fallback a descargas sueltas).
 *  - Por comprobante: previsualizar (PDF), descargar PDF/XML, reenviar por
 *    correo, cancelar (2 pasos con motivo SAT 01–04).
 *
 * Es el lugar único para ver qué facturas se le han hecho a cada cliente.
 */

const hoyISO = () => new Date().toISOString().slice(0, 10)
const primerDiaMes = () => { const d = hoyISO(); return d.slice(0, 8) + "01" }

const MOTIVOS = [
  { v: "02", label: "02 — Comprobante con errores sin relación" },
  { v: "03", label: "03 — No se llevó a cabo la operación" },
  { v: "04", label: "04 — Operación nominativa en factura global" },
  { v: "01", label: "01 — Comprobante con errores CON relación (requiere UUID sustituto)" },
]

const soportaCarpeta = typeof window !== "undefined" && "showDirectoryPicker" in window

export default function ComprobantesPanel({ pushToast }) {
  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoyISO())
  const [tipo, setTipo] = useState("")
  const [estado, setEstado] = useState("")
  const [texto, setTexto] = useState("")

  const [items, setItems] = useState([])
  const [cargando, setCargando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [sel, setSel] = useState(() => new Set())     // cfdi_id seleccionados
  const [descargandoLote, setDescargandoLote] = useState(false)
  const [progreso, setProgreso] = useState(null)        // {hechos,total}
  const [detalle, setDetalle] = useState(null)          // comprobante en drawer
  const [filaSel, setFilaSel] = useState(null)          // cfdi_id de la fila resaltada (1 clic)
  const [correoContador, setCorreoContador] = useState("")

  // Guard de montaje: no setear estado si el componente se desmontó con una
  // petición en vuelo (cambio de tab) — evita warnings y races en StrictMode.
  const montado = useRef(true)
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])

  useEffect(() => {
    obtenerConfigFacturacionAPI()
      .then((c) => { if (montado.current) setCorreoContador(c.correo_contador || "") })
      .catch(() => {})
  }, [])

  const buscar = useCallback(async () => {
    setCargando(true); setBuscado(true); setSel(new Set())
    try {
      const data = await listarComprobantesAPI({ desde, hasta, tipo, estado, q: texto.trim() })
      if (montado.current) setItems(data.comprobantes)
    } catch (e) {
      if (montado.current) { pushToast(e?.message ?? "No se pudo consultar los comprobantes", "error"); setItems([]) }
    } finally {
      if (montado.current) setCargando(false)
    }
  }, [desde, hasta, tipo, estado, texto, pushToast])

  // Carga inicial (solo una vez; `buscar` cambia con los filtros pero aquí
  // queremos la carga inicial únicamente).
  useEffect(() => { buscar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const kpis = useMemo(() => {
    const total = items.reduce((s, c) => s + (c.total ?? 0), 0)
    const vigentes = items.filter((c) => c.estado === "Vigente").length
    const canceladas = items.length - vigentes
    return { count: items.length, total, vigentes, canceladas }
  }, [items])

  const toggleUno = (id) => setSel((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleTodos = () => setSel((prev) =>
    prev.size === items.length ? new Set() : new Set(items.map((c) => c.cfdi_id))
  )

  // ── Descarga por lote a una carpeta (File System Access API) ────────────────
  async function descargarLote() {
    const seleccionados = items.filter((c) => sel.has(c.cfdi_id))
    if (seleccionados.length === 0) { pushToast("Selecciona al menos un comprobante", "error"); return }

    setDescargandoLote(true)
    setProgreso({ hechos: 0, total: seleccionados.length * 2 })
    try {
      let dirHandle = null
      if (soportaCarpeta) {
        try {
          dirHandle = await window.showDirectoryPicker({ mode: "readwrite" })
        } catch (e) {
          // El usuario canceló el selector de carpeta → abortar sin error.
          if (e?.name === "AbortError") { setDescargandoLote(false); setProgreso(null); return }
          dirHandle = null // sin permiso → caer al fallback de descargas sueltas
        }
      }

      let hechos = 0
      for (const c of seleccionados) {
        const base = nombreArchivo(c)
        for (const formato of ["pdf", "xml"]) {
          try {
            const blob = await obtenerArchivoComprobanteAPI(c.cfdi_id, formato)
            if (dirHandle) {
              const fh = await dirHandle.getFileHandle(`${base}.${formato}`, { create: true })
              const w = await fh.createWritable()
              await w.write(blob)
              await w.close()
            } else {
              guardarBlobSuelto(blob, `${base}.${formato}`)
            }
          } catch (e) {
            pushToast(`No se pudo descargar ${base}.${formato}`, "error")
          }
          hechos++
          setProgreso({ hechos, total: seleccionados.length * 2 })
        }
      }
      pushToast(
        dirHandle ? `Descargados ${seleccionados.length} comprobantes a la carpeta` : `Descargados ${seleccionados.length} comprobantes`,
        "success"
      )
    } finally {
      setDescargandoLote(false)
      setProgreso(null)
    }
  }

  return (
    <div className="fac-pane">
      {/* Filtros */}
      <div className="fac-toolbar">
        <label className="fac-field"><span>Desde</span>
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="fac-input" /></label>
        <label className="fac-field"><span>Hasta</span>
          <input type="date" value={hasta} max={hoyISO()} onChange={(e) => setHasta(e.target.value)} className="fac-input" /></label>
        <label className="fac-field"><span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="fac-input">
            <option value="">Todos</option>
            <option value="nominativa">Nominativa</option>
            <option value="global">Global</option>
          </select></label>
        <label className="fac-field"><span>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="fac-input">
            <option value="">Todos</option>
            <option value="vigente">Vigente</option>
            <option value="cancelado">Cancelado</option>
          </select></label>
        <label className="fac-field" style={{ flex: 1, minWidth: 200 }}><span>Buscar (folio / UUID / RFC)</span>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()}
              className="fac-input" style={{ paddingLeft: 32, width: "100%" }} placeholder="Buscar…" />
          </div></label>
        <button className="fac-btn-primary" onClick={buscar} disabled={cargando}>
          {cargando ? <Loader2 size={16} className="fac-spin" /> : <Search size={16} />} Buscar
        </button>
      </div>

      {/* KPIs + acciones de lote */}
      {buscado && (
        <div className="fac-kpis">
          <Kpi label="Comprobantes" value={kpis.count} />
          <Kpi label="Monto total" value={formatMXN(kpis.total)} />
          <Kpi label="Vigentes" value={kpis.vigentes} tone="ok" />
          <Kpi label="Canceladas" value={kpis.canceladas} tone="muted" />
        </div>
      )}

      {buscado && items.length > 0 && (
        <div className="fac-lote-bar">
          <label className="fac-lote-sel">
            <input type="checkbox" checked={sel.size === items.length && items.length > 0} onChange={toggleTodos} />
            {sel.size > 0 ? `${sel.size} seleccionado(s)` : "Seleccionar todo"}
          </label>
          <button className="fac-btn-secondary" onClick={descargarLote} disabled={sel.size === 0 || descargandoLote}>
            {descargandoLote
              ? <><Loader2 size={15} className="fac-spin" /> {progreso ? `${progreso.hechos}/${progreso.total}` : "Descargando…"}</>
              : <><FolderDown size={15} /> Descargar PDF+XML {sel.size > 0 ? `(${sel.size})` : ""}</>}
          </button>
          {!soportaCarpeta && (
            <span className="fac-lote-nota">
              <AlertTriangle size={13} /> Tu navegador no permite elegir carpeta; se descargarán a “Descargas”.
            </span>
          )}
        </div>
      )}

      {/* Tabla */}
      {cargando ? (
        <div className="fac-empty"><Loader2 size={30} className="fac-spin" /><p>Consultando comprobantes…</p></div>
      ) : !buscado ? null : items.length === 0 ? (
        <div className="fac-empty"><FileStack size={40} /><p>Sin comprobantes en el rango seleccionado.</p></div>
      ) : (
        <div className="fac-col" style={{ overflowX: "auto" }}>
          <table className="fac-tabla fac-tabla--rows">
            <thead><tr>
              <th style={{ width: 36 }}></th>
              <th>Fecha</th><th>Folio</th><th>Tipo</th><th>Receptor</th>
              <th className="num">Total</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.cfdi_id}
                  className={
                    (c.estado === "Cancelado" ? "fac-row-cancel " : "") +
                    "fac-row-click" +
                    (filaSel === c.cfdi_id ? " fac-row-active" : "")
                  }
                  onClick={() => setFilaSel(c.cfdi_id)}
                  onDoubleClick={() => setDetalle(c)}
                  title="Doble clic para ver el detalle y la previsualización"
                >
                  <td onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={sel.has(c.cfdi_id)} onChange={() => toggleUno(c.cfdi_id)} />
                  </td>
                  <td>{fechaCorta(c.fecha)}</td>
                  <td>{c.serie ? `${c.serie}-` : ""}{c.folio_cfdi ?? "—"}</td>
                  <td><TipoChip tipo={c.tipo} /></td>
                  <td>
                    <div className="fac-art">{c.receptor_nombre || "—"}</div>
                    <div className="fac-sku">{c.receptor_rfc}{c.folio_venta ? ` · venta ${c.folio_venta}` : ""}</div>
                  </td>
                  <td className="num">{c.total != null ? formatMXN(c.total) : "—"}</td>
                  <td><EstadoChip estado={c.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fac-tabla-hint">Selecciona una fila con un clic · <b>doble clic</b> para ver el detalle y la previsualización.</div>
        </div>
      )}

      {detalle && (
        <VisorComprobante
          comprobante={detalle}
          correoDefault={correoContador}
          onClose={() => setDetalle(null)}
          onCancelado={() => { setDetalle(null); buscar() }}
          pushToast={pushToast}
        />
      )}
    </div>
  )
}

// ── Helpers de presentación ───────────────────────────────────────────────────
function Kpi({ label, value, tone }) {
  return (
    <div className={`fac-kpi${tone ? " fac-kpi--" + tone : ""}`}>
      <div className="fac-kpi-label">{label}</div>
      <div className="fac-kpi-value">{value}</div>
    </div>
  )
}
function TipoChip({ tipo }) {
  return tipo === "global"
    ? <span className="fac-chip fac-chip--global"><Globe2 size={12} /> Global</span>
    : <span className="fac-chip fac-chip--nomina"><Receipt size={12} /> Nominativa</span>
}
function EstadoChip({ estado }) {
  return estado === "Cancelado"
    ? <span className="fac-chip fac-chip--cancel"><XCircle size={12} /> Cancelado</span>
    : <span className="fac-chip fac-chip--ok"><CheckCircle2 size={12} /> Vigente</span>
}
function fechaCorta(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return isNaN(d) ? String(iso).slice(0, 16) : d.toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}
/** Nombre de archivo legible: AAAAMMDD_Serie-Folio_RFC. */
function nombreArchivo(c) {
  const f = (c.fecha || "").slice(0, 10).replace(/-/g, "")
  const folio = `${c.serie ? c.serie + "-" : ""}${c.folio_cfdi ?? c.cfdi_id.slice(0, 8)}`
  const rfc = c.receptor_rfc || "SINRFC"
  return `${f}_${folio}_${rfc}`.replace(/[^\w\-.]/g, "_")
}
/** Descarga suelta (fallback cuando no hay File System Access API). Revoca el
 *  objectURL en el siguiente frame: el navegador ya inició la descarga con el
 *  click síncrono, así que no hace falta retenerlo 60s (evita acumular Blobs en
 *  RAM al bajar un lote grande en terminales con poca memoria). */
function guardarBlobSuelto(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = nombre
  document.body.appendChild(a); a.click(); a.remove()
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}
