import { useEffect, useState } from "react"
import { Truck, Save, Info } from "lucide-react"
import { obtenerFleteConfig, guardarFleteConfig } from "../lib/client"
import { UNIDADES_SAT } from "../lib/unidades-sat"

/**
 * Configuración del SERVICIO DE FLETE (tab "Fletes" del módulo Entregas).
 *
 * El flete es un SERVICIO que entra a la venta como una LÍNEA más: suma al total,
 * aparece en el ticket y es FACTURABLE. Aquí se define su nombre, clave SAT, unidad
 * SAT, precio base sugerido e IVA. Al guardar, el backend crea/actualiza un producto
 * Medusa oculto (SKU SERVICIO-FLETE) que lleva la clave SAT — así el resolver fiscal
 * lo mapea sin tocar el pipeline de facturación.
 *
 * (Las reglas de aviso — cobrar flete si peso/cantidad/monto < X — se diseñan luego;
 * aquí solo hay un placeholder de "próximamente".)
 *
 * Contrato de Conexión: datos por client.ts (obtenerFleteConfig/guardarFleteConfig),
 * toasts vía pushToast (del Module padre), guardado explícito (no auto-save).
 */
export default function FletesConfigPanel({ pushToast }) {
  const [form, setForm] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const c = await obtenerFleteConfig()
        if (on) setForm(c)
      } catch {
        if (on) pushToast?.("No se pudo cargar la configuración del flete", "error")
      } finally {
        if (on) setCargando(false)
      }
    })()
    return () => { on = false }
  }, [pushToast])

  function set(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function guardar() {
    if (!form) return
    const nombre = (form.nombre || "").trim()
    if (!nombre) { pushToast?.("El nombre del servicio es obligatorio", "error"); return }
    const precioBase = Number(form.precioBase)
    if (isNaN(precioBase) || precioBase < 0) { pushToast?.("El precio base no es válido", "error"); return }

    setGuardando(true)
    try {
      const guardado = await guardarFleteConfig({
        nombre,
        claveSat: (form.claveSat || "").trim(),
        unidadSat: (form.unidadSat || "E48").trim(),
        precioBase,
        aplicaIva: form.aplicaIva !== false,
      })
      setForm(guardado)
      if (guardado._warning) {
        pushToast?.(guardado._warning, "warning")
      } else {
        pushToast?.("Configuración de flete guardada", "success")
      }
    } catch {
      pushToast?.("No se pudo guardar la configuración", "error")
    } finally {
      setGuardando(false)
    }
  }

  if (cargando || !form) {
    return <div className="p-8 text-center text-gray-400 text-sm">Cargando configuración…</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-orange-600"><Truck size={22} /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Servicio de flete</h2>
          <p className="text-sm text-gray-500 leading-snug">
            El flete se cobra como una línea de la venta: suma al total, aparece en el ticket
            y puede facturarse. Configura aquí su nombre, clave SAT, unidad y precio base.
          </p>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre del servicio</label>
          <input
            type="text"
            value={form.nombre ?? ""}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Servicio de flete"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
          />
          <p className="text-xs text-gray-400 mt-1">Así aparece en el ticket y la factura.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Clave SAT (ProdServ)</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.claveSat ?? ""}
              onChange={(e) => set("claveSat", e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="78102203"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            />
            <p className="text-xs text-gray-400 mt-1">Servicios de mensajería = 78102203.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Unidad SAT</label>
            <select
              value={form.unidadSat ?? "E48"}
              onChange={(e) => set("unidadSat", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 bg-white"
            >
              {/* E48/ACT primero (servicio); luego el resto del catálogo SAT. */}
              <option value="E48">E48 — Unidad de servicio</option>
              <option value="ACT">ACT — Actividad</option>
              {UNIDADES_SAT.filter((u) => u.clave !== "E48" && u.clave !== "ACT").map((u) => (
                <option key={u.clave} value={u.clave}>{u.clave} — {u.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Precio base (sugerido)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.precioBase ?? ""}
                onChange={(e) => {
                  let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                  const i = raw.indexOf(".")
                  if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
                  set("precioBase", raw)
                }}
                placeholder="50.00"
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">El vendedor puede ajustarlo al cobrar.</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={form.aplicaIva !== false}
              onChange={(e) => set("aplicaIva", e.target.checked)}
              className="w-5 h-5 accent-orange-600"
            />
            <span className="text-sm font-medium text-gray-700">Aplica IVA (16%)</span>
          </label>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-40"
          >
            <Save size={16} /> {guardando ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>

      {/* Reglas de aviso — placeholder (se diseña luego). */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-5 flex items-start gap-3">
        <span className="mt-0.5 text-gray-400"><Info size={18} /></span>
        <div>
          <h3 className="text-sm font-semibold text-gray-600">Reglas de aviso de flete</h3>
          <p className="text-sm text-gray-400 leading-snug">
            Próximamente: avisar automáticamente que se cobre flete cuando el peso, la cantidad
            o el monto sean menores a cierto valor en artículos específicos.
          </p>
        </div>
      </div>
    </div>
  )
}
