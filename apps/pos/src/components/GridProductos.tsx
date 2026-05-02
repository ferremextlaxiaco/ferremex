import type { ProductoPOS } from "../lib/client"

interface GridProductosProps {
  productos: ProductoPOS[]
  onSeleccionar: (p: ProductoPOS) => void
}

function stockLabel(existencia: number) {
  if (existencia <= 0) return { texto: "Sin stock", clase: "badge-sin-stock" }
  if (existencia <= 3) return { texto: `Solo ${existencia}`, clase: "badge-poco-stock" }
  return { texto: `${existencia} en stock`, clase: "badge-en-stock" }
}

export function GridProductos({ productos, onSeleccionar }: GridProductosProps) {
  if (productos.length === 0) return null

  return (
    <div className="grid-productos">
      {productos.map((p) => {
        const stock = stockLabel(p.existencia)
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
            </div>
            <div className="tarjeta-info">
              <p className="tarjeta-nombre">{p.descripcion}</p>
              <p className="tarjeta-sku">{p.sku}</p>
              <p className="tarjeta-precio">${p.precio.toFixed(2)}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
