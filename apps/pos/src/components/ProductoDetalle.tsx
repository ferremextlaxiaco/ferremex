import { useState } from "react"
import { Tag } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import { promosDeArticulo, describirPromo, contextoDeCliente } from "../lib/promociones"
import { DetallePromoModal } from "./DetallePromoModal"
import type { ProductoPOS, Promocion } from "../lib/client"

interface ProductoDetalleProps {
  producto: ProductoPOS
  onVolver: () => void
}

export function ProductoDetalle({ producto, onVolver }: ProductoDetalleProps) {
  const { dispatch, state, promos } = usePOS()
  const [cantidad, setCantidad] = useState(1)
  // Texto crudo del input de cantidad. Se mantiene aparte de `cantidad` para
  // permitir estados intermedios al teclear (campo vacío, "0") sin romper el
  // número real. Se valida y sincroniza (clamp 1..existencia) al salir del campo.
  const [cantidadTexto, setCantidadTexto] = useState("1")
  const [agregado, setAgregado] = useState(false)
  const [promoDetalle, setPromoDetalle] = useState<Promocion | null>(null)

  // Fija la cantidad respetando límites y refleja el valor final tanto en el
  // número real como en el texto del input. En cotización el tope es libre
  // (presupuesto); en venta se limita a la existencia disponible.
  function fijarCantidad(n: number) {
    const tope = state.modoCotizacion ? Infinity : producto.existencia
    const limpio = Math.max(1, Math.min(tope, Math.floor(n)))
    setCantidad(limpio)
    setCantidadTexto(String(limpio))
  }

  const sinStock = producto.existencia <= 0
  // Bloqueo real de agregar por falta de stock: solo en venta. En cotización un
  // producto agotado sí se puede presupuestar.
  const bloqueadoPorStock = sinStock && !state.modoCotizacion
  // Promociones vigentes en las que participa este artículo (segmento del cliente
  // activo). Informativo: aparece aunque aún no se cumplan las condiciones.
  const promosArt = promosDeArticulo(producto.sku, promos, contextoDeCliente(state.clienteActivo))
  const skusEnCarrito = new Set(state.items.map((i) => i.sku))

  function handleAgregar() {
    for (let i = 0; i < cantidad; i++) {
      dispatch({
        type: "ADD_ITEM",
        item: {
          sku: producto.sku,
          descripcion: producto.descripcion,
          precio: producto.precio,
          precio2: producto.precio2,
          precio3: producto.precio3,
          precio4: producto.precio4,
          impuesto: producto.impuesto,
          existencia: producto.existencia,
          mayoreoActivo: producto.mayoreoActivo,
          mayoreoMin: producto.mayoreoMin,
          // Marca + depto/categoría → los usa el motor del Monedero para la tasa
          // de puntos por línea (resuelve la regla más específica que aplique).
          marca: producto.marca,
          departamento: producto.departamento,
          categoria: producto.categoria,
          // Proveedor → para el pedido automático si se vende por encargo.
          proveedor: producto.proveedor,
          proveedor_id: producto.proveedor_id,
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

          {/* Aviso de promoción(es) en las que participa el artículo.
              Clic en cada promo abre el detalle (artículos requeridos). */}
          {promosArt.length > 0 && (
            <div className="detalle-promo-banner">
              <Tag size={16} className="detalle-promo-icon" />
              <div className="detalle-promo-body">
                <span className="detalle-promo-titulo">
                  {promosArt.length === 1 ? "En promoción" : `En ${promosArt.length} promociones`}
                </span>
                {promosArt.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="detalle-promo-linea detalle-promo-linea--btn"
                    onClick={() => setPromoDetalle(p)}
                    title="Ver qué se requiere para activar la promoción"
                  >
                    {p.etiqueta || p.nombre} · {describirPromo(p, producto.sku)}
                    <span className="detalle-promo-vermas">Ver requisitos ›</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={`detalle-stock-badge ${sinStock ? "badge-sin-stock" : producto.existencia <= 3 ? "badge-poco-stock" : "badge-en-stock"}`}>
            {sinStock
              ? "❌ Sin existencia"
              : producto.existencia <= 3
              ? `⚠️ Solo ${producto.existencia} disponibles`
              : `✓ ${producto.existencia} en almacén`}
          </div>

          {!bloqueadoPorStock && (
            <div className="detalle-cantidad">
              <span className="detalle-cantidad-label">Cantidad</span>
              <div className="detalle-cantidad-controles">
                <button
                  className="btn-qty"
                  onClick={() => fijarCantidad(cantidad - 1)}
                  disabled={cantidad <= 1}
                >
                  −
                </button>
                <input
                  className="detalle-cantidad-num detalle-cantidad-input"
                  type="text"
                  inputMode="numeric"
                  value={cantidadTexto}
                  onChange={(e) => {
                    // Solo dígitos; permite vacío mientras se teclea. El número
                    // real se actualiza al vuelo si el texto es un entero válido.
                    const v = e.target.value.replace(/[^0-9]/g, "")
                    setCantidadTexto(v)
                    const n = parseInt(v, 10)
                    if (!Number.isNaN(n) && n >= 1) {
                      // Cotización: sin tope de existencia (presupuesto).
                      setCantidad(state.modoCotizacion ? n : Math.min(producto.existencia, n))
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => fijarCantidad(parseInt(cantidadTexto, 10) || 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      fijarCantidad(parseInt(cantidadTexto, 10) || 1)
                      e.currentTarget.blur()
                    }
                  }}
                  aria-label="Cantidad"
                />
                <button
                  className="btn-qty"
                  onClick={() => fijarCantidad(cantidad + 1)}
                  disabled={!state.modoCotizacion && cantidad >= producto.existencia}
                >
                  +
                </button>
              </div>
            </div>
          )}

          <button
            className={`btn-agregar-detalle ${agregado ? "btn-agregado" : ""}`}
            onClick={handleAgregar}
            disabled={bloqueadoPorStock || agregado}
          >
            {agregado
              ? "✓ Agregado al carrito"
              : bloqueadoPorStock
              ? "Sin existencia"
              : `Agregar ${cantidad > 1 ? `(${cantidad})` : ""} ${state.modoCotizacion ? "a la cotización" : "al carrito"}`}
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

      <DetallePromoModal promo={promoDetalle} skusEnCarrito={skusEnCarrito} onClose={() => setPromoDetalle(null)} />
    </div>
  )
}
