import { usePOS } from "../lib/pos-store"

interface CarritoProps {
  onCobrar: () => void
}

export function Carrito({ onCobrar }: CarritoProps) {
  const { state, dispatch, total } = usePOS()
  const { items } = state

  return (
    <div className="carrito">
      <div className="carrito-header">Carrito ({items.length} productos)</div>

      {items.length === 0 ? (
        <div className="carrito-vacio">
          <span style={{ fontSize: 32 }}>🛒</span>
          <p>Carrito vacío</p>
          <p style={{ fontSize: 12 }}>Busca y agrega productos</p>
        </div>
      ) : (
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
      )}

      <div className="carrito-footer">
        <div className="carrito-total">
          <span className="carrito-total-label">Total</span>
          <span className="carrito-total-valor">${total.toFixed(2)}</span>
        </div>
        <div className="carrito-acciones">
          <button
            className="btn-vaciar"
            onClick={() => dispatch({ type: "CLEAR" })}
            disabled={items.length === 0}
          >
            🗑 Vaciar
          </button>
          <button className="btn-cobrar" onClick={onCobrar} disabled={items.length === 0}>
            COBRAR →
          </button>
        </div>
      </div>
    </div>
  )
}
