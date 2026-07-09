import { useEffect, useMemo, useState } from "react"
import {
  ClipboardList, Search, RefreshCw, Phone, CalendarClock, Package, X,
  Printer, CheckCircle2, Truck, Clock, Ban, Wallet, User, MessageSquare, CreditCard,
} from "lucide-react"
import {
  listarEncargos, actualizarStatusEncargo, agregarAbonoEncargo, liquidarEncargo,
  type EncargoFicha, type EncargoStatus,
} from "../lib/client"
import { ComprobanteEncargo } from "./ComprobanteEncargo"
import ConfirmDialog from "./ConfirmDialog"
import { useToasts } from "../hooks/useToasts"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"

// ── Metadatos de status (etiqueta, color, icono, siguiente paso) ──────────────
const STATUS: Record<EncargoStatus, { label: string; cls: string; dot: string; icon: typeof Clock }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", icon: Clock },
  recibido:  { label: "Recibido en tienda", cls: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", icon: Package },
  entregado: { label: "Entregado", cls: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", cls: "bg-gray-100 text-gray-500 border-gray-200", dot: "bg-gray-400", icon: Ban },
}
const ORDEN_STATUS: EncargoStatus[] = ["pendiente", "recibido", "entregado", "cancelado"]

/** Badge de status reutilizable. */
function StatusBadge({ status }: { status: EncargoStatus }) {
  const s = STATUS[status]
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      <Icon size={13} /> {s.label}
    </span>
  )
}

