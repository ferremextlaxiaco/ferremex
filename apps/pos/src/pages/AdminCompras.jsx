import { useNavigate } from "react-router-dom"

export function AdminCompras() {
  const navigate = useNavigate()

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 32, gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--at-text-muted)", marginBottom: 8 }}>
        Módulo de Compras
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Hacer Compra */}
        <button
          onClick={() => navigate("/admin/compras-nueva")}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 14, width: 220, height: 180, background: "var(--at-bg-panel)",
            border: "1px solid var(--at-border)", borderRadius: 10, cursor: "pointer",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "var(--at-orange)"
            e.currentTarget.style.boxShadow   = "0 4px 20px rgba(249,99,2,0.12)"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--at-border)"
            e.currentTarget.style.boxShadow   = "none"
          }}
        >
          <span style={{ fontSize: 38 }}>🛒</span>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)", marginBottom: 4 }}>Hacer Compra</p>
            <p style={{ fontSize: 12, color: "var(--at-text-soft)", lineHeight: 1.4 }}>Registrar una nueva orden de compra a proveedor</p>
          </div>
        </button>

        {/* Consultar Compras */}
        <button
          onClick={() => navigate("/admin/consultar-compras")}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 14, width: 220, height: 180, background: "var(--at-bg-panel)",
            border: "1px solid var(--at-border)", borderRadius: 10, cursor: "pointer",
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "var(--at-orange)"
            e.currentTarget.style.boxShadow   = "0 4px 20px rgba(249,99,2,0.12)"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--at-border)"
            e.currentTarget.style.boxShadow   = "none"
          }}
        >
          <span style={{ fontSize: 38 }}>🔍</span>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)", marginBottom: 4 }}>Consultar Compras</p>
            <p style={{ fontSize: 12, color: "var(--at-text-soft)", lineHeight: 1.4 }}>Ver historial de compras, filtrar y cancelar</p>
          </div>
        </button>
      </div>
    </div>
  )
}
