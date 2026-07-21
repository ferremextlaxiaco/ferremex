import { useNavigate, Navigate } from "react-router-dom"
import { UsersRound, ShoppingCart, ShoppingBag, Boxes, UserRound } from "lucide-react"
import { usePOS } from "../lib/pos-store"

/** Una tarjeta del landing de Reportes (icono lucide + título + descripción). */
function TarjetaReporte({
  icon,
  titulo,
  descripcion,
  onClick,
  disponible = true,
}: {
  icon: React.ReactNode
  titulo: string
  descripcion: string
  onClick: () => void
  disponible?: boolean
}) {
  return (
    <button
      onClick={disponible ? onClick : undefined}
      disabled={!disponible}
      title={disponible ? titulo : `${titulo} (próximamente)`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 14, width: 220, height: 180, background: "var(--at-bg-panel)",
        border: "1px solid var(--at-border)", borderRadius: 10,
        cursor: disponible ? "pointer" : "not-allowed",
        opacity: disponible ? 1 : 0.45,
        transition: "border-color 0.15s, box-shadow 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!disponible) return
        e.currentTarget.style.borderColor = "var(--at-orange)"
        e.currentTarget.style.boxShadow = "0 4px 20px rgba(249,99,2,0.12)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--at-border)"
        e.currentTarget.style.boxShadow = "none"
      }}
    >
      {!disponible && (
        <span style={{
          position: "absolute", top: 10, right: 10, fontSize: 9.5, fontWeight: 700,
          color: "#9ca3af", background: "#f3f4f6", padding: "2px 7px", borderRadius: 10,
        }}>
          Próximamente
        </span>
      )}
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

/**
 * Landing de Reportes: tarjetas por CATEGORÍA (Empleados, Ventas, Compras,
 * Inventario, Clientes). Cada categoría navega a su propio sub-landing con
 * los reportes específicos de esa categoría (mismo patrón de 2 niveles que
 * Clientes → Ver Clientes/Cartera/Encargos, pero con un nivel extra porque
 * aquí cada categoría agrupará varios reportes).
 */
export function AdminReportes() {
  const { state } = usePOS()
  const navigate = useNavigate()

  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_reportes) return <Navigate to="/admin" replace />

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 32, gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--at-text-muted)", marginBottom: 8 }}>
        Módulo de Reportes
      </p>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <TarjetaReporte
          icon={<UsersRound size={30} strokeWidth={1.6} />}
          titulo="Empleados"
          descripcion="Comisiones y desempeño por vendedor"
          onClick={() => navigate("/admin/reportes/empleados")}
        />
        <TarjetaReporte
          icon={<ShoppingCart size={30} strokeWidth={1.6} />}
          titulo="Ventas"
          descripcion="Ventas por período, método de pago y vendedor"
          onClick={() => {}}
          disponible={false}
        />
        <TarjetaReporte
          icon={<ShoppingBag size={30} strokeWidth={1.6} />}
          titulo="Compras"
          descripcion="Compras por proveedor y período"
          onClick={() => {}}
          disponible={false}
        />
        <TarjetaReporte
          icon={<Boxes size={30} strokeWidth={1.6} />}
          titulo="Inventario"
          descripcion="Desplazamiento y rotación de artículos"
          onClick={() => {}}
          disponible={false}
        />
        <TarjetaReporte
          icon={<UserRound size={30} strokeWidth={1.6} />}
          titulo="Clientes"
          descripcion="Consumo, cartera y monedero por cliente"
          onClick={() => {}}
          disponible={false}
        />
      </div>
    </div>
  )
}
