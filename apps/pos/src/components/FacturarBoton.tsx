import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { FileText, X, CheckCircle2, AlertTriangle, Loader2, UserPlus } from "lucide-react"
import { camposFiscalesFaltantes, type Cliente } from "../lib/clientes"
import {
  facturarVentaAPI, estadoFacturaAPI, obtenerClienteAPI,
  type FacturaVenta,
} from "../lib/client"
// @ts-expect-error — VisorComprobante es .jsx (sin tipos); interfaz estable por props.
import VisorComprobante from "./VisorComprobante"
// @ts-expect-error — SelectorClienteModal es .jsx (sin tipos); interfaz estable por props.
import SelectorClienteModal from "./SelectorClienteModal"

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
  /**
   * Factura ya timbrada de la venta, si el llamador ya la conoce (p. ej.
   * `venta.factura` del listado / registro). Cuando viene con `cfdi_id`, el botón
   * muestra "Ver factura" y abre el visor directo; no consulta el estado ni
   * muestra el panel de timbrado. Si se omite, el botón consulta el estado al
   * abrirse (comportamiento original).
   */
  facturaInicial?: FacturaVenta | null
  /** Estilo del trigger: botón ancho (footer) o compacto (fila de acciones). */
  variant?: "full" | "compact"
}

export function FacturarBoton({ folio, cliente, facturaInicial = null, variant = "full" }: FacturarBotonProps) {
  const [abierto, setAbierto] = useState(false)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Si el llamador ya conoce la factura (venta.factura), arrancamos con ella:
  // el botón dice "Ver factura" y no necesita consultar el estado al abrir.
  const yaFacturada = !!facturaInicial?.cfdi_id
  const [cargandoEstado, setCargandoEstado] = useState(false)
  const [factura, setFactura] = useState<FacturaVenta | null>(facturaInicial)
  const [timbrando, setTimbrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El cliente que llega por props puede venir parcial (solo id/nombre, como en
  // SalesHistory). Al abrir, hidratamos el cliente COMPLETO desde la BD (con sus
  // datos fiscales reales) para validar bien si se puede timbrar.
  const [clienteCompleto, setClienteCompleto] = useState<Cliente | null>(null)
  const [cargandoCliente, setCargandoCliente] = useState(false)
  // Cliente elegido en el selector cuando la venta era a público en general.
  // Tiene prioridad sobre el `cliente` de props (que sería null en ese caso).
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null)
  const [selectorAbierto, setSelectorAbierto] = useState(false)

  // Mueve el foco al panel al abrirlo + cierra con Escape.
  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(() => cerrarRef.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) }
    window.addEventListener("keydown", onKey)
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [abierto])

  // Al abrir, consulta el estado de facturación de la venta. Se omite si el
  // llamador ya nos pasó la factura (yaFacturada): no hay nada que consultar.
  useEffect(() => {
    if (!abierto || yaFacturada) return
    let on = true
    setCargandoEstado(true); setError(null)
    estadoFacturaAPI(folio)
      .then((e) => { if (on) setFactura(e.factura) })
      .catch(() => { /* sin estado: se asume no facturada */ })
      .finally(() => { if (on) setCargandoEstado(false) })
    return () => { on = false }
  }, [abierto, folio, yaFacturada])

  // Al abrir, hidrata el cliente completo (con datos fiscales) desde la BD si el
  // que llegó por props no los trae. Si ya viene completo (tiene rfc), lo usa tal cual.
  // Depende de PRIMITIVOS (id/rfc) y no del objeto `cliente`, para que no se
  // re-dispare en bucle si el padre recrea ese objeto en cada render.
  // El cliente base a facturar: el elegido en el selector (público general) gana
  // sobre el de la venta. Se hidrata al abrir y al elegir uno nuevo.
  const clienteBase = clienteElegido ?? cliente ?? null
  const clienteBaseId = clienteBase?.id
  const clienteBaseRfc = clienteBase?.rfc
  useEffect(() => {
    if (!abierto || yaFacturada) return
    if (!clienteBaseId) { setClienteCompleto(clienteBase ?? null); return }
    if (clienteBaseRfc) { setClienteCompleto(clienteBase ?? null); return }
    let on = true
    setCargandoCliente(true)
    obtenerClienteAPI(clienteBaseId)
      .then((c) => { if (on) setClienteCompleto(c) })
      .catch(() => { if (on) setClienteCompleto(clienteBase ?? null) }) // fallback al parcial
      .finally(() => { if (on) setCargandoCliente(false) })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, clienteBaseId, clienteBaseRfc, yaFacturada])

  // Validación fiscal sobre el cliente COMPLETO (no el parcial de props).
  const clienteEf = clienteCompleto ?? clienteBase ?? null
  const faltan = camposFiscalesFaltantes(clienteEf)
  const listoFiscal = faltan.length === 0
  const puedeTimbrar = !!clienteEf && listoFiscal && !factura && !cargandoCliente

  // Al elegir un cliente en el selector (venta a público general): lo fijamos
  // como cliente elegido; el efecto de arriba lo hidrata para validar/timbrar.
  function onClienteSeleccionado(c: Cliente | null) {
    setSelectorAbierto(false)
    if (c) { setClienteElegido(c); setError(null) }
  }

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

  return (
    <>
      <button
        type="button"
        className={[
          "facturar-btn",
          variant === "full" ? "facturar-btn--full" : "facturar-btn--compact",
          yaFacturada ? "facturar-btn--vista" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => setAbierto(true)}
        title={yaFacturada ? "Ver la factura (CFDI) de esta venta" : "Facturar esta venta (CFDI)"}
      >
        {yaFacturada
          ? <><CheckCircle2 size={variant === "full" ? 16 : 14} /> Ver factura</>
          : <><FileText size={variant === "full" ? 16 : 14} /> Facturar</>}
      </button>

      {/* Ya facturada → visor a PANTALLA COMPLETA (PDF + barra lateral de detalles),
          el mismo del módulo de Comprobantes. Sin cancelar (no se pasa onCancelado). */}
      {abierto && factura && !cargandoEstado &&
        createPortal(
          <VisorComprobante
            comprobante={{
              cfdi_id: factura.cfdi_id,
              uuid: factura.uuid,
              tipo: "nominativa",
              receptor_rfc: factura.receptor_rfc,
              receptor_nombre: factura.receptor_nombre,
              total: factura.total,
              folio_venta: folio,
              estado: factura.cancelada ? "Cancelado" : "Vigente",
            }}
            onClose={() => setAbierto(false)}
          />,
          document.body
        )}

      {/* No facturada (o cargando) → panelito de validación + timbrado. */}
      {abierto && !(factura && !cargandoEstado) &&
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
              ) : (
                /* ── No facturada: validar cliente y permitir timbrar ── */
                <>
                  <div className="facturar-seccion">
                    <div className="facturar-seccion-titulo">Datos fiscales del receptor</div>
                    {!clienteEf ? (
                      <>
                        <div className="facturar-check facturar-check--warn">
                          <AlertTriangle size={15} />
                          <span>Venta a <b>público en general</b>. Elige un cliente con RFC para facturar nominativo.</span>
                        </div>
                        <button className="btn-elegir-cliente" onClick={() => setSelectorAbierto(true)}>
                          <UserPlus size={15} /> Elegir cliente
                        </button>
                      </>
                    ) : listoFiscal ? (
                      <>
                        <div className="facturar-check facturar-check--ok">
                          <CheckCircle2 size={15} />
                          <span><b>{clienteEf.razon_social || clienteEf.nombre}</b> tiene los datos fiscales completos. Listo para timbrar.</span>
                        </div>
                        {/* Si la venta era pública y se eligió cliente, avisar del "switch". */}
                        {!cliente && (
                          <div className="facturar-nota-switch">
                            Esta venta se reasignará a <b>{clienteEf.razon_social || clienteEf.nombre}</b> y saldrá de la factura global del día.
                            <button className="facturar-link" onClick={() => setSelectorAbierto(true)}>Cambiar</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="facturar-check facturar-check--warn">
                          <AlertTriangle size={15} />
                          <span>Faltan datos fiscales del cliente <b>{clienteEf.razon_social || clienteEf.nombre}</b>: <b>{faltan.join(", ")}</b>.</span>
                        </div>
                        {!cliente && (
                          <button className="btn-elegir-cliente" onClick={() => setSelectorAbierto(true)}>
                            <UserPlus size={15} /> Elegir otro cliente
                          </button>
                        )}
                      </>
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

      {/* Selector de cliente (para ventas a público en general). */}
      <SelectorClienteModal
        open={selectorAbierto}
        onClose={() => setSelectorAbierto(false)}
        onSelect={onClienteSeleccionado}
        permitirTodos={false}
      />
    </>
  )
}
