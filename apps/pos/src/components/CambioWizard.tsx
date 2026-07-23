import { useEffect, useMemo, useRef, useState } from "react"
import { X, Search, ArrowRightLeft, Check, AlertCircle, Loader2, UserCircle, ImageOff, Wallet, RotateCcw, Coins } from "lucide-react"
import {
  obtenerVenta, procesarCambioAPI, obtenerSaldoCambioAPI, listarCatalogos,
  obtenerDetalleMonederoAPI,
  type VentaResponse, type ArticuloPOS, type Cambio, type CatalogosData,
  type DetalleMonedero, type DetalleSaldoCambio,
} from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { topeCanjePesos } from "../lib/monedero"
import { formatMXN as fmt } from "../lib/format"
import SelectorClienteModal from "./SelectorClienteModal"
import { ComprobanteCambio } from "./ComprobanteCambio"
import SelectorArticulosPopup from "./SelectorArticulosPopup"

interface ClienteLigero { id: string; nombre: string }

interface CambioWizardProps {
  onClose: () => void
  onCompletado: (cambio: Cambio) => void
  /** Folio a precargar (viene del drawer de SalesHistory, salta el paso 1). */
  folioInicial?: string | null
}

type LineaDevuelta = { sku: string; descripcion: string; cantidad: number; max: number; precio_unitario: number }
type LineaNueva = { sku: string; descripcion: string; cantidad: number; precio_unitario: number; thumbnail: string | null }

const PASOS = ["Venta original", "Artículos", "Resumen"] as const

