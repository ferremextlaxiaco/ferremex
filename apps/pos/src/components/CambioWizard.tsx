import { useEffect, useMemo, useState } from "react"
import { X, Search, ArrowRightLeft, Check, AlertCircle, Loader2, UserCircle } from "lucide-react"
import {
  obtenerVenta, buscarProductos, procesarCambioAPI, obtenerSaldoCambioAPI,
  type VentaResponse, type ProductoPOS, type Cambio,
} from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"
import SelectorClienteModal from "./SelectorClienteModal"

interface ClienteLigero { id: string; nombre: string }

interface CambioWizardProps {
  onClose: () => void
  onCompletado: (cambio: Cambio) => void
  /** Folio a precargar (viene del drawer de SalesHistory, salta el paso 1). */
  folioInicial?: string | null
}

type LineaDevuelta = { sku: string; descripcion: string; cantidad: number; max: number; precio_unitario: number }
type LineaNueva = { sku: string; descripcion: string; cantidad: number; precio_unitario: number }

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
  const [nuevoQuery, setNuevoQuery] = useState("")
  const [resultadosNuevo, setResultadosNuevo] = useState<ProductoPOS[]>([])
  const [buscandoNuevo, setBuscandoNuevo] = useState(false)
  const [nuevos, setNuevos] = useState<LineaNueva[]>([])

  const [cliente, setCliente] = useState<ClienteLigero | null>(null)
  const [selectorClienteAbierto, setSelectorClienteAbierto] = useState(false)
  const [pagoEfectivo, setPagoEfectivo] = useState("")
  const [pagoTransferencia, setPagoTransferencia] = useState("")
  const [pagoTarjeta, setPagoTarjeta] = useState("")
  const [procesando, setProcesando] = useState(false)
  const [errorProceso, setErrorProceso] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Precarga automática si viene folio (desde SalesHistory).
  useEffect(() => {
    if (folioInicial) buscarVenta(folioInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioInicial])

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

  async function buscarNuevo() {
    const q = nuevoQuery.trim()
    if (!q) { setResultadosNuevo([]); return }
    setBuscandoNuevo(true)
    try {
      const r = await buscarProductos({ q })
      setResultadosNuevo(r)
    } catch {
      setResultadosNuevo([])
    } finally {
      setBuscandoNuevo(false)
    }
  }

  function agregarNuevo(p: ProductoPOS) {
    setNuevos((prev) => {
      const existe = prev.find((l) => l.sku === p.sku)
      if (existe) {
        return prev.map((l) => (l.sku === p.sku ? { ...l, cantidad: l.cantidad + 1 } : l))
      }
      return [...prev, { sku: p.sku, descripcion: p.descripcion, cantidad: 1, precio_unitario: p.precio }]
    })
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

  const totalPagado = useMemo(() => {
    const e = parseFloat(pagoEfectivo) || 0
    const t = parseFloat(pagoTransferencia) || 0
    const c = parseFloat(pagoTarjeta) || 0
    return Math.round((e + t + c) * 100) / 100
  }, [pagoEfectivo, pagoTransferencia, pagoTarjeta])

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
        } : {}),
      })
      onCompletado(cambio)
    } catch (e) {
      setErrorProceso(e instanceof Error ? e.message : "No se pudo procesar el cambio")
    } finally {
      setProcesando(false)
    }
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
            Cambio de artículo
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
            <div className="space-y-5">
              <div className="text-xs text-gray-500">
                Venta <span className="font-mono font-semibold text-gray-700">{ventaOrigen.folio}</span> · {ventaOrigen.cliente_nombre || "Público en general"}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Artículos que regresa</div>
                <div className="space-y-1.5">
                  {devueltos.map((l) => (
                    <div key={l.sku} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{l.descripcion}</div>
                        <div className="text-xs text-gray-400">{fmt(l.precio_unitario)} c/u · vendidos: {l.max}</div>
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

              <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloDevolucion}
                  onChange={(e) => {
                    setSoloDevolucion(e.target.checked)
                    if (e.target.checked) setNuevos([])
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
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={nuevoQuery}
                    onChange={(e) => setNuevoQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && buscarNuevo()}
                    placeholder="Buscar por nombre o SKU…"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <button onClick={buscarNuevo} disabled={buscandoNuevo} className="px-3 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
                    {buscandoNuevo ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  </button>
                </div>
                {resultadosNuevo.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100 mb-2">
                    {resultadosNuevo.map((p) => (
                      <button
                        key={p.sku}
                        onClick={() => agregarNuevo(p)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <span className="text-sm text-gray-900 truncate">{p.descripcion}</span>
                        <span className="text-sm font-semibold text-gray-600 shrink-0">{fmt(p.precio)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {nuevos.length > 0 && (
                  <div className="space-y-1.5">
                    {nuevos.map((l) => (
                      <div key={l.sku} className="flex items-center gap-2 border border-orange-200 bg-orange-50/50 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-900 truncate">{l.descripcion}</div>
                          <div className="text-xs text-gray-400">{fmt(l.precio_unitario)} c/u</div>
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
