import { Package, PackageCheck, Plus, Minus } from "lucide-react"
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
  /** SKUs que son componentes de algún paquete (para mostrar el badge de paquete). */
  skusEnPaquete?: Set<string>
  /** Artículo con cadena de N niveles de unidad (Pieza→Bolsa→Caja…, o
   *  inventario informativo tipo Arena): abre el selector de nivel en vez de
   *  agregar directo. Si no se pasa, caen al flujo normal. */
  onSeleccionarNiveles?: (p: ProductoPOS) => void
}

function stockLabel(existencia: number) {
  if (existencia <= 0) return { texto: "Sin stock", clase: "badge-sin-stock" }
  if (existencia <= 3) return { texto: `Solo ${existencia}`, clase: "badge-poco-stock" }
  return { texto: `${existencia} en stock`, clase: "badge-en-stock" }
}

export function GridProductos({ productos, onSeleccionar, cartMap, onAgregar, onQuitar, onEncargar, skusEnPaquete, onSeleccionarNiveles }: GridProductosProps) {
  const { state } = usePOS()
  const cotizando = state.modoCotizacion
  const enEncargo = state.modoEncargo
  // En cotización o encargo se puede seleccionar/agregar aunque no haya stock.
  const sinTopeStock = cotizando || enEncargo
  if (productos.length === 0) return null

  return (
    <div className="grid-productos">
      {productos.map((p) => {
        // ── Artículo con cadena de N niveles de unidad ───────────────────────
        // Dos sabores según `inventarioInformativo`:
        //  - INFORMATIVO (ej. Arena): no se topa por existencia; el único
        //    bloqueo es que TODOS sus niveles estén marcados Agotado (o el
        //    switch global `agotadoGlobal`). Clic en la tarjeta abre el
        //    selector de nivel directo (no el detalle normal).
        //  - INVENTARIO REAL (ej. Taquete Pieza/Bolsa): se topa por existencia
        //    real. Clic en la tarjeta abre el DETALLE normal; solo el botón
        //    "+" abre el selector de nivel. Bloqueado también si el SKU YA
        //    está en el carrito (todas las opciones comparten el mismo SKU
        //    real, sin sufijo — agregar de nuevo fusionaría cantidades entre
        //    niveles distintos).
        const tieneNiveles = (p.nivelesUnidad?.length ?? 0) > 1 || !!p.presentaCompraVenta
        if (tieneNiveles && onSeleccionarNiveles) {
          const informativo = !!p.inventarioInformativo
          if (informativo) {
            const nivelesDisp = (p.nivelesUnidad ?? []).filter((n) => !n.agotado)
            const bloqueado = !!p.agotadoGlobal || nivelesDisp.length === 0
            const precioDesde = nivelesDisp.length ? Math.min(...nivelesDisp.map((n) => n.precio1)) : p.precio
            return (
              <button
                key={p.sku}
                className={`tarjeta-producto${bloqueado ? " tarjeta-agotada" : ""}`}
                onClick={() => { if (!bloqueado) onSeleccionar(p) }}
                disabled={bloqueado}
                title={bloqueado ? `${p.descripcion} está marcado como agotado` : ""}
              >
                <div className="tarjeta-imagen">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt={p.descripcion} loading="lazy" />
                  ) : (
                    <div className="tarjeta-sin-imagen">
                      <Package size={34} strokeWidth={1.5} />
                    </div>
                  )}
                  {bloqueado ? (
                    <span className="badge-stock badge-sin-stock">Agotado</span>
                  ) : (
                    <span className="badge-stock badge-granel">Granel</span>
                  )}
                </div>
                <div className="tarjeta-info">
                  <p className="tarjeta-nombre">{p.descripcion}</p>
                  <p className="tarjeta-sku">{p.sku}</p>
                  <div className="tarjeta-footer">
                    <p className="tarjeta-precio">
                      {nivelesDisp.length > 1 && <span className="tarjeta-precio-desde">desde </span>}
                      ${precioDesde.toFixed(2)}
                    </p>
                    {!bloqueado && (
                      <button
                        className="btn-agregar-rapido"
                        onClick={(e) => { e.stopPropagation(); onSeleccionarNiveles(p) }}
                        title="Elegir presentación"
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </button>
            )
          }

          const yaEnCarrito = (cartMap?.get(p.sku) ?? 0) > 0
          const bloqueado = (p.existencia <= 0 && !sinTopeStock) || yaEnCarrito
          // Precio del nivel MÁS PEQUEÑO de la cadena (ej. Pieza) — los campos
          // legacy `precioVenta1`/`precio` no son confiables aquí: describen
          // el nivel de venta del shim de 2 niveles fijos, que puede quedar en
          // 0 cuando la base de inventario real está en un nivel intermedio
          // (ej. Bolsa) de una cadena de 3+ niveles, como en este artículo.
          const precioMenor = p.nivelesUnidad?.[0]?.precio1 ?? p.precioVenta1 ?? p.precio
          return (
            <button
              key={p.sku}
              className={`tarjeta-producto${bloqueado ? " tarjeta-agotada" : ""}`}
              onClick={() => onSeleccionar(p)}
              disabled={bloqueado}
              title={yaEnCarrito ? "Ya está en el carrito — quítalo para cambiar la unidad" : bloqueado ? `${p.descripcion} sin existencia` : ""}
            >
              <div className="tarjeta-imagen">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.descripcion} loading="lazy" />
                ) : (
                  <div className="tarjeta-sin-imagen">
                    <Package size={34} strokeWidth={1.5} />
                  </div>
                )}
                {yaEnCarrito ? (
                  <span className="badge-stock badge-en-stock">En carrito</span>
                ) : bloqueado ? (
                  <span className="badge-stock badge-sin-stock">Sin stock</span>
                ) : (
                  <span className="badge-stock badge-granel">{stockLabel(p.existencia).texto}</span>
                )}
              </div>
              <div className="tarjeta-info">
                <p className="tarjeta-nombre">{p.descripcion}</p>
                <p className="tarjeta-sku">{p.sku}</p>
                <div className="tarjeta-footer">
                  <p className="tarjeta-precio">
                    <span className="tarjeta-precio-desde">desde </span>
                    ${precioMenor.toFixed(2)}
                  </p>
                  {!bloqueado && (
                    <button
                      className="btn-agregar-rapido"
                      onClick={(e) => { e.stopPropagation(); onSeleccionarNiveles(p) }}
                      title="Elegir unidad de venta"
                    >
                      <Plus size={18} />
                    </button>
                  )}
                </div>
              </div>
            </button>
          )
        }

        const stock = stockLabel(p.existencia)
        const qty = cartMap?.get(p.sku) ?? 0
        // En cotización o encargo se permite agregar aunque no haya existencia.
        const showControls = onAgregar && (sinTopeStock || p.existencia > 0)
        // Producto agotado. En VENTA NORMAL se bloquea (como antes). En modo
        // ENCARGO se ofrece el botón "Encargar" (venta sobre pedido). En cotización
        // se agrega normal (presupuesto), sin botón de encargo.
        const agotado = p.existencia <= 0 && !cotizando
        // El botón de encargo SOLO aparece en modo encargo (no en venta normal).
        const puedeEncargar = agotado && enEncargo && !!onEncargar

        return (
          <button
            key={p.sku}
            className={`tarjeta-producto${agotado ? " tarjeta-agotada" : ""}`}
            onClick={() => onSeleccionar(p)}
            // Agotado en VENTA NORMAL → bloqueado (como antes). En cotización o
            // encargo la tarjeta queda clickeable (se agrega/encarga).
            disabled={agotado && !sinTopeStock}
          >
            <div className="tarjeta-imagen">
              {p.thumbnail ? (
                <img src={p.thumbnail} alt={p.descripcion} loading="lazy" />
              ) : (
                <div className="tarjeta-sin-imagen">
                  <Package size={34} strokeWidth={1.5} />
                </div>
              )}
              <span className={`badge-stock ${stock.clase}`}>{stock.texto}</span>
              {skusEnPaquete?.has(p.sku) && (
                <span className="badge-en-paquete" title="Este artículo forma parte de un paquete">
                  <Package size={12} /> Paquete
                </span>
              )}
            </div>
            <div className="tarjeta-info">
              <p className="tarjeta-nombre">{p.descripcion}</p>
              <p className="tarjeta-sku">{p.sku}</p>
              <div className="tarjeta-footer">
                <p className="tarjeta-precio">${p.precio.toFixed(2)}</p>
                {/* Agotado (modo encargo) sin unidades aún → SOLO botón "Encargar"
                    (reemplaza al "+", no se muestran ambos). Con unidades ya en el
                    carrito, cae al qty-control de abajo para subir/bajar. */}
                {puedeEncargar && qty === 0 ? (
                  <button
                    className="btn-encargar-rapido"
                    onClick={(e) => { e.stopPropagation(); onEncargar!(p) }}
                    title="Agregar por encargo (venta sobre pedido)"
                  >
                    <PackageCheck size={14} /> Encargar
                  </button>
                ) : showControls && (
                  qty === 0 ? (
                    <button
                      className="btn-agregar-rapido"
                      onClick={(e) => { e.stopPropagation(); onAgregar(p) }}
                      title="Agregar al carrito"
                    >
                      <Plus size={18} />
                    </button>
                  ) : (
                    <div className="qty-control" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="qty-btn"
                        onClick={() => onQuitar?.(p.sku)}
                        title="Quitar uno"
                      >
                        <Minus size={15} />
                      </button>
                      <span className="qty-num">{qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => onAgregar(p)}
                        disabled={!cotizando && qty >= p.existencia}
                        title="Agregar uno más"
                      >
                        <Plus size={15} />
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
