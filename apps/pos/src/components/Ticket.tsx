import type { VentaResponse } from "../lib/client"

interface TicketProps {
  venta: VentaResponse
  onImpreso: () => void
}

export function Ticket({ venta, onImpreso }: TicketProps) {
  function handleImprimir() {
    window.print()
    // Cerrar la vista previa después de imprimir
    window.addEventListener("afterprint", onImpreso, { once: true })
  }

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">Vista previa del ticket</p>

        {/* Este div es el que se imprime */}
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

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onImpreso}>
            Cerrar
          </button>
          <button className="btn-confirmar" onClick={handleImprimir}>
            🖨 Imprimir ticket
          </button>
        </div>
      </div>
    </div>
  )
}
