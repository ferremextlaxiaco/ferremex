import { useEffect, useRef, useState } from "react"
import { X, PackagePlus } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import { UNIDADES_SAT } from "../lib/unidades-sat"

/**
 * Alta rápida de un artículo "libre": algo que no está en el catálogo (una caja
 * de cartón, un servicio puntual) y que el cajero necesita cobrar una sola vez.
 * NO crea nada en Medusa — solo agrega una línea al carrito con un SKU generado
 * (LIBRE-<timestamp>) y `libre: true` para que se distinga del catálogo real.
 */
export function ArticuloLibreModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = usePOS()
  const [descripcion, setDescripcion] = useState("")
  const [precio, setPrecio] = useState("")
  const [cantidad, setCantidad] = useState("1")
  const [unidad, setUnidad] = useState("H87")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const precioNum = parseFloat(precio.replace(",", "."))
  const cantidadNum = parseInt(cantidad, 10)
  const valido = descripcion.trim().length > 0 && precioNum > 0 && cantidadNum >= 1

  function agregar() {
    if (!valido) return
    const sku = `LIBRE-${Date.now()}`
    dispatch({
      type: "ADD_ITEM",
      item: {
        sku,
        descripcion: descripcion.trim(),
        precio: precioNum,
        existencia: 9999,
        impuesto: true,
        libre: true,
        unidadVenta: unidad,
      },
    })
    // ADD_ITEM ya deja cantidad=1; SET_CANTIDAD la ajusta al valor capturado.
    if (cantidadNum > 1) dispatch({ type: "SET_CANTIDAD", sku, cantidad: cantidadNum })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <PackagePlus size={18} className="text-orange-600" />
            Artículo libre
          </h2>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Para vender algo que no está en el catálogo (ej. una caja de cartón). No se guarda como artículo — solo se agrega a esta venta.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <input
              ref={inputRef}
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Caja de cartón grande"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio (con IVA)</label>
              <input
                type="text"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                step={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidad</label>
              <select
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {UNIDADES_SAT.map((u) => (
                  <option key={u.clave} value={u.clave}>{u.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={agregar}
            disabled={!valido}
            className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  )
}
