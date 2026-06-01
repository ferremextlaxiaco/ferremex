import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Package, ImageOff } from "lucide-react"
import { formatMXN } from "../lib/format"
import { cargarDesglosePaquete, type DesglosePaquete } from "../lib/paquetes"
import type { Paquete } from "../lib/client"

/**
 * Modal de desglose de un paquete: lista de artículos que lo componen con su
 * imagen, cantidad, precio original y precio con descuento (prorrateado), más un
 * resumen con la suma original, el precio del paquete y el ahorro.
 *
 * Reutilizable: se abre desde la tarjeta de búsqueda (GridPaquetes) y desde el
 * bloque de paquete del carrito. Recibe `paquete` (null = cerrado) y se cierra
 * con `onClose`. Carga el desglose async vía cargarDesglosePaquete().
 *
 * Cumple el Contrato de Conexión: datos por lib/paquetes (que usa client.ts),
 * formatMXN para moneda.
 */
export function DesglosePaqueteModal({
  paquete,
  onClose,
}: {
  paquete: Paquete | null
  onClose: () => void
}) {
  const [data, setData] = useState<DesglosePaquete | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!paquete) { setData(null); return }
    let activo = true
    setCargando(true); setError(false); setData(null)
    cargarDesglosePaquete(paquete)
      .then((d) => { if (activo) setData(d) })
      .catch(() => { if (activo) setError(true) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [paquete])

  // Cerrar con Escape
  useEffect(() => {
    if (!paquete) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [paquete, onClose])

  if (!paquete) return null

  const piezas = paquete.componentes.reduce((s, c) => s + c.cantidad, 0)

  // Portal a <body>: el modal debe quedar por encima del drawer del carrito,
  // cuyo `transform` crea un stacking context que lo confinaría si se renderiza
  // anidado. Con el portal escapa a nivel de viewport.
  return createPortal(
    <div className="dpk-overlay" onClick={onClose}>
      <div className="dpk-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dpk-header">
          <div className="dpk-header-info">
            {paquete.imagenes?.[0]
              ? <img className="dpk-header-img" src={paquete.imagenes[0]} alt={paquete.nombre} />
              : <span className="dpk-header-img dpk-header-img--ph"><Package size={22} /></span>}
            <div>
              <p className="dpk-title">{paquete.nombre}</p>
              <p className="dpk-subtitle">
                Paquete · {paquete.componentes.length} artículo{paquete.componentes.length !== 1 ? "s" : ""} · {piezas} pza{piezas !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button className="dpk-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="dpk-body">
          {cargando ? (
            <p className="dpk-empty">Cargando desglose…</p>
          ) : error ? (
            <p className="dpk-empty dpk-empty--error">No se pudo cargar el desglose del paquete.</p>
          ) : data ? (
            <>
              <div className="dpk-list-head">
                <span className="dpk-col-art">Artículo</span>
                <span className="dpk-col-cant">Cant.</span>
                <span className="dpk-col-orig">P. original</span>
                <span className="dpk-col-desc">Con paquete</span>
              </div>
              <div className="dpk-list">
                {data.componentes.map((c) => {
                  const ahorroLinea = c.precioOriginal - c.precioProrrateado
                  return (
                    <div key={c.sku} className="dpk-row">
                      <div className="dpk-art">
                        <div className="dpk-art-img">
                          {c.thumbnail ? <img src={c.thumbnail} alt="" loading="lazy" /> : <ImageOff size={18} />}
                        </div>
                        <div className="dpk-art-info">
                          <span className="dpk-art-name">{c.descripcion}</span>
                          <span className="dpk-art-sku">{c.sku}</span>
                        </div>
                      </div>
                      <span className="dpk-col-cant dpk-cant">×{c.cantidad}</span>
                      <span className="dpk-col-orig dpk-orig">{formatMXN(c.precioOriginal)}</span>
                      <span className="dpk-col-desc dpk-desc">
                        {formatMXN(c.precioProrrateado)}
                        {ahorroLinea > 0.005 && (
                          <span className="dpk-desc-tag">−{formatMXN(ahorroLinea)}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Resumen: original tachado, precio paquete, ahorro */}
              <div className="dpk-resumen">
                <div className="dpk-resumen-row">
                  <span>Suma de precios individuales</span>
                  <span className="dpk-tachado">{formatMXN(data.sumaOriginal)}</span>
                </div>
                <div className="dpk-resumen-row dpk-resumen-row--total">
                  <span>Precio del paquete</span>
                  <span className="dpk-precio-pkg">{formatMXN(data.precioPaquete)}</span>
                </div>
                {data.ahorro > 0.005 && (
                  <div className="dpk-resumen-row dpk-resumen-row--ahorro">
                    <span>Ahorro</span>
                    <span>{formatMXN(data.ahorro)} ({data.ahorroPct.toFixed(0)}%)</span>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
