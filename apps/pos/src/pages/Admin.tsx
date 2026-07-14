import { useState } from "react"
import { useLocation, useNavigate, Outlet, Navigate } from "react-router-dom"
import {
  ShoppingCart, ReceiptText, FileText, Settings, UserRound, Package,
  Boxes, Factory, ShoppingBag, ClipboardList, FolderTree, UsersRound, Banknote,
  Coins, FileSignature, Tag, Wallet, Receipt, ArrowRightLeft, Truck,
} from "lucide-react"
import { usePOS } from "../lib/pos-store"

export function Admin() {
  const { state } = usePOS()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOculto, setSidebarOculto] = useState(false)

  // Solo administradores pueden entrar. La redirección de GUARDIA es declarativa
  // (<Navigate>, no navigate() en render, que viola las reglas de React y se
  // duplica en StrictMode). Los onClick del sidebar/topbar sí usan navigate().
  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_admin) return <Navigate to="/venta" replace />

  const path = location.pathname
  const tab = path.includes("/admin/consulta-ventas")
    ? "ventas"
    : path.includes("/admin/cotizaciones")
    ? "cotizaciones"
    : path.includes("/admin/formatos") || path.includes("/admin/tickets")
    ? "formatos"
    : path.includes("/admin/perifericos")
    ? "perifericos"
    : path.includes("/admin/entregas")
    ? "entregas"
    : path.includes("/admin/clientes") || path.includes("/admin/cartera-credito") || path.includes("/admin/encargos")
    ? "clientes"
    : path.includes("/admin/monedero")
    ? "monedero"
    : path.includes("/admin/facturacion")
    ? "facturacion"
    : path.includes("/admin/articulos") || path.includes("/admin/paquetes") || path.includes("/admin/facturable")
    ? "articulos"
    : path.includes("/admin/promociones")
    ? "promociones"
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
    : path.includes("/admin/corte")
    ? "corte"
    : path.includes("/admin/cambios")
    ? "cambios"
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
          <button
            className="admin-brand-mark"
            onClick={() => navigate("/venta")}
            title="Ir al panel de ventas"
          >
            <ShoppingCart size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            FERREMEX
          </button>
        </div>

        {/* Pestañas Artículos | Paquetes | Facturable — solo en esas secciones */}
        {tab === "articulos" && (
          <div className="admin-topbar-tabs">
            <button
              className={`admin-topbar-tab${path.includes("/admin/articulos") ? " active" : ""}`}
              onClick={() => navigate("/admin/articulos")}
            >
              Artículos
            </button>
            <button
              className={`admin-topbar-tab${path.includes("/admin/paquetes") ? " active" : ""}`}
              onClick={() => navigate("/admin/paquetes")}
            >
              Paquetes
            </button>
            <button
              className={`admin-topbar-tab${path.includes("/admin/facturable") ? " active" : ""}`}
              onClick={() => navigate("/admin/facturable")}
            >
              Saldo facturable
            </button>
          </div>
        )}

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
            <span className="admin-side-icon"><ReceiptText size={18} /></span>
            Consulta de ventas
          </button>
          <button
            className={`admin-side-item${tab === "cotizaciones" ? " active" : ""}`}
            onClick={() => navigate("/admin/cotizaciones")}
          >
            <span className="admin-side-icon"><FileSignature size={18} /></span>
            Cotizaciones
          </button>
          <button
            className={`admin-side-item${tab === "cambios" ? " active" : ""}`}
            onClick={() => navigate("/admin/cambios")}
          >
            <span className="admin-side-icon"><ArrowRightLeft size={18} /></span>
            Cambios de artículo
          </button>
          <button
            className={`admin-side-item${tab === "formatos" ? " active" : ""}`}
            onClick={() => navigate("/admin/formatos")}
          >
            <span className="admin-side-icon"><FileText size={18} /></span>
            Formatos
          </button>
          <button
            className={`admin-side-item${tab === "perifericos" ? " active" : ""}`}
            onClick={() => navigate("/admin/perifericos")}
          >
            <span className="admin-side-icon"><Settings size={18} /></span>
            Periféricos
          </button>
          <button
            className={`admin-side-item${tab === "clientes" ? " active" : ""}`}
            onClick={() => navigate("/admin/clientes")}
          >
            <span className="admin-side-icon"><UserRound size={18} /></span>
            Clientes
          </button>
          <button
            className={`admin-side-item${tab === "entregas" ? " active" : ""}`}
            onClick={() => navigate("/admin/entregas")}
          >
            <span className="admin-side-icon"><Truck size={18} /></span>
            Entregas a domicilio
          </button>
          <button
            className={`admin-side-item${tab === "monedero" ? " active" : ""}`}
            onClick={() => navigate("/admin/monedero")}
          >
            <span className="admin-side-icon"><Wallet size={18} /></span>
            Monedero Electrónico
          </button>
          <button
            className={`admin-side-item${tab === "facturacion" ? " active" : ""}`}
            onClick={() => navigate("/admin/facturacion")}
          >
            <span className="admin-side-icon"><Receipt size={18} /></span>
            Facturación
          </button>
          <button
            className={`admin-side-item${tab === "articulos" ? " active" : ""}`}
            onClick={() => navigate("/admin/articulos")}
          >
            <span className="admin-side-icon"><Package size={18} /></span>
            Artículos
          </button>
          <button
            className={`admin-side-item${tab === "promociones" ? " active" : ""}`}
            onClick={() => navigate("/admin/promociones")}
          >
            <span className="admin-side-icon"><Tag size={18} /></span>
            Promociones
          </button>
          <button
            className={`admin-side-item${tab === "inventario" ? " active" : ""}`}
            onClick={() => navigate("/admin/inventario")}
          >
            <span className="admin-side-icon"><Boxes size={18} /></span>
            Ajuste de Inventario
          </button>
          <button
            className={`admin-side-item${tab === "proveedores" ? " active" : ""}`}
            onClick={() => navigate("/admin/proveedores")}
          >
            <span className="admin-side-icon"><Factory size={18} /></span>
            Proveedores
          </button>
          <button
            className={`admin-side-item${tab === "compras" ? " active" : ""}`}
            onClick={() => navigate("/admin/compras")}
          >
            <span className="admin-side-icon"><ShoppingBag size={18} /></span>
            Compras
          </button>
          <button
            className={`admin-side-item${tab === "pedidos" ? " active" : ""}`}
            onClick={() => navigate("/admin/pedidos")}
          >
            <span className="admin-side-icon"><ClipboardList size={18} /></span>
            Pedidos
          </button>
          <button
            className={`admin-side-item${tab === "catalogos" ? " active" : ""}`}
            onClick={() => navigate("/admin/catalogos")}
          >
            <span className="admin-side-icon"><FolderTree size={18} /></span>
            Catálogos
          </button>
          <button
            className={`admin-side-item${tab === "empleados" ? " active" : ""}`}
            onClick={() => navigate("/admin/empleados")}
          >
            <span className="admin-side-icon"><UsersRound size={18} /></span>
            Empleados y permisos
          </button>
          <button
            className={`admin-side-item${tab === "caja" ? " active" : ""}`}
            onClick={() => navigate("/admin/caja")}
          >
            <span className="admin-side-icon"><Banknote size={18} /></span>
            Movimientos de Caja
          </button>
          {state.cajero.permisos.puede_ver_corte && (
            <button
              className={`admin-side-item${tab === "corte" ? " active" : ""}`}
              onClick={() => navigate("/admin/corte")}
            >
              <span className="admin-side-icon"><Coins size={18} /></span>
              Corte de caja
            </button>
          )}
        </aside>

        {/* Contenido */}
        <main className="admin-contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
