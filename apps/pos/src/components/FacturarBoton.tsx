import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { FileText, X, CheckCircle2, AlertTriangle, Loader2, Download, FileCode2 } from "lucide-react"
import { camposFiscalesFaltantes, type Cliente } from "../lib/clientes"
import {
  facturarVentaAPI, estadoFacturaAPI, abrirArchivoFacturaAPI, obtenerClienteAPI,
  type FacturaVenta,
} from "../lib/client"

/**
 * Facturación de una venta (CFDI 4.0 nominativo vía Facturama).
 *
 * Flujo: al abrir, consulta si la venta YA está facturada (estadoFacturaAPI).
 * Si no, valida los datos fiscales del cliente y habilita "Timbrar CFDI"
 * (facturarVentaAPI). Una vez timbrada, muestra el folio fiscal (UUID) y permite
 * descargar el PDF/XML. Todo el timbrado vive en el backend.
 *
 * Reusado en: Ticket (venta recién emitida) y SalesHistory (ventas previas).
 */

interface FacturarBotonProps {
  /** Folio de la venta a facturar. */
  folio: string
  /** Cliente de la venta (si lo hay). Público en general no se puede facturar nominativo. */
  cliente?: Cliente | null
  /** Estilo del trigger: botón ancho (footer) o compacto (fila de acciones). */
  variant?: "full" | "compact"
}

