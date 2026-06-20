import { useState, useEffect, useRef } from "react"
import { Save, Loader2 } from "lucide-react"
import { obtenerConfigFacturacionAPI, guardarConfigFacturacionAPI } from "../lib/client"

/**
 * Tab "Configuración" — ajustes de facturación del POS (NO credenciales: esas
 * viven en el .env del backend y nunca tocan el navegador).
 *
 *  - Serie de facturas nominativas y globales (Facturama numera el folio).
 *  - Periodicidad por defecto de la global (Diario normalmente).
 *  - Correo del contador (default al reenviar comprobantes).
 *
 * Guardado explícito (no auto-save).
 */
const PERIODICIDADES = [
  { v: "01", label: "Diario" },
  { v: "02", label: "Semanal" },
  { v: "03", label: "Quincenal" },
  { v: "04", label: "Mensual" },
  { v: "05", label: "Bimestral" },
]

export default function FacturacionConfigPanel({ pushToast }) {
  const [cfg, setCfg] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    obtenerConfigFacturacionAPI()
      .then((c) => { if (montado.current) setCfg(c) })
      .catch(() => { if (montado.current) { pushToast("No se pudo cargar la configuración", "error"); setCfg({ serie_nominativa: "", serie_global: "", periodicidad_global: "01", correo_contador: "" }) } })
      .finally(() => { if (montado.current) setCargando(false) })
    return () => { montado.current = false }
  }, [pushToast])

  function set(campo, valor) { setCfg((c) => ({ ...c, [campo]: valor })) }

  async function guardar() {
    if (cfg.correo_contador && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.correo_contador)) {
      pushToast("El correo del contador no es válido", "error"); return
    }
    setGuardando(true)
    try {
      const nueva = await guardarConfigFacturacionAPI(cfg)
      if (montado.current) { setCfg(nueva); pushToast("Configuración guardada", "success") }
    } catch (e) {
      if (montado.current) pushToast(e?.message ?? "No se pudo guardar", "error")
    } finally {
      if (montado.current) setGuardando(false)
    }
  }

  if (cargando || !cfg) {
    return <div className="fac-empty"><Loader2 size={30} className="fac-spin" /><p>Cargando configuración…</p></div>
  }

  return (
    <div className="fac-pane">
      <div className="fac-config">
        <div className="fac-config-row">
          <span>Serie para facturas nominativas</span>
          <input className="fac-input" value={cfg.serie_nominativa} onChange={(e) => set("serie_nominativa", e.target.value)} placeholder="Ej. A (opcional)" />
          <small>Si la dejas vacía, Facturama numera con su serie por defecto.</small>
        </div>

        <div className="fac-config-row">
          <span>Serie para facturas globales</span>
          <input className="fac-input" value={cfg.serie_global} onChange={(e) => set("serie_global", e.target.value)} placeholder="Ej. G (opcional)" />
        </div>

        <div className="fac-config-row">
          <span>Periodicidad de la factura global</span>
          <select className="fac-input" value={cfg.periodicidad_global} onChange={(e) => set("periodicidad_global", e.target.value)}>
            {PERIODICIDADES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
          <small>Normalmente “Diario”: una global por día de las ventas de público en general.</small>
        </div>

        <div className="fac-config-row">
          <span>Correo del contador</span>
          <input className="fac-input" type="email" value={cfg.correo_contador} onChange={(e) => set("correo_contador", e.target.value)} placeholder="contador@ejemplo.com" />
          <small>Se usa como destinatario por defecto al reenviar comprobantes.</small>
        </div>

        <div className="fac-config-acciones">
          <button className="fac-btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 size={16} className="fac-spin" /> : <Save size={16} />} Guardar configuración
          </button>
        </div>
      </div>
    </div>
  )
}
