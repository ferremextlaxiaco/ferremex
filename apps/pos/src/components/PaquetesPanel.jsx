import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  listarPaquetes, crearPaquete, actualizarPaquete, eliminarPaquete,
  listarArticulos, listarArticulosDeCatalogo, subirImagenArticulo,
} from "../lib/client"
import { formatMXN } from "../lib/format"
import ConfirmDialog from "./ConfirmDialog"
import { useToasts } from "../hooks/useToasts"
import SelectorArticulosPopup from "./SelectorArticulosPopup"
import {
  Plus, Search, Trash2, Pencil, X, Package, AlertTriangle, PackageCheck,
  ImageOff, ImagePlus,
} from "lucide-react"

// ── Helpers de precio ───────────────────────────────────────────────────────

// Suma de precios individuales de los componentes a un nivel dado (1-4).
// Precio de venta de un componente a un nivel (1-4), CON IVA si el artículo lo
// aplica (16%). Los precio1..4 se guardan sin IVA, igual que en Artículos.
function precioVentaIva(comp, nivel) {
  const base = Number(comp[`precio${nivel}`]) || 0
  return comp.aplicarIva ? base * 1.16 : base
}
// Precio de compra (costo) de un componente, CON IVA si aplica.
function precioCompraIva(comp) {
  const base = Number(comp.precioCompra) || 0
  return comp.aplicarIva ? base * 1.16 : base
}
// Suma de precios de venta (con IVA) de todos los componentes a un nivel.
function sumaNivel(componentes, nivel) {
  return componentes.reduce((s, c) => s + precioVentaIva(c, nivel) * c.cantidad, 0)
}

// ¿Todos los componentes tienen existencia suficiente?
function esVendible(componentes) {
  return componentes.length > 0 && componentes.every((c) => (c.existencia ?? 0) >= c.cantidad)
}

// El popup de selección de artículos (estilo cristal) vive en su propio módulo
// reutilizable: ./SelectorArticulosPopup. Aquí se usa con anchorMode="drawer".

// ── Drawer de crear / editar paquete ─────────────────────────────────────────

