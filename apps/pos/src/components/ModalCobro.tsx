import { useEffect, useRef, useState } from "react"
import { registrarVenta, marcarCotizacionConvertida, type VentaResponse } from "../lib/client"
import { abrirCajon } from "../lib/serial"
import { usePOS, efectivoPrecio } from "../lib/pos-store"
import { claveLinea } from "../lib/promociones"
import { formatMXN as fmt } from "../lib/format"

interface ModalCobroProps {
  onCerrar: () => void
  onVentaCompletada: (venta: VentaResponse) => void
}

type Metodo = "efectivo" | "transferencia" | "credito"

const METODOS: { id: Metodo; label: string; icon: string }[] = [
  { id: "efectivo",      label: "Efectivo",       icon: "💵" },
  { id: "transferencia", label: "Transferencia",   icon: "📱" },
  { id: "credito",       label: "Crédito",         icon: "📋" },
]

export function ModalCobro({ onCerrar, onVentaCompletada }: ModalCobroProps) {
  const { state, total, dispatch, promosCarrito } = usePOS()

  // Precio unitario efectivo de una línea, ya con promociones aplicadas. Para
  // NxM/volumen el descuento no es un precio uniforme, así que se reparte el
  // importe total de la línea entre sus unidades (lo que se persiste y se imprime).
  function precioUnitEfectivo(i: (typeof state.items)[number]): number {
    const linea = promosCarrito.get(claveLinea(i))
    if (linea && i.cantidad > 0) return Math.round((linea.importe / i.cantidad) * 100) / 100
    return efectivoPrecio(i)
  }
  const [pagos, setPagos] = useState<Record<Metodo, string>>({ efectivo: "", transferencia: "", credito: "" })
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const efectivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => { efectivoRef.current?.focus() }, [])

  const tieneCredito = (state.clienteActivo?.limite_credito ?? 0) > 0

  const pEfectivo      = parseFloat(pagos.efectivo)      || 0
  const pTransferencia = parseFloat(pagos.transferencia)  || 0
  const pCredito       = parseFloat(pagos.credito)        || 0
  const asignado       = pEfectivo + pTransferencia + pCredito

  // Cuánto falta cubrir con efectivo una vez restados otros métodos
  const neededCash = Math.max(0, total - pTransferencia - pCredito)
  const cambio     = Math.max(0, pEfectivo - neededCash)
  const pendiente  = Math.max(0, neededCash - pEfectivo)
  const cubierto   = asignado >= total - 0.005

  function completar(id: Metodo) {
    const otros = asignado - (parseFloat(pagos[id]) || 0)
    const resto = Math.max(0, total - otros)
    setPagos(p => ({ ...p, [id]: resto.toFixed(2) }))
  }

  async function handleConfirmar() {
    if (!cubierto || procesando || !state.cajero) return
    if (pCredito > 0 && !state.clienteActivo) return
    setProcesando(true)
    setError(null)
    try {
      const ventaItems = state.items
      const ventaCliente = state.clienteActivo
      // El cargo a crédito lo registra el backend de forma TRANSACCIONAL dentro
      // de POST /caja/ventas (dentro del lock de la venta). Por eso enviamos
      // cliente_id/plazo y ya NO llamamos a agregarMovimientoCredito por separado:
      // así nunca queda un cargo huérfano si la venta falla, ni una venta sin cargo.
      const venta = await registrarVenta({
        cajero: state.cajero.nombre,
        turno_id: state.cajero.turno_id,
        items: ventaItems.map((i) => ({
          sku: i.sku,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          // Precio unitario ya con promoción aplicada (gana sobre mayoreo).
          precio_unitario: precioUnitEfectivo(i),
          // Traza del paquete (si la línea proviene de un paquete vendido).
          ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre } : {}),
        })),
        pago_efectivo: pEfectivo,
        pago_transferencia: pTransferencia,
        pago_credito: pCredito,
        ...(pCredito > 0 && ventaCliente
          ? {
              cliente_id: ventaCliente.id,
              cliente_nombre: ventaCliente.nombre,
              plazo: ventaCliente.dias_credito,
            }
          : {}),
      })
      // Si la venta nació de una cotización cargada, enlázala (trazabilidad).
      // No es crítico para la venta: si falla, la venta ya quedó registrada.
      if (state.cotizacionCargadaFolio) {
        try {
          await marcarCotizacionConvertida(state.cotizacionCargadaFolio, venta.folio)
        } catch { /* la venta es lo importante; el enlace es best-effort */ }
      }
      if (pEfectivo > 0) {
        try { await abrirCajon() } catch { /* sin cajón, continuar */ }
      }
      dispatch({ type: "CLEAR" })
      onVentaCompletada(venta)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
      setProcesando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCerrar()
  }

  return (
    <div className="modal-overlay" onKeyDown={handleKeyDown}>
      <div className="modal-cobro">
        <h2 className="modal-titulo">Cobro</h2>

        <div className="cobro-resumen">
          {state.items.map((i) => {
            const linea = promosCarrito.get(claveLinea(i))
            const importe = linea ? linea.importe : efectivoPrecio(i) * i.cantidad
            return (
              <div key={i.sku} className="cobro-item">
                <span>
                  {i.descripcion} × {i.cantidad}
                  {linea?.promo && <span className="cobro-item-promo"> · {linea.etiqueta}</span>}
                </span>
                <span>${importe.toFixed(2)}</span>
              </div>
            )
          })}
        </div>

        <div className="cobro-total">
          <span className="cobro-total-label">Total</span>
          <span className="cobro-total-valor">${total.toFixed(2)}</span>
        </div>

        <p className="cobro-instruccion">Selecciona una forma de pago o combínalas:</p>

        <div className="cobro-metodos">
          {METODOS.map(({ id, label, icon }) => {
            const disabled = id === "credito" && !tieneCredito
            const activo   = (parseFloat(pagos[id]) || 0) > 0
            const restante = Math.max(0, total - asignado + (parseFloat(pagos[id]) || 0))

            return (
              <div key={id} className={`cobro-metodo${activo ? " activo" : ""}${disabled ? " deshabilitado" : ""}`}>
                <div className="cobro-metodo-header">
                  <span className="cobro-metodo-icon">{icon}</span>
                  <span className="cobro-metodo-label">{label}</span>
                  {id === "credito" && !tieneCredito && (
                    <span className="cobro-metodo-nota">Requiere cliente con crédito</span>
                  )}
                </div>

                <input
                  ref={id === "efectivo" ? efectivoRef : undefined}
                  type="number"
                  min={0}
                  step="0.50"
                  className="cobro-metodo-input"
                  value={pagos[id]}
                  onChange={(e) => setPagos(p => ({ ...p, [id]: e.target.value }))}
                  placeholder="$0.00"
                  disabled={disabled}
                />

                {!disabled && !cubierto && (
                  <button className="cobro-btn-completar" onClick={() => completar(id)}>
                    Completar {fmt(restante)}
                  </button>
                )}

                {id === "efectivo" && activo && cubierto && cambio >= 0.01 && (
                  <div className="cobro-cambio-mini">
                    Cambio: <strong>{fmt(cambio)}</strong>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {pendiente > 0.005 && (
          <div className="cobro-pendiente">
            Falta por cubrir: <strong>{fmt(pendiente)}</strong>
          </div>
        )}

        {cubierto && cambio >= 0.01 && pTransferencia === 0 && pCredito === 0 && (
          <div className="cobro-cambio cobro-cambio-ok">
            <span className="cobro-cambio-label">Cambio</span>
            <span className="cobro-cambio-valor">{fmt(cambio)}</span>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-acciones">
          <button className="btn-secondary" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </button>
          <button
            className="btn-confirmar"
            onClick={handleConfirmar}
            disabled={!cubierto || procesando}
          >
            {procesando ? "Procesando…" : "✓ Confirmar y ticket"}
          </button>
        </div>
      </div>
    </div>
  )
}
