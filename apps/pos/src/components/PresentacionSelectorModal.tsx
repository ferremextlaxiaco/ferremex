import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Minus, Plus } from "lucide-react"
import { formatMXN } from "../lib/format"
import { abreviaturaUnidad } from "../lib/unidades-sat"
import type { ProductoPOS, OpcionPresentacion } from "../lib/client"

/**
 * Selector de PRESENTACIÓN/NIVEL para artículos con cadena de N niveles de
 * unidad (ver lib/niveles.ts): se abre al tocar un producto con más de una
 * forma de venta (ej. Arena → m³/Carretilla/Bote con inventario informativo,
 * o Taquete → Pieza/Bolsa con inventario real). El vendedor elige la opción y
 * la cantidad; al confirmar se agrega al carrito una línea con el precio de
 * ese nivel. Componente 100% genérico: recibe las opciones ya resueltas por
 * el dueño del estado (Buscador.tsx) vía `presentacionesOverride` — no deriva
 * nada de `producto` directamente.
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
  onConfirmar: (args: { producto: ProductoPOS; presentacion: OpcionPresentacion; cantidad: number }) => void
  onClose: () => void
  /** Opciones a mostrar (una por nivel de la cadena), ya resueltas por Buscador.tsx. */
  presentacionesOverride: OpcionPresentacion[]
  /** Texto bajo el nombre del producto (default "¿Cómo lo vendes?"). */
  subtitulo?: string
}) {
  const presentaciones = presentacionesOverride

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
                  {/* Se expresa siempre hacia el nivel INMEDIATO ANTERIOR de
                      la cadena (ej. Caja ≈ 5 Bolsa, Bolsa ≈ 10 Pieza), no
                      hacia la base de inventario ni acumulado hasta el nivel
                      más pequeño — es el mismo factor que ya se capturó en el
                      drawer para ese nivel. undefined en el nivel más pequeño
                      (no tiene anterior). */}
                  {!p.agotado && p.factorMenor ? (
                    <span className="pgs-opcion-factor">≈ {p.factorMenor} {abreviaturaUnidad(p.unidadMenor ?? "")}</span>
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
