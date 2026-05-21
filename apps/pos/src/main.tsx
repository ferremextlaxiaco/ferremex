import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { PosProvider } from "./lib/pos-store"
import { Login } from "./pages/Login"
import { Venta } from "./pages/Venta"
import { Corte } from "./pages/Corte"
import { Admin } from "./pages/Admin"
import { AdminTickets } from "./pages/AdminTickets"
import { AdminUsuarios } from "./pages/AdminUsuarios"
import { AdminClientes } from "./pages/AdminClientes"
import { AdminArticulos } from "./pages/AdminArticulos"
import { AdminInventario } from "./pages/AdminInventario"
import { AdminProveedores } from "./pages/AdminProveedores"
import { AdminCompras } from "./pages/AdminCompras"
import { AdminComprasNueva } from "./pages/AdminComprasNueva"
import { AdminConsultarCompras } from "./pages/AdminConsultarCompras"
import { AdminPedidos } from "./pages/AdminPedidos"
import { AdminCatalogos } from "./pages/AdminCatalogos"
import { GeneradorTickets } from "./pages/GeneradorTickets"
import "./pos.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/pos">
      <PosProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/venta" element={<Venta />} />
          <Route path="/corte" element={<Corte />} />
          <Route path="/admin" element={<Admin />}>
            <Route index element={<Navigate to="/admin/tickets" replace />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="usuarios" element={<AdminUsuarios />} />
            <Route path="clientes" element={<AdminClientes />} />
            <Route path="articulos" element={<AdminArticulos />} />
            <Route path="inventario" element={<AdminInventario />} />
            <Route path="proveedores" element={<AdminProveedores />} />
            <Route path="compras" element={<AdminCompras />} />
            <Route path="compras-nueva" element={<AdminComprasNueva />} />
            <Route path="consultar-compras" element={<AdminConsultarCompras />} />
            <Route path="pedidos" element={<AdminPedidos />} />
          <Route path="catalogos" element={<AdminCatalogos />} />
          </Route>
          <Route path="/admin/generador" element={<GeneradorTickets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PosProvider>
    </BrowserRouter>
  </StrictMode>
)
