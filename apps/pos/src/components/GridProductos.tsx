import type { ProductoPOS } from "../lib/client"
import { usePOS } from "../lib/pos-store"

interface GridProductosProps {
  productos: ProductoPOS[]
  onSeleccionar: (p: ProductoPOS) => void
  cartMap?: Map<string, number>
  onAgregar?: (p: ProductoPOS) => void
  onQuitar?: (sku: string) => void
  /** Agrega un producto SIN stock al carrito marcado como venta por encargo. */
  onEncargar?: (p: ProductoPOS) => void
  /** SKUs que son componentes de algún paquete (para mostrar el badge 📦). */
  skusEnPaquete?: Set<string>
}

function stockLabel(existencia: number) {
  if (existencia <= 0) return { texto: "Sin stock", clase: "badge-sin-stock" }
  if (existencia <= 3) return { texto: `Solo ${existencia}`, clase: "badge-poco-stock" }
  return { texto: `${existencia} en stock`, clase: "badge-en-stock" }
}

export function GridProductos({ productos, onSeleccionar, cartMap, onAgregar, onQuitar, onEncargar, skusEnPaquete }: GridProductosProps) {
  const { state } = usePOS()
  const cotizando = state.modoCotizacion
  if (productos.length === 0) return null

  return (
    <div className="grid-productos">
      {productos.map((p) => {
        const stock = stockLabel(p.existencia)
        const qty = cartMap?.get(p.sku) ?? 0
        // En cotización se permite seleccionar/agregar aunque no haya existencia.
        const showControls = onAgregar && (cotizando || p.existencia > 0)
        // Sin stock (fuera de cotización): en vez de bloquear, se puede agregar
        // por ENCARGO (venta sobre pedido). La tarjeta queda clickeable para ver
        // el detalle, y el control "+" se reemplaza por "📦 Encargar".
        const agotado = p.existencia <= 0 && !cotizando
        const puedeEncargar = agotado && !!onEncargar

        return (
          <button
            key={p.sku}
            className="tarjeta-producto"
            onClick={() => onSeleccionar(p)}
            disabled={agotado && !onEncargar}
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
                {/* Sin stock → botón de encargo (venta sobre pedido). */}
                {puedeEncargar && qty === 0 && (
                  <button
                    className="btn-encargar-rapido"
                    onClick={(e) => { e.stopPropagation(); onEncargar!(p) }}
                    title="Agregar por encargo (venta sobre pedido)"
                  >
                    📦 Encargar
                  </button>
                )}
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
                        disabled={!cotizando && qty >= p.existencia}
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
