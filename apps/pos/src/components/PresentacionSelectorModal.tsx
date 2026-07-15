import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { X, Minus, Plus } from "lucide-react"
import { formatMXN } from "../lib/format"
import { abreviaturaUnidad, nombreUnidad } from "../lib/unidades-sat"
import type { ProductoPOS, PresentacionGranel } from "../lib/client"

// Id reservado para la forma de venta BASE (el propio artículo, vendido por su
// Unidad de Venta al Precio 1). El Buscador lo detecta para usar factor 1.
export const ID_PRESENTACION_BASE = "__base__"

/**
 * Selector de PRESENTACIÓN para un artículo especial (a granel). Se abre al tocar
 * un producto con `esGranel` + presentaciones (ej. Arena → m³ / carretilla / bote).
 * El vendedor elige la presentación y la cantidad; al confirmar se agrega al
 * carrito una línea con el precio de esa presentación y los datos para el descuento
 * informativo del inventario (factor → granelFactor).
 *
 * Reutiliza la estética de DesglosePaqueteModal (createPortal a <body> para escapar
 * el stacking context del drawer del carrito; overlay + Escape para cerrar).
 *
 * Cumple el Contrato de Conexión: no toca el backend directamente — devuelve la
 * línea vía onConfirmar y el dueño del estado (Buscador) despacha el ADD_ITEM.
 */
export function PresentacionSelectorModal({
  producto,
  onConfirmar,
  onClose,
  presentacionesOverride,
  subtitulo,
}: {
  producto: ProductoPOS | null
  onConfirmar: (args: { producto: ProductoPOS; presentacion: PresentacionGranel; cantidad: number }) => void
  onClose: () => void
  /** Lista de presentaciones a mostrar en vez de las derivadas de `producto`.
   *  La usa el caso "unidad de compra ≠ unidad de venta" (Buscador.tsx) para
   *  ofrecer metro-vs-rollo sin tocar la lógica de artículo especial (granel). */
  presentacionesOverride?: PresentacionGranel[]
  /** Texto bajo el nombre del producto (default "¿Cómo lo vendes?"). */
  subtitulo?: string
}) {
  // Formas de venta = la UNIDAD BASE del artículo (el propio producto, vendido por
  // su Unidad de Venta al Precio 1, factor 1) + las presentaciones hijas. La base
  // va primero porque es la unidad principal. Su precio ya viene CON IVA en
  // `producto.precio`. Se puede agotar por separado con `producto.agotadoBase`.
  const presentacionesDerivadas = useMemo<PresentacionGranel[]>(() => {
    if (!producto) return []
    const hijas = producto.presentaciones ?? []
    // Solo mostramos la base si el artículo tiene un precio de venta (>0).
    const base: PresentacionGranel[] = producto.precio > 0
      ? [{
          id: ID_PRESENTACION_BASE,
          nombre: nombreUnidad(producto.unidadVenta ?? "") || "Unidad",
          precio: producto.precio,
          factor: 1,
          agotado: !!producto.agotadoBase,
        }]
      : []
    return [...base, ...hijas]
  }, [producto])
  const presentaciones = presentacionesOverride ?? presentacionesDerivadas

  const [selId, setSelId] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(1)

  // Al abrir/cambiar de producto: preseleccionar la primera presentación disponible.
  useEffect(() => {
    if (!producto) return
    const primera = presentaciones.find((p) => !p.agotado)
    setSelId(primera?.id ?? null)
    setCantidad(1)
  }, [producto, presentaciones])

  // Cerrar con Escape.
  useEffect(() => {
    if (!producto) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [producto, onClose])

  if (!producto) return null

  const sel = presentaciones.find((p) => p.id === selId) ?? null
  // "≈ N unidad" bajo cada opción: unidad BASE del granel (m³) o unidad de VENTA
  // real cuando viene de una lista override (caso unidad de compra/venta, ej. Metro).
  const unidad = abreviaturaUnidad((presentacionesOverride ? producto.unidadVenta : producto.unidadBase) ?? "")
  const totalLinea = sel ? sel.precio * cantidad : 0

  function confirmar() {
    if (!sel || !producto) return
    onConfirmar({ producto, presentacion: sel, cantidad })
    onClose()
  }

  return createPortal(
    <div className="pgs-overlay" onClick={onClose}>
      <div className="pgs-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pgs-header">
          <div>
            <p className="pgs-title">{producto.descripcion}</p>
            <p className="pgs-subtitle">{subtitulo ?? "¿Cómo lo vendes?"}</p>
          </div>
          <button className="pgs-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* Presentaciones */}
        <div className="pgs-body">
          {presentaciones.length === 0 ? (
            <p className="pgs-empty">Este artículo no tiene formas de venta configuradas.</p>
          ) : (
            <div className="pgs-opciones">
              {presentaciones.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pgs-opcion${p.id === selId ? " activa" : ""}${p.agotado ? " agotada" : ""}`}
                  disabled={p.agotado}
                  onClick={() => { if (!p.agotado) setSelId(p.id) }}
                  title={p.agotado ? "Forma de venta agotada" : ""}
                >
                  <span className="pgs-opcion-nombre">{p.nombre}</span>
                  <span className="pgs-opcion-precio">
                    {p.agotado ? "Agotada" : formatMXN(p.precio)}
                  </span>
                  {!p.agotado && p.factor ? (
                    <span className="pgs-opcion-factor">≈ {p.factor} {unidad}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {/* Cantidad */}
          {sel && (
            <div className="pgs-cantidad">
              <span className="pgs-cantidad-label">Cantidad</span>
              <div className="pgs-stepper">
                <button
                  type="button" className="pgs-step"
                  onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                  title="Menos"
                ><Minus size={18} /></button>
                <input
                  type="text" inputMode="decimal" className="pgs-cantidad-input"
                  value={cantidad}
                  onChange={(e) => {
                    let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                    const i = raw.indexOf(".")
                    if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
                    const n = Number(raw)
                    setCantidad(raw === "" ? 0 : (isNaN(n) ? cantidad : n))
                  }}
                  onBlur={() => setCantidad((c) => (c > 0 ? c : 1))}
                />
                <button
                  type="button" className="pgs-step"
                  onClick={() => setCantidad((c) => c + 1)}
                  title="Más"
                ><Plus size={18} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Footer: total + agregar */}
        <div className="pgs-footer">
          <div className="pgs-total">
            <span className="pgs-total-label">Total</span>
            <span className="pgs-total-monto">{formatMXN(totalLinea)}</span>
          </div>
          <button
            type="button" className="pgs-agregar"
            disabled={!sel || cantidad <= 0}
            onClick={confirmar}
          >
            Agregar {sel ? formatMXN(totalLinea) : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
