import { useNavigate, useLocation, Outlet } from "react-router-dom"
import { usePOS } from "../lib/pos-store"

export function Admin() {
  const { state } = usePOS()
  const navigate = useNavigate()
  const location = useLocation()

  // Solo administradores pueden entrar
  if (!state.cajero) {
    navigate("/", { replace: true })
    return null
  }
  if (!state.cajero.permisos.puede_ver_admin) {
    navigate("/venta", { replace: true })
    return null
  }

  const tab = location.pathname.includes("/admin/usuarios") ? "usuarios" : "tickets"

  return (
    <div className="admin-page">
      <header className="pos-header">
        <span className="pos-marca">FERREMEX — Administración</span>
        <div className="pos-header-derecha">
          <span className="pos-cajero">👤 {state.cajero.nombre}</span>
          <button className="btn-secondary btn-sm" onClick={() => navigate("/venta")}>
            ← Volver al POS
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <nav className="admin-sidebar">
          <button
            className={`admin-nav-item ${tab === "tickets" ? "admin-nav-activo" : ""}`}
            onClick={() => navigate("/admin/tickets")}
          >
            <span className="admin-nav-icono">🖨</span>
            <span>Formato de tickets</span>
          </button>
          <button
            className={`admin-nav-item ${tab === "usuarios" ? "admin-nav-activo" : ""}`}
            onClick={() => navigate("/admin/usuarios")}
          >
            <span className="admin-nav-icono">👥</span>
            <span>Usuarios y permisos</span>
          </button>
        </nav>

        <main className="admin-contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
