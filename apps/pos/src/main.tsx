import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { PosProvider } from "./lib/pos-store"
import { Login } from "./pages/Login"
import { Venta } from "./pages/Venta"
import { Corte } from "./pages/Corte"
import { Admin } from "./pages/Admin"
import { AdminTickets } from "./pages/AdminTickets"
import { AdminFormatos } from "./pages/AdminFormatos"
import { AdminClientes } from "./pages/AdminClientes"
import { AdminClientesLista } from "./pages/AdminClientesLista"
import CarteraCredito from "./pages/CarteraCredito"
import { AdminArticulos } from "./pages/AdminArticulos"
import { AdminPaquetes } from "./pages/AdminPaquetes"
import { AdminFacturable } from "./pages/AdminFacturable"
import { AdminPromociones } from "./pages/AdminPromociones"
import { AdminInventario } from "./pages/AdminInventario"
import { AdminProveedores } from "./pages/AdminProveedores"
import { AdminCompras } from "./pages/AdminCompras"
import { AdminComprasNueva } from "./pages/AdminComprasNueva"
import { AdminConsultarCompras } from "./pages/AdminConsultarCompras"
import { AdminPedidos } from "./pages/AdminPedidos"
import { AdminCatalogos } from "./pages/AdminCatalogos"
import { AdminMonedero } from "./pages/AdminMonedero"
import { AdminConsultaVentas } from "./pages/AdminConsultaVentas"
import { AdminCotizaciones } from "./pages/AdminCotizaciones"
import { AdminPerifericos } from "./pages/AdminPerifericos"
import { GeneradorTickets } from "./pages/GeneradorTickets"
import { AdminEmpleados } from "./pages/AdminEmpleados"
import { AdminCaja } from "./pages/AdminCaja"
import { AdminCorte } from "./pages/AdminCorte"
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
            <Route index element={<Navigate to="/admin/consulta-ventas" replace />} />
            <Route path="consulta-ventas" element={<AdminConsultaVentas />} />
            <Route path="cotizaciones" element={<AdminCotizaciones />} />
            <Route path="formatos" element={<AdminFormatos />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="usuarios" element={<Navigate to="/admin/empleados" replace />} />
            <Route path="clientes" element={<AdminClientes />} />
            <Route path="clientes-lista" element={<AdminClientesLista />} />
            <Route path="cartera-credito" element={<CarteraCredito />} />
            <Route path="articulos" element={<AdminArticulos />} />
            <Route path="paquetes" element={<AdminPaquetes />} />
            <Route path="facturable" element={<AdminFacturable />} />
            <Route path="promociones" element={<AdminPromociones />} />
            <Route path="inventario" element={<AdminInventario />} />
            <Route path="proveedores" element={<AdminProveedores />} />
            <Route path="compras" element={<AdminCompras />} />
            <Route path="compras-nueva" element={<AdminComprasNueva />} />
            <Route path="consultar-compras" element={<AdminConsultarCompras />} />
            <Route path="pedidos" element={<AdminPedidos />} />
          <Route path="catalogos" element={<AdminCatalogos />} />
          <Route path="monedero" element={<AdminMonedero />} />
          <Route path="perifericos" element={<AdminPerifericos />} />
          <Route path="empleados" element={<AdminEmpleados />} />
          <Route path="caja" element={<AdminCaja />} />
          <Route path="corte" element={<AdminCorte />} />
          </Route>
          <Route path="/admin/generador" element={<GeneradorTickets />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PosProvider>
    </BrowserRouter>
  </StrictMode>
)
