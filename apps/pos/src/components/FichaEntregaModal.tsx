import { useEffect, useRef, useState } from "react"
import { Truck, X, MapPin, User, Phone, Wallet, MessageSquare, AlertCircle, Banknote, Coins } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import { formatMXN as fmt } from "../lib/format"

/** Datos que el cajero llena al registrar una entrega a domicilio. */
export interface DatosFichaEntrega {
  // `true` = la venta ya se pagó en tienda; solo hay que enviarla. En ese caso
  // `paga` va vacío (pagó el cliente en caja). false/omitido = contra entrega.
  pagada?: boolean
  direccion: string
  recibe: { nombre: string; telefono: string }
  paga: { nombre: string; telefono: string }
  comentarios?: string
  // Con cuánto pagará el cliente al recibir (contra entrega) → cambio del repartidor.
  // Opcional; si se deja vacío, el repartidor cobra el monto exacto.
  paga_con?: number
}

interface FichaEntregaModalProps {
  /** Total de la venta. */
  total: number
  /**
   * `true` = envío con pago en tienda (pagada). Oculta "quién paga". Con `abonado`
   * < total, la resta la cobra el repartidor. false/omitido = contra entrega.
   */
  pagada?: boolean
  /** Abono ya capturado en tienda (solo pagada). La resta = total − abonado. */
  abonado?: number
  onCancelar: () => void
  onConfirmar: (datos: DatosFichaEntrega) => void
}

/**
 * Ficha de entrega — formulario previo al registro de una venta a domicilio.
 * Se inyecta como GATE en ModalCobro. Dos naturalezas según `pagada`:
 *
 *  - CONTRA ENTREGA (`pagada` false): la venta se registra y descuenta inventario,
 *    pero NO se cobra hoy. Obligatorio "quién paga" (puede ser un tercero, el
 *    "jefe"; botón para copiarlo de quién recibe). El pago se registra al liquidar.
 *  - YA PAGADA (`pagada` true): el cliente pagó en caja; solo se captura a dónde
 *    va y quién recibe. Sin "quién paga". La venta se cobra hoy normal.
 *
 * Obligatorios siempre: dirección, quién recibe (nombre+tel). Comentarios opcional.
 */
