import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Truck, Search, RefreshCw, Phone, MapPin, X, Printer, CheckCircle2,
  Clock, Ban, Wallet, User, MessageSquare, Package, AlertTriangle,
} from "lucide-react"
import {
  listarEntregas, liquidarEntrega, marcarEntregada, cancelarEntrega, cancelarFleteEntrega,
  type EntregaFicha, type EntregaStatus,
} from "../lib/client"
import { TicketsEntrega } from "./TicketsEntrega"
import ConfirmDialog from "./ConfirmDialog"
import { useToasts } from "../hooks/useToasts"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"
import type { VentaResponse } from "../lib/client"

// ── Metadatos de status (etiqueta, color, icono) ──────────────────────────────
// El status "por_entregar" se lee distinto según la naturaleza: en contra entrega
// falta cobrar ("Por cobrar", ámbar); en una entrega ya pagada solo falta enviar
// ("Por enviar", verde). `statusInfo()` resuelve la etiqueta correcta.
const STATUS: Record<EntregaStatus, { label: string; cls: string; icon: typeof Clock }> = {
  por_entregar: { label: "Por cobrar", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  entregada:    { label: "Cobrada y entregada", cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  cancelada:    { label: "Cancelada", cls: "bg-gray-100 text-gray-500 border-gray-200", icon: Ban },
}
const ORDEN_STATUS: EntregaStatus[] = ["por_entregar", "entregada", "cancelada"]

/** ¿Queda resta por cobrar al entregar? (contra entrega siempre; pagada si parcial). */
function tieneResta(f: EntregaFicha): boolean {
  const resta = f.resta != null ? Number(f.resta) : (Number(f.total) || 0)
  return resta > 0.005
}

/** Etiqueta + color + icono del status, tomando en cuenta pagada y si queda resta. */
function statusInfo(f: EntregaFicha): { label: string; cls: string; icon: typeof Clock } {
  if (f.pagada) {
    if (f.status === "por_entregar") {
      // Pagó completo → "Por enviar" (verde). Abono parcial → "Por cobrar resta" (ámbar).
      return tieneResta(f)
        ? { label: "Por cobrar resta", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock }
        : { label: "Por enviar", cls: "bg-green-50 text-green-700 border-green-200", icon: Truck }
    }
    if (f.status === "entregada") return { label: "Entregada", cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 }
  }
  return STATUS[f.status]
}

/** Chips de naturaleza: todas, contra entrega (por cobrar) o ya pagadas (solo enviar). */
type FiltroNaturaleza = "todas" | "por_cobrar" | "solo_enviar"

/** Días transcurridos desde el cobro/creación de la ficha (antigüedad de la entrega). */
function diasDesde(fechaISO: string): number {
  const ms = Date.now() - new Date(fechaISO).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
/**
 * Semáforo de antigüedad. La escalada de color depende de la naturaleza:
 *   - Contra entrega (pago pendiente): presión de COBRO. Rojo a los 5+ días (hay
 *     dinero sin recuperar), ámbar 2–5d, verde <2d.
 *   - Ya pagada (solo enviar): NO hay dinero en riesgo, solo logística. Tono azul
 *     neutro; a los 5+ días avisa "lleva X días sin enviarse" en ámbar suave, sin
 *     el rojo de deuda que confundiría al cajero.
 */
function semaforo(dias: number, pagada = false): { cls: string; label: string } {
  const etiqueta = dias === 0 ? "hoy" : `${dias} día${dias > 1 ? "s" : ""}`
  if (pagada) {
    if (dias >= 5) return { cls: "text-amber-600 bg-amber-50 border-amber-200", label: etiqueta }
    return { cls: "text-sky-600 bg-sky-50 border-sky-200", label: etiqueta }
  }
  if (dias >= 5) return { cls: "text-red-600 bg-red-50 border-red-200", label: etiqueta }
  if (dias >= 2) return { cls: "text-amber-600 bg-amber-50 border-amber-200", label: etiqueta }
  return { cls: "text-green-600 bg-green-50 border-green-200", label: etiqueta }
}

/** Badge de status reutilizable (resuelve la etiqueta según naturaleza pagada/no). */
function StatusBadge({ ficha }: { ficha: EntregaFicha }) {
  const s = statusInfo(ficha)
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      <Icon size={13} /> {s.label}
    </span>
  )
}

export default function EntregasModule() {
  const { toasts, push } = useToasts()
  const [fichas, setFichas] = useState<EntregaFicha[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState("")
  const [filtroStatus, setFiltroStatus] = useState<EntregaStatus | "todos">("por_entregar")
  // Naturaleza: contra entrega (por cobrar) vs. ya pagada (solo enviar) vs. todas.
  const [filtroNat, setFiltroNat] = useState<FiltroNaturaleza>("todas")
  const [sel, setSel] = useState<EntregaFicha | null>(null)
  const [comprobantes, setComprobantes] = useState<EntregaFicha | null>(null)
  // Folio a abrir automáticamente (llega desde "Consulta de ventas" → "Marcar como
  // pagado" con `?folio=T100`). Se consume una sola vez tras cargar las fichas.
  const [searchParams, setSearchParams] = useSearchParams()
  const folioAbrir = searchParams.get("folio")

  // ¿La ficha casa con el filtro de naturaleza? pagada=solo_enviar, !pagada=por_cobrar.
  function casaNaturaleza(f: EntregaFicha): boolean {
    if (filtroNat === "solo_enviar") return !!f.pagada
    if (filtroNat === "por_cobrar") return !f.pagada
    return true
  }

  async function cargar() {
    setCargando(true)
    try {
      const data = await listarEntregas()
      setFichas(data)
    } catch {
      push("No se pudieron cargar las entregas", "error")
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apertura: si venimos con `?folio=`, tras cargar las fichas abrimos el
  // drawer de esa entrega directamente (prefiere la pendiente si hubiera varias).
  // Precarga el buscador con el folio para que la fila quede visible detrás. Se
  // consume una sola vez (se limpia el query param) para no reabrir al recargar.
  useEffect(() => {
    if (!folioAbrir || cargando || fichas.length === 0) return
    const coincidencias = fichas.filter((f) => f.folio === folioAbrir)
    const ficha = coincidencias.find((f) => f.status === "por_entregar") ?? coincidencias[0]
    if (ficha) {
      setQ(folioAbrir)
      setFiltroStatus("todos")
      setFiltroNat("todas")
      setSel(ficha)
    } else {
      push(`No se encontró una entrega para el folio ${folioAbrir}`, "error")
    }
    // Limpia el folio del URL para que no se reabra al actualizar / navegar atrás.
    searchParams.delete("folio")
    setSearchParams(searchParams, { replace: true })
  }, [folioAbrir, cargando, fichas]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado por naturaleza, por status y por texto (paga/recibe/dirección/folio).
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return fichas.filter((f) => {
      if (!casaNaturaleza(f)) return false
      if (filtroStatus !== "todos" && f.status !== filtroStatus) return false
      if (!t) return true
      return (
        f.paga.nombre.toLowerCase().includes(t) ||
        f.recibe.nombre.toLowerCase().includes(t) ||
        f.direccion.toLowerCase().includes(t) ||
        f.paga.telefono.toLowerCase().includes(t) ||
        f.recibe.telefono.toLowerCase().includes(t) ||
        f.folio.toLowerCase().includes(t)
      )
    })
  }, [fichas, q, filtroStatus, filtroNat]) // eslint-disable-line react-hooks/exhaustive-deps

  // KPIs (sobre el set filtrado por texto, no por status — para ver el desglose).
  // Separa las pendientes en "por cobrar" (contra entrega) y "por enviar" (pagadas).
  const kpis = useMemo(() => {
    const base = fichas.filter((f) => {
      const t = q.trim().toLowerCase()
      if (!t) return true
      return f.paga.nombre.toLowerCase().includes(t) || f.recibe.nombre.toLowerCase().includes(t) ||
        f.direccion.toLowerCase().includes(t) || f.folio.toLowerCase().includes(t)
    })
    const pendientes = base.filter((f) => f.status === "por_entregar")
    const restaDe = (f) => (f.resta != null ? Number(f.resta) : (Number(f.total) || 0))
    // "Por cobrar" = pendientes con resta (contra entrega + pagada parcial).
    // "Por enviar" = pendientes ya pagadas completas (sin resta).
    const conResta = pendientes.filter((f) => restaDe(f) > 0.005)
    const montoPorCobrar = conResta.reduce((s, f) => s + restaDe(f), 0)
    return {
      porCobrar: conResta.length,
      porEnviar: pendientes.filter((f) => restaDe(f) <= 0.005).length,
      entregadas: base.filter((f) => f.status === "entregada").length,
      montoPorCobrar,
    }
  }, [fichas, q])

  // Actualiza una ficha en el estado local tras una mutación (sin recargar todo).
  function reemplazar(f: EntregaFicha) {
    setFichas((prev) => prev.map((x) => (x.id === f.id ? f : x)))
    if (sel?.id === f.id) setSel(f)
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Encabezado */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <Truck size={19} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Entregas a domicilio</h1>
              <p className="text-xs text-gray-500">Por cobrar (contra entrega) y ya pagadas (solo enviar)</p>
            </div>
          </div>
          <button onClick={cargar}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Por cobrar" value={String(kpis.porCobrar)} icon={Clock} tone="amber" />
          <Kpi label="Por enviar (pagadas)" value={String(kpis.porEnviar)} icon={Truck} tone="green" />
          <Kpi label="Entregadas" value={String(kpis.entregadas)} icon={CheckCircle2} tone="green" />
          <Kpi label="Monto por cobrar" value={fmt(kpis.montoPorCobrar)} icon={Wallet} tone="orange" />
        </div>

        {/* Filtros: naturaleza + status + búsqueda */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por quién paga, recibe, dirección o folio…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <FiltroChip activo={filtroNat === "todas"} onClick={() => setFiltroNat("todas")}>Todas</FiltroChip>
            <FiltroChip activo={filtroNat === "por_cobrar"} onClick={() => setFiltroNat("por_cobrar")}>Por cobrar</FiltroChip>
            <FiltroChip activo={filtroNat === "solo_enviar"} onClick={() => setFiltroNat("solo_enviar")}>Solo enviar</FiltroChip>
          </div>
        </div>
        {/* Segunda fila: filtro por status */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-xs text-gray-400 mr-1">Estado:</span>
          <FiltroChip activo={filtroStatus === "todos"} onClick={() => setFiltroStatus("todos")}>Todos</FiltroChip>
          {ORDEN_STATUS.map((s) => (
            <FiltroChip key={s} activo={filtroStatus === s} onClick={() => setFiltroStatus(s)}>
              {s === "por_entregar" ? "Pendientes" : STATUS[s].label}
            </FiltroChip>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {cargando ? (
          <div className="text-center text-gray-400 py-16 text-sm">Cargando entregas…</div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="w-14 h-14 p-0 inline-flex items-center justify-center rounded-2xl bg-gray-100 text-gray-300 mb-3">
              <Truck size={28} />
            </span>
            <p className="text-sm font-medium text-gray-500">No hay entregas con estos filtros</p>
            <p className="text-xs text-gray-400 mt-1">Se crean al elegir "Pagar y enviar" o "Cobrar contra entrega" en el cobro.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Recibe / Paga</th>
                  <th className="px-4 py-3 font-medium">Dirección</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                  <th className="px-4 py-3 font-medium">Antigüedad</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map((f) => {
                  const dias = diasDesde(f.fecha)
                  const sem = semaforo(dias, f.pagada)
                  return (
                    <tr key={f.id} onClick={() => setSel(f)}
                      className="cursor-pointer hover:bg-orange-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.folio}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.recibe.nombre}</div>
                        {/* Sin resta = ya pagado; con resta = falta cobrar (parcial o total). */}
                        {!tieneResta(f) ? (
                          <div className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Ya pagado
                          </div>
                        ) : f.pagada ? (
                          <div className="text-xs text-amber-600 flex items-center gap-1">
                            <Wallet size={11} /> Abonó {fmt(Number(f.abonado) || 0)} · resta
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 flex items-center gap-1">
                            <Wallet size={11} /> Cobra al entregar
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px] truncate">{f.direccion}</td>
                      {/* Monto = lo que se cobra al entregar (la resta). Verde si nada. */}
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${tieneResta(f) ? "text-orange-600" : "text-green-600"}`}>
                        {fmt(tieneResta(f) ? (f.resta != null ? Number(f.resta) : f.total) : f.total)}
                      </td>
                      <td className="px-4 py-3">
                        {f.status === "por_entregar" ? (
                          <span className={`inline-flex items-center border rounded-full px-2 py-0.5 text-xs font-medium ${sem.cls}`}>{sem.label}</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge ficha={f} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer de detalle */}
      {sel && (
        <EntregaDetalle
          ficha={sel}
          onCerrar={() => setSel(null)}
          onImprimir={() => setComprobantes(sel)}
          onCambiado={reemplazar}
          push={push}
        />
      )}

      {/* Comprobantes imprimibles (cliente + repartidor). Reutiliza TicketsEntrega
          reconstruyendo un VentaResponse mínimo desde la ficha. */}
      {comprobantes && (
        <TicketsEntrega
          venta={ventaDesdeFicha(comprobantes)}
          ficha={comprobantes}
          onCerrar={() => setComprobantes(null)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[800] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className={`px-4 py-2.5 rounded-lg text-sm text-white shadow-lg ${
              t.type === "error" ? "bg-red-600" : t.type === "info" ? "bg-gray-800" : t.type === "warning" ? "bg-amber-600" : "bg-green-600"
            }`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Reconstruye un VentaResponse mínimo desde la ficha para reimprimir tickets. */
function ventaDesdeFicha(f: EntregaFicha): VentaResponse {
  const resta = f.resta != null ? Number(f.resta) : f.total
  return {
    folio: f.folio,
    fecha: f.fecha,
    total: f.total,
    // Lo que cobra el repartidor (la resta). TicketsEntrega prefiere ficha.resta,
    // pero lo dejamos consistente aquí también.
    entrega_total: resta,
    metodo_pago: f.pagada ? "entrega_pagada" : "contra_entrega",
    estado: f.pagada ? "cobrada" : f.status === "entregada" ? "cobrada" : "por_cobrar",
    items: f.articulos.map((a) => ({
      sku: a.sku,
      descripcion: a.descripcion,
      cantidad: a.cantidad,
      precio_unitario: a.precio_unitario,
      subtotal: a.precio_unitario * a.cantidad,
    })),
  } as VentaResponse
}

// ── Drawer de detalle de una ficha ────────────────────────────────────────────
interface DetalleProps {
  ficha: EntregaFicha
  onCerrar: () => void
  onImprimir: () => void
  onCambiado: (f: EntregaFicha) => void
  push: (msg: string, type?: "success" | "error" | "info" | "warning") => void
}
function EntregaDetalle({ ficha, onCerrar, onImprimir, onCambiado, push }: DetalleProps) {
  const { state } = usePOS()
  const [guardando, setGuardando] = useState(false)
  const [metodo, setMetodo] = useState("efectivo")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmCobrar, setConfirmCobrar] = useState(false)
  const [confirmFlete, setConfirmFlete] = useState(false)
  const [motivoFlete, setMotivoFlete] = useState("")
  const cerrada = ficha.status === "entregada" || ficha.status === "cancelada"
  const pagada = !!ficha.pagada
  // Lo que se cobra al entregar (la resta). Contra entrega = total; pagada = total −
  // abono (0 si pagó completo). Decide si al entregar se cobra o solo se confirma.
  const resta = ficha.resta != null ? Number(ficha.resta) : (Number(ficha.total) || 0)
  const abonado = Number(ficha.abonado) || 0
  const hayResta = resta > 0.005
  // Flete (opcional, no cancelado) y flete que se cobra al entregar.
  const flete = ficha.flete && !ficha.flete.cancelado ? ficha.flete : null
  const fletePrecio = flete ? Number(flete.precio) || 0 : 0
  const fleteAlEntregar = !!(flete && flete.cobrar_al_entregar && !flete.cobrado)
  // ¿Hay algo por cobrar al entregar? (resta de material o flete pendiente).
  const cobraAlEntregar = hayResta || fleteAlEntregar

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  // Confirmar la entrega. Decide según la RESTA por cobrar:
  //   - Hay resta (contra entrega, o pagada parcial): cobra la resta (método real) +
  //     movimiento de caja del día si efectivo + marca venta cobrada + entregada.
  //   - Sin resta (pagó todo en tienda): solo marca entregada (sin tocar caja).
  async function cobrarYEntregar() {
    setConfirmCobrar(false)
    setGuardando(true)
    try {
      // Sin nada por cobrar (ni resta ni flete pendiente) → solo marcar entregada.
      // Con resta o flete al entregar → liquidar (cobra resta y/o flete).
      const f = !cobraAlEntregar
        ? await marcarEntregada(ficha.id)
        : await liquidarEntrega(ficha.id, {
            caja_id: state.cajero?.caja_id ?? null,
            caja_name: state.cajero?.caja_nombre ?? null,
            cajero_id: state.cajero?.id,
            cajero_name: state.cajero?.nombre,
            turno_id: state.cajero?.turno_id,
            metodo,
          })
      onCambiado(f)
      push(!cobraAlEntregar ? "Entrega marcada como entregada" : "Entrega cobrada y marcada entregada")
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo completar la entrega", "error")
    } finally {
      setGuardando(false)
    }
  }

  async function cancelarFlete() {
    setConfirmFlete(false)
    setGuardando(true)
    try {
      const f = await cancelarFleteEntrega(ficha.id, motivoFlete.trim() || "Cancelado desde el módulo", {
        caja_id: state.cajero?.caja_id ?? null,
        caja_name: state.cajero?.caja_nombre ?? null,
        cajero_id: state.cajero?.id,
        cajero_name: state.cajero?.nombre,
        turno_id: state.cajero?.turno_id,
      })
      onCambiado(f)
      setMotivoFlete("")
      push("Flete cancelado", "info")
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo cancelar el flete", "error")
    } finally {
      setGuardando(false)
    }
  }

  async function cancelar() {
    setConfirmCancel(false)
    setGuardando(true)
    try {
      const f = await cancelarEntrega(ficha.id, "Cancelada desde módulo Por cobrar")
      onCambiado(f)
      push("Entrega cancelada", "info")
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo cancelar la entrega", "error")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[700] flex justify-end bg-black/40" onClick={onCerrar}>
      <div className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-xs text-gray-400 mb-1">{ficha.folio}</div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{ficha.recibe.nombre}</h2>
            <div className="mt-2"><StatusBadge ficha={ficha} /></div>
          </div>
          <button onClick={onCerrar} className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Datos de entrega */}
          <Bloque titulo="Entrega">
            <Dato icon={MapPin} label="Dirección" valor={ficha.direccion} />
            <Dato icon={User} label="Recibe" valor={ficha.recibe.nombre} />
            <Dato icon={Phone} label="Tel. recibe" valor={ficha.recibe.telefono} />
            {ficha.comentarios && <Dato icon={MessageSquare} label="Referencias" valor={ficha.comentarios} />}
          </Bloque>

          {/* En contra entrega el que recibe es el mismo que paga (se cobra al
              entregar); en la pagada ya se pagó en caja. En ambos casos basta con
              los datos de "Recibe" — no hay un bloque "Quién paga" separado. */}

          {/* Artículos */}
          <Bloque titulo="Artículos">
            <ul className="flex flex-col gap-1.5">
              {ficha.articulos.map((a, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{a.descripcion} <span className="text-gray-400">× {a.cantidad}</span></span>
                  <span className="text-gray-500 tabular-nums">{fmt(a.precio_unitario * a.cantidad)}</span>
                </li>
              ))}
            </ul>
          </Bloque>

          {/* Monto. Sin resta = ya pagado (verde). Con resta = total / abono / resta. */}
          <Bloque titulo={hayResta ? "Cobro" : "Pago"}>
            {pagada && abonado > 0.005 && hayResta ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Total de la venta</span><span className="tabular-nums">{fmt(ficha.total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-green-700">
                  <span>Abonado en tienda</span><span className="tabular-nums font-semibold">{fmt(abonado)}</span>
                </div>
                <div className="border-t border-gray-200 my-0.5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Resta a cobrar al entregar</span>
                  <span className="text-lg font-black tabular-nums text-orange-600">{fmt(resta)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{hayResta ? "Total a cobrar" : "Ya pagado en tienda"}</span>
                <span className={`text-lg font-black tabular-nums ${hayResta ? "text-orange-600" : "text-green-600"}`}>{fmt(ficha.total)}</span>
              </div>
            )}
            {ficha.pago && (
              <p className="text-[11px] text-green-700 mt-2">
                Cobrado el {new Date(ficha.pago.fecha).toLocaleString("es-MX")} — {ficha.pago.metodo} · {fmt(ficha.pago.monto)}
              </p>
            )}

            {/* Cambio a llevar (si hay algo por cobrar y se capturó con cuánto paga).
                El cambio se calcula contra el total a cobrar = resta + flete al entregar,
                igual que el ticket del repartidor. */}
            {cobraAlEntregar && ficha.paga_con != null && ficha.paga_con > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                <span className="text-xs text-gray-500">Paga con {fmt(ficha.paga_con)} → cambio</span>
                <span className="text-sm font-bold tabular-nums text-green-700">
                  {fmt(Math.max(0, ficha.paga_con - resta - (fleteAlEntregar ? fletePrecio : 0)))}
                </span>
              </div>
            )}

            {/* Selector de método de cobro (resta y/o flete): si hay algo por cobrar. */}
            {cobraAlEntregar && ficha.status === "por_entregar" && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Método de cobro al entregar</label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
                  className="mt-1.5 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                  En efectivo entra al corte de <strong>hoy</strong>.
                </p>
              </div>
            )}
          </Bloque>

          {/* Flete (si la entrega tiene servicio de flete). */}
          {ficha.flete && (
            <Bloque titulo="Flete">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${ficha.flete.cancelado ? "text-gray-400 line-through" : "text-gray-700"}`}>
                  Servicio de flete
                </span>
                <span className={`text-lg font-black tabular-nums ${ficha.flete.cancelado ? "text-gray-400 line-through" : "text-orange-600"}`}>
                  {fmt(Number(ficha.flete.precio) || 0)}
                </span>
              </div>
              <p className="text-[11px] mt-1.5 leading-snug">
                {ficha.flete.cancelado ? (
                  <span className="text-red-600">Cancelado{ficha.flete.motivo_cancelacion ? ` — ${ficha.flete.motivo_cancelacion}` : ""}</span>
                ) : ficha.flete.cobrado ? (
                  <span className="text-green-700">Cobrado ({ficha.flete.metodo_tienda ?? "efectivo"})</span>
                ) : ficha.flete.cobrar_al_entregar ? (
                  <span className="text-amber-600">Se cobra al entregar (junto con la resta)</span>
                ) : (
                  <span className="text-gray-500">Por cobrar</span>
                )}
              </p>
              {/* Cancelar flete: solo si no está cancelado y la entrega no está cerrada. */}
              {!ficha.flete.cancelado && !cerrada && (
                <button onClick={() => setConfirmFlete(true)} disabled={guardando}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-40">
                  <Ban size={13} /> Cancelar flete
                </button>
              )}
            </Bloque>
          )}

          {/* Acciones */}
          {!cerrada && (
            <Bloque titulo="Acciones">
              <div className="flex flex-col gap-2">
                <BotonStatus
                  icon={CheckCircle2}
                  onClick={() => setConfirmCobrar(true)}
                  disabled={guardando}
                  label={!cobraAlEntregar
                    ? "Marcar como entregada"
                    : `Cobrar ${fmt(resta + (fleteAlEntregar ? fletePrecio : 0))} y entregar`}
                  tono="green" />
                <BotonStatus icon={Ban} onClick={() => setConfirmCancel(true)} disabled={guardando}
                  label="Cancelar entrega" tono="red" />
              </div>
              <div className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-400 leading-snug">
                <AlertTriangle size={13} className="text-amber-500 mt-px shrink-0" />
                <span>
                  Cancelar solo cierra la ficha. Si el material NO se entregó y quieres
                  reintegrar el inventario, cancela la venta {ficha.folio} desde
                  Consulta de ventas.
                </span>
              </div>
            </Bloque>
          )}
        </div>

        {/* Footer acciones */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={onImprimir}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Printer size={16} /> Reimprimir comprobantes
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCobrar}
        title={!cobraAlEntregar ? "Marcar como entregada" : "Cobrar y entregar"}
        message={!cobraAlEntregar
          ? `La venta ${ficha.folio} ya está pagada. Se marcará la entrega como entregada. No se cobra nada. ¿Continuar?`
          : `Se cobrará ${hayResta ? `la resta ${fmt(resta)}` : ""}${hayResta && fleteAlEntregar ? " + " : ""}${fleteAlEntregar ? `flete ${fmt(fletePrecio)}` : ""} (${metodo}) y la entrega se marcará como entregada. ${metodo === "efectivo" ? "El efectivo entrará al corte de hoy." : "El pago se registrará sin tocar el cajón."} ¿Continuar?`}
        confirmLabel={!cobraAlEntregar ? "Marcar entregada" : "Cobrar y entregar"}
        onConfirm={cobrarYEntregar}
        onClose={() => setConfirmCobrar(false)}
      />

      <ConfirmDialog
        open={confirmFlete}
        title="Cancelar flete"
        message={`¿Cancelar el flete de ${fmt(Number(ficha.flete?.precio) || 0)}? ${ficha.flete?.cobrado && !ficha.flete?.cobrar_al_entregar ? "Como ya se cobró en tienda, se registrará una reversa en la caja de hoy." : "Aún no se cobraba, así que no toca la caja."}`}
        confirmLabel="Sí, cancelar flete"
        danger
        onConfirm={cancelarFlete}
        onClose={() => setConfirmFlete(false)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar entrega"
        message={`¿Cancelar la entrega ${ficha.folio}? Esto solo cierra la ficha (no reintegra inventario ni cancela la venta).`}
        confirmLabel="Sí, cancelar"
        danger
        onConfirm={cancelar}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  )
}

// ── Sub-componentes de presentación ──────────────────────────────────────────
function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Clock; tone: "amber" | "green" | "gray" | "orange" }) {
  const tones = {
    amber: "text-amber-600 bg-amber-50",
    green: "text-green-600 bg-green-50",
    gray: "text-gray-500 bg-gray-100",
    orange: "text-orange-600 bg-orange-50",
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <span className={`w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 leading-none tabular-nums">{value}</div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{label}</div>
      </div>
    </div>
  )
}
function FiltroChip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
        activo ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
      }`}>
      {children}
    </button>
  )
}
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">{titulo}</div>
      {children}
    </div>
  )
}
function Dato({ icon: Icon, label, valor }: { icon: typeof User; label: string; valor: string }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      <Icon size={14} className="text-gray-400 mt-0.5 shrink-0" />
      <span className="text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-gray-800 flex-1 break-words">{valor}</span>
    </div>
  )
}
function BotonStatus({ icon: Icon, label, onClick, disabled, tono = "green" }: {
  icon: typeof Clock; label: string; onClick: () => void; disabled?: boolean; tono?: "green" | "red"
}) {
  const tones = {
    green: "border-green-200 text-green-700 hover:bg-green-50",
    red: "border-red-200 text-red-600 hover:bg-red-50",
  }
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full inline-flex items-center gap-2 border rounded-lg px-4 py-2.5 text-sm font-medium bg-white disabled:opacity-40 ${tones[tono]}`}>
      <Icon size={16} /> {label}
    </button>
  )
}
