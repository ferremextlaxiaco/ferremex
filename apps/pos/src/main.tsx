import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { PosProvider } from "./lib/pos-store"
import { Login } from "./pages/Login"
import { Venta } from "./pages/Venta"
import { Corte } from "./pages/Corte"
import "./pos.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/pos">
      <PosProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/venta" element={<Venta />} />
          <Route path="/corte" element={<Corte />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PosProvider>
    </BrowserRouter>
  </StrictMode>
)
