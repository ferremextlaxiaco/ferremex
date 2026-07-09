import { useEffect, useRef, useState } from "react"
import { ClipboardList, X, User, Phone, MessageSquare, CalendarClock, Mail, StickyNote, AlertCircle } from "lucide-react"
import { usePOS, efectivoPrecio } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"

/** Datos que el cajero llena antes de cobrar una venta por encargo. */
export interface DatosFichaEncargo {
  cliente_nombre: string
  telefono: string
  motivo: string
  tiempo_entrega: string
  correo?: string
  notas?: string
}

interface FichaEncargoModalProps {
  /** Líneas por encargo de la venta (para mostrar qué se encarga y el total). */
  onCancelar: () => void
  /** Confirma la ficha; el cobro continúa con estos datos adjuntos. */
  onConfirmar: (datos: DatosFichaEncargo) => void
}

/**
 * Ficha de encargo — formulario obligatorio previo al cobro de una venta sobre
 * pedido. Se inyecta como GATE en ModalCobro: al confirmar el cobro, si hay
 * líneas por encargo, primero se abre esta ficha; al confirmarla, la venta se
 * registra con la ficha adjunta (`encargo_ficha` en el body). El anticipo NO se
 * captura aquí: lo deriva el backend de lo que el cajero cobre en el modal.
 *
 * Obligatorios: nombre, teléfono, tiempo de entrega, motivo (decisión del
 * usuario). Correo y notas son opcionales. Si hay cliente activo, precargamos su
 * nombre/teléfono para no re-teclear (editable).
 */
export function FichaEncargoModal({ onCancelar, onConfirmar }: FichaEncargoModalProps) {
  const { state } = usePOS()

  // Líneas por encargo (para el resumen visual y el total).
  const lineasEncargo = state.items.filter((i) => i.esEncargo)
  const totalEncargo = lineasEncargo.reduce((s, i) => s + efectivoPrecio(i) * i.cantidad, 0)

  // Precarga desde el cliente activo si lo hay (el tipo Cliente no tiene correo).
  const cli = state.clienteActivo
  const [nombre, setNombre] = useState(cli?.nombre ?? "")
  const [telefono, setTelefono] = useState(cli?.telefono ?? "")
  const [motivo, setMotivo] = useState("")
  const [tiempoEntrega, setTiempoEntrega] = useState("")
  const [correo, setCorreo] = useState("")
  const [notas, setNotas] = useState("")
  const [tocado, setTocado] = useState(false)
  const nombreRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nombreRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancelar() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancelar])

  const faltaNombre = !nombre.trim()
  const faltaTel = !telefono.trim()
  const faltaTiempo = !tiempoEntrega.trim()
  const faltaMotivo = !motivo.trim()
  const invalido = faltaNombre || faltaTel || faltaTiempo || faltaMotivo

  function confirmar() {
    setTocado(true)
    if (invalido) return
    onConfirmar({
      cliente_nombre: nombre.trim(),
      telefono: telefono.trim(),
      motivo: motivo.trim(),
      tiempo_entrega: tiempoEntrega.trim(),
      correo: correo.trim() || undefined,
      notas: notas.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancelar}>
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500"
        onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 p-0 inline-flex items-center justify-center rounded-xl bg-orange-100 text-orange-600 shrink-0">
              <ClipboardList size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Ficha de encargo</h2>
              <p className="text-xs text-gray-500">Datos del cliente para el pedido especial</p>
            </div>
          </div>
          <button onClick={onCancelar}
            className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          {/* Resumen de lo que se encarga */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Se encarga</span>
              <span className="text-sm font-bold text-orange-700">{fmt(totalEncargo)}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {lineasEncargo.map((i) => (
                <li key={i.sku} className="flex items-center justify-between text-sm text-gray-700">
                  <span className="truncate pr-2">{i.descripcion} <span className="text-gray-400">× {i.cantidad}</span></span>
                  {i.proveedor && <span className="text-[11px] text-gray-400 shrink-0">{i.proveedor}</span>}
                </li>
              ))}
            </ul>
          </div>

          {/* Nombre + teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Nombre del cliente / institución" icon={User} requerido error={tocado && faltaNombre}>
              <input ref={nombreRef} value={nombre} onChange={(e) => setNombre(e.target.value)}
                className={inputCls(tocado && faltaNombre)} placeholder="Ej. Escuela Benito Juárez" />
            </Campo>
            <Campo label="Teléfono" icon={Phone} requerido error={tocado && faltaTel}>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel"
                className={inputCls(tocado && faltaTel)} placeholder="953 000 0000" />
            </Campo>
          </div>

          {/* Tiempo de entrega */}
          <Campo label="Tiempo estimado de entrega" icon={CalendarClock} requerido error={tocado && faltaTiempo}>
            <input value={tiempoEntrega} onChange={(e) => setTiempoEntrega(e.target.value)}
              className={inputCls(tocado && faltaTiempo)} placeholder="Ej. 3 a 5 días hábiles" />
          </Campo>

          {/* Motivo */}
          <Campo label="Motivo del encargo" icon={MessageSquare} requerido error={tocado && faltaMotivo}>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
              className={inputCls(tocado && faltaMotivo)} placeholder="Ej. Producto agotado, se pide bajo demanda" />
          </Campo>

          {/* Opcionales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Correo (opcional)" icon={Mail}>
              <input value={correo} onChange={(e) => setCorreo(e.target.value)} inputMode="email"
                className={inputCls(false)} placeholder="correo@ejemplo.com" />
            </Campo>
            <Campo label="Notas adicionales (opcional)" icon={StickyNote}>
              <input value={notas} onChange={(e) => setNotas(e.target.value)}
                className={inputCls(false)} placeholder="Color, medida, referencia…" />
            </Campo>
          </div>

          {tocado && invalido && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              Completa los campos obligatorios (marcados con *) para continuar con el cobro.
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancelar}
              className="flex-1 inline-flex items-center justify-center bg-white border border-gray-300 text-gray-700 px-4 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={confirmar}
              className="flex-[2] inline-flex items-center justify-center gap-2 bg-orange-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-orange-700">
              Continuar al cobro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function inputCls(error: boolean): string {
  return `w-full text-sm text-gray-900 bg-white border rounded-lg px-3 py-2.5 focus:outline-none ${
    error ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-orange-500"
  }`
}

interface CampoProps {
  label: string
  icon: typeof User
  requerido?: boolean
  error?: boolean
  children: React.ReactNode
}
function Campo({ label, icon: Icon, requerido, children }: CampoProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
        <Icon size={14} className="text-gray-400" />
        {label}{requerido && <span className="text-orange-500">*</span>}
      </span>
      {children}
    </label>
  )
}
