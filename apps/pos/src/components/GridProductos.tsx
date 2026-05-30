import type { ProductoPOS } from "../lib/client"

interface GridProductosProps {
  productos: ProductoPOS[]
  onSeleccionar: (p: ProductoPOS) => void
  cartMap?: Map<string, number>
  onAgregar?: (p: ProductoPOS) => void
  onQuitar?: (sku: string) => void
  /** SKUs que son componentes de algún paquete (para mostrar el badge 📦). */
  skusEnPaquete?: Set<string>
}

function stockLabel(existencia: number) {
  if (existencia <= 0) return { texto: "Sin stock", clase: "badge-sin-stock" }
  if (existencia <= 3) return { texto: `Solo ${existencia}`, clase: "badge-poco-stock" }
  return { texto: `${existencia} en stock`, clase: "badge-en-stock" }
}

export function GridProductos({ productos, onSeleccionar, cartMap, onAgregar, onQuitar, skusEnPaquete }: GridProductosProps) {
  if (productos.length === 0) return null

  return (
    <div className="grid-productos">
      {productos.map((p) => {
        const stock = stockLabel(p.existencia)
        const qty = cartMap?.get(p.sku) ?? 0
        const showControls = onAgregar && p.existencia > 0

        return (
          <button
            key={p.sku}
            className="tarjeta-producto"
            onClick={() => onSeleccionar(p)}
            disabled={p.existencia <= 0}
          >
            <div className="tarjeta-imagen">
              {p.thumbnail ? (
                <img src={p.thumbnail} alt={p.descripcion} loading="lazy" />
              ) : (
                <div className="tarjeta-sin-imagen">
                  <span>📦</span>
                </div>
              )}
              <span className={`badge-stock ${stock.clase}`}>{stock.texto}</span>
              {skusEnPaquete?.has(p.sku) && (
                <span className="badge-en-paquete" title="Este artículo forma parte de un paquete">📦 Paquete</span>
              )}
            </div>
            <div className="tarjeta-info">
              <p className="tarjeta-nombre">{p.descripcion}</p>
              <p className="tarjeta-sku">{p.sku}</p>
              <div className="tarjeta-footer">
                <p className="tarjeta-precio">${p.precio.toFixed(2)}</p>
                {showControls && (
                  qty === 0 ? (
                    <button
                      className="btn-agregar-rapido"
                      onClick={(e) => { e.stopPropagation(); onAgregar(p) }}
                      title="Agregar al carrito"
                    >
                      +
                    </button>
                  ) : (
                    <div className="qty-control" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="qty-btn"
                        onClick={() => onQuitar?.(p.sku)}
                        title="Quitar uno"
                      >
                        −
                      </button>
                      <span className="qty-num">{qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => onAgregar(p)}
                        disabled={qty >= p.existencia}
                        title="Agregar uno más"
                      >
                        +
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
