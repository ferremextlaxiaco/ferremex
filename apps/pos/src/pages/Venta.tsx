import { useState, useEffect } from "react"
import { ShoppingCart, X } from "lucide-react"
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
  // El carrito ahora es un panel deslizable (drawer) que se abre con un FAB.
  const [carritoAbierto, setCarritoAbierto] = useState(false)
  const numItems = state.items.length

  // Cerrar el drawer con Escape (solo si no hay otro modal encima).
  useEffect(() => {
    if (!carritoAbierto) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setCarritoAbierto(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [carritoAbierto])

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

      {/* ---- Cuerpo: Buscador (ancho completo) ---- */}
      <main className="venta-main">
        <section className="venta-izquierda venta-izquierda--full">
          <Buscador />
        </section>
      </main>

      {/* ---- Carrito como panel deslizable (drawer) ---- */}
      {carritoAbierto && (
        <div className="carrito-overlay" onClick={() => setCarritoAbierto(false)} />
      )}
      <aside className={`carrito-drawer${carritoAbierto ? " abierto" : ""}`} aria-hidden={!carritoAbierto}>
        <button
          className="carrito-drawer-cerrar"
          onClick={() => setCarritoAbierto(false)}
          aria-label="Cerrar carrito"
        >
          <X size={18} />
        </button>
        <Carrito onCobrar={() => { setCarritoAbierto(false); setMostrarCobro(true) }} />
      </aside>

      {/* ---- FAB del carrito (esquina inferior derecha) ---- */}
      {!carritoAbierto && (
        <button
          className="carrito-fab"
          onClick={() => setCarritoAbierto(true)}
          title="Ver carrito"
        >
          <ShoppingCart size={24} />
          {numItems > 0 && <span className="carrito-fab-badge">{numItems}</span>}
        </button>
      )}

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
