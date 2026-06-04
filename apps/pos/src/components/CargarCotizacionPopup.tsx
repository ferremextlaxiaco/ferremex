import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { FileText, X, Search, RotateCcw, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react"
import {
  listarCotizaciones,
  buscarProductos,
  type Cotizacion,
} from "../lib/client"
import { loadClientes, type Cliente } from "../lib/clientes"
import { usePOS, type CartItem } from "../lib/pos-store"
import { formatMXN } from "../lib/format"

/**
 * Cargar cotización — popup con estilo cristal.
 *
 * Lista las cotizaciones guardadas; al elegir una, consulta los precios ACTUALES
 * de cada SKU y, si alguno cambió respecto al cotizado, muestra un modal de
 * comparación para que el cajero decida conservar los precios cotizados o usar
 * los actuales. Luego carga los productos al carrito en modo cotización.
 *
 * Contrato de conexión: datos vía client.ts (listarCotizaciones, buscarProductos,
 * loadClientes), estado global vía usePOS (CARGAR_COTIZACION), feedback por toasts.
 */

interface CargarCotizacionPopupProps {
  open: boolean
  onClose: () => void
  pushToast: (msg: string, tipo?: "success" | "error" | "info") => void
  /** Si se pasa, al abrir auto-selecciona esa cotización (deep-link desde admin). */
  folioInicial?: string | null
}

/** Diferencia de precio detectada al comparar lo cotizado con lo actual. */
interface CambioPrecio {
  sku: string
  descripcion: string
  cantidad: number
  precioCotizado: number
  precioActual: number
}

function fmtHace(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return "hoy"
  if (dias === 1) return "ayer"
  return `hace ${dias} días`
}

export function CargarCotizacionPopup({ open, onClose, pushToast, folioInicial }: CargarCotizacionPopupProps) {
  const { dispatch } = usePOS()
  // Para abortar la carga si el usuario cierra el popup mientras se comparan precios.
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  // Cotización seleccionada en proceso de comparación de precios.
  const [comparando, setComparando] = useState<{
    cotizacion: Cotizacion
    cambios: CambioPrecio[]
    preciosActuales: Map<string, number>
  } | null>(null)
  const [verificando, setVerificando] = useState(false)

  // Carga inicial: cotizaciones + clientes (para restaurar el cliente al cargar).
  useEffect(() => {
    if (!open) return
    let on = true
    setCargando(true)
    setBusqueda("")
    setComparando(null)
    ;(async () => {
      try {
        const [cots, cls] = await Promise.all([listarCotizaciones(), loadClientes().catch(() => [])])
        if (on) { setCotizaciones(cots); setClientes(cls) }
      } catch {
        if (on) pushToast("No se pudieron cargar las cotizaciones", "error")
      } finally {
        if (on) setCargando(false)
      }
    })()
    return () => { on = false }
  }, [open, pushToast])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { if (comparando) setComparando(null); else onClose() } }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [open, comparando, onClose])

  // Deep-link desde el admin (?cotizacion=folio): auto-selecciona al cargar.
  const [autoHecho, setAutoHecho] = useState(false)
  useEffect(() => { if (!open) setAutoHecho(false) }, [open])
  useEffect(() => {
    if (!open || autoHecho || cargando || !folioInicial) return
    const cot = cotizaciones.find((c) => c.folio === folioInicial)
    if (cot) { setAutoHecho(true); seleccionar(cot) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoHecho, cargando, folioInicial, cotizaciones])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return cotizaciones
    return cotizaciones.filter(
      (c) =>
        c.folio.toLowerCase().includes(q) ||
        (c.cliente_nombre ?? "").toLowerCase().includes(q)
    )
  }, [busqueda, cotizaciones])

  /** Restaura el cliente de la cotización (por id) para reaplicar su nivel de precio. */
  const clienteDe = useCallback(
    (cot: Cotizacion): Cliente | null =>
      cot.cliente_id ? clientes.find((c) => c.id === cot.cliente_id) ?? null : null,
    [clientes]
  )

  /** Convierte los items de la cotización en líneas de carrito, con el precio dado por SKU. */
  function aCarrito(cot: Cotizacion, precioPorSku: (sku: string, fallback: number) => number): CartItem[] {
    return cot.items.map((it) => ({
      sku: it.sku,
      descripcion: it.descripcion,
      precio: precioPorSku(it.sku, it.precio_unitario),
      cantidad: it.cantidad,
      // Sin dato de stock fresco aquí: el carrito lo refrescará al editar. Usamos
      // un tope alto para no bloquear la edición de cantidades de una cotización.
      existencia: Math.max(it.cantidad, 9999),
      impuesto: it.impuesto,
      ...(it.paquete_id ? { paquete_id: it.paquete_id, paquete_nombre: it.paquete_nombre } : {}),
    }))
  }

  /** Carga definitiva al carrito (modo cotización) y cierra. */
  function cargar(cot: Cotizacion, precioPorSku: (sku: string, fallback: number) => number) {
    dispatch({
      type: "CARGAR_COTIZACION",
      items: aCarrito(cot, precioPorSku),
      cliente: clienteDe(cot),
      folio: cot.folio,
    })
    pushToast(`Cotización ${cot.folio} cargada`, "success")
    onClose()
  }

  /** Al elegir una cotización: compara precios actuales vs cotizados. */
  async function seleccionar(cot: Cotizacion) {
    setVerificando(true)
    try {
      // Precio actual por SKU: busca cada uno (las cotizaciones tienen pocos renglones).
      const preciosActuales = new Map<string, number>()
      await Promise.all(
        cot.items.map(async (it) => {
          try {
            const res = await buscarProductos({ q: it.sku })
            const match = res.find((p) => p.sku === it.sku)
            if (match) preciosActuales.set(it.sku, match.precio)
          } catch { /* sin precio actual: se conserva el cotizado */ }
        })
      )

      // Si el usuario cerró el popup mientras comparábamos, abortar sin cargar.
      if (!openRef.current) return

      const cambios: CambioPrecio[] = []
      for (const it of cot.items) {
        const actual = preciosActuales.get(it.sku)
        if (actual != null && Math.abs(actual - it.precio_unitario) > 0.005) {
          cambios.push({
            sku: it.sku,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precioCotizado: it.precio_unitario,
            precioActual: actual,
          })
        }
      }

      if (cambios.length === 0) {
        // Sin cambios: carga directa con los precios cotizados.
        cargar(cot, (_sku, fallback) => fallback)
      } else {
        setComparando({ cotizacion: cot, cambios, preciosActuales })
      }
    } finally {
      setVerificando(false)
    }
  }

  if (!open) return null

  // ── Sub-vista: comparación de precios ──────────────────────────────────────
  if (comparando) {
    const { cotizacion, cambios, preciosActuales } = comparando
    const totalCotizado = cotizacion.total
    const totalActual = cotizacion.items.reduce(
      (s, it) => s + (preciosActuales.get(it.sku) ?? it.precio_unitario) * it.cantidad,
      0
    )
    const delta = totalActual - totalCotizado

    return createPortal(
      <div className="cotpop-overlay" onClick={() => setComparando(null)}>
        <div className="cotpop-panel cotpop-panel--cambios" onClick={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-label="Cambios de precio en la cotización">
          <div className="cotpop-head">
            <span className="cotpop-titulo">
              <AlertTriangle size={18} /> {cambios.length} artículo{cambios.length !== 1 ? "s" : ""} cambió de precio
            </span>
            <button className="cotpop-cerrar" onClick={() => setComparando(null)} aria-label="Cerrar"><X size={18} /></button>
          </div>

          <p className="cotpop-cambios-sub">
            La cotización <b>{cotizacion.folio}</b> tiene precios distintos a los actuales. Elige qué precios usar.
          </p>

          <div className="cotpop-cambios-tabla">
            <div className="cotpop-cambios-thead">
              <span>Artículo</span>
              <span>Cotizado</span>
              <span>Actual</span>
              <span>Δ</span>
            </div>
            {cambios.map((c) => {
              const d = c.precioActual - c.precioCotizado
              return (
                <div key={c.sku} className="cotpop-cambios-fila">
                  <span className="cotpop-cambios-desc">{c.descripcion}</span>
                  <span className="cotpop-cambios-num">{formatMXN(c.precioCotizado)}</span>
                  <span className="cotpop-cambios-num">{formatMXN(c.precioActual)}</span>
                  <span className={`cotpop-cambios-delta${d > 0 ? " sube" : " baja"}`}>
                    {d > 0 ? "+" : ""}{formatMXN(d)}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="cotpop-cambios-totales">
            <div><span>Total cotizado</span><span>{formatMXN(totalCotizado)}</span></div>
            <div className="cotpop-cambios-total-actual">
              <span>Total actualizado</span>
              <span>{formatMXN(totalActual)} <em className={delta > 0 ? "sube" : "baja"}>({delta > 0 ? "+" : ""}{formatMXN(delta)})</em></span>
            </div>
          </div>

          <div className="cotpop-cambios-acciones">
            <button
              className="btn-secondary"
              onClick={() => cargar(cotizacion, (_sku, fallback) => fallback)}
            >
              Conservar precios cotizados
            </button>
            <button
              className="btn-confirmar"
              onClick={() => cargar(cotizacion, (sku, fallback) => preciosActuales.get(sku) ?? fallback)}
            >
              Usar precios actuales <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ── Vista principal: lista de cotizaciones (cristal) ───────────────────────
  return createPortal(
    <div className="cotpop-overlay" onClick={onClose}>
      <div className="cotpop-panel pk-sel-popup" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Cargar cotización">
        <div className="cotpop-head">
          <span className="cotpop-titulo"><FileText size={18} /> Cargar cotización</span>
          <button className="cotpop-cerrar" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="cotpop-buscador">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Buscar por folio o cliente…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="cotpop-lista">
          {cargando ? (
            <p className="cotpop-vacio">Cargando cotizaciones…</p>
          ) : filtradas.length === 0 ? (
            <div className="cotpop-vacio-box">
              <FileText size={28} />
              <p>{busqueda.trim() ? `Sin resultados para "${busqueda}"` : "No hay cotizaciones guardadas"}</p>
            </div>
          ) : (
            filtradas.map((c) => (
              <button
                key={c.folio}
                className="cotpop-item"
                onClick={() => seleccionar(c)}
                disabled={verificando}
              >
                <div className="cotpop-item-main">
                  <span className="cotpop-item-folio">{c.folio}</span>
                  <span className="cotpop-item-total">{formatMXN(c.total)}</span>
                </div>
                <div className="cotpop-item-meta">
                  <span>{c.cliente_nombre || "Público en general"}</span>
                  <span>·</span>
                  <span>{c.items.length} art.</span>
                  <span>·</span>
                  <span>{fmtHace(c.fecha)}</span>
                  {c.estado === "convertida" ? (
                    <span className="cotpop-badge cotpop-badge--conv">
                      <CheckCircle2 size={11} /> Vendida{c.folio_venta ? ` (${c.folio_venta})` : ""}
                    </span>
                  ) : (
                    <span className="cotpop-badge cotpop-badge--vig"><RotateCcw size={11} /> Vigente</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
