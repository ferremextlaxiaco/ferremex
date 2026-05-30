import { useState } from "react"
import { useNavigate, Navigate } from "react-router-dom"
import { Buscador } from "../components/Buscador"
import { Carrito } from "../components/Carrito"
import { ModalCobro } from "../components/ModalCobro"
import { Ticket } from "../components/Ticket"
import { SelectorCliente } from "../components/SelectorCliente"
import { usePOS } from "../lib/pos-store"
import type { VentaResponse } from "../lib/client"

export function Venta() {
  const { state } = usePOS()
  const navigate = useNavigate()
  const [mostrarCobro, setMostrarCobro] = useState(false)
  const [ventaCompletada, setVentaCompletada] = useState<VentaResponse | null>(null)

  // Redirigir al login si no hay cajero (declarativo, no navigate en render).
  if (!state.cajero) return <Navigate to="/" replace />

  function handleVentaCompletada(venta: VentaResponse) {
    setMostrarCobro(false)
    setVentaCompletada(venta)
  }

  function handleTicketImpreso() {
    setVentaCompletada(null)
  }

  return (
    <div className="venta-page">
      {/* ---- Header ---- */}
      <header className="pos-header">
        <span className="pos-marca">FERREMEX POS</span>
        <div className="pos-header-centro">
          <SelectorCliente />
        </div>
        <div className="pos-header-derecha">
          <span className="pos-cajero">👤 {state.cajero.alias || state.cajero.nombre}</span>
          {state.cajero.permisos.puede_ver_corte && (
            <button className="btn-secondary btn-sm" onClick={() => navigate("/corte")}>
              Corte de caja
            </button>
          )}
          {state.cajero.permisos.puede_ver_admin && (
            <button className="btn-secondary btn-sm" onClick={() => navigate("/admin")}>
              ⚙ Admin
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={() => navigate("/", { replace: true })}>
            Salir
          </button>
        </div>
      </header>

      {/* ---- Cuerpo: Buscador + Carrito ---- */}
      <main className="venta-main">
        <section className="venta-izquierda">
          <Buscador />
        </section>
        <section className="venta-derecha">
          <Carrito onCobrar={() => setMostrarCobro(true)} />
        </section>
      </main>

      {/* ---- Modal de cobro ---- */}
      {mostrarCobro && (
        <ModalCobro
          onCerrar={() => setMostrarCobro(false)}
          onVentaCompletada={handleVentaCompletada}
        />
      )}

      {/* ---- Ticket (se imprime automáticamente) ---- */}
      {ventaCompletada && (
        <Ticket venta={ventaCompletada} onImpreso={handleTicketImpreso} />
      )}
    </div>
  )
}
