import { useNavigate } from "react-router-dom"
import { Users, CreditCard, PackageCheck } from "lucide-react"

/** Una tarjeta del landing de Clientes (icono lucide + título + descripción). */
function TarjetaCliente({
  icon,
  titulo,
  descripcion,
  onClick,
}: {
  icon: React.ReactNode
  titulo: string
  descripcion: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
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
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 56, height: 56, borderRadius: 14,
          background: "rgba(249,99,2,0.10)", color: "var(--at-orange)",
        }}
      >
        {icon}
      </span>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)", marginBottom: 4 }}>{titulo}</p>
        <p style={{ fontSize: 12, color: "var(--at-text-soft)", lineHeight: 1.4 }}>{descripcion}</p>
      </div>
    </button>
  )
}

export function AdminClientes() {
  const navigate = useNavigate()

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 32, gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--at-text-muted)", marginBottom: 8 }}>
        Módulo de Clientes
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <TarjetaCliente
          icon={<Users size={30} strokeWidth={1.6} />}
          titulo="Ver Clientes"
          descripcion="Consultar, crear y editar clientes registrados"
          onClick={() => navigate("/admin/clientes-lista")}
        />
        <TarjetaCliente
          icon={<CreditCard size={30} strokeWidth={1.6} />}
          titulo="Cartera de Crédito"
          descripcion="Gestión de saldos, abonos y clientes con crédito"
          onClick={() => navigate("/admin/cartera-credito")}
        />
        <TarjetaCliente
          icon={<PackageCheck size={30} strokeWidth={1.6} />}
          titulo="Encargos"
          descripcion="Pedidos especiales de clientes y su seguimiento"
          onClick={() => navigate("/admin/encargos")}
        />
        {/* "Entregas a domicilio" se movió al sidebar como módulo propio. */}
      </div>
    </div>
  )
}