export function FichaEntregaModal({ total, pagada = false, abonado = 0, onCancelar, onConfirmar }: FichaEntregaModalProps) {
  const { state } = usePOS()
  const cli = state.clienteActivo
  // Resta a cobrar al entregar. Pagada = total − abono; contra entrega = total.
  const restaEntrega = pagada
    ? Math.max(0, Math.round((total - abonado) * 100) / 100)
    : total

  const [direccion, setDireccion] = useState("")
  const [recibeNombre, setRecibeNombre] = useState(cli?.nombre ?? "")
  const [recibeTel, setRecibeTel] = useState(cli?.telefono ?? "")
  // "Paga con $" (solo contra entrega): con cuánto pagará al recibir, para calcular
  // el cambio que lleva el repartidor. Texto libre; se saneal a número al confirmar.
  const [pagaCon, setPagaCon] = useState("")
  const [comentarios, setComentarios] = useState("")
  const [tocado, setTocado] = useState(false)
  const dirRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { dirRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancelar() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancelar])

  // Solo se pide dirección + quién recibe (en AMBOS modos). "Quién paga" ya no se
  // captura por separado: en contra entrega el que recibe es el mismo que paga
  // (se copia de "recibe" al confirmar); en la pagada ya se pagó en caja.
  const faltaDir = !direccion.trim()
  const faltaRecibeN = !recibeNombre.trim()
  const faltaRecibeT = !recibeTel.trim()
  const invalido = faltaDir || faltaRecibeN || faltaRecibeT

  // "Paga con": monto parseado y cambio a llevar (cuando hay resta por cobrar). Si
  // el monto es 0/inválido, no se muestra cambio (el repartidor cobra exacto). El
  // cambio se calcula contra la RESTA a cobrar, no el total.
  const pagaConNum = parseFloat(pagaCon.replace(",", "."))
  const pagaConValido = restaEntrega > 0.005 && Number.isFinite(pagaConNum) && pagaConNum > 0
  const cambio = pagaConValido ? Math.round((pagaConNum - restaEntrega) * 100) / 100 : null

  function confirmar() {
    setTocado(true)
    if (invalido) return
    const recibe = { nombre: recibeNombre.trim(), telefono: recibeTel.trim() }
    onConfirmar({
      pagada,
      direccion: direccion.trim(),
      recibe,
      // Ya pagada: sin "quién paga" (pagó el cliente en caja). Contra entrega: el
      // que recibe es el mismo que paga → se copia de "recibe".
      paga: pagada ? { nombre: "", telefono: "" } : recibe,
      comentarios: comentarios.trim() || undefined,
      // Solo contra entrega y si es un monto válido > 0.
      ...(pagaConValido ? { paga_con: pagaConNum } : {}),
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
              <p className="text-xs text-gray-500">
                {!pagada
                  ? "Se cobra al entregar (pago contra entrega)"
                  : restaEntrega <= 0.005
                    ? "Pagada en tienda — solo enviar"
                    : "Abono en tienda — el resto se cobra al entregar"}
              </p>
            </div>
          </div>
          <button onClick={onCancelar}
            className="w-9 h-9 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          {/* Monto. Contra entrega = a cobrar al entregar (naranja). Pagada = ya
              cobrado en tienda (verde: es solo informativo, no se cobra al llegar). */}
          {pagada ? (
            // Envío con pago en tienda. Si el abono cubre el total → "Ya pagado"
            // (verde). Si es parcial → desglose total / abono / resta a cobrar.
            restaEntrega <= 0.005 ? (
              <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-green-700">
                  <Wallet size={16} /> Ya pagado en tienda
                </span>
                <span className="text-lg font-black text-green-700 tabular-nums">{fmt(total)}</span>
              </div>
            ) : (
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Total de la venta</span><span className="tabular-nums">{fmt(total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-green-700">
                  <span className="inline-flex items-center gap-1.5"><Wallet size={14} /> Abonado en tienda</span>
                  <span className="tabular-nums font-semibold">{fmt(abonado)}</span>
                </div>
                <div className="border-t border-orange-200 my-0.5" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-orange-700">Resta a cobrar al entregar</span>
                  <span className="text-lg font-black text-orange-700 tabular-nums">{fmt(restaEntrega)}</span>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange-700">
                <Wallet size={16} /> Monto a cobrar al entregar
              </span>
              <span className="text-lg font-black text-orange-700 tabular-nums">{fmt(total)}</span>
            </div>
          )}

          {/* Paga con / cambio — cuando hay algo por cobrar al entregar (contra
              entrega, o pagada con resta > 0). El repartidor lleva el cambio. */}
          {restaEntrega > 0.005 && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-2">
              <Campo label="¿Con cuánto pagará el resto? (opcional — para el cambio del repartidor)" icon={Banknote}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input value={pagaCon} onChange={(e) => setPagaCon(e.target.value.replace(/[^0-9.,]/g, ""))}
                    inputMode="decimal" className={`${inputCls(false)} pl-7`} placeholder="0.00" />
                </div>
              </Campo>
              {/* Preview del cambio a llevar. Rojo si el monto es menor a la resta. */}
              {pagaConValido && (
                cambio! >= 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-gray-600">
                      <Coins size={15} className="text-green-600" /> Cambio a llevar
                    </span>
                    <span className="font-black tabular-nums text-green-700">{fmt(cambio!)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle size={14} className="shrink-0" />
                    Es menor a la resta ({fmt(restaEntrega)}). Faltarían {fmt(Math.abs(cambio!))}.
                  </div>
                )
              )}
            </div>
          )}

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

          {/* Nota: en contra entrega el que recibe es el mismo que paga, así que no
              se pide "quién paga" por separado (se copia de "recibe" al confirmar). */}
          {!pagada && (
            <p className="text-[11px] text-gray-400 -mt-1 leading-snug flex items-center gap-1.5">
              <Wallet size={13} className="shrink-0 text-gray-400" />
              El cobro se hace a quien recibe al momento de entregar.
            </p>
          )}

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
              className={`flex-[2] inline-flex items-center justify-center gap-2 text-white px-4 py-3 rounded-xl text-sm font-bold ${
                pagada ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"
              }`}>
              <Truck size={17} /> {!pagada ? "Registrar entrega" : restaEntrega <= 0.005 ? "Pagar y enviar" : "Abonar y enviar"}
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