function PaqueteDrawer({ open, mode, paquete, onSave, onClose, saving, pushToast, taxonomy, taxLoading }) {
  const [nombre, setNombre] = useState("")
  const [componentes, setComponentes] = useState([]) // [{sku, descripcion, cantidad, precio1..4, existencia}]
  const [nivelBase, setNivelBase] = useState(1)
  const [precioManual, setPrecioManual] = useState("") // "" = usar sugerido; valor = manual
  const [popupOpen, setPopupOpen] = useState(false) // popup flotante de selección de artículos
  const [imagenes, setImagenes] = useState([]) // galería; la primera es la principal
  const [subiendoImg, setSubiendoImg] = useState(false)
  const fileRef = useRef(null)

  // Escape: cierra primero el popup de selección si está abierto, luego el drawer.
  useEffect(() => {
    if (!open) return
    const fn = (e) => {
      if (e.key !== "Escape") return
      if (popupOpen) setPopupOpen(false)
      else onClose()
    }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [open, popupOpen, onClose])

  // Cargar datos al abrir
  useEffect(() => {
    if (!open) return
    if (mode === "edit" && paquete) {
      setNombre(paquete.nombre)
      setNivelBase(paquete.nivel_base || 1)
      setPrecioManual(String(paquete.precio_paquete))
      setImagenes(Array.isArray(paquete.imagenes) ? paquete.imagenes : [])
      // Rehidratar componentes con precios/existencia actuales del catálogo.
      ;(async () => {
        const enriquecidos = await Promise.all(
          paquete.componentes.map(async (c) => {
            try {
              const arts = await listarArticulos(c.sku)
              const art = arts.find((a) => a.clave === c.sku || a.claveAlterna === c.sku) ?? arts[0]
              return {
                sku: c.sku, descripcion: c.descripcion, cantidad: c.cantidad,
                precio1: art?.precio1 ?? 0, precio2: art?.precio2 ?? 0,
                precio3: art?.precio3 ?? 0, precio4: art?.precio4 ?? 0,
                precioCompra: art?.precioCompra ?? 0,
                aplicarIva: art?.aplicarIva ?? false,
                existencia: art?.existencia ?? 0,
              }
            } catch {
              return { sku: c.sku, descripcion: c.descripcion, cantidad: c.cantidad, precio1: 0, precio2: 0, precio3: 0, precio4: 0, precioCompra: 0, aplicarIva: false, existencia: 0 }
            }
          })
        )
        setComponentes(enriquecidos)
      })()
    } else {
      setNombre(""); setComponentes([]); setNivelBase(1); setPrecioManual(""); setImagenes([])
    }
    setPopupOpen(false)
  }, [open, mode, paquete])

  // Subir una imagen y AÑADIRLA a la galería (base64 → /caja/imagen). La primera
  // imagen es la principal (se muestra en ventas/lista/sugerencia).
  async function handleImagen(e) {
    const file = e.target.files?.[0]
    if (file) { e.target.value = "" } else { return }
    if (!file.type.startsWith("image/")) { pushToast("El archivo debe ser una imagen", "error"); return }
    setSubiendoImg(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result)
        fr.onerror = reject
        fr.readAsDataURL(file)
      })
      const url = await subirImagenArticulo(dataUrl)
      setImagenes((prev) => [...prev, url])
    } catch {
      pushToast("No se pudo subir la imagen", "error")
    } finally {
      setSubiendoImg(false)
    }
  }

  function quitarImagen(idx) {
    setImagenes((prev) => prev.filter((_, i) => i !== idx))
  }
  // Marcar una imagen como principal (la mueve al inicio del arreglo).
  function hacerPrincipal(idx) {
    setImagenes((prev) => { const a = [...prev]; const [img] = a.splice(idx, 1); return [img, ...a] })
  }

  const sugerido = useMemo(() => sumaNivel(componentes, nivelBase), [componentes, nivelBase])
  const precioFinal = precioManual.trim() !== "" ? (parseFloat(precioManual) || 0) : sugerido
  const sumaIndividual = sugerido // referencia = mismo nivel base
  const descuentoPct = sumaIndividual > 0 ? ((sumaIndividual - precioFinal) / sumaIndividual) * 100 : 0
  const ahorro = Math.max(0, sumaIndividual - precioFinal)

  // Costo (compra) total del paquete (con IVA por artículo) y margen.
  const costoTotal = useMemo(
    () => componentes.reduce((s, c) => s + precioCompraIva(c) * c.cantidad, 0),
    [componentes]
  )
  const ganancia = precioFinal - costoTotal
  const margenPct = precioFinal > 0 ? (ganancia / precioFinal) * 100 : 0

  // SKUs ya agregados (para marcar ✓ en el popup).
  const skusAgregados = useMemo(() => new Set(componentes.map((c) => c.sku)), [componentes])

  function agregarComponente(art) {
    const sku = art.clave || art.claveAlterna
    if (!sku) { pushToast("El artículo no tiene clave/SKU", "error"); return }
    if (componentes.some((c) => c.sku === sku)) { pushToast("Ese artículo ya está en el paquete", "info"); return }
    setComponentes((prev) => [...prev, {
      sku, descripcion: art.descripcion, cantidad: 1,
      precio1: art.precio1 ?? 0, precio2: art.precio2 ?? 0,
      precio3: art.precio3 ?? 0, precio4: art.precio4 ?? 0,
      precioCompra: art.precioCompra ?? 0,
      aplicarIva: art.aplicarIva ?? false,
      existencia: art.existencia ?? 0,
    }])
    // El popup permanece abierto para agregar varios.
  }

  function cambiarCantidad(sku, cantidad) {
    const n = Math.max(1, parseInt(cantidad) || 1)
    setComponentes((prev) => prev.map((c) => c.sku === sku ? { ...c, cantidad: n } : c))
  }

  // Precio del paquete: aceptar coma o punto, normalizar a punto, y permitir solo
  // dígitos + un separador decimal.
  function cambiarPrecio(raw) {
    const limpio = raw.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
    setPrecioManual(limpio)
  }

  // Flechas: suben/bajan el precio de UNA EN UNA unidad (no por decimales).
  function ajustarPrecio(delta) {
    const base = precioManual.trim() !== "" ? (parseFloat(precioManual) || 0) : sugerido
    const nuevo = Math.max(0, Math.round(base) + delta)
    setPrecioManual(String(nuevo))
  }

  function quitarComponente(sku) {
    setComponentes((prev) => prev.filter((c) => c.sku !== sku))
  }

  function handleGuardar() {
    if (!nombre.trim()) { pushToast("Escribe un nombre para el paquete", "error"); return }
    if (componentes.length < 2) { pushToast("Agrega al menos 2 artículos", "error"); return }
    if (precioFinal <= 0) { pushToast("El precio del paquete debe ser mayor a 0", "error"); return }
    onSave({
      ...(mode === "edit" && paquete ? { id: paquete.id } : {}),
      nombre: nombre.trim(),
      componentes: componentes.map((c) => ({ sku: c.sku, descripcion: c.descripcion, cantidad: c.cantidad })),
      precio_paquete: Number(precioFinal.toFixed(2)),
      nivel_base: nivelBase,
      imagenes,
    })
  }

  if (!open) return null

  return (
    <div className="pk-drawer-overlay" onClick={onClose}>
      {/* Popup flotante de selección de artículos, a la izquierda del drawer */}
      <SelectorArticulosPopup
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onAgregar={agregarComponente}
        yaAgregados={skusAgregados}
        taxonomy={taxonomy}
        taxLoading={taxLoading}
        pushToast={pushToast}
        anchorMode="drawer"
        agregarTitulo="Agregar al paquete"
      />

      <div className="pk-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pk-drawer-header">
          <h2>{mode === "edit" ? "Editar paquete" : "Nuevo paquete"}</h2>
          <button className="pk-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="pk-drawer-body">
          {/* Nombre */}
          <label className="pk-label">Nombre del paquete</label>
          <input
            className="pk-input" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Baño armado completo" autoFocus
          />

          {/* Buscar componentes — abre el popup flotante a la izquierda */}
          <label className="pk-label" style={{ marginTop: 16 }}>Agregar artículos</label>
          <button
            className={`pk-open-selector${popupOpen ? " activo" : ""}`}
            onClick={() => setPopupOpen((v) => !v)}
          >
            <Search size={15} />
            {popupOpen ? "Cerrar buscador" : "Buscar artículos…"}
          </button>

          {/* Componentes agregados */}
          <div className="pk-comp-list">
            {componentes.length === 0 ? (
              <p className="pk-empty-sm">Aún no hay artículos en el paquete.</p>
            ) : componentes.map((c) => {
              const sinStock = (c.existencia ?? 0) < c.cantidad
              return (
                <div key={c.sku} className={`pk-comp-row${sinStock ? " sin-stock" : ""}`}>
                  <div className="pk-comp-info">
                    <span className="pk-comp-name">{c.descripcion}</span>
                    <span className="pk-comp-sku">
                      <span className="pk-comp-sku-code">{c.sku}</span> ·{" "}
                      <span className={(c.existencia ?? 0) >= c.cantidad ? "pk-stock-ok" : "pk-stock-zero"}>
                        {c.existencia ?? 0} en stock
                      </span>
                      {sinStock && <span className="pk-comp-warn"> · insuficiente</span>}
                    </span>
                    <span className="pk-comp-precios">
                      <span className="pk-precio-compra">Compra {formatMXN(precioCompraIva(c))}</span>
                      {" · "}
                      <span className="pk-precio-venta">Venta {formatMXN(precioVentaIva(c, nivelBase))} c/u</span>
                      {c.aplicarIva && <span className="pk-iva-tag"> +IVA</span>}
                    </span>
                  </div>
                  <input
                    type="number" min="1" className="pk-qty"
                    value={c.cantidad}
                    onChange={(e) => cambiarCantidad(c.sku, e.target.value)}
                  />
                  <span className="pk-comp-sub">{formatMXN(precioVentaIva(c, nivelBase) * c.cantidad)}</span>
                  <button className="pk-icon-btn danger" onClick={() => quitarComponente(c.sku)} aria-label="Quitar">
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Precio sugerido por nivel */}
          <div className="pk-price-box">
            <label className="pk-label">Nivel de precio base (sugerencia) <span style={{ fontWeight: 400, color: "#9ca3af" }}>· precios c/IVA</span></label>
            <div className="pk-nivel-row">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={`pk-nivel-btn${nivelBase === n ? " active" : ""}`}
                  onClick={() => setNivelBase(n)}
                >
                  P{n}<span className="pk-nivel-val">{formatMXN(sumaNivel(componentes, n))}</span>
                </button>
              ))}
            </div>

            <div className="pk-price-final">
              <div>
                <span className="pk-label" style={{ marginBottom: 4 }}>Precio del paquete</span>
                <div className="pk-precio-wrap">
                  <span className="pk-precio-signo">$</span>
                  <input
                    type="text" inputMode="decimal" className="pk-input pk-precio-input"
                    value={precioManual}
                    onChange={(e) => cambiarPrecio(e.target.value)}
                    placeholder={sugerido.toFixed(2)}
                  />
                  <div className="pk-precio-steppers">
                    <button type="button" className="pk-precio-step" onClick={() => ajustarPrecio(1)} aria-label="Subir $1">▲</button>
                    <button type="button" className="pk-precio-step" onClick={() => ajustarPrecio(-1)} aria-label="Bajar $1">▼</button>
                  </div>
                </div>
              </div>
              <div className="pk-price-stats">
                <p className="pk-stat">Costo (compra): <b className="pk-precio-compra">{formatMXN(costoTotal)}</b></p>
                <p className="pk-stat">Por piezas (P{nivelBase}): <b>{formatMXN(sumaIndividual)}</b></p>
                <p className={`pk-stat ${descuentoPct >= 0 ? "save" : "warn"}`}>
                  {descuentoPct >= 0 ? `Descuento ${descuentoPct.toFixed(1)}% · ahorro ${formatMXN(ahorro)}` : `⚠ Más caro que por piezas (${Math.abs(descuentoPct).toFixed(1)}%)`}
                </p>
                <p className={`pk-stat ${ganancia >= 0 ? "save" : "warn"}`}>
                  {ganancia >= 0
                    ? `Ganancia ${formatMXN(ganancia)} · margen ${margenPct.toFixed(0)}%`
                    : `⚠ Pérdida ${formatMXN(Math.abs(ganancia))} (vendes bajo costo)`}
                </p>
              </div>
            </div>
            <p className="pk-hint">Deja el precio vacío para usar el sugerido. El precio del paquete puede ser igual o menor que por piezas.</p>
          </div>

          {/* Imágenes del paquete (al final) — galería: la 1ª es la principal */}
          <label className="pk-label" style={{ marginTop: 18 }}>Imágenes del paquete</label>
          <p className="pk-hint" style={{ marginTop: 0, marginBottom: 8 }}>La primera imagen es la principal (se muestra en ventas). Agrega más con el botón +.</p>
          <div className="pk-galeria">
            {imagenes.map((url, idx) => (
              <div key={url + idx} className={`pk-galeria-item${idx === 0 ? " principal" : ""}`}>
                <img src={url} alt="" />
                {idx === 0 && <span className="pk-galeria-tag">Principal</span>}
                {idx !== 0 && (
                  <button type="button" className="pk-galeria-star" title="Hacer principal" onClick={() => hacerPrincipal(idx)}>★</button>
                )}
                <button type="button" className="pk-galeria-quitar" title="Quitar" onClick={() => quitarImagen(idx)}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button type="button" className="pk-galeria-add" onClick={() => fileRef.current?.click()} disabled={subiendoImg}>
              {subiendoImg ? "…" : <><Plus size={20} /><span>{imagenes.length === 0 ? "Imagen" : "Agregar"}</span></>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImagen} style={{ display: "none" }} />
          </div>
        </div>

        {/* Footer */}
        <div className="pk-drawer-footer">
          <button className="pk-btn-sec" onClick={onClose}>Cancelar</button>
          <button className="pk-btn-pri" onClick={handleGuardar} disabled={saving}>
            {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear paquete"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel derecho de detalle del paquete (solo lectura) ──────────────────────

function PaqueteDetalle({ paquete, onClose, onEditar }) {
  const [comps, setComps] = useState([])
  const [cargando, setCargando] = useState(true)

  // Cerrar con Escape (igual que el botón X / clic en el overlay).
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  // Rehidratar componentes con precios/IVA/existencia actuales del catálogo.
  useEffect(() => {
    if (!paquete) return
    let on = true
    setCargando(true)
    ;(async () => {
      const enriquecidos = await Promise.all(
        paquete.componentes.map(async (c) => {
          try {
            const arts = await listarArticulos(c.sku)
            const art = arts.find((a) => a.clave === c.sku || a.claveAlterna === c.sku) ?? arts[0]
            return {
              sku: c.sku, descripcion: c.descripcion, cantidad: c.cantidad,
              precio1: art?.precio1 ?? 0, precio2: art?.precio2 ?? 0,
              precio3: art?.precio3 ?? 0, precio4: art?.precio4 ?? 0,
              precioCompra: art?.precioCompra ?? 0, aplicarIva: art?.aplicarIva ?? false,
              existencia: art?.existencia ?? 0, thumbnail: art?.thumbnail ?? null,
            }
          } catch {
            return { sku: c.sku, descripcion: c.descripcion, cantidad: c.cantidad, precio1: 0, precio2: 0, precio3: 0, precio4: 0, precioCompra: 0, aplicarIva: false, existencia: 0, thumbnail: null }
          }
        })
      )
      if (on) { setComps(enriquecidos); setCargando(false) }
    })()
    return () => { on = false }
  }, [paquete])

  if (!paquete) return null

  const nivel = paquete.nivel_base || 1
  const porPiezas = sumaNivel(comps, nivel)
  const costo = comps.reduce((s, c) => s + precioCompraIva(c) * c.cantidad, 0)
  const ganancia = paquete.precio_paquete - costo
  const margenPct = paquete.precio_paquete > 0 ? (ganancia / paquete.precio_paquete) * 100 : 0
  const desc = porPiezas > 0 ? ((porPiezas - paquete.precio_paquete) / porPiezas) * 100 : 0
  const vendible = comps.length > 0 && comps.every((c) => c.existencia >= c.cantidad)

  return (
    <div className="pk-det-overlay" onClick={onClose}>
      <div className="pk-det" onClick={(e) => e.stopPropagation()}>
        <div className="pk-drawer-header">
          <h2>Detalle del paquete</h2>
          <button className="pk-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="pk-det-body">
          {/* Imagen principal + galería */}
          {paquete.imagenes?.length > 0 && (
            <div className="pk-det-imgs">
              <div className="pk-det-img-main">
                <img src={paquete.imagenes[0]} alt="" />
              </div>
              {paquete.imagenes.length > 1 && (
                <div className="pk-det-img-thumbs">
                  {paquete.imagenes.slice(1).map((u, i) => <img key={i} src={u} alt="" />)}
                </div>
              )}
            </div>
          )}

          <h3 className="pk-det-nombre">{paquete.nombre}</h3>
          <div className="pk-det-estado">
            {vendible
              ? <span className="pk-det-vendible"><PackageCheck size={14} /> Vendible</span>
              : <span className="pk-badge-warn"><AlertTriangle size={12} /> No vendible (sin stock)</span>}
          </div>

          {/* Componentes */}
          <p className="pk-label" style={{ marginTop: 16 }}>Componentes</p>
          {cargando ? (
            <p className="pk-empty-sm">Cargando…</p>
          ) : (
            <div className="pk-det-comps">
              {comps.map((c) => {
                const sinStock = c.existencia < c.cantidad
                return (
                  <div key={c.sku} className={`pk-det-comp${sinStock ? " sin-stock" : ""}`}>
                    <div className="pk-det-comp-img">
                      {c.thumbnail ? <img src={c.thumbnail} alt="" /> : <ImageOff size={16} />}
                    </div>
                    <div className="pk-det-comp-info">
                      <span className="pk-det-comp-name">{c.descripcion}</span>
                      <span className="pk-comp-sku">
                        <span className="pk-comp-sku-code">{c.sku}</span> · ×{c.cantidad} ·{" "}
                        <span className={c.existencia >= c.cantidad ? "pk-stock-ok" : "pk-stock-zero"}>{c.existencia} en stock</span>
                      </span>
                      <span className="pk-comp-precios">
                        <span className="pk-precio-compra">Compra {formatMXN(precioCompraIva(c))}</span>
                        {" · "}
                        <span className="pk-precio-venta">Venta {formatMXN(precioVentaIva(c, nivel))} c/u</span>
                      </span>
                    </div>
                    <span className="pk-det-comp-sub">{formatMXN(precioVentaIva(c, nivel) * c.cantidad)}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Resumen de precios */}
          <div className="pk-det-resumen">
            <div className="pk-det-row"><span>Por piezas (P{nivel}, c/IVA)</span><b>{formatMXN(porPiezas)}</b></div>
            <div className="pk-det-row"><span>Costo (compra)</span><b className="pk-precio-compra">{formatMXN(costo)}</b></div>
            <div className="pk-det-row destacado"><span>Precio del paquete</span><b>{formatMXN(paquete.precio_paquete)}</b></div>
            {desc > 0 && <div className="pk-det-row save"><span>Descuento vs piezas</span><b>−{desc.toFixed(1)}% · ahorra {formatMXN(porPiezas - paquete.precio_paquete)}</b></div>}
            <div className={`pk-det-row ${ganancia >= 0 ? "save" : "warn"}`}>
              <span>{ganancia >= 0 ? "Ganancia" : "Pérdida"}</span>
              <b>{ganancia >= 0 ? `${formatMXN(ganancia)} · margen ${margenPct.toFixed(0)}%` : `${formatMXN(Math.abs(ganancia))} (bajo costo)`}</b>
            </div>
          </div>
        </div>

        <div className="pk-drawer-footer">
          <button className="pk-btn-sec" onClick={onClose}>Cerrar</button>
          <button className="pk-btn-pri" onClick={() => onEditar(paquete)}>
            <Pencil size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />Editar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel principal de Paquetes ───────────────────────────────────────────────

export default function PaquetesPanel({ pushToast: pushExterno, taxonomy, taxLoading }) {
  const interno = useToasts()
  const pushToast = pushExterno ?? interno.push

  const [paquetes, setPaquetes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState("add")
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [borrar, setBorrar] = useState(null) // paquete a eliminar
  const [detalle, setDetalle] = useState(null) // paquete cuyo panel de detalle está abierto

  // Para marcar vendibilidad necesitamos la existencia actual de los componentes.
  const [stockPorSku, setStockPorSku] = useState({})
  const [stockListo, setStockListo] = useState(false) // ¿ya llegó el stock de fondo?

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      // 1) Mostrar los paquetes de inmediato (esta llamada es rápida).
      const data = await listarPaquetes()
      setPaquetes(data)
      setCargando(false)
      setStockListo(false)

      // 2) Cargar existencias en SEGUNDO PLANO (no bloquea la lista). El
      //    semáforo de vendibilidad se actualiza cuando lleguen; mientras tanto
      //    los paquetes ya se ven. Cada listarArticulos(sku) es lento (~1.5s),
      //    por eso no se espera antes de pintar.
      const skus = [...new Set(data.flatMap((p) => p.componentes.map((c) => c.sku)))]
      Promise.all(skus.map(async (sku) => {
        try {
          const arts = await listarArticulos(sku)
          const art = arts.find((a) => a.clave === sku || a.claveAlterna === sku) ?? arts[0]
          return [sku, art?.existencia ?? 0]
        } catch { return [sku, 0] }
      })).then((pares) => { setStockPorSku(Object.fromEntries(pares)); setStockListo(true) })
    } catch (e) {
      setError(e.message ?? "Error al cargar paquetes")
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function handleSave(data) {
    setSaving(true)
    try {
      if (drawerMode === "edit" && data.id) {
        const upd = await actualizarPaquete(data)
        setPaquetes((prev) => prev.map((p) => p.id === upd.id ? upd : p))
        pushToast("Paquete actualizado ✓", "success")
      } else {
        const nuevo = await crearPaquete(data)
        setPaquetes((prev) => [nuevo, ...prev])
        pushToast("Paquete creado ✓", "success")
      }
      setDrawerOpen(false)
      cargar() // refrescar existencias
    } catch (e) {
      pushToast("Error al guardar: " + (e.message ?? "Error"), "error")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!borrar) return
    try {
      await eliminarPaquete(borrar.id)
      setPaquetes((prev) => prev.filter((p) => p.id !== borrar.id))
      pushToast("Paquete eliminado", "success")
    } catch (e) {
      pushToast("Error al eliminar: " + (e.message ?? "Error"), "error")
    } finally {
      setBorrar(null)
    }
  }

  // Componentes enriquecidos con existencia para el cálculo de vendibilidad.
  function compsConStock(p) {
    return p.componentes.map((c) => ({ ...c, existencia: stockPorSku[c.sku] ?? 0 }))
  }

  return (
    <div className="pk-root">
      <div className="ar-header">
        <div>
          <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Paquetes</p>
          <p className="ar-header-meta">
            {cargando ? "Cargando…" : `${paquetes.length} paquete${paquetes.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="ar-header-actions">
          <button className="ar-btn-add" onClick={() => { setDrawerMode("add"); setEditing(null); setDrawerOpen(true) }}>
            <Plus size={14} /> Nuevo paquete
          </button>
        </div>
      </div>

      {error && (
        <div className="ar-error-bar">
          {error} — <button onClick={cargar} className="ar-error-retry">Reintentar</button>
        </div>
      )}

      <div className="pk-list">
        {cargando ? (
          <p className="ar-empty">Cargando paquetes…</p>
        ) : paquetes.length === 0 ? (
          <div className="pk-empty-state">
            <Package size={40} />
            <p>Aún no hay paquetes.</p>
            <p className="pk-empty-sub">Crea el primero para agilizar las ventas combinadas (ej. baño armado, kit de plomería).</p>
          </div>
        ) : (
          paquetes.map((p) => {
            // El stock llega en segundo plano; solo marcamos "No vendible" cuando
            // ya cargó (evita un falso negativo mientras carga).
            const vendible = !stockListo || esVendible(compsConStock(p))
            const noVendible = stockListo && !vendible
            const piezas = p.componentes.reduce((s, c) => s + c.cantidad, 0)
            return (
              <div key={p.id} className="pk-card pk-card-click" onClick={() => setDetalle(p)} title="Ver detalle">
                <div className={`pk-card-icon${p.imagenes?.[0] ? " con-img" : ""}`}>
                  {p.imagenes?.[0]
                    ? <img src={p.imagenes[0]} alt="" />
                    : (!noVendible ? <PackageCheck size={22} /> : <Package size={22} />)}
                </div>
                <div className="pk-card-main">
                  <div className="pk-card-title">
                    {p.nombre}
                    {noVendible && (
                      <span className="pk-badge-warn"><AlertTriangle size={12} /> No vendible (sin stock)</span>
                    )}
                  </div>
                  <div className="pk-card-piezas">{piezas} artículo{piezas !== 1 ? "s" : ""}</div>
                </div>
                <div className="pk-card-prices">
                  <span className="pk-card-pkg">{formatMXN(p.precio_paquete)}</span>
                </div>
                <div className="pk-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="pk-card-btn editar" onClick={() => { setDrawerMode("edit"); setEditing(p); setDrawerOpen(true) }}>
                    <Pencil size={15} /> Editar
                  </button>
                  <button className="pk-card-btn eliminar" onClick={() => setBorrar(p)} aria-label="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <PaqueteDrawer
        open={drawerOpen}
        mode={drawerMode}
        paquete={drawerMode === "edit" ? editing : null}
        saving={saving}
        onSave={handleSave}
        onClose={() => setDrawerOpen(false)}
        pushToast={pushToast}
        taxonomy={taxonomy}
        taxLoading={taxLoading}
      />

      {/* Panel derecho de detalle (solo lectura) */}
      {detalle && (
        <PaqueteDetalle
          paquete={detalle}
          onClose={() => setDetalle(null)}
          onEditar={(p) => { setDetalle(null); setDrawerMode("edit"); setEditing(p); setDrawerOpen(true) }}
        />
      )}

      <ConfirmDialog
        open={!!borrar}
        title="Eliminar paquete"
        message={borrar ? `¿Eliminar el paquete "${borrar.nombre}"? Los artículos que lo componen no se borran, solo se elimina el paquete.` : ""}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        danger
        onConfirm={handleDelete}
        onClose={() => setBorrar(null)}
      />

      {/* Toasts solo si el panel no recibió un push externo */}
      {!pushExterno && interno.toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 5000, display: "flex", flexDirection: "column", gap: 8 }}>
          {interno.toasts.map((t) => (
            <div key={t.id} style={{
              background: t.type === "error" ? "#dc2626" : t.type === "info" ? "#374151" : "#16a34a",
              color: "#fff", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 500,
              boxShadow: "0 4px 16px rgba(0,0,0,.2)", minWidth: 200, maxWidth: 360,
            }}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
