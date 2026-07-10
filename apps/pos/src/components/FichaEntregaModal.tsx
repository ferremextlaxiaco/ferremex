import { useEffect, useRef, useState } from "react"
import { Truck, X, MapPin, User, Phone, Wallet, MessageSquare, AlertCircle, Copy } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"

/** Datos que el cajero llena al cobrar contra entrega (venta a domicilio). */
export interface DatosFichaEntrega {
  direccion: string
  recibe: { nombre: string; telefono: string }
  paga: { nombre: string; telefono: string }
  comentarios?: string
}

interface FichaEntregaModalProps {
  /** Total de la venta (se cobrará al entregar). */
  total: number
  onCancelar: () => void
  onConfirmar: (datos: DatosFichaEntrega) => void
}

/**
 * Ficha de entrega — formulario previo al registro de una venta CONTRA ENTREGA
 * (a domicilio, pago diferido). Se inyecta como GATE en ModalCobro cuando el
 * cajero elige el método "Contra entrega": la venta se registra y descuenta
 * inventario, pero NO se cobra hoy. El pago se registra al liquidar la entrega.
 *
 * Obligatorios: dirección, quién recibe (nombre+tel), quién paga (nombre+tel).
 * Comentarios/referencias del lugar es opcional pero recomendado. El que paga
 * puede ser un tercero (el "jefe"); botón para copiarlo de quién recibe.
 */
export function FichaEntregaModal({ total, onCancelar, onConfirmar }: FichaEntregaModalProps) {
  const { state } = usePOS()
  const cli = state.clienteActivo

  const [direccion, setDireccion] = useState("")
  const [recibeNombre, setRecibeNombre] = useState(cli?.nombre ?? "")
  const [recibeTel, setRecibeTel] = useState(cli?.telefono ?? "")
  const [pagaNombre, setPagaNombre] = useState("")
  const [pagaTel, setPagaTel] = useState("")
  const [comentarios, setComentarios] = useState("")
  const [tocado, setTocado] = useState(false)
  const dirRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { dirRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancelar() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancelar])

  const faltaDir = !direccion.trim()
  const faltaRecibeN = !recibeNombre.trim()
  const faltaRecibeT = !recibeTel.trim()
  const faltaPagaN = !pagaNombre.trim()
  const faltaPagaT = !pagaTel.trim()
  const invalido = faltaDir || faltaRecibeN || faltaRecibeT || faltaPagaN || faltaPagaT

  function copiarDeRecibe() {
    setPagaNombre(recibeNombre)
    setPagaTel(recibeTel)
  }

  function confirmar() {
    setTocado(true)
    if (invalido) return
    onConfirmar({
      direccion: direccion.trim(),
      recibe: { nombre: recibeNombre.trim(), telefono: recibeTel.trim() },
      paga: { nombre: pagaNombre.trim(), telefono: pagaTel.trim() },
      comentarios: comentarios.trim() || undefined,
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
              <Truck size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Entrega a domicilio</h2>
              <p className="text-xs text-gray-500">Se cobra al entregar (pago contra entrega)</p>
            </div>
          </div>
          <button onClick={onCancelar}
            className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          {/* Monto a cobrar */}
          <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange-700">
              <Wallet size={16} /> Monto a cobrar al entregar
            </span>
            <span className="text-lg font-black text-orange-700 tabular-nums">{fmt(total)}</span>
          </div>

          {/* Dirección */}
          <Campo label="Dirección de entrega" icon={MapPin} requerido error={tocado && faltaDir}>
            <textarea ref={dirRef} value={direccion} onChange={(e) => setDireccion(e.target.value)} rows={2}
              className={inputCls(tocado && faltaDir)} placeholder="Calle, número, colonia, población" />
          </Campo>

          {/* Quién recibe */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quién recibe</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Nombre" icon={User} requerido error={tocado && faltaRecibeN}>
                <input value={recibeNombre} onChange={(e) => setRecibeNombre(e.target.value)}
                  className={inputCls(tocado && faltaRecibeN)} placeholder="Quién recibe el material" />
              </Campo>
              <Campo label="Teléfono" icon={Phone} requerido error={tocado && faltaRecibeT}>
                <input value={recibeTel} onChange={(e) => setRecibeTel(e.target.value)} inputMode="tel"
                  className={inputCls(tocado && faltaRecibeT)} placeholder="953 000 0000" />
              </Campo>
            </div>
          </div>

          {/* Quién paga */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quién paga</div>
              <button type="button" onClick={copiarDeRecibe}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 border border-orange-200 rounded-lg px-2.5 py-1 hover:bg-orange-50">
                <Copy size={12} /> Es el mismo
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Nombre" icon={User} requerido error={tocado && faltaPagaN}>
                <input value={pagaNombre} onChange={(e) => setPagaNombre(e.target.value)}
                  className={inputCls(tocado && faltaPagaN)} placeholder="Quién liquidará (puede ser otra persona)" />
              </Campo>
              <Campo label="Teléfono" icon={Phone} requerido error={tocado && faltaPagaT}>
                <input value={pagaTel} onChange={(e) => setPagaTel(e.target.value)} inputMode="tel"
                  className={inputCls(tocado && faltaPagaT)} placeholder="953 000 0000" />
              </Campo>
            </div>
          </div>

          {/* Comentarios */}
          <Campo label="Comentarios / referencias del lugar (opcional)" icon={MessageSquare}>
            <textarea value={comentarios} onChange={(e) => setComentarios(e.target.value)} rows={2}
              className={inputCls(false)} placeholder="Ej. Casa azul junto a la tienda, portón negro, entre calles…" />
          </Campo>

          {tocado && invalido && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              Completa los campos obligatorios (marcados con *) para registrar la entrega.
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
              <Truck size={17} /> Registrar entrega
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

function Campo({ label, icon: Icon, requerido, children }: {
  label: string; icon: typeof User; requerido?: boolean; error?: boolean; children: React.ReactNode
}) {
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
