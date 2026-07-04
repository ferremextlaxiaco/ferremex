import { useEffect, useMemo } from "react"
import type { VentaResponse } from "../lib/client"
import type { Cliente } from "../lib/clientes"
import { FacturarBoton } from "./FacturarBoton"

interface TicketProps {
  venta: VentaResponse
  /** Cliente de la venta (para el gancho de facturación). Público = null. */
  cliente?: Cliente | null
  /** Si true, se imprime como COTIZACIÓN (sin pago/cambio ni facturación). */
  esCotizacion?: boolean
  onImpreso: () => void
}

export function Ticket({ venta, cliente, esCotizacion = false, onImpreso }: TicketProps) {
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

  function handleImprimir() {
    window.print()
    // Cerrar la vista previa después de imprimir
    window.addEventListener("afterprint", onImpreso, { once: true })
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
                  <td className="ticket-col-desc">{item.descripcion}</td>
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
          <button className="btn-confirmar" onClick={handleImprimir}>
            🖨 Imprimir {esCotizacion ? "cotización" : "ticket"}
          </button>
        </div>
      </div>
    </div>
  )
}
