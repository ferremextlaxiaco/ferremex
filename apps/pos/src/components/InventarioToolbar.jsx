import { Search, X, Check } from "lucide-react"

/**
 * Toolbar del módulo de Ajuste de Inventario.
 *
 * El campo de búsqueda es el DISPARADOR del selector cristal (popup con su propio
 * buscador + filtros de taxonomía + selección múltiple): al enfocarlo se abre el
 * popup, que es donde realmente se buscan y eligen los artículos. Por eso aquí ya
 * no hay filtros de taxonomía ni "cargar por lote" (viven en el popup).
 *
 * Presentacional: callbacks por props (onAbrirBuscador, onConfirmar, onLimpiar).
 */
export function InventarioToolbar({
  numCambios,
  hayCambios,
  guardando,
  buscadorAbierto,
  onAbrirBuscador,
  onConfirmar,
  onLimpiar,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <h2 className="text-lg font-semibold text-gray-900 mr-auto">Ajuste de Inventario</h2>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          autoComplete="off"
          readOnly
          placeholder="Buscar y agregar artículos…"
          onFocus={onAbrirBuscador}
          onClick={onAbrirBuscador}
          className={`w-72 border rounded-lg pl-9 pr-3 py-2.5 text-sm cursor-pointer focus:outline-none
            ${buscadorAbierto ? "border-orange-500 ring-1 ring-orange-400" : "border-gray-300 hover:border-orange-400"}`}
        />
      </div>

      <button
        onClick={onConfirmar}
        disabled={guardando || !hayCambios}
        className={`flex items-center gap-1.5 bg-green-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-green-700
          ${guardando || !hayCambios ? "opacity-40 pointer-events-none" : ""}`}
      >
        <Check size={16} /> {guardando ? "Guardando…" : "Confirmar ajuste"}
        {hayCambios && (
          <span className="bg-white text-green-700 rounded-full text-xs font-bold px-1.5 min-w-[20px] text-center">
            {numCambios}
          </span>
        )}
      </button>

      <button
        onClick={onLimpiar}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 px-3 py-2.5"
        title="Vaciar la lista de ajuste"
      >
        <X size={15} /> Limpiar todo
      </button>
    </div>
  )
}
