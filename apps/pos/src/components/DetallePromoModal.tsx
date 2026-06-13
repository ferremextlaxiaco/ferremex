import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Tag, ImageOff, Check, Plus } from "lucide-react"
import { buscarProductoPorSku, type Promocion, type ProductoPOS } from "../lib/client"
import { describirPromo, diagnosticoPromo, contextoDeCliente } from "../lib/promociones"
import { usePOS } from "../lib/pos-store"

/**
 * Modal de detalle de una promoción: muestra su mecánica y QUÉ ARTÍCULOS se
 * requieren para activarla (y cuáles reciben el descuento si es cruzada). Marca
 * con ✓ los que ya están en el carrito; los que faltan traen un botón "Agregar"
 * para añadirlos al carrito sin salir. Mismo patrón que DesglosePaqueteModal
 * (portal a body + Escape).
 *
 * Cumple el Contrato de Conexión: info de artículos vía buscarProductoPorSku
 * (client.ts, match exacto rápido); agregar al carrito vía usePOS() (ADD_ITEM).
 *
 * Props:
 *   promo (null = cerrado), skusEnCarrito (Set de SKUs ya en el carrito), onClose.
 */
export function DetallePromoModal({
  promo,
  skusEnCarrito,
  onClose,
}: {
  promo: Promocion | null
  skusEnCarrito: Set<string>
  onClose: () => void
}) {
  const { state, promos, dispatch } = usePOS()
  // Cache sku → ProductoPOS completo (precio/existencia para agregar al carrito).
  const [info, setInfo] = useState<Record<string, ProductoPOS>>({})
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!promo) { setInfo({}); return }
    let activo = true
    const skus = [...new Set([...promo.skus_requeridos, ...promo.skus_beneficiados])]
    setCargando(true)
    ;(async () => {
      const pares = await Promise.all(
        skus.map(async (sku) => {
          try {
            const a = await buscarProductoPorSku(sku)  // ≈10ms, match exacto
            return a ? ([sku, a] as const) : null
          } catch { return null }
        })
      )
      if (!activo) return
      const next: Record<string, ProductoPOS> = {}
      for (const p of pares) if (p) next[p[0]] = p[1]
      setInfo(next)
      setCargando(false)
    })()
    return () => { activo = false }
  }, [promo])

  useEffect(() => {
    if (!promo) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [promo, onClose])

  if (!promo) return null

  const esCruzada = promo.modo_articulos === "cruzada"
  // Diagnóstico REAL contra el motor: no basta con que los SKUs estén en el
  // carrito; también debe cumplirse la cantidad mínima (y que el descuento baje
  // el precio). Así el aviso dice exactamente qué falta (artículos o piezas).
  const diag = diagnosticoPromo(promo, state.items, contextoDeCliente(state.clienteActivo))

  function agregar(p: ProductoPOS) {
    dispatch({
      type: "ADD_ITEM",
      item: {
        sku: p.sku, descripcion: p.descripcion, precio: p.precio,
        precio2: p.precio2, precio3: p.precio3, precio4: p.precio4,
        impuesto: p.impuesto, existencia: p.existencia,
        mayoreoActivo: p.mayoreoActivo, mayoreoMin: p.mayoreoMin,
        // Taxonomía → tasa de puntos por línea en el motor del Monedero.
        marca: p.marca, departamento: p.departamento, categoria: p.categoria,
      },
    })
  }

  const Articulo = ({ sku, marcar }: { sku: string; marcar: boolean }) => {
    const a = info[sku]
    const enCarrito = skusEnCarrito.has(sku)
    const sinStock = a ? a.existencia <= 0 : false
    return (
      <div className="prm-row">
        <div className="dpk-art">
          <div className="dpk-art-img">
            {a?.thumbnail ? <img src={a.thumbnail} alt="" loading="lazy" /> : <ImageOff size={18} />}
          </div>
          <div className="dpk-art-info">
            <span className="dpk-art-name">{a?.descripcion ?? (cargando ? "…" : sku)}</span>
            <span className="prm-art-sku">{sku}</span>
          </div>
        </div>
        {marcar && (
          enCarrito ? (
            <span className="prm-estado prm-estado--ok">
              <Check size={13} strokeWidth={3} /> En carrito
            </span>
          ) : (
            <button
              type="button"
              className="prm-btn-agregar"
              disabled={!a || sinStock}
              title={sinStock ? "Sin existencia" : "Agregar al carrito"}
              onClick={() => a && agregar(a)}
            >
              <Plus size={14} /> {sinStock ? "Sin stock" : "Agregar"}
            </button>
          )
        )}
      </div>
    )
  }

  return createPortal(
    <div className="dpk-overlay" onClick={onClose}>
      <div className="dpk-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dpk-header">
          <div className="dpk-header-info">
            <span className="dpk-header-img dpk-header-img--ph" style={{ background: "rgba(234,88,12,0.1)", color: "#ea580c" }}>
              <Tag size={22} />
            </span>
            <div>
              <p className="dpk-title">{promo.etiqueta || promo.nombre}</p>
              <p className="dpk-subtitle">Promoción · {describirPromo(promo)}</p>
            </div>
          </div>
          <button className="dpk-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="dpk-body">
          {/* Aviso de activación — refleja el estado REAL del motor (presencia de
              artículos + cantidad mínima + que el descuento aplique). */}
          <div className={`prm-aviso ${diag.aplicada ? "prm-aviso--ok" : "prm-aviso--pend"}`}>
            {diag.aplicada
              ? "✓ La promoción está activa: se está aplicando el descuento."
              : diag.motivo || "Esta promoción aún no se está aplicando."}
          </div>

          {/* Artículos requeridos */}
          <div className="prm-seccion-titulo">
            {esCruzada ? "Debes llevar" : "Artículos en promoción"}
          </div>
          <div className="dpk-list">
            {promo.skus_requeridos.map((sku) => <Articulo key={sku} sku={sku} marcar />)}
          </div>

          {/* Artículos beneficiados (solo cruzada) */}
          {esCruzada && (
            <>
              <div className="prm-seccion-titulo">Reciben el descuento</div>
              <div className="dpk-list">
                {promo.skus_beneficiados.map((sku) => <Articulo key={sku} sku={sku} marcar={false} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
