import { useState } from "react"
import { useLocation, Outlet, Navigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"

export function Admin() {
  const { state } = usePOS()
  const location = useLocation()
  const [sidebarOculto, setSidebarOculto] = useState(false)

  // Solo administradores pueden entrar. Redirección declarativa (no navigate en
  // render, que viola las reglas de React y se duplica en StrictMode).
  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_admin) return <Navigate to="/venta" replace />

  const path = location.pathname
  const tab = path.includes("/admin/consulta-ventas")
    ? "ventas"
    : path.includes("/admin/formatos") || path.includes("/admin/tickets")
    ? "formatos"
    : path.includes("/admin/perifericos")
    ? "perifericos"
    : path.includes("/admin/clientes") || path.includes("/admin/cartera-credito")
    ? "clientes"
    : path.includes("/admin/articulos")
    ? "articulos"
    : path.includes("/admin/inventario")
    ? "inventario"
    : path.includes("/admin/proveedores")
    ? "proveedores"
    : path.includes("/admin/compras")
    ? "compras"
    : path.includes("/admin/pedidos")
    ? "pedidos"
    : path.includes("/admin/catalogos")
    ? "catalogos"
    : path.includes("/admin/empleados")
    ? "empleados"
    : path.includes("/admin/caja")
    ? "caja"
    : ""

  return (
    <div className="admin-shell">
      {/* Topbar (tema claro) */}
      <div className="admin-topbar">
        <div className="admin-topbar-brand">
          <button
            className={`admin-btn-sidebar-toggle${sidebarOculto ? " collapsed" : ""}`}
            onClick={() => setSidebarOculto(v => !v)}
            title={sidebarOculto ? "Mostrar panel lateral" : "Ocultar panel lateral"}
          />
          <span className="admin-brand-mark">FERREMEX</span>
          <button
            className="admin-btn-panel-ventas"
            onClick={() => navigate("/venta")}
            title="Ir al panel de ventas"
          >
            🛒 Panel de ventas
          </button>
        </div>
        <div className="admin-topbar-right">
          <span className="admin-user-chip">
            <span className="admin-avatar">{(state.cajero.alias || state.cajero.nombre)[0].toUpperCase()}</span>
            {state.cajero.alias || state.cajero.nombre}
          </span>
        </div>
      </div>

      <div className="admin-body">
        {/* Sidebar */}
        <aside className={`admin-sidebar${sidebarOculto ? " oculto" : ""}`}>
          <button
            className={`admin-side-item${tab === "ventas" ? " active" : ""}`}
            onClick={() => navigate("/admin/consulta-ventas")}
          >
            <span className="admin-side-icon">🧾</span>
            Consulta de ventas
          </button>
          <button
            className={`admin-side-item${tab === "formatos" ? " active" : ""}`}
            onClick={() => navigate("/admin/formatos")}
          >
            <span className="admin-side-icon">📄</span>
            Formatos
          </button>
          <button
            className={`admin-side-item${tab === "perifericos" ? " active" : ""}`}
            onClick={() => navigate("/admin/perifericos")}
          >
            <span className="admin-side-icon">⚙️</span>
            Periféricos
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
          <button
            className={`admin-side-item${tab === "pedidos" ? " active" : ""}`}
            onClick={() => navigate("/admin/pedidos")}
          >
            <span className="admin-side-icon">📋</span>
            Pedidos
          </button>
          <button
            className={`admin-side-item${tab === "catalogos" ? " active" : ""}`}
            onClick={() => navigate("/admin/catalogos")}
          >
            <span className="admin-side-icon">🗂️</span>
            Catálogos
          </button>
          <button
            className={`admin-side-item${tab === "empleados" ? " active" : ""}`}
            onClick={() => navigate("/admin/empleados")}
          >
            <span className="admin-side-icon">👥</span>
            Empleados y permisos
          </button>
          <button
            className={`admin-side-item${tab === "caja" ? " active" : ""}`}
            onClick={() => navigate("/admin/caja")}
          >
            <span className="admin-side-icon">💵</span>
            Movimientos de Caja
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