export function FacturarBoton({ folio, cliente, variant = "full" }: FacturarBotonProps) {
  const [abierto, setAbierto] = useState(false)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  const [cargandoEstado, setCargandoEstado] = useState(false)
  const [factura, setFactura] = useState<FacturaVenta | null>(null)
  const [timbrando, setTimbrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Formato que se está descargando ("pdf"|"xml"|null) → spinner + bloqueo del
  // botón mientras la petición está en vuelo (la descarga tarda ~1-2s).
  const [descargando, setDescargando] = useState<"pdf" | "xml" | null>(null)
  // El cliente que llega por props puede venir parcial (solo id/nombre, como en
  // SalesHistory). Al abrir, hidratamos el cliente COMPLETO desde la BD (con sus
  // datos fiscales reales) para validar bien si se puede timbrar.
  const [clienteCompleto, setClienteCompleto] = useState<Cliente | null>(null)
  const [cargandoCliente, setCargandoCliente] = useState(false)

  // Mueve el foco al panel al abrirlo + cierra con Escape.
  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(() => cerrarRef.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) }
    window.addEventListener("keydown", onKey)
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [abierto])

  // Al abrir, consulta el estado de facturación de la venta.
  useEffect(() => {
    if (!abierto) return
    let on = true
    setCargandoEstado(true); setError(null)
    estadoFacturaAPI(folio)
      .then((e) => { if (on) setFactura(e.factura) })
      .catch(() => { /* sin estado: se asume no facturada */ })
      .finally(() => { if (on) setCargandoEstado(false) })
    return () => { on = false }
  }, [abierto, folio])

  // Al abrir, hidrata el cliente completo (con datos fiscales) desde la BD si el
  // que llegó por props no los trae. Si ya viene completo (tiene rfc), lo usa tal cual.
  useEffect(() => {
    if (!abierto || !cliente?.id) { setClienteCompleto(cliente ?? null); return }
    if (cliente.rfc) { setClienteCompleto(cliente); return }
    let on = true
    setCargandoCliente(true)
    obtenerClienteAPI(cliente.id)
      .then((c) => { if (on) setClienteCompleto(c) })
      .catch(() => { if (on) setClienteCompleto(cliente) }) // fallback al parcial
      .finally(() => { if (on) setCargandoCliente(false) })
    return () => { on = false }
  }, [abierto, cliente])

  // Validación fiscal sobre el cliente COMPLETO (no el parcial de props).
  const clienteEf = clienteCompleto ?? cliente ?? null
  const faltan = camposFiscalesFaltantes(clienteEf)
  const listoFiscal = faltan.length === 0
  const puedeTimbrar = !!clienteEf && listoFiscal && !factura && !cargandoCliente

  async function timbrar() {
    setTimbrando(true); setError(null)
    try {
      const r = await facturarVentaAPI(folio, clienteEf?.id)
      setFactura(r.factura)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo timbrar la factura")
    } finally {
      setTimbrando(false)
    }
  }

  async function descargar(formato: "pdf" | "xml") {
    if (descargando) return // evita disparar varias peticiones por doble clic
    setDescargando(formato); setError(null)
    try {
      await abrirArchivoFacturaAPI(folio, formato)
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo abrir el ${formato.toUpperCase()}`)
    } finally {
      setDescargando(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className={variant === "full" ? "facturar-btn facturar-btn--full" : "facturar-btn facturar-btn--compact"}
        onClick={() => setAbierto(true)}
        title="Facturar esta venta (CFDI)"
      >
        <FileText size={variant === "full" ? 16 : 14} /> Facturar
      </button>

      {abierto &&
        createPortal(
          <div className="facturar-overlay" onClick={() => setAbierto(false)}>
            <div
              className="facturar-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Facturar venta ${folio}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="facturar-panel-head">
                <span className="facturar-panel-titulo">
                  <FileText size={18} /> Facturar venta {folio}
                </span>
                <button className="facturar-panel-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar (Esc)">
                  <X size={18} />
                </button>
              </div>

              {cargandoEstado || cargandoCliente ? (
                <div className="facturar-aviso">
                  <Loader2 size={16} className="animate-spin" />
                  <span>{cargandoEstado ? "Consultando estado de facturación…" : "Cargando datos del cliente…"}</span>
                </div>
              ) : factura ? (
                /* ── Ya facturada: mostrar folio fiscal + descargas ── */
                <>
                  <div className="facturar-check facturar-check--ok" style={{ marginBottom: 12 }}>
                    <CheckCircle2 size={15} />
                    <span>Esta venta ya está facturada.</span>
                  </div>
                  <div className="facturar-seccion">
                    <div className="facturar-seccion-titulo">Comprobante fiscal</div>
                    <div style={{ fontSize: 13, color: "var(--text-soft, #6b7280)", lineHeight: 1.7 }}>
                      <div><b>Receptor:</b> {factura.receptor_nombre} ({factura.receptor_rfc})</div>
                      {factura.uuid && (
                        <div style={{ wordBreak: "break-all" }}><b>Folio fiscal (UUID):</b> {factura.uuid}</div>
                      )}
                      {factura.total != null && <div><b>Total:</b> ${factura.total.toFixed(2)}</div>}
                    </div>
                  </div>
                  <div className="facturar-panel-acciones">
                    <button className="btn-secondary" onClick={() => descargar("xml")} disabled={!!descargando}>
                      {descargando === "xml" ? <><Loader2 size={15} className="animate-spin" /> XML…</> : <><FileCode2 size={15} /> XML</>}
                    </button>
                    <button className="btn-confirmar" onClick={() => descargar("pdf")} disabled={!!descargando}>
                      {descargando === "pdf" ? <><Loader2 size={15} className="animate-spin" /> Generando PDF…</> : <><Download size={15} /> Descargar PDF</>}
                    </button>
                  </div>
                </>
              ) : (
                /* ── No facturada: validar cliente y permitir timbrar ── */
                <>
                  <div className="facturar-seccion">
                    <div className="facturar-seccion-titulo">Datos fiscales del receptor</div>
                    {!clienteEf ? (
                      <div className="facturar-check facturar-check--warn">
                        <AlertTriangle size={15} />
                        <span>Venta a <b>público en general</b>. Asigna un cliente con RFC para facturar nominativo.</span>
                      </div>
                    ) : listoFiscal ? (
                      <div className="facturar-check facturar-check--ok">
                        <CheckCircle2 size={15} />
                        <span><b>{clienteEf.razon_social || clienteEf.nombre}</b> tiene los datos fiscales completos. Listo para timbrar.</span>
                      </div>
                    ) : (
                      <div className="facturar-check facturar-check--warn">
                        <AlertTriangle size={15} />
                        <span>Faltan datos fiscales del cliente: <b>{faltan.join(", ")}</b>.</span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="facturar-check facturar-check--warn" style={{ marginTop: 4 }}>
                      <AlertTriangle size={15} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="facturar-panel-acciones">
                    <button ref={cerrarRef} className="btn-secondary" onClick={() => setAbierto(false)}>
                      Cancelar
                    </button>
                    <button
                      className="btn-confirmar"
                      disabled={!puedeTimbrar || timbrando}
                      title={puedeTimbrar ? "Timbrar CFDI" : "Completa los datos fiscales del cliente"}
                      onClick={timbrar}
                    >
                      {timbrando ? <><Loader2 size={15} className="animate-spin" /> Timbrando…</> : "Timbrar CFDI"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
