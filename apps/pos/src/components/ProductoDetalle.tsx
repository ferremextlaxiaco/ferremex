import { useState } from "react"
import { usePOS } from "../lib/pos-store"
import type { ProductoPOS } from "../lib/client"

interface ProductoDetalleProps {
  producto: ProductoPOS
  onVolver: () => void
}

export function ProductoDetalle({ producto, onVolver }: ProductoDetalleProps) {
  const { dispatch } = usePOS()
  const [cantidad, setCantidad] = useState(1)
  const [agregado, setAgregado] = useState(false)

  const sinStock = producto.existencia <= 0

  function handleAgregar() {
    for (let i = 0; i < cantidad; i++) {
      dispatch({
        type: "ADD_ITEM",
        item: {
          sku: producto.sku,
          descripcion: producto.descripcion,
          precio: producto.precio,
          precio2: producto.precio2,
          impuesto: producto.impuesto,
          existencia: producto.existencia,
          mayoreoActivo: producto.mayoreoActivo,
          mayoreoMin: producto.mayoreoMin,
        },
      })
    }
    setAgregado(true)
    setTimeout(() => {
      setAgregado(false)
      onVolver()
    }, 900)
  }

  return (
    <div className="detalle-wrapper">
      <button className="detalle-volver" onClick={onVolver} title="Volver a resultados">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
      </button>

      <div className="detalle-body">
        {/* Imagen */}
        <div className="detalle-imagen">
          {producto.thumbnail ? (
            <img src={producto.thumbnail} alt={producto.descripcion} />
          ) : (
            <div className="detalle-sin-imagen">
              <span>📦</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="detalle-info">
          <h2 className="detalle-nombre">{producto.descripcion}</h2>
          <div className="detalle-sku-row">
            <p className="detalle-sku">SKU: {producto.sku}</p>
            {producto.marca && <span className="detalle-marca">{producto.marca}</span>}
          </div>

          <div className="detalle-precio">${producto.precio.toFixed(2)}</div>
          {producto.mayoreoActivo && producto.precio2 && producto.mayoreoMin && (
            <div className="detalle-mayoreo-badge">
              Mayoreo: {producto.mayoreoMin}+ piezas → ${producto.precio2.toFixed(2)} c/u
            </div>
          )}

          <div className={`detalle-stock-badge ${sinStock ? "badge-sin-stock" : producto.existencia <= 3 ? "badge-poco-stock" : "badge-en-stock"}`}>
            {sinStock
              ? "❌ Sin existencia"
              : producto.existencia <= 3
              ? `⚠️ Solo ${producto.existencia} disponibles`
              : `✓ ${producto.existencia} en almacén`}
          </div>

          {!sinStock && (
            <div className="detalle-cantidad">
              <span className="detalle-cantidad-label">Cantidad</span>
              <div className="detalle-cantidad-controles">
                <button
                  className="btn-qty"
                  onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  disabled={cantidad <= 1}
                >
                  −
                </button>
                <span className="detalle-cantidad-num">{cantidad}</span>
                <button
                  className="btn-qty"
                  onClick={() => setCantidad((c) => Math.min(producto.existencia, c + 1))}
                  disabled={cantidad >= producto.existencia}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <button
            className={`btn-agregar-detalle ${agregado ? "btn-agregado" : ""}`}
            onClick={handleAgregar}
            disabled={sinStock || agregado}
          >
            {agregado ? "✓ Agregado al carrito" : `Agregar ${cantidad > 1 ? `(${cantidad})` : ""} al carrito`}
          </button>
        </div>
      </div>

      {/* Especificaciones */}
      <div className="detalle-specs">
        <h3 className="detalle-specs-titulo">Especificaciones</h3>
        {producto.especificaciones && producto.especificaciones.length > 0 ? (
          <table className="detalle-specs-tabla">
            <tbody>
              {producto.especificaciones.map((esp, i) => (
                <tr key={i}>
                  <td className="detalle-specs-key">{esp.clave}</td>
                  <td className="detalle-specs-val">{esp.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="detalle-specs-vacio">Sin especificaciones registradas.</p>
        )}
      </div>
    </div>
  )
}
