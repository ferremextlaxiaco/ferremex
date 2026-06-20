import { useState, useEffect } from "react"
import {
  Receipt, X, Loader2, Download, FileCode2, Mail, XCircle, AlertTriangle,
} from "lucide-react"
import {
  obtenerArchivoComprobanteAPI, abrirArchivoComprobanteAPI,
  reenviarComprobanteAPI, cancelarComprobanteAPI,
} from "../lib/client"
import { formatMXN } from "../lib/format"

/**
 * Visor de comprobante a PANTALLA COMPLETA con fondo difuminado:
 *  - Izquierda: la factura PDF centrada (iframe), cubriendo todo el alto.
 *  - Derecha: panel con los detalles + acciones (descargar PDF/XML, reenviar y,
 *    opcionalmente, cancelar).
 *
 * Reutilizado por:
 *  - ComprobantesPanel (historial): pasa `onCancelado` y `onReembolsado` → muestra
 *    la sección de cancelación.
 *  - FacturarBoton (ticket post-venta y SalesHistory): NO pasa `onCancelado` →
 *    oculta cancelar (no tiene sentido cancelar lo recién timbrado desde ahí).
 *
 * El comprobante `c` es un objeto normalizado:
 *   { cfdi_id, uuid?, serie?, folio_cfdi?, tipo?, receptor_rfc, receptor_nombre,
 *     total?, estado?, folio_venta?, email? }
 */
const MOTIVOS = [
  { v: "02", label: "02 — Comprobante con errores sin relación" },
  { v: "03", label: "03 — No se llevó a cabo la operación" },
  { v: "04", label: "04 — Operación nominativa en factura global" },
  { v: "01", label: "01 — Comprobante con errores CON relación (requiere UUID sustituto)" },
]

/** Nombre de archivo legible: AAAAMMDD_Serie-Folio_RFC. */
function nombreArchivo(c) {
  const f = (c.fecha || "").slice(0, 10).replace(/-/g, "")
  const folio = `${c.serie ? c.serie + "-" : ""}${c.folio_cfdi ?? c.cfdi_id?.slice(0, 8) ?? "cfdi"}`
  const rfc = c.receptor_rfc || "SINRFC"
  return `${f}_${folio}_${rfc}`.replace(/[^\w\-.]/g, "_")
}

function EstadoChip({ estado }) {
  if (!estado) return null
  return estado === "Cancelado"
    ? <span className="fac-chip fac-chip--cancel"><XCircle size={12} /> Cancelado</span>
    : <span className="fac-chip fac-chip--ok">Vigente</span>
}

