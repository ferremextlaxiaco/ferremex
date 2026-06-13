import { useEffect, useState } from "react"
import { X, Wallet, Check, AlertCircle } from "lucide-react"
import { listarCajasAPI, type CajaAPI } from "../lib/client"
import { usePOS } from "../lib/pos-store"

/**
 * Selector de CAJA física para la sesión actual. Se abre cuando un usuario sin
 * caja asignada intenta cobrar (no puede vender sin caja, porque el corte se
 * agrupa por caja física), o cuando quiere cambiar de caja a media sesión.
 *
 * Al elegir una caja se despacha SET_CAJA: la caja queda activa el resto de la
 * sesión (igual que si la tuviera asignada). NO re-loguea.
 *
 * `obligatorio` (cobro sin caja): el aviso explica que es necesaria para vender.
 * Si false (cambio voluntario): permite cancelar sin elegir.
 */
export function SelectorCajaModal({
  onClose,
  onElegida,
  obligatorio = false,
}: {
  onClose: () => void
  onElegida?: () => void
  obligatorio?: boolean
}) {
  const { state, dispatch } = usePOS()
  const [cajas, setCajas] = useState<CajaAPI[]>([])
  const [cargando, setCargando] = useState(true)
  const cajaActual = state.cajero?.caja_id ?? null

  useEffect(() => {
    let on = true
    ;(async () => {
      try { const c = await listarCajasAPI(); if (on) setCajas(c.filter((x) => x.activa)) }
      catch { /* sin catálogo no hay cajas que ofrecer */ }
      finally { if (on) setCargando(false) }
    })()
    return () => { on = false }
  }, [])

  // Escape siempre cierra (el usuario nunca debe quedar atrapado en el modal).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function elegir(caja: CajaAPI) {
    dispatch({ type: "SET_CAJA", caja_id: caja.id, caja_nombre: caja.nombre })
    onElegida?.()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
        onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Wallet size={18} className="text-orange-600" />
            {obligatorio ? "Selecciona una caja" : "Cambiar de caja"}
          </h2>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {obligatorio ? (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            No tienes una caja asignada. Elige la caja que estás usando para poder registrar la venta. El corte se hará por esa caja.
          </div>
        ) : (
          <p className="text-xs text-gray-500 mb-4">
            La caja que elijas queda activa el resto de tu sesión. Las ventas y el corte se agrupan por esta caja.
          </p>
        )}

        {/* Lista de cajas */}
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {cargando ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">Cargando cajas…</div>
          ) : cajas.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              No hay cajas registradas. Pide a un administrador crear una en Empleados y permisos.
            </div>
          ) : cajas.map((c) => {
            const activa = c.id === cajaActual
            return (
              <button
                key={c.id}
                onClick={() => elegir(c)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 ${
                  activa ? "bg-orange-50/50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <Wallet size={14} className="text-gray-400 shrink-0" /> {c.nombre}
                    {activa && <span className="text-gray-400 text-xs">· en uso</span>}
                  </div>
                  {c.descripcion && <div className="text-xs text-gray-400 truncate">{c.descripcion}</div>}
                </div>
                {activa && <Check size={16} className="shrink-0 text-orange-600" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
