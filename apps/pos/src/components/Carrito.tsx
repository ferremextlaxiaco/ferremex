import { usePOS } from "../lib/pos-store"

interface CarritoProps {
  onCobrar: () => void
}

export function Carrito({ onCobrar }: CarritoProps) {
  const { state, dispatch, total } = usePOS()
  const { items } = state

  if (items.length === 0) {
    return (
      <div className="carrito carrito-vacio">
        <p>El carrito está vacío</p>
        <p style={{ fontSize: 13, color: "#999" }}>Busca un producto y agrégalo</p>
      </div>
    )
  }

  return (
    <div className="carrito">
      <div className="carrito-items">
        {items.map((item) => (
          <div key={item.sku} className="carrito-item">
            <div className="carrito-item-desc">
              <span className="carrito-item-nombre">{item.descripcion}</span>
              <span className="carrito-item-sku">{item.sku}</span>
            </div>
            <div className="carrito-item-controles">
              <button
                className="btn-cantidad"
                onClick={() => dispatch({ type: "DECREMENT", sku: item.sku })}
              >
                −
              </button>
              <span className="carrito-item-cantidad">{item.cantidad}</span>
              <button
                className="btn-cantidad"
                onClick={() => dispatch({ type: "INCREMENT", sku: item.sku })}
              >
                +
              </button>
            </div>
            <div className="carrito-item-subtotal">
              ${(item.precio * item.cantidad).toFixed(2)}
            </div>
            <button
              className="btn-eliminar"
              onClick={() => dispatch({ type: "REMOVE", sku: item.sku })}
              title="Eliminar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="carrito-footer">
        <div className="carrito-total">
          <span>Total</span>
          <span className="carrito-total-valor">${total.toFixed(2)}</span>
        </div>
        <div className="carrito-acciones">
          <button
            className="btn-secondary"
            onClick={() => dispatch({ type: "CLEAR" })}
          >
            🗑 Vaciar
          </button>
          <button className="btn-cobrar" onClick={onCobrar}>
            COBRAR →
          </button>
        </div>
      </div>
    </div>
  )
}
