import { useRef, useState } from "react"
import { List, FileText, ShoppingCart, Bookmark, PackageCheck, Package, PenLine, X, AlertTriangle, Trash2, Boxes } from "lucide-react"
import { usePOS, efectivoPrecio, modoVentaActual } from "../lib/pos-store"
import { abreviaturaUnidad } from "../lib/unidades-sat"
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
  const { items, modoCotizacion, modoEncargo } = state
  // Modo actual (venta | cotizacion | encargo | reposicion) para el selector.
  const modo = modoVentaActual(state)
  const ctxPromo = contextoDeCliente(state.clienteActivo)

  // Líneas cuya cantidad supera la existencia (típico al convertir una cotización
  // —donde se permite exceder stock— a venta). En cotización NO aplica; en modo
  // encargo global TAMPOCO (todo es sobre pedido, sin tope de stock). En venta
  // normal se marcan en rojo y bloquean el cobro hasta corregirlas O marcarlas
  // como ENCARGO. Una línea de encargo NO cuenta como exceso.
  const excedeStock = (i: (typeof items)[number]) => i.cantidad > i.existencia && !i.esEncargo
  const skusSinStock = (modoCotizacion || modoEncargo) ? [] : items.filter(excedeStock)
  const hayExcesoStock = skusSinStock.length > 0

  // draft values while the user is typing (sku → string)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Draft del MONTO ($) para líneas de venta fraccionada (granel). Al confirmar,
  // la cantidad se recalcula = monto / precio unitario.
  const [montoDrafts, setMontoDrafts] = useState<Record<string, string>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Paquete cuyo desglose se está viendo (reconstruido desde las líneas del carrito)
  const [paqueteDesglose, setPaqueteDesglose] = useState<Paquete | null>(null)
  // Promoción cuyo detalle (artículos requeridos) se está viendo.
  const [promoDetalle, setPromoDetalle] = useState<Promocion | null>(null)
  const skusEnCarrito = new Set(items.map((i) => i.sku))

  function startDraft(sku: string, current: number) {
    setDrafts((prev) => ({ ...prev, [sku]: String(current) }))
    // Si había un draft de monto abierto para esta línea, descártalo: la cantidad
    // se está editando directamente, así que un blur posterior del monto no debe
    // sobreescribir con un valor viejo.
    setMontoDrafts((prev) => {
      if (prev[sku] === undefined) return prev
      const next = { ...prev }; delete next[sku]; return next
    })
  }

  function commitDraft(sku: string) {
    const raw = drafts[sku]
    if (raw === undefined) return
    const item = items.find((i) => i.sku === sku)
    // Granel: acepta cantidad DECIMAL (ej. 0.541 kg). No-granel: entero ≥ 1.
    if (item?.granel) {
      const n = parseFloat(raw.replace(",", "."))
      if (!isNaN(n) && n > 0) dispatch({ type: "SET_CANTIDAD", sku, cantidad: n })
    } else {
      const n = parseInt(raw, 10)
      if (!isNaN(n) && n >= 1) dispatch({ type: "SET_CANTIDAD", sku, cantidad: n })
    }
    setDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
  }

  function cancelDraft(sku: string) {
    setDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
  }

  // ── Captura por MONTO ($) para líneas granel ────────────────────────────────
  function startMonto(sku: string, montoActual: number) {
    setMontoDrafts((prev) => ({ ...prev, [sku]: montoActual.toFixed(2) }))
  }
  function commitMonto(sku: string) {
    const raw = montoDrafts[sku]
    if (raw === undefined) return
    const item = items.find((i) => i.sku === sku)
    const monto = parseFloat(raw.replace(",", "."))
    if (item && !isNaN(monto) && monto > 0) {
      // cantidad = monto / precio unitario. El precio efectivo puede cambiar si la
      // cantidad cruza el umbral de mayoreo, así que iteramos: calculamos con el
      // precio actual y, si la cantidad resultante activa/desactiva el mayoreo,
      // recalculamos con el precio ya correcto. Converge en ≤2 pasadas.
      let precioUnit = efectivoPrecio(item)
      if (precioUnit > 0) {
        let cant = monto / precioUnit
        const precio2 = efectivoPrecio({ ...item, cantidad: cant })
        if (precio2 > 0 && precio2 !== precioUnit) {
          precioUnit = precio2
          cant = monto / precioUnit
        }
        dispatch({ type: "SET_CANTIDAD", sku, cantidad: cant })
      }
    }
    setMontoDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
  }
  function cancelMonto(sku: string) {
    setMontoDrafts((prev) => { const next = { ...prev }; delete next[sku]; return next })
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
      // En cotización, modo encargo global o una línea de encargo se puede exceder
      // la existencia (presupuesto / venta sobre pedido).
      if (modoCotizacion || modoEncargo || item.esEncargo || item.cantidad < item.existencia) {
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

  const tituloCarrito = modo === "cotizacion" ? "Cotización"
    : modo === "encargo" ? "Encargo"
    : modo === "reposicion" ? "Reposición"
    : "Carrito"

  return (
    <div className={`carrito${modoCotizacion ? " carrito--cotizacion" : ""}${modoEncargo ? " carrito--encargo-global" : ""}`}>
      <div className="carrito-header">
        <span>{tituloCarrito} ({items.length} productos)</span>
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

      {/* Banner de modo encargo MIXTO: vende lo que hay y encarga el faltante. */}
      {modo === "encargo" && (
        <div className="carrito-banner-encargo">
          <PackageCheck size={14} /> Modo encargo — vende lo disponible y encarga el faltante al proveedor
        </div>
      )}

      {/* Banner de modo REPOSICIÓN: nada descuenta inventario. */}
      {modo === "reposicion" && (
        <div className="carrito-banner-encargo">
          <Boxes size={14} /> Modo reposición — todo se pide al proveedor, no descuenta inventario
        </div>
      )}

      {/* Sugerencia de paquete (si aplica) */}
      <SugerenciaPaquete />

      {items.length === 0 ? (
        <div className="carrito-vacio">
          <ShoppingCart size={32} strokeWidth={1.5} />
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
                  <span className="carrito-paquete-nombre"><Package size={14} /> {nombre}</span>
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
            const esGranel = !!item.granel
            const draft = drafts[item.sku]
            // En granel se muestran hasta 3 decimales (ej. 0.541); en entero, tal cual.
            const displayValue = draft !== undefined
              ? draft
              : esGranel ? String(item.cantidad) : String(item.cantidad)
            const unidadAbrev = abreviaturaUnidad(item.unidadVenta ?? "")

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

            // En modo encargo global TODAS las líneas son encargo; en venta normal,
            // solo las marcadas individualmente.
            const esEncargo = !modoCotizacion && (modoEncargo || !!item.esEncargo)
            // "Sin stock" (rojo, bloquea) solo si excede Y NO está marcado encargo.
            const sinStock = !modoCotizacion && !modoEncargo && item.cantidad > item.existencia && !esEncargo
            // La cantidad no se topa al inventario en cotización, modo encargo global,
            // ni en una línea de encargo individual (todas son sobre pedido).
            const sinTopeCantidad = modoCotizacion || modoEncargo || esEncargo

            return (
              <div
                key={item.sku}
                className={`carrito-item${esMayoreo ? " carrito-item--mayoreo" : ""}${tienePromo ? " carrito-item--promo" : ""}${sinStock ? " carrito-item--sin-stock" : ""}${esEncargo ? " carrito-item--encargo" : ""}`}
                onClick={() => inputRefs.current[item.sku]?.focus()}
              >
                <div className="carrito-item-sup">
                <div className="carrito-item-desc">
                  <span className="carrito-item-nombre">
                    <span className="carrito-item-sku">{item.libre ? "LIBRE" : item.sku}</span> {item.descripcion}
                  </span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {item.libre && (
                      <span className="badge-libre" title="Artículo capturado a mano, no está en el catálogo">
                        <PenLine size={11} /> Libre
                      </span>
                    )}
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
                    {sinStock && (
                      <span className="badge-sin-stock-carrito" title="Corrige la cantidad para poder cobrar">
                        ⚠ Solo {item.existencia} en stock (tienes {item.cantidad})
                      </span>
                    )}
                    {esEncargo && (
                      modoEncargo ? (
                        <span className="badge-encargo-carrito badge-encargo-carrito--fijo" title="Venta sobre pedido (modo encargo)">
                          <PackageCheck size={12} /> Por encargo
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="badge-encargo-carrito"
                          title="Venta sobre pedido. Clic para quitar el encargo."
                          onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_ENCARGO", sku: item.sku, esEncargo: false }) }}
                        >
                          <PackageCheck size={12} /> Por encargo <X size={11} />
                        </button>
                      )
                    )}
                  </div>
                </div>
                <button
                  className="btn-eliminar"
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE", sku: item.sku }) }}
                  title="Eliminar"
                >
                  ✕
                </button>
                </div>
                <div className="carrito-item-inf">
                <div className={esGranel ? "carrito-item-controles carrito-item-controles--granel" : "carrito-item-controles"}>
                  <div className="carrito-granel-fila">
                    <button
                      className="btn-cantidad"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Granel: bajar 1 unidad pero sin borrar la línea (clamp al
                        // mínimo). No-granel: DECREMENT normal (resta 1, borra si 0).
                        if (esGranel) {
                          cancelMonto(item.sku)
                          if (item.cantidad > 1) dispatch({ type: "SET_CANTIDAD", sku: item.sku, cantidad: item.cantidad - 1 })
                        } else {
                          dispatch({ type: "DECREMENT", sku: item.sku })
                        }
                      }}
                    >
                      −
                    </button>
                    <input
                      ref={(el) => { inputRefs.current[item.sku] = el }}
                      className="carrito-item-cantidad-input"
                      type="number"
                      min={esGranel ? 0.001 : 1}
                      step={esGranel ? 0.001 : 1}
                      max={sinTopeCantidad ? undefined : item.existencia}
                      value={displayValue}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => { startDraft(item.sku, item.cantidad); e.target.select() }}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.sku]: e.target.value }))}
                      onBlur={() => commitDraft(item.sku)}
                      onKeyDown={(e) => handleKeyDown(e, item.sku)}
                      title={sinTopeCantidad ? "Sin límite de existencia" : `Máximo ${item.existencia} disponibles`}
                    />
                    <button
                      className="btn-cantidad"
                      onClick={(e) => { e.stopPropagation(); if (esGranel) cancelMonto(item.sku); dispatch({ type: "INCREMENT", sku: item.sku }) }}
                      disabled={!sinTopeCantidad && item.cantidad >= item.existencia}
                      title={!sinTopeCantidad && item.cantidad >= item.existencia ? `Máximo ${item.existencia} disponibles` : undefined}
                    >
                      +
                    </button>
                    {unidadAbrev && <span className="carrito-granel-unidad">{unidadAbrev}</span>}
                  </div>
                  {/* Venta fraccionada: capturar el MONTO ($) → recalcula la cantidad. */}
                  {esGranel && (
                    <label className="carrito-granel-monto" onClick={(e) => e.stopPropagation()}>
                      <span className="carrito-granel-monto-sign">$</span>
                      <input
                        className="carrito-granel-monto-input"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        placeholder="monto"
                        value={montoDrafts[item.sku] ?? importeLinea.toFixed(2)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => { startMonto(item.sku, importeLinea); e.currentTarget.select() }}
                        onChange={(e) => setMontoDrafts((prev) => ({ ...prev, [item.sku]: e.target.value }))}
                        onBlur={() => commitMonto(item.sku)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { commitMonto(item.sku); e.currentTarget.blur() }
                          else if (e.key === "Escape") { cancelMonto(item.sku); e.currentTarget.blur() }
                        }}
                        title="Monto en pesos — la cantidad se recalcula automáticamente"
                      />
                    </label>
                  )}
                </div>
                <div className={esGranel ? "carrito-item-subtotal carrito-item-subtotal--granel" : "carrito-item-subtotal"}>
                  {tienePromo ? (
                    <span className="carrito-precio-tachado">${importeSinPromo.toFixed(2)}</span>
                  ) : esMayoreo ? (
                    <span className="carrito-precio-tachado">${(item.precio * item.cantidad).toFixed(2)}</span>
                  ) : null}
                  {/* En granel el importe ya se muestra (y edita) en el campo de
                      monto: no repetimos el subtotal para evitar el doble precio. */}
                  {!esGranel && `$${importeLinea.toFixed(2)}`}
                </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="carrito-footer">
        {/* Aviso de exceso de stock. Da DOS salidas: ajustar a lo disponible, o
            vender lo faltante POR ENCARGO (venta sobre pedido, Fase 3). */}
        {hayExcesoStock && (
          <div className="carrito-aviso-stock">
            <span className="carrito-aviso-stock-texto">
              <AlertTriangle size={14} /> {skusSinStock.length} artículo{skusSinStock.length !== 1 ? "s" : ""} sin existencia
              suficiente. Ajusta al stock o véndelo por encargo.
            </span>
            <div className="carrito-aviso-stock-acciones">
              <button
                type="button"
                className="carrito-aviso-stock-btn carrito-aviso-stock-btn--encargo"
                title="Vender lo faltante sobre pedido; se agrega al pedido del proveedor"
                onClick={() => dispatch({ type: "SET_ENCARGO", esEncargo: true })}
              >
                <PackageCheck size={14} /> Vender por encargo
              </button>
              <button
                type="button"
                className="carrito-aviso-stock-btn"
                onClick={() => {
                  for (const it of skusSinStock) {
                    // Sin existencia (agotado): la línea no puede venderse → se quita.
                    // Con stock parcial: se ajusta a lo disponible.
                    if (it.existencia <= 0) dispatch({ type: "REMOVE", sku: it.sku })
                    else dispatch({ type: "SET_CANTIDAD", sku: it.sku, cantidad: it.existencia })
                  }
                }}
              >
                Ajustar al stock
              </button>
            </div>
          </div>
        )}
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
        {/* Selector de modo: Venta · Cotización · Encargo · Reposición.
            Un solo control; cada modo tiene reglas propias de stock/inventario. */}
        {onImprimirCotizacion && (
          <div className="modo-venta-selector" role="group" aria-label="Modo de venta">
            <button
              className={`modo-venta-btn${modo === "venta" ? " activo" : ""}`}
              onClick={() => { dispatch({ type: "SET_MODO_COTIZACION", activo: false }); dispatch({ type: "SET_MODO_ENCARGO", activo: false }) }}
              title="Venta normal (descuenta inventario)"
            >
              <ShoppingCart size={14} /> Venta
            </button>
            <button
              className={`modo-venta-btn${modo === "cotizacion" ? " activo" : ""}`}
              onClick={() => dispatch({ type: "SET_MODO_COTIZACION", activo: true })}
              title="Cotización (presupuesto, no descuenta ni cobra)"
            >
              <FileText size={14} /> Cotización
            </button>
            <button
              className={`modo-venta-btn${modo === "encargo" ? " activo" : ""}`}
              onClick={() => dispatch({ type: "SET_MODO_ENCARGO", activo: true, reposicion: false })}
              title="Encargo: vende lo que hay y encarga el faltante al proveedor"
            >
              <PackageCheck size={14} /> Encargo
            </button>
            <button
              className={`modo-venta-btn${modo === "reposicion" ? " activo" : ""}`}
              onClick={() => dispatch({ type: "SET_MODO_ENCARGO", activo: true, reposicion: true })}
              title="Reposición: todo se pide al proveedor sin descontar inventario"
            >
              <Boxes size={14} /> Reposición
            </button>
          </div>
        )}
        <div className="carrito-acciones">
          <button
            className="btn-vaciar"
            onClick={() => dispatch({ type: "CLEAR_ITEMS" })}
            disabled={items.length === 0}
          >
            <Trash2 size={15} /> Vaciar
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
            <button
              className="btn-cobrar"
              onClick={onCobrar}
              disabled={items.length === 0 || hayExcesoStock}
              title={hayExcesoStock ? "Hay artículos que superan el stock disponible. Corrige las cantidades marcadas en rojo." : undefined}
            >
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
