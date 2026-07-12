import { useEffect, useRef, useState } from "react"
import { X, UserPlus } from "lucide-react"
import { crearCliente, loadGrupos, type Cliente } from "../lib/clientes"

/**
 * Alta rápida de un cliente nuevo, para usar dentro de otro flujo (ej. el
 * selector de cliente de Cambio de artículo) sin salir al admin de Clientes.
 * Solo pide lo mínimo — el resto (crédito, monedero, datos fiscales) se
 * completa después desde Clientes → Editar.
 */
export function ClienteRapidoModal({
  onClose,
  onCreado,
}: {
  onClose: () => void
  onCreado: (cliente: Cliente) => void
}) {
  const [nombre, setNombre] = useState("")
  const [telefono, setTelefono] = useState("")
  const [numPrecio, setNumPrecio] = useState(1)
  const [grupo, setGrupo] = useState("")
  const [grupos, setGrupos] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    loadGrupos().then(setGrupos).catch(() => setGrupos([]))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const valido = nombre.trim().length > 0

  async function guardar() {
    if (!valido || guardando) return
    setGuardando(true)
    setError(null)
    try {
      const creado = await crearCliente({
        num_cliente: "",
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        num_precio: numPrecio,
        dias_credito: 0,
        limite_credito: 0,
        grupo,
        monedero: false,
        rfc: "",
        razon_social: "",
        regimen_fiscal: "",
        cfdi: "",
        calle: "",
        numero: "",
        colonia: "",
        ciudad: "",
        estado: "",
        cp: "",
      })
      onCreado(creado)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cliente")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[6100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UserPlus size={18} className="text-orange-600" />
            Cliente nuevo
          </h2>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Alta rápida. Crédito, monedero y datos fiscales se completan después desde Clientes → Editar.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
            <input
              ref={inputRef}
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="Nombre completo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-600 mb-1">Precio</label>
              <select
                value={numPrecio}
                onChange={(e) => setNumPrecio(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value={1}>Mostrador</option>
                <option value={2}>Cliente</option>
                <option value={3}>Distribuidor</option>
                <option value={4}>Especial</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Grupo</label>
            <select
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Sin grupo</option>
              {grupos.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!valido || guardando}
            className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? "Guardando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  )
}
