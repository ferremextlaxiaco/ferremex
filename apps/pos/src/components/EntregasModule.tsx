import { useEffect, useMemo, useState } from "react"
import {
  Truck, Search, RefreshCw, Phone, MapPin, X, Printer, CheckCircle2,
  Clock, Ban, Wallet, User, MessageSquare, Package, AlertTriangle,
} from "lucide-react"
import {
  listarEntregas, liquidarEntrega, cancelarEntrega,
  type EntregaFicha, type EntregaStatus,
} from "../lib/client"
import { TicketsEntrega } from "./TicketsEntrega"
import ConfirmDialog from "./ConfirmDialog"
import { useToasts } from "../hooks/useToasts"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"
import type { VentaResponse } from "../lib/client"

// ── Metadatos de status (etiqueta, color, icono) ──────────────────────────────
const STATUS: Record<EntregaStatus, { label: string; cls: string; icon: typeof Clock }> = {
  por_entregar: { label: "Por cobrar", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  entregada:    { label: "Cobrada y entregada", cls: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  cancelada:    { label: "Cancelada", cls: "bg-gray-100 text-gray-500 border-gray-200", icon: Ban },
}
const ORDEN_STATUS: EntregaStatus[] = ["por_entregar", "entregada", "cancelada"]

/**
 * Días transcurridos desde el cobro/creación de la ficha, para el semáforo de
 * "cuánto lleva sin cobrarse". Colores: verde <2d, ámbar 2–5d, rojo ≥5d.
 */
function diasDesde(fechaISO: string): number {
  const ms = Date.now() - new Date(fechaISO).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
function semaforo(dias: number): { cls: string; label: string } {
  if (dias >= 5) return { cls: "text-red-600 bg-red-50 border-red-200", label: `${dias} días` }
  if (dias >= 2) return { cls: "text-amber-600 bg-amber-50 border-amber-200", label: `${dias} días` }
  return { cls: "text-green-600 bg-green-50 border-green-200", label: dias === 0 ? "hoy" : `${dias} día${dias > 1 ? "s" : ""}` }
}

/** Badge de status reutilizable. */
function StatusBadge({ status }: { status: EntregaStatus }) {
  const s = STATUS[status]
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
  const [sel, setSel] = useState<EntregaFicha | null>(null)
  const [comprobantes, setComprobantes] = useState<EntregaFicha | null>(null)

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

  // Filtrado por texto (paga/recibe/dirección/folio) y por status.
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return fichas.filter((f) => {
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
  }, [fichas, q, filtroStatus])

  // KPIs (sobre el set filtrado por texto, no por status — para ver el desglose).
  const kpis = useMemo(() => {
    const base = fichas.filter((f) => {
      const t = q.trim().toLowerCase()
      if (!t) return true
      return f.paga.nombre.toLowerCase().includes(t) || f.recibe.nombre.toLowerCase().includes(t) ||
        f.direccion.toLowerCase().includes(t) || f.folio.toLowerCase().includes(t)
    })
    const porCobrar = base
      .filter((f) => f.status === "por_entregar")
      .reduce((s, f) => s + (Number(f.total) || 0), 0)
    return {
      porEntregar: base.filter((f) => f.status === "por_entregar").length,
      entregadas: base.filter((f) => f.status === "entregada").length,
      canceladas: base.filter((f) => f.status === "cancelada").length,
      porCobrar,
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
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Por cobrar</h1>
              <p className="text-xs text-gray-500">Ventas contra entrega (a domicilio, pago diferido)</p>
            </div>
          </div>
          <button onClick={cargar}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Por cobrar" value={String(kpis.porEntregar)} icon={Clock} tone="amber" />
          <Kpi label="Cobradas" value={String(kpis.entregadas)} icon={CheckCircle2} tone="green" />
          <Kpi label="Canceladas" value={String(kpis.canceladas)} icon={Ban} tone="gray" />
          <Kpi label="Monto por cobrar" value={fmt(kpis.porCobrar)} icon={Wallet} tone="orange" />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por quién paga, recibe, dirección o folio…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <FiltroChip activo={filtroStatus === "todos"} onClick={() => setFiltroStatus("todos")}>Todas</FiltroChip>
            {ORDEN_STATUS.map((s) => (
              <FiltroChip key={s} activo={filtroStatus === s} onClick={() => setFiltroStatus(s)}>
                {STATUS[s].label}
              </FiltroChip>
            ))}
          </div>
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
            <p className="text-sm font-medium text-gray-500">No hay entregas {filtroStatus !== "todos" ? `en "${STATUS[filtroStatus as EntregaStatus].label}"` : ""}</p>
            <p className="text-xs text-gray-400 mt-1">Se crean al cobrar una venta con el método "Contra entrega".</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Paga / Recibe</th>
                  <th className="px-4 py-3 font-medium">Dirección</th>
                  <th className="px-4 py-3 font-medium text-right">A cobrar</th>
                  <th className="px-4 py-3 font-medium">Antigüedad</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map((f) => {
                  const dias = diasDesde(f.fecha)
                  const sem = semaforo(dias)
                  return (
                    <tr key={f.id} onClick={() => setSel(f)}
                      className="cursor-pointer hover:bg-orange-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.folio}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.paga.nombre}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <User size={11} /> Recibe: {f.recibe.nombre}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[220px] truncate">{f.direccion}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-orange-600">{fmt(f.total)}</td>
                      <td className="px-4 py-3">
                        {f.status === "por_entregar" ? (
                          <span className={`inline-flex items-center border rounded-full px-2 py-0.5 text-xs font-medium ${sem.cls}`}>{sem.label}</span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
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
  return {
    folio: f.folio,
    fecha: f.fecha,
    total: f.total,
    entrega_total: f.total,
    metodo_pago: "contra_entrega",
    estado: f.status === "entregada" ? "cobrada" : "por_cobrar",
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
  const cerrada = ficha.status === "entregada" || ficha.status === "cancelada"

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  // Cobrar y entregar: registra el pago (con el método real), crea el movimiento
  // de caja del día si es efectivo, marca la venta cobrada y la entrega entregada.
  async function cobrarYEntregar() {
    setConfirmCobrar(false)
    setGuardando(true)
    try {
      const f = await liquidarEntrega(ficha.id, {
        caja_id: state.cajero?.caja_id ?? null,
        caja_name: state.cajero?.caja_nombre ?? null,
        cajero_id: state.cajero?.id,
        cajero_name: state.cajero?.nombre,
        turno_id: state.cajero?.turno_id,
        metodo,
      })
      onCambiado(f)
      push(`Entrega cobrada (${fmt(ficha.total)}) y marcada entregada`)
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo cobrar la entrega", "error")
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
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{ficha.paga.nombre}</h2>
            <div className="mt-2"><StatusBadge status={ficha.status} /></div>
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

          {/* Quién paga (a veces un tercero) */}
          <Bloque titulo="Quién paga">
            <Dato icon={User} label="Nombre" valor={ficha.paga.nombre} />
            <Dato icon={Phone} label="Teléfono" valor={ficha.paga.telefono} />
          </Bloque>

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

          {/* Monto a cobrar */}
          <Bloque titulo="Cobro">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Total a cobrar</span>
              <span className="text-lg font-black tabular-nums text-orange-600">{fmt(ficha.total)}</span>
            </div>
            {ficha.pago && (
              <p className="text-[11px] text-green-700 mt-2">
                Cobrado el {new Date(ficha.pago.fecha).toLocaleString("es-MX")} — {ficha.pago.metodo} · {fmt(ficha.pago.monto)}
              </p>
            )}

            {/* Selector de método real de cobro (solo si sigue por cobrar) */}
            {ficha.status === "por_entregar" && (
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Método de cobro</label>
                <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
                  className="mt-1.5 w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
                  En efectivo entra al corte de <strong>hoy</strong> como "Cobro de entrega".
                </p>
              </div>
            )}
          </Bloque>

          {/* Acciones */}
          {!cerrada && (
            <Bloque titulo="Acciones">
              <div className="flex flex-col gap-2">
                <BotonStatus
                  icon={CheckCircle2}
                  onClick={() => setConfirmCobrar(true)}
                  disabled={guardando}
                  label={`Registrar pago ${fmt(ficha.total)} y entregar`}
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
        title="Registrar pago y entregar"
        message={`Se cobrará ${fmt(ficha.total)} (${metodo}) y la entrega se marcará como entregada. ${metodo === "efectivo" ? "El efectivo entrará al corte de hoy." : "El pago se registrará sin tocar el cajón."} ¿Continuar?`}
        confirmLabel="Cobrar y entregar"
        onConfirm={cobrarYEntregar}
        onClose={() => setConfirmCobrar(false)}
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
