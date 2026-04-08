import { useEffect, useRef, useState } from "react"
import { registrarVenta, type VentaResponse } from "../lib/client"
import { abrirCajon } from "../lib/serial"
import { usePOS } from "../lib/pos-store"

interface ModalCobroProps {
  onCerrar: () => void
  onVentaCompletada: (venta: VentaResponse) => void
}

export function ModalCobro({ onCerrar, onVentaCompletada }: ModalCobroProps) {
  const { state, total, dispatch } = usePOS()
  const [pagoStr, setPagoStr] = useState("")
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const pago = parseFloat(pagoStr) || 0
  const cambio = pago - total
  const pagoValido = pago >= total

  async function handleConfirmar() {
    if (!pagoValido || procesando || !state.cajero) return
    setProcesando(true)
    setError(null)
    try {
      const venta = await registrarVenta({
        cajero: state.cajero.nombre,
        turno_id: state.cajero.turno_id,
        items: state.items.map((i) => ({
          sku: i.sku,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precio,
        })),
        pago_efectivo: pago,
      })
      await abrirCajon()
      dispatch({ type: "CLEAR" })
      onVentaCompletada(venta)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
      setProcesando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && pagoValido) handleConfirmar()
    if (e.key === "Escape") onCerrar()
  }

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div className="modal-cobro">
        <h2 className="modal-titulo">Cobrar en efectivo</h2>

        <div className="cobro-resumen">
          {state.items.map((i) => (
            <div key={i.sku} className="cobro-item">
              <span>{i.descripcion} × {i.cantidad}</span>
              <span>${(i.precio * i.cantidad).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="cobro-total">
          <span className="cobro-total-label">Total</span>
          <span className="cobro-total-valor">${total.toFixed(2)}</span>
        </div>

        <div className="cobro-campo">
          <label>Recibido ($)</label>
          <input
            ref={inputRef}
            type="number"
            min={total}
            step="0.50"
            className="cobro-input"
            value={pagoStr}
            onChange={(e) => setPagoStr(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className={`cobro-cambio ${pagoValido ? "cambio-ok" : "cambio-insuficiente"}`}>
          <span className="cobro-cambio-label">Cambio</span>
          <span className="cobro-cambio-valor">
            {pagoValido ? `$${cambio.toFixed(2)}` : "—"}
          </span>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-acciones">
          <button className="btn-secondary" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            className="btn-confirmar"
            onClick={handleConfirmar}
            disabled={!pagoValido || procesando}
          >
            {procesando ? "Procesando…" : "✓ Confirmar y ticket"}
          </button>
        </div>
      </div>
    </div>
  )
}
