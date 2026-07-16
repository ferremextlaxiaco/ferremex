import { useEffect, useMemo, useState } from "react"
import type { VentaResponse, TicketConfig } from "../lib/client"
import type { Cliente } from "../lib/clientes"
import { usePOS } from "../lib/pos-store"
import { construirBytesTicket, type TicketPrintData } from "../lib/serial"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { FacturarBoton } from "./FacturarBoton"
import NotaVentaModal from "./NotaVentaModal"

interface TicketProps {
  venta: VentaResponse
  /** Cliente de la venta (para el gancho de facturación). Público = null. */
  cliente?: Cliente | null
  /** Si true, se imprime como COTIZACIÓN (sin pago/cambio ni facturación). */
  esCotizacion?: boolean
  onImpreso: () => void
  pushToast?: (msg: string, tipo?: "success" | "error" | "info") => void
}

/**
 * Mapea una VentaResponse + config del ticket a los bytes ESC/POS que espera la
 * térmica. Respeta el encabezado/pie configurado en el panel de Formatos.
 *
 * Nota de IVA: los precios de la venta YA incluyen IVA (es lo que se cobró y lo
 * que ve el cliente en pantalla). Para que el ticket impreso coincida exactamente
 * con la vista previa —sin desglosar un IVA que confundiría—, pasamos subtotal =
 * total e iva = 0. Si en el futuro se quiere desglosar, se calcula aquí.
 */
function ventaATicketPrintData(
  venta: VentaResponse,
  cfg: TicketConfig | null,
  esCotizacion: boolean
): TicketPrintData {
  const enc = cfg?.encabezado
  const tipo = esCotizacion ? cfg?.tipos?.cotizacion : cfg?.tipos?.venta

  // Método de pago dominante (para la etiqueta y el bloque recibido/cambio).
  const metodo: TicketPrintData["payment"]["method"] =
    venta.pago_efectivo > 0 ? "efectivo"
    : (venta.pago_tarjeta ?? 0) > 0 ? "tarjeta"
    : (venta.pago_transferencia ?? 0) > 0 ? "transferencia"
    : (venta.pago_credito ?? 0) > 0 ? "credito"
    : "efectivo"
  const labelPago =
    metodo === "efectivo" ? "EFECTIVO"
    : metodo === "tarjeta" ? "TARJETA"
    : metodo === "transferencia" ? "TRANSFERENCIA"
    : "CRÉDITO"

  // Pie: para cotización usa un texto fijo; para venta, el configurado.
  const pie = esCotizacion
    ? ["Cotización — no es comprobante de pago", "Precios sujetos a cambio sin previo aviso"]
    : (cfg?.pie && cfg.pie.length > 0 ? cfg.pie : ["¡Gracias por su compra!", "Conserve su ticket"])

  return {
    company: {
      logo: enc?.logo ?? null,
      logoSize: 120,
      name: enc?.nombre || "FERREMEX",
      rfc: enc?.rfc || "",
      address: enc?.direccion || "",
      phone: enc?.telefono || "",
      email: enc?.email || "",
    },
    titulo: tipo?.titulo || (esCotizacion ? "COTIZACIÓN" : "COMPROBANTE DE VENTA"),
    folio: venta.folio,
    fecha: new Date(venta.fecha).toLocaleString("es-MX"),
    cajero: venta.cajero,
    cliente: venta.cliente_nombre ? { name: venta.cliente_nombre, rfc: "" } : null,
    lines: venta.items.map((it) => ({
      description: it.encargo ? `${it.descripcion} (POR ENCARGO)` : it.descripcion,
      qty: it.cantidad,
      unitPrice: it.precio_unitario,
      total: it.subtotal,
      savings: 0,
      discount: 0,
      pkgItems: [],
    })),
    // Precios de venta ya con IVA → no desglosamos (ver nota arriba).
    subtotal: venta.total,
    globalDiscAmt: 0,
    globalDiscLabel: "",
    iva: 0,
    pointsDisc: esCotizacion ? 0 : (venta.pago_puntos ?? 0),
    pointsRedeemed: esCotizacion ? 0 : (venta.puntos_canjeados ?? 0),
    cnAmt: 0,
    cnFolio: "",
    total: venta.total,
    payment: {
      method: metodo,
      label: labelPago,
      received: venta.pago_efectivo,
      change: venta.cambio,
    },
    footer: pie,
  }
}

