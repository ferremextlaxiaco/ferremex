import { useState } from "react"
import { Navigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import { AdminTickets } from "./AdminTickets"
import { FormatoConfig } from "./FormatoConfig"

const TABS = [
  { key: "ticket",             label: "Ticket" },
  { key: "nota_venta",         label: "Nota de venta" },
  { key: "factura",            label: "Factura" },
  { key: "cupon",              label: "Cupón" },
  { key: "cambio_devolucion",  label: "Cambio/Devolución" },
]

export function AdminFormatos() {
  const { state } = usePOS()
  const [tab, setTab] = useState("ticket")

  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_formatos) return <Navigate to="/admin" replace />

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid #e4e4e7",
        background: "#fff", padding: "0 24px", flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "12px 18px",
              fontSize: 13,
              fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "#F96302" : "#71717a",
              borderBottom: tab === t.key ? "2px solid #F96302" : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "ticket"            && <AdminTickets />}
        {tab === "nota_venta"        && <FormatoConfig formatoKey="nota_venta" label="Nota de venta" />}
        {tab === "factura"           && <FormatoConfig formatoKey="factura" label="Factura" />}
        {tab === "cupon"             && <FormatoConfig formatoKey="cupon" label="Cupón" />}
        {tab === "cambio_devolucion" && <FormatoConfig formatoKey="cambio_devolucion" label="Cambio/Devolución" />}
      </div>
    </div>
  )
}