export default function EncargosModule() {
  const { toasts, push } = useToasts()
  const [fichas, setFichas] = useState<EncargoFicha[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState("")
  const [filtroStatus, setFiltroStatus] = useState<EncargoStatus | "todos">("todos")
  const [sel, setSel] = useState<EncargoFicha | null>(null)
  const [comprobante, setComprobante] = useState<EncargoFicha | null>(null)

  async function cargar() {
    setCargando(true)
    try {
      const data = await listarEncargos()
      setFichas(data)
    } catch {
      push("No se pudieron cargar los encargos", "error")
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrado por texto (cliente/teléfono/folio) y por status.
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    return fichas.filter((f) => {
      if (filtroStatus !== "todos" && f.status !== filtroStatus) return false
      if (!t) return true
      return (
        f.cliente_nombre.toLowerCase().includes(t) ||
        f.telefono.toLowerCase().includes(t) ||
        f.folio.toLowerCase().includes(t)
      )
    })
  }, [fichas, q, filtroStatus])

  // KPIs (sobre el set filtrado por texto, no por status — para ver el desglose).
  const kpis = useMemo(() => {
    const base = fichas.filter((f) => {
      const t = q.trim().toLowerCase()
      if (!t) return true
      return f.cliente_nombre.toLowerCase().includes(t) || f.telefono.toLowerCase().includes(t) || f.folio.toLowerCase().includes(t)
    })
    const porPagar = base
      .filter((f) => f.status !== "cancelado")
      .reduce((s, f) => s + (f.resta ?? Math.max(0, f.total - f.anticipo - (f.abonado ?? 0))), 0)
    return {
      pendiente: base.filter((f) => f.status === "pendiente").length,
      recibido: base.filter((f) => f.status === "recibido").length,
      entregado: base.filter((f) => f.status === "entregado").length,
      porPagar,
    }
  }, [fichas, q])

  // Actualiza una ficha en el estado local tras una mutación (sin recargar todo).
  function reemplazar(f: EncargoFicha) {
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
              <ClipboardList size={19} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Encargos</h1>
              <p className="text-xs text-gray-500">Pedidos especiales de clientes (venta sobre pedido)</p>
            </div>
          </div>
          <button onClick={cargar}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Kpi label="Pendientes" value={String(kpis.pendiente)} icon={Clock} tone="amber" />
          <Kpi label="Recibidos" value={String(kpis.recibido)} icon={Package} tone="blue" />
          <Kpi label="Entregados" value={String(kpis.entregado)} icon={CheckCircle2} tone="green" />
          <Kpi label="Por cobrar (resta)" value={fmt(kpis.porPagar)} icon={Wallet} tone="orange" />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cliente, teléfono o folio…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <FiltroChip activo={filtroStatus === "todos"} onClick={() => setFiltroStatus("todos")}>Todos</FiltroChip>
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
          <div className="text-center text-gray-400 py-16 text-sm">Cargando encargos…</div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="w-14 h-14 p-0 inline-flex items-center justify-center rounded-2xl bg-gray-100 text-gray-300 mb-3">
              <ClipboardList size={28} />
            </span>
            <p className="text-sm font-medium text-gray-500">No hay encargos {filtroStatus !== "todos" ? `en "${STATUS[filtroStatus as EncargoStatus].label}"` : ""}</p>
            <p className="text-xs text-gray-400 mt-1">Los encargos se crean al cobrar una venta por encargo.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Entrega</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Resta</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map((f) => {
                  const resta = f.resta ?? Math.max(0, f.total - f.anticipo - (f.abonado ?? 0))
                  return (
                    <tr key={f.id} onClick={() => setSel(f)}
                      className="cursor-pointer hover:bg-orange-50/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{f.folio}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.cliente_nombre}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1"><Phone size={11} /> {f.telefono}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{f.tiempo_entrega || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(f.total)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${resta > 0 ? "text-orange-600" : "text-green-600"}`}>{fmt(resta)}</td>
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
        <EncargoDetalle
          ficha={sel}
          onCerrar={() => setSel(null)}
          onImprimir={() => setComprobante(sel)}
          onCambiado={reemplazar}
          push={push}
        />
      )}

      {/* Comprobante imprimible */}
      {comprobante && (
        <ComprobanteEncargo ficha={comprobante} onCerrar={() => setComprobante(null)} />
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

// ── Drawer de detalle de una ficha ────────────────────────────────────────────
interface DetalleProps {
  ficha: EncargoFicha
  onCerrar: () => void
  onImprimir: () => void
  onCambiado: (f: EncargoFicha) => void
  push: (msg: string, type?: "success" | "error" | "info" | "warning") => void
}
function EncargoDetalle({ ficha, onCerrar, onImprimir, onCambiado, push }: DetalleProps) {
  const { state } = usePOS()
  const [guardando, setGuardando] = useState(false)
  const [abonoTxt, setAbonoTxt] = useState("")
  const [metodoAbono, setMetodoAbono] = useState("efectivo")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmLiquidar, setConfirmLiquidar] = useState(false)
  const resta = ficha.resta ?? Math.max(0, ficha.total - ficha.anticipo - (ficha.abonado ?? 0))

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  async function cambiarStatus(nuevo: EncargoStatus) {
    setGuardando(true)
    try {
      const f = await actualizarStatusEncargo(ficha.id, nuevo)
      onCambiado(f)
      push(`Encargo marcado como "${STATUS[nuevo].label}"`)
    } catch {
      push("No se pudo cambiar el status", "error")
    } finally {
      setGuardando(false)
    }
  }

  async function registrarAbono() {
    const monto = parseFloat(abonoTxt)
    if (!(monto > 0)) { push("Ingresa un monto válido", "error"); return }
    if (monto > resta + 0.01) { push(`El abono excede la resta (${fmt(resta)})`, "error"); return }
    setGuardando(true)
    try {
      const f = await agregarAbonoEncargo(ficha.id, { monto, metodo: metodoAbono })
      onCambiado(f)
      setAbonoTxt("")
      push(`Abono de ${fmt(monto)} registrado`)
    } catch {
      push("No se pudo registrar el abono", "error")
    } finally {
      setGuardando(false)
    }
  }

  // Liquidar y entregar: cobra la resta pendiente (abono + movimiento de caja del
  // día para el corte) y marca entregado, en una sola operación backend.
  async function liquidarYEntregar() {
    setConfirmLiquidar(false)
    setGuardando(true)
    try {
      const f = await liquidarEncargo(ficha.id, {
        caja_id: state.cajero?.caja_id ?? null,
        caja_name: state.cajero?.caja_nombre ?? null,
        cajero_id: state.cajero?.id,
        cajero_name: state.cajero?.nombre,
        turno_id: state.cajero?.turno_id,
        metodo: metodoAbono,
      })
      onCambiado(f)
      push(resta > 0 ? `Encargo liquidado (${fmt(resta)}) y entregado` : "Encargo entregado")
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo liquidar el encargo", "error")
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
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{ficha.cliente_nombre}</h2>
            <div className="mt-2"><StatusBadge status={ficha.status} /></div>
          </div>
          <button onClick={onCerrar} className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Datos de contacto */}
          <Bloque titulo="Datos del cliente">
            <Dato icon={User} label="Cliente" valor={ficha.cliente_nombre} />
            <Dato icon={Phone} label="Teléfono" valor={ficha.telefono} />
            <Dato icon={CalendarClock} label="Entrega estimada" valor={ficha.tiempo_entrega || "—"} />
            {ficha.correo && <Dato icon={MessageSquare} label="Correo" valor={ficha.correo} />}
            {ficha.motivo && <Dato icon={MessageSquare} label="Motivo" valor={ficha.motivo} />}
            {ficha.notas && <Dato icon={MessageSquare} label="Notas" valor={ficha.notas} />}
          </Bloque>

          {/* Artículos */}
          <Bloque titulo="Artículos encargados">
            <ul className="flex flex-col gap-1.5">
              {ficha.articulos.map((a, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{a.descripcion} <span className="text-gray-400">× {a.cantidad}</span></span>
                  <span className="text-gray-500 tabular-nums">{fmt(a.precio_unitario * a.cantidad)}</span>
                </li>
              ))}
            </ul>
          </Bloque>

          {/* Montos */}
          <Bloque titulo="Pagos">
            <FilaMonto label="Total del encargo" valor={fmt(ficha.total)} />
            <FilaMonto label="Anticipo pagado" valor={fmt(ficha.anticipo)} />
            {(ficha.abonado ?? 0) > 0 && <FilaMonto label="Abonos posteriores" valor={fmt(ficha.abonado ?? 0)} />}
            <div className="h-px bg-gray-200 my-1" />
            {ficha.resta_en_cartera ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Resta</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                  <CreditCard size={13} /> En cartera del cliente
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Resta por pagar</span>
                <span className={`text-lg font-black tabular-nums ${resta > 0 ? "text-orange-600" : "text-green-600"}`}>{fmt(resta)}</span>
              </div>
            )}

            {/* Registrar abono parcial (solo si la resta vive en la ficha) */}
            {resta > 0 && !ficha.resta_en_cartera && ficha.status !== "cancelado" && ficha.status !== "entregado" && (
              <div className="mt-3 flex items-center gap-2">
                <input value={abonoTxt} onChange={(e) => setAbonoTxt(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal" placeholder="Abono parcial"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500" />
                <select value={metodoAbono} onChange={(e) => setMetodoAbono(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-500">
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
                <button onClick={registrarAbono} disabled={guardando}
                  className="bg-white border border-orange-300 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-50 disabled:opacity-40">
                  Abonar
                </button>
              </div>
            )}
          </Bloque>

          {/* Cambio de status */}
          {ficha.status !== "cancelado" && ficha.status !== "entregado" && (
            <Bloque titulo="Acciones">
              <div className="flex flex-col gap-2">
                {ficha.status === "pendiente" && (
                  <BotonStatus icon={Package} onClick={() => cambiarStatus("recibido")} disabled={guardando}
                    label="Marcar como recibido en tienda" />
                )}
                {/* Liquidar y entregar: si hay resta en ficha, cobra la resta (con el
                    método elegido arriba) + movimiento de caja del día + entregado.
                    Si la resta está en cartera o es 0, solo marca entregado. */}
                <BotonStatus
                  icon={Truck}
                  onClick={() => (resta > 0 && !ficha.resta_en_cartera ? setConfirmLiquidar(true) : liquidarYEntregar())}
                  disabled={guardando}
                  label={resta > 0 && !ficha.resta_en_cartera ? `Liquidar ${fmt(resta)} y entregar` : "Entregar al cliente"}
                  tono="green" />
                <BotonStatus icon={Ban} onClick={() => setConfirmCancel(true)} disabled={guardando}
                  label="Cancelar encargo" tono="red" />
              </div>
              {resta > 0 && !ficha.resta_en_cartera && (
                <p className="text-[11px] text-gray-400 mt-2 leading-snug">
                  La liquidación cobra la resta como <strong>{metodoAbono}</strong>; en efectivo entra al corte de hoy.
                </p>
              )}
            </Bloque>
          )}
        </div>

        {/* Footer acciones */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button onClick={onImprimir}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Printer size={16} /> Imprimir comprobante
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar encargo"
        message={`¿Cancelar el encargo de ${ficha.cliente_nombre}? El anticipo pagado NO se reembolsa automáticamente.`}
        confirmLabel="Sí, cancelar"
        danger
        onConfirm={() => { setConfirmCancel(false); cambiarStatus("cancelado") }}
        onClose={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={confirmLiquidar}
        title="Liquidar y entregar"
        message={`Se cobrará la resta de ${fmt(resta)} (${metodoAbono}) y el encargo se marcará como entregado. ¿Continuar?`}
        confirmLabel="Liquidar y entregar"
        onConfirm={liquidarYEntregar}
        onClose={() => setConfirmLiquidar(false)}
      />
    </div>
  )
}

// ── Sub-componentes de presentación ──────────────────────────────────────────
function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Clock; tone: "amber" | "blue" | "green" | "orange" }) {
  const tones = {
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
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
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-gray-800 flex-1">{valor}</span>
    </div>
  )
}
function FilaMonto({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 tabular-nums">{valor}</span>
    </div>
  )
}
function BotonStatus({ icon: Icon, label, onClick, disabled, tono = "blue" }: {
  icon: typeof Clock; label: string; onClick: () => void; disabled?: boolean; tono?: "blue" | "green" | "red"
}) {
  const tones = {
    blue: "border-blue-200 text-blue-700 hover:bg-blue-50",
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
