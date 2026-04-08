import { useEffect } from "react"
import type { VentaResponse } from "../lib/client"

interface TicketProps {
  venta: VentaResponse
  onImpreso: () => void
}

export function Ticket({ venta, onImpreso }: TicketProps) {
  useEffect(() => {
    // Imprimir automáticamente al montar el ticket
    const timer = setTimeout(() => {
      window.print()
      onImpreso()
    }, 200)
    return () => clearTimeout(timer)
  }, [onImpreso])

  return (
    <div className="ticket-wrapper">
      {/* ---- Solo visible en impresión (@media print) ---- */}
      <div className="ticket">
        <div className="ticket-header">
          <p className="ticket-negocio">FERREMEX</p>
          <p className="ticket-sub">Tlaxiaco, Oaxaca</p>
          <p className="ticket-sub">Tel: (953) 555-0000</p>
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
              <th className="ticket-col-num">Precio</th>
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
        <div className="ticket-fila-resumen">
          <span>Efectivo</span>
          <span>${venta.pago_efectivo.toFixed(2)}</span>
        </div>
        <div className="ticket-fila-resumen ticket-cambio">
          <span>Cambio</span>
          <span>${venta.cambio.toFixed(2)}</span>
        </div>

        <div className="ticket-separador">————————————————</div>

        <p className="ticket-gracias">¡Gracias por su compra!</p>
        <p className="ticket-gracias">Conserve su ticket</p>
      </div>
    </div>
  )
}