export function Ticket({ venta, cliente, esCotizacion = false, onImpreso, pushToast }: TicketProps) {
  const { state } = usePOS()
  const [imprimiendo, setImprimiendo] = useState(false)
  const [notaVenta, setNotaVenta] = useState(false)
  // Cliente para facturar: la VENTA es la fuente de verdad (el clienteActivo del
  // estado se resetea al terminar la venta, así que no sirve aquí). Si la venta
  // trae cliente_id, construimos un cliente mínimo (el FacturarBoton hidrata el
  // resto desde la BD). Fallback al prop `cliente` para cotizaciones/compat.
  // Memoizado para que NO se recree en cada render: si fuera un objeto literal
  // nuevo cada vez, el useEffect de hidratación del FacturarBoton (dep: cliente)
  // se re-dispararía en bucle y podría no estabilizar los datos fiscales.
  const clienteFactura: Cliente | null = useMemo(
    () =>
      venta.cliente_id
        ? ({ id: venta.cliente_id, nombre: venta.cliente_nombre ?? "" } as Cliente)
        : (cliente ?? null),
    [venta.cliente_id, venta.cliente_nombre, cliente]
  )

  // Cerrar la vista previa con Escape (igual que el botón "Cerrar").
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onImpreso() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onImpreso])

  // Fallback: impresión por el navegador (diálogo de Chrome). Se usa solo si NO
  // hay servicio local con impresora térmica (p. ej. una terminal sin la Sicar).
  function imprimirPorNavegador() {
    window.print()
    window.addEventListener("afterprint", onImpreso, { once: true })
  }

  async function handleImprimir() {
    if (imprimiendo) return
    setImprimiendo(true)
    try {
      // Vía preferida: mandar el ticket ESC/POS directo a la térmica por el
      // servicio local (sin diálogo del navegador). Requiere impresora elegida
      // en Periféricos y el servicio corriendo en la caja.
      if (impresoraElegida()) {
        const printData = ventaATicketPrintData(venta, state.ticketConfig, esCotizacion)
        const bytes = await construirBytesTicket(printData)
        await imprimirBytesLocal(bytes)
        onImpreso()
        return
      }
    } catch (err) {
      // El servicio no respondió o la impresora falló: caemos al diálogo del
      // navegador para no dejar al cajero sin poder imprimir.
      console.warn("Impresión térmica local falló, usando diálogo del navegador:", err)
    } finally {
      setImprimiendo(false)
    }
    imprimirPorNavegador()
  }

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">
          Vista previa de {esCotizacion ? "la cotización" : "el ticket"}
        </p>

        {/* Este div es el que se imprime */}
        <div className="ticket">
          <div className="ticket-header">
            <p className="ticket-negocio">FERREMEX</p>
            <p className="ticket-sub">Tlaxiaco, Oaxaca</p>
            <p className="ticket-sub">Tel: (953) 555-0000</p>
            {esCotizacion && <p className="ticket-tipo-doc">COTIZACIÓN</p>}
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Folio: {venta.folio}</p>
          <p className="ticket-meta">Fecha: {new Date(venta.fecha).toLocaleString("es-MX")}</p>
          <p className="ticket-meta">Cajero: {venta.cajero}</p>

          <div className="ticket-separador">————————————————</div>

          <table className="ticket-tabla">
            <thead>
              <tr>
                <th className="ticket-col-desc">Artículo</th>
                <th className="ticket-col-num">Cant</th>
                <th className="ticket-col-num">P.U.</th>
                <th className="ticket-col-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="ticket-col-desc">
                    {item.descripcion}
                    {item.encargo && <span className="ticket-encargo"> (POR ENCARGO)</span>}
                  </td>
                  <td className="ticket-col-num">{item.cantidad}</td>
                  <td className="ticket-col-num">${item.precio_unitario.toFixed(2)}</td>
                  <td className="ticket-col-num">${item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen">
            <span>TOTAL</span>
            <span>${venta.total.toFixed(2)}</span>
          </div>
          {/* Pago/cambio solo en ventas; una cotización es un presupuesto. */}
          {!esCotizacion && (
            <>
              {venta.pago_efectivo > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Efectivo</span>
                  <span>${venta.pago_efectivo.toFixed(2)}</span>
                </div>
              )}
              {(venta.pago_transferencia ?? 0) > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Transferencia</span>
                  <span>${(venta.pago_transferencia ?? 0).toFixed(2)}</span>
                </div>
              )}
              {(venta.pago_tarjeta ?? 0) > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Tarjeta</span>
                  <span>${(venta.pago_tarjeta ?? 0).toFixed(2)}</span>
                </div>
              )}
              {(venta.pago_credito ?? 0) > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Crédito</span>
                  <span>${(venta.pago_credito ?? 0).toFixed(2)}</span>
                </div>
              )}
              {(venta.pago_puntos ?? 0) > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Puntos ({(venta.puntos_canjeados ?? 0).toLocaleString("es-MX")})</span>
                  <span>${(venta.pago_puntos ?? 0).toFixed(2)}</span>
                </div>
              )}
              {(venta.pago_saldo_cambio ?? 0) > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Saldo a favor</span>
                  <span>${(venta.pago_saldo_cambio ?? 0).toFixed(2)}</span>
                </div>
              )}
              <div className="ticket-fila-resumen ticket-cambio">
                <span>Cambio</span>
                <span>${venta.cambio.toFixed(2)}</span>
              </div>
            </>
          )}

          {/* Monedero Electrónico: puntos ganados con esta compra. */}
          {!esCotizacion && (venta.puntos_ganados ?? 0) > 0 && (
            <>
              <div className="ticket-separador">————————————————</div>
              <p className="ticket-meta" style={{ textAlign: "center" }}>
                🪙 Monedero Electrónico
              </p>
              <p className="ticket-meta" style={{ textAlign: "center" }}>
                Ganaste {(venta.puntos_ganados ?? 0).toLocaleString("es-MX")} puntos
              </p>
            </>
          )}

          <div className="ticket-separador">————————————————</div>

          {esCotizacion ? (
            <>
              <p className="ticket-gracias">Cotización — no es comprobante de pago</p>
              <p className="ticket-gracias">Precios sujetos a cambio sin previo aviso</p>
            </>
          ) : (
            <>
              <p className="ticket-gracias">¡Gracias por su compra!</p>
              <p className="ticket-gracias">Conserve su ticket</p>
            </>
          )}
        </div>

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onImpreso}>
            Cerrar
          </button>
          {/* Botón de facturar: SIEMPRE visible para ventas (no cotizaciones).
              Si la venta no tiene cliente (público en general), al pulsarlo el
              FacturarBoton pide elegir un cliente y reasigna la venta a él antes
              de timbrar nominativo (la saca de la global del día). */}
          {!esCotizacion && (
            <FacturarBoton folio={venta.folio} cliente={clienteFactura} facturaInicial={venta.factura ?? null} variant="full" />
          )}
          {/* Nota de venta formal (hoja carta, estética factura): para imprimir más
              rápido o mandar al cliente sin pasar por el historial de ventas. */}
          {!esCotizacion && (
            <button className="btn-secondary" onClick={() => setNotaVenta(true)}>
              📄 Nota de venta
            </button>
          )}
          <button className="btn-confirmar" onClick={handleImprimir} disabled={imprimiendo}>
            🖨 {imprimiendo ? "Imprimiendo…" : `Imprimir ${esCotizacion ? "cotización" : "ticket"}`}
          </button>
        </div>
      </div>

      {notaVenta && (
        <NotaVentaModal venta={venta} onClose={() => setNotaVenta(false)} pushToast={pushToast} />
      )}
    </div>
  )
}
