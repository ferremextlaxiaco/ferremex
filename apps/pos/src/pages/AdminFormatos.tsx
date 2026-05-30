import { useState } from "react"
import { AdminTickets } from "./AdminTickets"

const TABS = [
  { key: "ticket",     label: "Ticket" },
  { key: "nota_venta", label: "Nota de venta" },
  { key: "factura",    label: "Factura" },
  { key: "cupon",      label: "Cupón" },
]

function Proximamente({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "60%", gap: 12, color: "#71717a",
    }}>
      <span style={{ fontSize: 48 }}>🚧</span>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 13, margin: 0 }}>Módulo en desarrollo — próximamente</p>
    </div>
  )
}

export function AdminFormatos() {
  const [tab, setTab] = useState("ticket")

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
        {tab === "ticket"     && <AdminTickets />}
        {tab === "nota_venta" && <Proximamente label="Nota de venta" />}
        {tab === "factura"    && <Proximamente label="Factura" />}
        {tab === "cupon"      && <Proximamente label="Cupón" />}
      </div>
    </div>
  )
}
