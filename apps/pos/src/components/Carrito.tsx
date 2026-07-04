import { useRef, useState } from "react"
import { List, FileText, ShoppingCart, Bookmark } from "lucide-react"
import { usePOS, efectivoPrecio } from "../lib/pos-store"
import { claveLinea, promosDeArticulo, describirPromo, etiquetaPromo, contextoDeCliente, diagnosticoPromo } from "../lib/promociones"
import { SugerenciaPaquete } from "./SugerenciaPaquete"
import { DesglosePaqueteModal } from "./DesglosePaqueteModal"
import { DetallePromoModal } from "./DetallePromoModal"
import { formatMXN } from "../lib/format"
import type { Paquete, Promocion } from "../lib/client"

interface CarritoProps {
  onCobrar: () => void
  /** Imprime+guarda la cotización (modo cotización). Si falta, se oculta el toggle. */
  onImprimirCotizacion?: () => void
  /** Pone el carrito actual en espera (guardar y liberar la caja). */
  onPonerEnEspera?: () => void
}

export function Carrito({ onCobrar, onImprimirCotizacion, onPonerEnEspera }: CarritoProps) {
  const { state, dispatch, total, promosCarrito, ahorroPromos, promos } = usePOS()
  const { items, modoCotizacion } = state
  const ctxPromo = contextoDeCliente(state.clienteActivo)

  // draft values while the user is typing (sku → string)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Paquete cuyo desglose se está viendo (reconstruido desde las líneas del carrito)
  const [paqueteDesglose, setPaqueteDesglose] = useState<Paquete | null>(null)
  // Promoción cuyo detalle (artículos requeridos) se está viendo.
  const [promoDetalle, setPromoDetalle] = useState<Promocion | null>(null)
  const skusEnCarrito = new Set(items.map((i) => i.sku))

  function startDraft(sku: string, current: number) {
    setDrafts((prev) => ({ ...prev, [sku]: String(current) }))
  }

  function commitDraft(sku: string) {
    const raw = drafts[sku]
    if (raw === undefined) return
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 1) {
      dispatch({ type: "SET_CANTIDAD", sku, cantidad: n })
    }
    setDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
  }

  function cancelDraft(sku: string) {
    setDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, sku: string) {
    const item = items.find((i) => i.sku === sku)
    if (!item) return

    if (e.key === "Enter") {
      commitDraft(sku)
      e.currentTarget.blur()
    } else if (e.key === "Escape") {
      cancelDraft(sku)
      e.currentTarget.blur()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (item.cantidad < item.existencia) {
        dispatch({ type: "INCREMENT", sku })
        setDrafts((prev) => ({ ...prev, [sku]: String(item.cantidad + 1) }))
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (item.cantidad > 1) {
        dispatch({ type: "DECREMENT", sku })
        setDrafts((prev) => ({ ...prev, [sku]: String(item.cantidad - 1) }))
      }
    }
  }

  // Agrupar: items sueltos vs items de paquete (por paquete_id).
  const sueltos = items.filter((i) => !i.paquete_id)
  const gruposPaquete = new Map<string, typeof items>()
  for (const i of items) {
    if (i.paquete_id) {
      const arr = gruposPaquete.get(i.paquete_id) ?? []
      arr.push(i)
      gruposPaquete.set(i.paquete_id, arr)
    }
  }

  return (
    <div className={`carrito${modoCotizacion ? " carrito--cotizacion" : ""}`}>
      <div className="carrito-header">
        <span>{modoCotizacion ? "Cotización" : "Carrito"} ({items.length} productos)</span>
        {/* Poner en espera: junto al resumen. Solo en modo venta con items. */}
        {onPonerEnEspera && !modoCotizacion && (
          <button
            className="carrito-header-espera"
            onClick={onPonerEnEspera}
            disabled={items.length === 0}
            title="Guardar este carrito en espera y liberar la caja"
          >
            <Bookmark size={14} /> En espera
          </button>
        )}
      </div>

      {/* Banner de modo cotización: aclara que es un presupuesto, no una venta. */}
      {modoCotizacion && (
        <div className="carrito-banner-cotizacion">
          <FileText size={14} /> Modo cotización — no descuenta inventario
        </div>
      )}

      {/* Sugerencia de paquete (si aplica) */}
      <SugerenciaPaquete />

      {items.length === 0 ? (
        <div className="carrito-vacio">
          <span style={{ fontSize: 32 }}>🛒</span>
          <p>Carrito vacío</p>
          <p style={{ fontSize: 12 }}>Busca y agrega productos</p>
        </div>
      ) : (
        <div className="carrito-items">
          {/* Bloques de paquete */}
          {[...gruposPaquete.entries()].map(([pkgId, lineas]) => {
            const nombre = lineas[0]?.paquete_nombre ?? "Paquete"
            const totalPkg = lineas.reduce((s, l) => s + efectivoPrecio(l) * l.cantidad, 0)
            // Cuántas copias del paquete hay en el carrito (para mostrar la
            // composición por COPIA en el modal, no el total acumulado).
            const copias = lineas[0]?.paqueteCantidad
              ? Math.max(1, Math.round((lineas[0].cantidad ?? 0) / lineas[0].paqueteCantidad))
              : 1
            // Reconstruye un Paquete desde las líneas del carrito para el modal.
            const verDesglose = () => setPaqueteDesglose({
              id: pkgId,
              nombre,
              precio_paquete: totalPkg / copias,
              componentes: lineas.map((l) => ({
                sku: l.sku,
                descripcion: l.descripcion,
                cantidad: l.paqueteCantidad ?? l.cantidad,
              })),
              nivel_base: 1,
              imagenes: [],
              creado_en: "",
            })
            return (
              <div key={pkgId} className="carrito-paquete">
                <div className="carrito-paquete-head">
                  <span className="carrito-paquete-nombre">📦 {nombre}</span>
                  <div className="carrito-paquete-right">
                    <span className="carrito-paquete-total">{formatMXN(totalPkg)}</span>
                    <button
                      className="carrito-paquete-desglose-btn"
                      onClick={verDesglose}
                      title="Ver desglose del paquete"
                    >
                      <List size={13} /> Desglose
                    </button>
                    <button
                      className="carrito-paquete-deshacer"
                      onClick={() => dispatch({ type: "REMOVE_PAQUETE", paqueteId: pkgId })}
                      title="Deshacer paquete"
                    >
                      Deshacer
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Items sueltos */}
          {sueltos.map((item) => {
            const draft = drafts[item.sku]
            const displayValue = draft !== undefined ? draft : String(item.cantidad)

            const precioEfectivo = efectivoPrecio(item)
            // Promo aplicada a la línea (gana sobre el mayoreo). importeSinPromo =
            // mayoreo/base; si hay promo, lineaPromo.importe trae el total ya con
            // descuento. Sin promos, lineaPromo es undefined → comportamiento previo.
            const lineaPromo = promosCarrito.get(claveLinea(item))
            const tienePromo = !!lineaPromo?.promo
            const importeSinPromo = precioEfectivo * item.cantidad
            const importeLinea = tienePromo ? lineaPromo!.importe : importeSinPromo
            // Promo DISPONIBLE para este artículo que aún NO aplica (faltan
            // condiciones: cantidad, requeridos de una cruzada…). Solo informativo.
            const promoDisponible = !tienePromo && !item.paquete_id
              ? promosDeArticulo(item.sku, promos, ctxPromo)[0] ?? null
              : null
            // Pista corta de qué falta para activarla (piezas o artículos), para
            // que el cajero lo vea sin abrir el detalle.
            const diagDisp = promoDisponible
              ? diagnosticoPromo(promoDisponible, items, ctxPromo)
              : null
            const pistaPromo = diagDisp && !diagDisp.aplicada
              ? diagDisp.faltanPiezas > 0
                ? `faltan ${diagDisp.faltanPiezas} pza${diagDisp.faltanPiezas !== 1 ? "s" : ""}`
                : diagDisp.faltanSkus.length > 0
                ? `faltan ${diagDisp.faltanSkus.length} art.`
                : ""
              : ""
            // El mayoreo solo se rotula si NO lo eclipsó una promo.
            const esMayoreo = !tienePromo && item.mayoreoActivo && item.precio2 && item.mayoreoMin && item.cantidad >= item.mayoreoMin
            const faltanMayoreo = !tienePromo && item.mayoreoActivo && item.precio2 && item.mayoreoMin && item.cantidad < item.mayoreoMin
              ? item.mayoreoMin - item.cantidad : 0

            return (
              <div
                key={item.sku}
                className={`carrito-item${esMayoreo ? " carrito-item--mayoreo" : ""}${tienePromo ? " carrito-item--promo" : ""}`}
                onClick={() => inputRefs.current[item.sku]?.focus()}
              >
                <div className="carrito-item-desc">
                  <span className="carrito-item-nombre">{item.descripcion}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="carrito-item-sku">{item.sku}</span>
                    {tienePromo && (
                      <button
                        type="button"
                        className="badge-promo badge-promo--btn"
                        title="Ver detalle de la promoción"
                        onClick={(e) => { e.stopPropagation(); setPromoDetalle(lineaPromo!.promo!) }}
                      >
                        🏷️ {lineaPromo!.etiqueta}
                      </button>
                    )}
                    {promoDisponible && (
                      <button
                        type="button"
                        className="badge-promo-disp badge-promo--btn"
                        title="Ver qué se requiere para activar la promoción"
                        onClick={(e) => { e.stopPropagation(); setPromoDetalle(promoDisponible) }}
                      >
                        🏷️ Promo: {describirPromo(promoDisponible, item.sku)}
                        {pistaPromo && <span className="badge-promo-pista"> · {pistaPromo}</span>}
                      </button>
                    )}
                    {esMayoreo && <span className="badge-mayoreo">Mayoreo</span>}
                    {faltanMayoreo > 0 && (
                      <span className="badge-mayoreo-hint">+{faltanMayoreo} para ${item.precio2!.toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <div className="carrito-item-controles">
                  <button
                    className="btn-cantidad"
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "DECREMENT", sku: item.sku }) }}
                  >
                    −
                  </button>
                  <input
                    ref={(el) => { inputRefs.current[item.sku] = el }}
                    className="carrito-item-cantidad-input"
                    type="number"
                    min={1}
                    max={item.existencia}
                    value={displayValue}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => { startDraft(item.sku, item.cantidad); e.target.select() }}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [item.sku]: e.target.value }))}
                    onBlur={() => commitDraft(item.sku)}
                    onKeyDown={(e) => handleKeyDown(e, item.sku)}
                    title={`Máximo ${item.existencia} disponibles`}
                  />
                  <button
                    className="btn-cantidad"
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "INCREMENT", sku: item.sku }) }}
                    disabled={item.cantidad >= item.existencia}
                    title={item.cantidad >= item.existencia ? `Máximo ${item.existencia} disponibles` : undefined}
                  >
                    +
                  </button>
                </div>
                <div className="carrito-item-subtotal">
                  {tienePromo ? (
                    <span className="carrito-precio-tachado">${importeSinPromo.toFixed(2)}</span>
                  ) : esMayoreo ? (
                    <span className="carrito-precio-tachado">${(item.precio * item.cantidad).toFixed(2)}</span>
                  ) : null}
                  ${importeLinea.toFixed(2)}
                </div>
                <button
                  className="btn-eliminar"
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE", sku: item.sku }) }}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="carrito-footer">
        {/* Desglose fiscal POR ÍTEM: solo los artículos con IVA (precio ya
            incluye el 16%) aportan impuesto; los exentos/neto van completos a la
            base. Es lo que el CFDI desglosará. */}
        {items.length > 0 && (() => {
          let base = 0, iva = 0
          for (const it of items) {
            // El importe usa el resultado de promociones (gana sobre mayoreo);
            // sin promo, equivale a efectivoPrecio × cantidad como antes.
            const importe = promosCarrito.get(claveLinea(it))?.importe ?? efectivoPrecio(it) * it.cantidad
            if (it.impuesto) {
              const b = importe / 1.16
              base += b
              iva += importe - b
            } else {
              base += importe
            }
          }
          return (
            <div className="carrito-desglose">
              <div className="carrito-desglose-fila">
                <span>Subtotal</span>
                <span>${base.toFixed(2)}</span>
              </div>
              {ahorroPromos > 0 && (
                <div className="carrito-desglose-fila carrito-desglose-fila--ahorro">
                  <span>Ahorro en promociones</span>
                  <span>−${ahorroPromos.toFixed(2)}</span>
                </div>
              )}
              <div className="carrito-desglose-fila">
                <span>IVA (16%)</span>
                <span>${iva.toFixed(2)}</span>
              </div>
            </div>
          )
        })()}
        <div className="carrito-total">
          <span className="carrito-total-label">Total</span>
          <span className="carrito-total-valor">${total.toFixed(2)}</span>
        </div>
        {/* Toggle venta ↔ cotización (solo si el contenedor cableó la impresión) */}
        {onImprimirCotizacion && (
          <button
            className={`btn-toggle-cotizacion${modoCotizacion ? " activo" : ""}`}
            onClick={() => dispatch({ type: "SET_MODO_COTIZACION", activo: !modoCotizacion })}
            disabled={items.length === 0}
          >
            {modoCotizacion
              ? <><ShoppingCart size={15} /> Convertir a venta</>
              : <><FileText size={15} /> Convertir a cotización</>}
          </button>
        )}
        <div className="carrito-acciones">
          <button
            className="btn-vaciar"
            onClick={() => dispatch({ type: "CLEAR_ITEMS" })}
            disabled={items.length === 0}
          >
            🗑 Vaciar
          </button>
          {modoCotizacion ? (
            <button
              className="btn-cobrar btn-cotizar"
              onClick={onImprimirCotizacion}
              disabled={items.length === 0}
            >
              <FileText size={16} /> Imprimir cotización
            </button>
          ) : (
            <button className="btn-cobrar" onClick={onCobrar} disabled={items.length === 0}>
              COBRAR →
            </button>
          )}
        </div>
      </div>

      {/* Modal de desglose del paquete */}
      <DesglosePaqueteModal paquete={paqueteDesglose} onClose={() => setPaqueteDesglose(null)} />
      <DetallePromoModal promo={promoDetalle} skusEnCarrito={skusEnCarrito} onClose={() => setPromoDetalle(null)} />
    </div>
  )
}
