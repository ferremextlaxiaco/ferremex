import { useState } from "react"
import { Truck, Settings2 } from "lucide-react"
import EntregasModule from "../components/EntregasModule"
import FletesConfigPanel from "../components/FletesConfigPanel"
import { useToasts } from "../hooks/useToasts"

/**
 * Shell del módulo Entregas a domicilio (item propio del sidebar admin). Dos tabs:
 *  - Entregas → el módulo de entregas (por cobrar / ya pagadas).
 *  - Fletes   → configuración del servicio de flete (clave SAT, nombre, precio base).
 *
 * El flete es una LÍNEA de la venta (SKU SERVICIO-FLETE): suma al total, sale en el
 * ticket y es facturable. Su config vive aquí (tab Fletes).
 */
const TABS = [
  { id: "entregas", label: "Entregas", icon: Truck },
  { id: "fletes", label: "Fletes", icon: Settings2 },
] as const

export function AdminEntregas() {
  const [tab, setTab] = useState<"entregas" | "fletes">("entregas")
  const { toasts, push } = useToasts()

  return (
    <div className="flex flex-col h-full">
      {/* Barra de tabs interna */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-200 bg-white">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-orange-600 text-orange-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "entregas" && <EntregasModule />}
        {tab === "fletes" && <FletesConfigPanel pushToast={push} />}
      </div>

      {/* Toasts */}
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