export function CambioWizard({ onClose, onCompletado, folioInicial }: CambioWizardProps) {
  const { state } = usePOS()
  const cajero = state.cajero

  const [paso, setPaso] = useState(0)
  const [folioQuery, setFolioQuery] = useState(folioInicial ?? "")
  const [buscando, setBuscando] = useState(false)
  const [ventaOrigen, setVentaOrigen] = useState<VentaResponse | null>(null)
  const [errorVenta, setErrorVenta] = useState<string | null>(null)

  const [devueltos, setDevueltos] = useState<LineaDevuelta[]>([])
  // El cliente no se lleva nada ahora: el 100% del valor devuelto se acredita
  // como saldo a favor (requiere cliente, igual que cualquier saldo generado).
  const [soloDevolucion, setSoloDevolucion] = useState(false)
  const [nuevos, setNuevos] = useState<LineaNueva[]>([])

  // Selector cristal de artículos nuevos (mismo popup que Ajuste de Inventario,
  // en modo multiSelect + cantidad): selSkus = SKUs marcados, selArts = artículo
  // por SKU (para agregar sin re-buscar), selCantidades = cantidad por SKU.
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  const [taxonomia, setTaxonomia] = useState<CatalogosData>({ depts: [], cats: [], marcas: [] })
  const [taxLoading, setTaxLoading] = useState(true)
  const [selSkus, setSelSkus] = useState<Set<string>>(() => new Set())
  const [selCantidades, setSelCantidades] = useState<Record<string, number>>({})
  const selArts = useRef<Map<string, ArticuloPOS>>(new Map())

  const [cliente, setCliente] = useState<ClienteLigero | null>(null)
  const [selectorClienteAbierto, setSelectorClienteAbierto] = useState(false)
  const [pagoEfectivo, setPagoEfectivo] = useState("")
  const [pagoTransferencia, setPagoTransferencia] = useState("")
  const [pagoTarjeta, setPagoTarjeta] = useState("")
  // Monedero (puntos) y saldo a favor (de un cambio anterior) del cliente, para
  // cubrir la diferencia — mismo mecanismo que ModalCobro, sin biometría/slider.
  const [monedero, setMonedero] = useState<DetalleMonedero | null>(null)
  const [saldoCambio, setSaldoCambio] = useState<DetalleSaldoCambio | null>(null)
  const [puntosTexto, setPuntosTexto] = useState("")
  const [saldoTexto, setSaldoTexto] = useState("")
  const [procesando, setProcesando] = useState(false)
  const [errorProceso, setErrorProceso] = useState<string | null>(null)
  const [cambioCompletado, setCambioCompletado] = useState<Cambio | null>(null)

  // Escape cierra lo que esté abierto: primero el popup del selector cristal
  // (igual que su clic-fuera), luego el wizard completo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (buscadorAbierto) setBuscadorAbierto(false)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, buscadorAbierto])

  // Precarga automática si viene folio (desde SalesHistory).
  useEffect(() => {
    if (folioInicial) buscarVenta(folioInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioInicial])

  // Taxonomía para el selector cristal de artículos nuevos (única fuente: listarCatalogos).
  useEffect(() => {
    let on = true
    listarCatalogos()
      .then((d) => { if (on) setTaxonomia(d) })
      .catch(() => { /* sin taxonomía los filtros del popup quedan vacíos */ })
      .finally(() => { if (on) setTaxLoading(false) })
    return () => { on = false }
  }, [])

  // Monedero (puntos) del cliente elegido para el cambio — igual patrón que
  // ModalCobro: opcional, requiere que el cliente esté inscrito.
  useEffect(() => {
    if (!cliente) { setMonedero(null); setPuntosTexto(""); return }
    let on = true
    obtenerDetalleMonederoAPI(cliente.id)
      .then((d) => { if (on) setMonedero(d) })
      .catch(() => { if (on) setMonedero(null) })
    return () => { on = false }
  }, [cliente])

  // Saldo a favor por cambio del cliente elegido — independiente del monedero,
  // cualquier cliente identificado puede tener saldo de un cambio anterior.
  useEffect(() => {
    if (!cliente) { setSaldoCambio(null); setSaldoTexto(""); return }
    let on = true
    obtenerSaldoCambioAPI(cliente.id)
      .then((d) => { if (on) setSaldoCambio(d) })
      .catch(() => { if (on) setSaldoCambio(null) })
    return () => { on = false }
  }, [cliente])

  async function buscarVenta(folio: string) {
    const f = folio.trim()
    if (!f) return
    setBuscando(true)
    setErrorVenta(null)
    try {
      const venta = await obtenerVenta(f)
      if (!venta) {
        setErrorVenta("No se encontró ninguna venta con ese folio")
        return
      }
      if ((venta as VentaResponse & { estado?: string }).estado === "cancelada") {
        setErrorVenta("Esa venta está cancelada, no se puede cambiar")
        return
      }
      setVentaOrigen(venta)
      setDevueltos(
        (venta.items ?? [])
          .filter((it) => it.sku)
          .map((it) => ({
            sku: it.sku as string,
            descripcion: it.descripcion,
            cantidad: 0,
            max: it.cantidad,
            precio_unitario: it.precio_unitario,
          }))
      )
      if (venta.cliente_id && venta.cliente_nombre) {
        setCliente({ id: venta.cliente_id, nombre: venta.cliente_nombre })
      }
      setPaso(1)
    } catch (e) {
      setErrorVenta(e instanceof Error ? e.message : "No se pudo buscar la venta")
    } finally {
      setBuscando(false)
    }
  }

  function cambiarCantidadDevuelta(sku: string, cantidad: number) {
    setDevueltos((prev) =>
      prev.map((l) => (l.sku === sku ? { ...l, cantidad: Math.max(0, Math.min(cantidad, l.max)) } : l))
    )
  }

  // Precio de venta (nivel 1) CON IVA si el artículo lo aplica — precio1 se
  // guarda SIN IVA (mismo criterio que PaquetesPanel.precioVentaIva).
  function precioVentaIva(art: ArticuloPOS): number {
    const base = Number(art.precio1) || 0
    return art.aplicarIva ? base * 1.16 : base
  }

  function agregarNuevo(art: ArticuloPOS, cantidad = 1) {
    const sku = art.clave || art.claveAlterna
    if (!sku) return
    setNuevos((prev) => {
      const existe = prev.find((l) => l.sku === sku)
      if (existe) {
        return prev.map((l) => (l.sku === sku ? { ...l, cantidad: l.cantidad + cantidad } : l))
      }
      return [...prev, { sku, descripcion: art.descripcion, cantidad, precio_unitario: precioVentaIva(art), thumbnail: art.thumbnail ?? null }]
    })
  }

  // Selector cristal en modo multiSelect + cantidad: marcar/desmarcar (mismo
  // patrón que InventarioModule) y agregar todo el lote de una vez al confirmar.
  function toggleSeleccionNuevo(art: ArticuloPOS) {
    const sku = art.clave || art.claveAlterna
    if (!sku) return
    const yaEstaba = selSkus.has(sku)
    if (yaEstaba) selArts.current.delete(sku)
    else selArts.current.set(sku, art)
    setSelSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  function cambiarCantidadSel(sku: string, cantidad: number) {
    setSelCantidades((prev) => ({ ...prev, [sku]: cantidad }))
  }

  function agregarSeleccionados() {
    for (const sku of selSkus) {
      const art = selArts.current.get(sku)
      if (art) agregarNuevo(art, selCantidades[sku] ?? 1)
    }
    setSelSkus(new Set())
    setSelCantidades({})
    selArts.current.clear()
    setBuscadorAbierto(false)
  }

  function cambiarCantidadNueva(sku: string, cantidad: number) {
    setNuevos((prev) =>
      cantidad <= 0
        ? prev.filter((l) => l.sku !== sku)
        : prev.map((l) => (l.sku === sku ? { ...l, cantidad } : l))
    )
  }

  const lineasDevueltasActivas = useMemo(() => devueltos.filter((l) => l.cantidad > 0), [devueltos])
  const valorDevuelto = useMemo(
    () => Math.round(lineasDevueltasActivas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0) * 100) / 100,
    [lineasDevueltasActivas]
  )
  const valorNuevo = useMemo(
    () => (soloDevolucion ? 0 : Math.round(nuevos.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0) * 100) / 100),
    [nuevos, soloDevolucion]
  )
  const diferencia = Math.round((valorNuevo - valorDevuelto) * 100) / 100
  const generaSaldo = diferencia < -0.005
  const cobraDiferencia = diferencia > 0.005

  const puedeAvanzarPaso1 =
    lineasDevueltasActivas.length > 0 && (soloDevolucion || nuevos.length > 0)

  // ── Derivados del monedero (puntos) — mismo criterio que ModalCobro ────────
  const cfgMon = monedero?.config ?? null
  const saldoPuntos = monedero?.saldo ?? 0
  const valorCanje = cfgMon?.valor_punto || 1
  const saldoPesosMon = Math.round(saldoPuntos * valorCanje * 100) / 100
  const topePesosMon = cfgMon ? topeCanjePesos(diferencia > 0 ? diferencia : 0, cfgMon) : 0
  const maxCanjePesos = Math.min(saldoPesosMon, topePesosMon)
  const puedeUsarPuntos = !!cfgMon && saldoPuntos >= cfgMon.min_puntos_canje && maxCanjePesos >= 0.01
  const pagoPuntos = Math.min(parseFloat(puntosTexto) || 0, maxCanjePesos)
  const puntosUsados = (cfgMon && pagoPuntos > 0) ? Math.round((pagoPuntos / cfgMon.valor_punto) * 100) / 100 : 0

  // ── Derivados del saldo a favor por cambio (1:1 con pesos) ──────────────────
  const saldoCambioDisponible = saldoCambio?.saldo ?? 0
  const maxSaldoCambio = Math.max(0, Math.min(saldoCambioDisponible, diferencia > 0 ? diferencia : 0))
  const puedeUsarSaldoCambio = saldoCambioDisponible >= 0.01
  const pagoSaldoCambio = Math.min(parseFloat(saldoTexto) || 0, maxSaldoCambio)

  const totalPagado = useMemo(() => {
    const e = parseFloat(pagoEfectivo) || 0
    const t = parseFloat(pagoTransferencia) || 0
    const c = parseFloat(pagoTarjeta) || 0
    return Math.round((e + t + c + pagoPuntos + pagoSaldoCambio) * 100) / 100
  }, [pagoEfectivo, pagoTransferencia, pagoTarjeta, pagoPuntos, pagoSaldoCambio])

  const puedeConfirmar =
    !procesando &&
    lineasDevueltasActivas.length > 0 &&
    (soloDevolucion || nuevos.length > 0) &&
    (!generaSaldo || !!cliente) &&
    (!cobraDiferencia || totalPagado >= diferencia - 0.01)

  async function confirmar() {
    if (!puedeConfirmar || !ventaOrigen || !cajero) return
    setProcesando(true)
    setErrorProceso(null)
    try {
      const cambio = await procesarCambioAPI({
        venta_origen_folio: ventaOrigen.folio,
        cajero: cajero.nombre,
        turno_id: cajero.turno_id,
        caja_id: cajero.caja_id ?? null,
        caja_name: cajero.caja_nombre ?? null,
        customer_id: cliente?.id ?? null,
        cliente_nombre: cliente?.nombre ?? null,
        lineas_devueltas: lineasDevueltasActivas.map((l) => ({ sku: l.sku, cantidad: l.cantidad })),
        ...(soloDevolucion ? {} : {
          lineas_nuevas: nuevos.map((l) => ({
            sku: l.sku, descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precio_unitario,
          })),
        }),
        ...(cobraDiferencia ? {
          pago_efectivo: parseFloat(pagoEfectivo) || 0,
          pago_transferencia: parseFloat(pagoTransferencia) || 0,
          pago_tarjeta: parseFloat(pagoTarjeta) || 0,
          ...(pagoPuntos > 0 ? { pago_puntos: pagoPuntos } : {}),
          ...(pagoSaldoCambio > 0 ? { pago_saldo_cambio: pagoSaldoCambio } : {}),
        } : {}),
      })
      setCambioCompletado(cambio)
    } catch (e) {
      setErrorProceso(e instanceof Error ? e.message : "No se pudo procesar el cambio")
    } finally {
      setProcesando(false)
    }
  }

  // Encabezado del negocio + título del comprobante (config de Formatos → Cambio/Devolución).
  const negocioComprobante = {
    nombre: state.ticketConfig?.encabezado?.nombre ?? "FERREMEX",
    direccion: state.ticketConfig?.encabezado?.direccion ?? "",
    telefono: state.ticketConfig?.encabezado?.telefono ?? "",
    rfc: state.ticketConfig?.encabezado?.rfc ?? "",
  }
  const tituloComprobante = state.ticketConfig?.formatos?.cambio_devolucion?.titulo

  if (cambioCompletado) {
    return (
      <ComprobanteCambio
        cambio={cambioCompletado}
        negocio={negocioComprobante}
        titulo={tituloComprobante}
        onCerrar={() => onCompletado(cambioCompletado)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-orange-600" />
            Devolución o cambio
          </h2>
          <button onClick={onClose} className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 pt-3 text-xs">
          {PASOS.map((p, i) => (
            <div key={p} className={`flex items-center gap-1.5 ${i <= paso ? "text-orange-600 font-semibold" : "text-gray-400"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${i <= paso ? "bg-orange-100" : "bg-gray-100"}`}>
                {i + 1}
              </span>
              {p}
              {i < PASOS.length - 1 && <span className="w-6 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* ── Paso 0: buscar venta original ── */}
          {paso === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Busca el folio de la venta de donde el cliente regresa artículos.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folioQuery}
                  onChange={(e) => setFolioQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarVenta(folioQuery)}
                  placeholder="Folio de la venta (ej. POS-20260711-A1B2)"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  autoFocus
                />
                <button
                  onClick={() => buscarVenta(folioQuery)}
                  disabled={buscando || !folioQuery.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Buscar
                </button>
              </div>
              {errorVenta && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" /> {errorVenta}
                </div>
              )}
            </div>
          )}

          {/* ── Paso 1: elegir devueltos + nuevos ── */}
          {paso === 1 && ventaOrigen && (
            <div className="space-y-6">
              <div className="text-xs text-gray-500">
                Venta <span className="font-mono font-semibold text-gray-700">{ventaOrigen.folio}</span> · {ventaOrigen.cliente_nombre || "Público en general"}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Artículos que regresa</div>
                <div className="space-y-3">
                  {devueltos.map((l) => (
                    <div key={l.sku} className="flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="text-sm leading-none text-gray-900 truncate">{l.descripcion}</div>
                        <div className="text-xs leading-none text-gray-400">{fmt(l.precio_unitario)} c/u · vendidos: {l.max}</div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={l.max}
                        value={l.cantidad}
                        onChange={(e) => cambiarCantidadDevuelta(l.sku, parseInt(e.target.value, 10) || 0)}
                        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloDevolucion}
                  onChange={(e) => {
                    setSoloDevolucion(e.target.checked)
                    if (e.target.checked) {
                      setNuevos([])
                      setSelSkus(new Set()); setSelCantidades({}); selArts.current.clear()
                    }
                  }}
                  className="mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">El cliente no se lleva nada ahora</span>
                  <br />
                  <span className="text-xs text-gray-500">No tenemos (o no quiere) otro artículo. Se acredita el 100% de lo devuelto como saldo a favor para su próxima compra.</span>
                </span>
              </label>

              {!soloDevolucion && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Artículo(s) nuevo(s) que se lleva</div>
                {/* Selector cristal (mismo popup que Ajuste de Inventario): buscador
                    por texto + filtros de taxonomía Dept→Cat→Marca en cascada. */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    autoComplete="off"
                    readOnly
                    placeholder="Buscar y agregar artículos…"
                    onFocus={() => setBuscadorAbierto(true)}
                    onClick={() => setBuscadorAbierto(true)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm cursor-pointer focus:outline-none ${
                      buscadorAbierto ? "border-orange-500 ring-1 ring-orange-400" : "border-gray-300 hover:border-orange-400"
                    }`}
                  />
                  {buscadorAbierto && (
                    <div className="pk-sel-overlay pk-sel-en-modal" onClick={() => setBuscadorAbierto(false)} />
                  )}
                  <SelectorArticulosPopup
                    open={buscadorAbierto}
                    anchorMode="inline"
                    className="pk-sel-en-modal pk-sel-solido"
                    multiSelect
                    seleccionados={selSkus}
                    onToggle={toggleSeleccionNuevo}
                    cantidades={selCantidades}
                    onCantidadChange={cambiarCantidadSel}
                    onConfirmarSeleccion={agregarSeleccionados}
                    onClose={() => setBuscadorAbierto(false)}
                    yaAgregados={new Set()}
                    taxonomy={taxonomia}
                    taxLoading={taxLoading}
                    titulo="Agregar artículo nuevo"
                    agregarTitulo="Agregar al cambio"
                  />
                </div>
                {nuevos.length > 0 && (
                  <div className="space-y-1.5">
                    {nuevos.map((l) => (
                      <div key={l.sku} className="flex items-center gap-3 border border-orange-200 bg-orange-50/50 rounded-lg px-3 py-2">
                        <div className="w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center text-gray-300">
                          {l.thumbnail ? <img src={l.thumbnail} alt="" className="w-full h-full object-cover" /> : <ImageOff size={18} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{l.descripcion}</div>
                          <div className="text-xs text-gray-400">
                            <span className="text-orange-600 font-semibold">{l.sku}</span> · {fmt(l.precio_unitario)} c/u
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={l.cantidad}
                          onChange={(e) => cambiarCantidadNueva(l.sku, parseInt(e.target.value, 10) || 0)}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* ── Paso 2: resumen + cliente + pago ── */}
          {paso === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Valor devuelto</span><span className="font-medium">{fmt(valorDevuelto)}</span></div>
                {!soloDevolucion && (
                  <div className="flex justify-between"><span className="text-gray-500">Valor nuevo</span><span className="font-medium">{fmt(valorNuevo)}</span></div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-gray-100">
                  <span className="font-semibold text-gray-700">{cobraDiferencia ? "Diferencia a cobrar" : generaSaldo ? "Saldo a favor" : "Diferencia"}</span>
                  <span className={`font-bold ${cobraDiferencia ? "text-orange-600" : generaSaldo ? "text-green-600" : "text-gray-700"}`}>
                    {fmt(Math.abs(diferencia))}
                  </span>
                </div>
              </div>

              {/* Cliente (obligatorio si genera saldo a favor). */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Cliente {generaSaldo && <span className="text-red-500">· requerido para el saldo a favor</span>}
                </div>
                <button
                  onClick={() => setSelectorClienteAbierto(true)}
                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left ${
                    generaSaldo && !cliente ? "border-red-300 bg-red-50" : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <UserCircle size={16} className="text-gray-400 shrink-0" />
                  {cliente ? cliente.nombre : "Seleccionar cliente…"}
                </button>
              </div>

              {/* Pago de la diferencia (solo si se cobra). */}
              {cobraDiferencia && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                    Cobro de la diferencia ({fmt(diferencia)})
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Efectivo</label>
                      <input type="text" inputMode="decimal" value={pagoEfectivo} onChange={(e) => setPagoEfectivo(e.target.value)}
                        placeholder="0.00" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Transferencia</label>
                      <input type="text" inputMode="decimal" value={pagoTransferencia} onChange={(e) => setPagoTransferencia(e.target.value)}
                        placeholder="0.00" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Tarjeta</label>
                      <input type="text" inputMode="decimal" value={pagoTarjeta} onChange={(e) => setPagoTarjeta(e.target.value)}
                        placeholder="0.00" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                  </div>
                  {totalPagado < diferencia - 0.01 && (
                    <div className="text-xs text-red-600 mt-1.5">Falta cubrir {fmt(diferencia - totalPagado)}</div>
                  )}

                  {/* Monedero del cliente: puntos aplicables a la diferencia. */}
                  {puedeUsarPuntos && cfgMon && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg bg-amber-100 text-amber-600 shrink-0">
                          <Wallet size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-amber-900">Puntos del cliente</div>
                          <div className="text-xs text-amber-700">{saldoPuntos.toLocaleString("es-MX")} pts · equivalen a {fmt(saldoPesosMon)}</div>
                        </div>
                        {pagoPuntos > 0 ? (
                          <button onClick={() => setPuntosTexto("")}
                            className="inline-flex items-center gap-1 bg-white border border-amber-300 text-amber-700 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100">
                            <RotateCcw size={12} /> Quitar
                          </button>
                        ) : (
                          <button onClick={() => setPuntosTexto(String(Math.round(maxCanjePesos * 100) / 100))}
                            className="inline-flex items-center gap-1 bg-amber-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-amber-600">
                            <Coins size={12} /> Usar puntos
                          </button>
                        )}
                      </div>
                      {pagoPuntos > 0 && (
                        <div className="px-3 pb-2.5 pt-0.5 border-t border-amber-100 bg-amber-50/60">
                          <div className="flex items-center gap-2">
                            <input type="text" inputMode="decimal" value={puntosTexto}
                              onChange={(e) => setPuntosTexto(e.target.value.replace(/[^0-9.]/g, ""))}
                              className="w-24 text-right text-sm font-bold text-gray-900 bg-white border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500" />
                            <span className="text-xs text-amber-700">{puntosUsados.toLocaleString("es-MX", { maximumFractionDigits: 2 })} pts</span>
                            <button onClick={() => setPuntosTexto(String(Math.round(maxCanjePesos * 100) / 100))}
                              className="ml-auto text-xs font-medium text-amber-700 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-100">
                              Usar máximo ({fmt(maxCanjePesos)})
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Saldo a favor por cambio: aplicable a la diferencia. */}
                  {puedeUsarSaldoCambio && (
                    <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 overflow-hidden">
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg bg-teal-100 text-teal-600 shrink-0">
                          <RotateCcw size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-teal-900">Saldo a favor del cliente</div>
                          <div className="text-xs text-teal-700">{fmt(saldoCambioDisponible)} disponibles</div>
                        </div>
                        {pagoSaldoCambio > 0 ? (
                          <button onClick={() => setSaldoTexto("")}
                            className="inline-flex items-center gap-1 bg-white border border-teal-300 text-teal-700 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-100">
                            <RotateCcw size={12} /> Quitar
                          </button>
                        ) : (
                          <button onClick={() => setSaldoTexto(String(Math.round(maxSaldoCambio * 100) / 100))}
                            className="inline-flex items-center gap-1 bg-teal-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-teal-600">
                            <Coins size={12} /> Usar saldo
                          </button>
                        )}
                      </div>
                      {pagoSaldoCambio > 0 && (
                        <div className="px-3 pb-2.5 pt-0.5 border-t border-teal-100 bg-teal-50/60">
                          <div className="flex items-center gap-2">
                            <input type="text" inputMode="decimal" value={saldoTexto}
                              onChange={(e) => setSaldoTexto(e.target.value.replace(/[^0-9.]/g, ""))}
                              className="w-24 text-right text-sm font-bold text-gray-900 bg-white border border-teal-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500" />
                            <button onClick={() => setSaldoTexto(String(Math.round(maxSaldoCambio * 100) / 100))}
                              className="ml-auto text-xs font-medium text-teal-700 border border-teal-300 rounded-lg px-2.5 py-1 hover:bg-teal-100">
                              Usar máximo ({fmt(maxSaldoCambio)})
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {generaSaldo && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
                  <AlertCircle size={14} className="shrink-0 mt-0.5 text-green-600" />
                  No se devuelve efectivo. Se acreditará {fmt(Math.abs(diferencia))} como saldo a favor para la próxima compra de {cliente?.nombre ?? "este cliente"}.
                </div>
              )}

              {errorProceso && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" /> {errorProceso}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => (paso === 0 ? onClose() : setPaso((p) => (p - 1) as typeof paso))}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100"
          >
            {paso === 0 ? "Cancelar" : "Atrás"}
          </button>
          {paso === 1 && (
            <button
              onClick={() => setPaso(2)}
              disabled={!puedeAvanzarPaso1}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40"
            >
              Continuar
            </button>
          )}
          {paso === 2 && (
            <button
              onClick={confirmar}
              disabled={!puedeConfirmar}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {procesando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Confirmar cambio
            </button>
          )}
        </div>
      </div>

      {selectorClienteAbierto && (
        <SelectorClienteModal
          open={selectorClienteAbierto}
          onSelect={(c: ClienteLigero | null) => { setCliente(c); setSelectorClienteAbierto(false) }}
          onClose={() => setSelectorClienteAbierto(false)}
          permitirTodos={false}
        />
      )}
    </div>
  )
}
