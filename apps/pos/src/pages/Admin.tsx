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

  const path = location.pathname
  const tab = path.includes("/admin/clientes")
    ? "clientes"
    : path.includes("/admin/usuarios")
    ? "usuarios"
    : path.includes("/admin/articulos")
    ? "articulos"
    : path.includes("/admin/inventario")
    ? "inventario"
    : path.includes("/admin/proveedores")
    ? "proveedores"
    : path.includes("/admin/compras")
    ? "compras"
    : "tickets"

  return (
    <div className="admin-shell">
      {/* Topbar (tema claro) */}
      <div className="admin-topbar">
        <div className="admin-topbar-brand">
          <span className="admin-brand-mark">FERREMEX</span>
          <span className="admin-brand-sep">—</span>
          <span className="admin-brand-section">Administración</span>
        </div>
        <div className="admin-topbar-right">
          <span className="admin-user-chip">
            <span className="admin-avatar">{state.cajero.nombre[0].toUpperCase()}</span>
            {state.cajero.nombre}
          </span>
          <button className="admin-btn-back" onClick={() => navigate("/venta")}>← Volver al POS</button>
        </div>
      </div>

      <div className="admin-body">
        {/* Sidebar */}
        <aside className="admin-sidebar">
          <button
            className={`admin-side-item${tab === "tickets" ? " active" : ""}`}
            onClick={() => navigate("/admin/tickets")}
          >
            <span className="admin-side-icon">📄</span>
            Formato de tickets
          </button>
          <button
            className={`admin-side-item${tab === "usuarios" ? " active" : ""}`}
            onClick={() => navigate("/admin/usuarios")}
          >
            <span className="admin-side-icon">👥</span>
            Usuarios y permisos
          </button>
          <button
            className={`admin-side-item${tab === "clientes" ? " active" : ""}`}
            onClick={() => navigate("/admin/clientes")}
          >
            <span className="admin-side-icon">🧑‍💼</span>
            Clientes
          </button>
          <button
            className={`admin-side-item${tab === "articulos" ? " active" : ""}`}
            onClick={() => navigate("/admin/articulos")}
          >
            <span className="admin-side-icon">📦</span>
            Artículos
          </button>
          <button
            className={`admin-side-item${tab === "inventario" ? " active" : ""}`}
            onClick={() => navigate("/admin/inventario")}
          >
            <span className="admin-side-icon">🔢</span>
            Ajuste de Inventario
          </button>
          <button
            className={`admin-side-item${tab === "proveedores" ? " active" : ""}`}
            onClick={() => navigate("/admin/proveedores")}
          >
            <span className="admin-side-icon">🏭</span>
            Proveedores
          </button>
          <button
            className={`admin-side-item${tab === "compras" ? " active" : ""}`}
            onClick={() => navigate("/admin/compras")}
          >
            <span className="admin-side-icon">🛒</span>
            Compras
          </button>
        </aside>

        {/* Contenido */}
        <main className="admin-contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
