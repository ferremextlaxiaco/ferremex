import { useState } from "react"
import { Globe2, FileStack, Settings2 } from "lucide-react"
import { useToasts } from "../hooks/useToasts"
import FacturaGlobalPanel from "./FacturaGlobalPanel"
import ComprobantesPanel from "./ComprobantesPanel"
import FacturacionConfigPanel from "./FacturacionConfigPanel"

/**
 * Centro de control de Facturación CFDI (Facturama).
 *
 * Tres tabs:
 *  - Global del día  → arma y timbra la factura global de público en general,
 *    respetando el saldo facturable (consume el saldo = "switch" confirmado).
 *  - Comprobantes    → historial de TODOS los CFDIs emitidos (nominativas +
 *    globales), leído de Facturama + cruce con ventas. Previsualizar, descargar
 *    individual o por lote a una carpeta, reenviar por correo, cancelar.
 *  - Configuración   → serie/folio, correo del contador, periodicidad.
 *
 * Patrón de composición POS: este Module es el único con estado de toasts; cada
 * panel maneja su propio estado de datos. Todo el backend pasa por client.ts
 * (Contrato de Conexión). Las credenciales/CSD jamás tocan el frontend.
 */
const TABS = [
  { id: "global", label: "Global del día", icon: Globe2 },
  { id: "comprobantes", label: "Comprobantes", icon: FileStack },
  { id: "config", label: "Configuración", icon: Settings2 },
]

export default function FacturacionModule() {
  const [tab, setTab] = useState("global")
  const { toasts, push: pushToast } = useToasts()

  return (
    <div className="fac-root">
      <div className="fac-header">
        <h1 className="fac-titulo">Facturación</h1>
        <div className="fac-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`fac-tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="fac-body">
        {tab === "global" && <FacturaGlobalPanel pushToast={pushToast} />}
        {tab === "comprobantes" && <ComprobantesPanel pushToast={pushToast} />}
        {tab === "config" && <FacturacionConfigPanel pushToast={pushToast} />}
      </div>

      {toasts.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 5000, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map((t) => (
            <div key={t.id} style={{
              background: t.type === "error" ? "#dc2626" : t.type === "warning" ? "#d97706" : "#16a34a",
              color: "#fff", borderRadius: 8, padding: "10px 18px",
              fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,.2)",
              minWidth: 200, maxWidth: 360,
            }}>
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
