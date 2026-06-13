import { useEffect, useRef, useState } from "react"
import { UserCircle, ChevronDown, Check } from "lucide-react"
import { obtenerUsuarios } from "../lib/client"
import { usePOS } from "../lib/pos-store"

/**
 * Selector del VENDEDOR de la venta actual. Por defecto el vendedor es el cajero
 * logueado, pero cuando otra persona atiende en esta caja (p. ej. el encargado),
 * el cajero puede atribuirle la venta sin cambiar de sesión ni de caja.
 *
 * Es solo atribución (reportes/comisiones); el corte agrupa por CAJA, no por
 * vendedor. El valor se guarda en pos-store (state.vendedorVenta) y se resetea al
 * terminar la venta (CLEAR) y al cambiar de cajero (SET_CAJERO).
 */
export function SelectorVendedor() {
  const { state, dispatch } = usePOS()
  const [empleados, setEmpleados] = useState<{ id: string; nombre: string; alias?: string }[]>([])
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const us = await obtenerUsuarios()
        if (on) setEmpleados(us.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre, alias: u.alias })))
      } catch { /* sin lista, el vendedor queda como el cajero logueado */ }
    })()
    return () => { on = false }
  }, [])

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [abierto])

  const cajero = state.cajero
  if (!cajero) return null

  // Vendedor efectivo: el manual si existe, si no el cajero logueado.
  const vendedorId = state.vendedorVenta?.id ?? cajero.id
  const vendedorNombre = state.vendedorVenta?.nombre ?? (cajero.alias || cajero.nombre)
  // Distinto del cajero → resaltar para que sea obvio que se reatribuyó.
  const reatribuido = vendedorId !== cajero.id

  function elegir(emp: { id: string; nombre: string } | null) {
    // Elegir al propio cajero = volver al default (null).
    dispatch({ type: "SET_VENDEDOR", vendedor: emp && emp.id !== cajero?.id ? { id: emp.id, nombre: emp.nombre } : null })
    setAbierto(false)
  }

  const label = (e: { nombre: string; alias?: string }) => e.alias?.trim() || e.nombre

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        title="Vendedor de esta venta"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm border transition-colors ${
          reatribuido
            ? "bg-orange-50 border-orange-300 text-orange-700"
            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <UserCircle size={15} className="shrink-0" />
        <span className="max-w-[140px] truncate">Vende: {vendedorNombre}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>

      {abierto && (
        <div className="absolute right-0 mt-1 w-56 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-[400] py-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            ¿Quién hace esta venta?
          </div>
          {empleados.map((e) => {
            const activo = e.id === vendedorId
            const esCajero = e.id === cajero.id
            return (
              <button
                key={e.id}
                onClick={() => elegir(e)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                  activo ? "text-orange-700 font-medium" : "text-gray-700"
                }`}
              >
                <span className="truncate">
                  {label(e)}{esCajero && <span className="text-gray-400 text-xs"> · en sesión</span>}
                </span>
                {activo && <Check size={15} className="shrink-0 text-orange-600" />}
              </button>
            )
          })}
          {empleados.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">Sin empleados.</div>
          )}
        </div>
      )}
    </div>
  )
}