export default function VisorComprobante({ comprobante: c, correoDefault, onClose, onCancelado, pushToast }) {
  const [descargando, setDescargando] = useState(null)
  const [correo, setCorreo] = useState(correoDefault || c.email || "")
  const [enviando, setEnviando] = useState(false)
  const [cancelStep, setCancelStep] = useState(0)
  const [motivo, setMotivo] = useState("02")
  const [uuidSust, setUuidSust] = useState("")
  const [cancelando, setCancelando] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfCargando, setPdfCargando] = useState(true)
  const [pdfError, setPdfError] = useState(null)

  const toast = pushToast ?? (() => {})

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Cargar el PDF como blob → object URL → iframe. Revoca el URL al cerrar/cambiar.
  useEffect(() => {
    let url = null
    let vivo = true
    setPdfCargando(true); setPdfError(null); setPdfUrl(null)
    obtenerArchivoComprobanteAPI(c.cfdi_id, "pdf")
      .then((blob) => { if (vivo) { url = URL.createObjectURL(blob); setPdfUrl(url) } })
      .catch((e) => { if (vivo) setPdfError(e?.message ?? "No se pudo cargar la previsualización") })
      .finally(() => { if (vivo) setPdfCargando(false) })
    return () => { vivo = false; if (url) URL.revokeObjectURL(url) }
  }, [c.cfdi_id])

  async function descargar(formato) {
    if (descargando) return
    setDescargando(formato)
    try { await abrirArchivoComprobanteAPI(c.cfdi_id, formato, nombreArchivo(c)) }
    catch (e) { toast(e?.message ?? `No se pudo abrir el ${formato.toUpperCase()}`, "error") }
    finally { setDescargando(null) }
  }

  async function reenviar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { toast("Correo inválido", "error"); return }
    setEnviando(true)
    try { await reenviarComprobanteAPI(c.cfdi_id, correo); toast("Comprobante reenviado", "success") }
    catch (e) { toast(e?.message ?? "No se pudo reenviar", "error") }
    finally { setEnviando(false) }
  }

  async function cancelar() {
    if (motivo === "01" && !uuidSust.trim()) { toast("El motivo 01 requiere el UUID sustituto", "error"); return }
    setCancelando(true)
    try {
      await cancelarComprobanteAPI(c.cfdi_id, motivo, motivo === "01" ? uuidSust.trim() : undefined)
      toast("Comprobante cancelado", "success")
      onCancelado?.()
    } catch (e) {
      toast(e?.message ?? "No se pudo cancelar", "error")
    } finally {
      setCancelando(false)
    }
  }

  // La cancelación solo se ofrece si el padre la maneja (onCancelado) y está vigente.
  const cancelable = !!onCancelado && c.estado === "Vigente"

  return (
    <div className="fac-visor-overlay" onClick={onClose}>
      {/* Izquierda: factura PDF a pantalla completa sobre el fondo difuminado. */}
      <div className="fac-visor-zona" onClick={(e) => e.stopPropagation()}>
        {pdfCargando ? (
          <div className="fac-visor-estado fac-visor-estado--flot"><Loader2 size={30} className="fac-spin" /><span>Cargando previsualización…</span></div>
        ) : pdfError ? (
          <div className="fac-visor-estado fac-visor-estado--flot">
            <AlertTriangle size={30} />
            <span>{pdfError}</span>
            <button className="fac-btn-secondary" onClick={() => descargar("pdf")}><Download size={15} /> Abrir en pestaña</button>
          </div>
        ) : pdfUrl ? (
          <iframe className="fac-visor-doc" src={pdfUrl} title={`Factura ${c.folio_cfdi ?? c.cfdi_id}`} />
        ) : null}
      </div>

      {/* Derecha: panel de detalles + acciones. */}
      <div className="fac-detalle-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fac-modal-head">
          <span><Receipt size={18} /> Comprobante {c.serie ? `${c.serie}-` : ""}{c.folio_cfdi ?? ""}</span>
          <button className="fac-btn-ghost" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="fac-modal-body fac-detalle-info">
          <div className="fac-resultado-datos">
            {c.tipo && <div><b>Tipo:</b> {c.tipo === "global" ? "Factura global" : "Nominativa"}</div>}
            <div><b>Receptor:</b> {c.receptor_nombre || "—"} ({c.receptor_rfc})</div>
            {c.folio_venta && <div><b>Venta POS:</b> {c.folio_venta}</div>}
            {c.uuid && <div><b>UUID:</b> <span className="fac-uuid">{c.uuid}</span></div>}
            {c.total != null && <div><b>Total:</b> {formatMXN(c.total)}</div>}
            {c.estado && <div><b>Estado:</b> <EstadoChip estado={c.estado} /></div>}
          </div>

          {/* Descargas */}
          <div className="fac-seccion">
            <div className="fac-seccion-titulo">Descargar archivos</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="fac-btn-secondary" onClick={() => descargar("xml")} disabled={!!descargando}>
                {descargando === "xml" ? <Loader2 size={15} className="fac-spin" /> : <FileCode2 size={15} />} XML
              </button>
              <button className="fac-btn-primary" onClick={() => descargar("pdf")} disabled={!!descargando}>
                {descargando === "pdf" ? <Loader2 size={15} className="fac-spin" /> : <Download size={15} />} PDF
              </button>
            </div>
          </div>

          {/* Reenviar */}
          <div className="fac-seccion">
            <div className="fac-seccion-titulo">Reenviar por correo</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="fac-input" style={{ flex: 1 }} type="email" value={correo}
                onChange={(e) => setCorreo(e.target.value)} placeholder="correo@ejemplo.com" />
              <button className="fac-btn-secondary" onClick={reenviar} disabled={enviando}>
                {enviando ? <Loader2 size={15} className="fac-spin" /> : <Mail size={15} />} Enviar
              </button>
            </div>
          </div>

          {/* Cancelar (solo si el padre lo maneja) */}
          {cancelable && (
            <div className="fac-seccion">
              <div className="fac-seccion-titulo">Cancelar comprobante</div>
              {cancelStep === 0 ? (
                <button className="fac-btn-danger" onClick={() => setCancelStep(1)}>
                  <XCircle size={15} /> Cancelar este CFDI
                </button>
              ) : (
                <div className="fac-cancel-box">
                  <label className="fac-field" style={{ width: "100%" }}>
                    <span>Motivo de cancelación (SAT)</span>
                    <select className="fac-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ width: "100%" }}>
                      {MOTIVOS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                    </select>
                  </label>
                  {motivo === "01" && (
                    <label className="fac-field" style={{ width: "100%" }}>
                      <span>UUID del comprobante que lo sustituye</span>
                      <input className="fac-input" value={uuidSust} onChange={(e) => setUuidSust(e.target.value)}
                        placeholder="UUID sustituto" style={{ width: "100%" }} />
                    </label>
                  )}
                  <div className="fac-alert fac-alert--warn">
                    <AlertTriangle size={15} /> La cancelación es definitiva ante el SAT. {c.tipo === "global"
                      ? "Se reintegrará el saldo facturable consumido y las ventas volverán a estar disponibles."
                      : "La venta quedará marcada como no facturada."}
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="fac-btn-secondary" onClick={() => setCancelStep(0)} disabled={cancelando}>Volver</button>
                    <button className="fac-btn-danger" onClick={cancelar} disabled={cancelando}>
                      {cancelando ? <><Loader2 size={15} className="fac-spin" /> Cancelando…</> : "Confirmar cancelación"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
