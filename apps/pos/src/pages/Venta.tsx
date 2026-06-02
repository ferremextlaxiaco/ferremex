import { useState, useEffect } from "react"
import { ShoppingCart, X, CheckCircle2 } from "lucide-react"
import { Navigate } from "react-router-dom"
import { Buscador } from "../components/Buscador"
import { Carrito } from "../components/Carrito"
import { ModalCobro } from "../components/ModalCobro"
import { Ticket } from "../components/Ticket"
import { SelectorCliente } from "../components/SelectorCliente"
import { BarraComandos } from "../components/BarraComandos"
import { PedidosEnEspera } from "../components/PedidosEnEspera"
import { usePedidosEnEspera } from "../lib/pedidos-espera"
import { usePOS } from "../lib/pos-store"
import { clientePuedeFacturar } from "../lib/clientes"
import type { VentaResponse } from "../lib/client"

// Ancho a partir del cual el carrito se muestra como columna fija a la derecha.
// Por debajo, cae al drawer deslizable con FAB (terminales/pantallas angostas).
const ANCHO_CARRITO_FIJO = 1100

export function Venta() {
  const { state, total } = usePOS()
  const [mostrarCobro, setMostrarCobro] = useState(false)
  const [ventaCompletada, setVentaCompletada] = useState<VentaResponse | null>(null)
  // El carrito es columna fija en pantallas anchas; drawer en las angostas.
  const [carritoFijo, setCarritoFijo] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= ANCHO_CARRITO_FIJO
  )
  const [carritoAbierto, setCarritoAbierto] = useState(false)   // solo aplica en modo drawer
  const [esperaAbierta, setEsperaAbierta] = useState(false)
  const { pedidos, refrescar } = usePedidosEnEspera()
  const numItems = state.items.length

  // Cliente activo con datos fiscales completos → se puede facturar.
  const puedeFacturar = clientePuedeFacturar(state.clienteActivo)

  // Responsive: alterna entre carrito fijo y drawer según el ancho de ventana.
  // El valor inicial ya lo tomó el lazy initializer del useState; aquí solo
  // escuchamos cambios de ancho (sin un setState inmediato que re-renderice).
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${ANCHO_CARRITO_FIJO}px)`)
    const fn = () => {
      setCarritoFijo(mql.matches)
      if (mql.matches) setCarritoAbierto(false)   // al ensanchar, cierra el drawer
    }
    mql.addEventListener("change", fn)
    return () => mql.removeEventListener("change", fn)
  }, [])

  // Cerrar el drawer con Escape (solo en modo drawer).
  useEffect(() => {
    if (carritoFijo || !carritoAbierto) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setCarritoAbierto(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [carritoFijo, carritoAbierto])

  // Redirigir al login si no hay cajero (declarativo, no navigate en render).
  if (!state.cajero) return <Navigate to="/" replace />
  const cajero = state.cajero

  function handleVentaCompletada(venta: VentaResponse) {
    setMostrarCobro(false)
    setVentaCompletada(venta)
  }

  function handleTicketImpreso() {
    setVentaCompletada(null)
  }

  function abrirCobro() {
    setCarritoAbierto(false)
    setMostrarCobro(true)
  }

  return (
    <div className={`venta-page${carritoFijo ? " venta-page--carrito-fijo" : ""}`}>
      {/* ===== Header fila 1 — identidad y contexto ===== */}
      <header className="pos-header">
        <span className="pos-marca">FERREMEX POS</span>
        <div className="pos-header-centro">
          <SelectorCliente />
          {puedeFacturar && (
            <span className="chip-facturar" title="El cliente tiene datos fiscales completos">
              <CheckCircle2 size={13} /> Puede facturar
            </span>
          )}
        </div>
        <div className="pos-header-derecha">
          <span className="pos-sesion">
            <span className={`pos-sesion-caja${cajero.caja_nombre ? "" : " pos-sesion-caja--sin"}`}>
              {cajero.caja_nombre ? `🟢 ${cajero.caja_nombre}` : "○ Sin caja"}
            </span>
            <span className="pos-sesion-sep">·</span>
            <span className="pos-sesion-cajero">👤 {cajero.alias || cajero.nombre}</span>
            <span className="pos-sesion-sep">·</span>
            <span className="pos-sesion-turno">{cajero.turno_id}</span>
          </span>
        </div>
      </header>

      {/* ===== Header fila 2 — barra de comandos ===== */}
      <BarraComandos
        pedidosEnEspera={pedidos.length}
        onAbrirEspera={() => setEsperaAbierta(true)}
      />

      {/* ===== Cuerpo: buscador (izq) + carrito (der, fijo o drawer) ===== */}
      <main className="venta-main">
        <section className={`venta-izquierda${carritoFijo ? "" : " venta-izquierda--full"}`}>
          <Buscador />
        </section>

        {/* Carrito como columna fija (pantallas anchas) */}
        {carritoFijo && (
          <aside className="venta-derecha">
            <Carrito onCobrar={abrirCobro} />
          </aside>
        )}
      </main>

      {/* ===== Carrito como drawer (pantallas angostas) ===== */}
      {!carritoFijo && (
        <>
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
            <Carrito onCobrar={abrirCobro} />
          </aside>

          {!carritoAbierto && (
            <button className="carrito-fab" onClick={() => setCarritoAbierto(true)} title="Ver carrito">
              <ShoppingCart size={24} />
              {numItems > 0 && <span className="carrito-fab-badge">{numItems}</span>}
            </button>
          )}
        </>
      )}

      {/* ===== Pedidos en espera / cotizaciones ===== */}
      <PedidosEnEspera
        abierto={esperaAbierta}
        onCerrar={() => setEsperaAbierta(false)}
        onCambio={refrescar}
      />

      {/* ===== Modal de cobro ===== */}
      {mostrarCobro && (
        <ModalCobro
          onCerrar={() => setMostrarCobro(false)}
          onVentaCompletada={handleVentaCompletada}
        />
      )}

      {/* ===== Ticket (se imprime + gancho de factura) ===== */}
      {ventaCompletada && (
        <Ticket
          venta={ventaCompletada}
          cliente={state.clienteActivo}
          onImpreso={handleTicketImpreso}
        />
      )}
    </div>
  )
}
