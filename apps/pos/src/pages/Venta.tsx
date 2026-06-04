import { useState, useEffect } from "react"
import { ShoppingCart, X, Settings, LogOut } from "lucide-react"
import { Navigate, useSearchParams, useNavigate } from "react-router-dom"
import { Buscador } from "../components/Buscador"
import { Carrito } from "../components/Carrito"
import { ModalCobro } from "../components/ModalCobro"
import { Ticket } from "../components/Ticket"
import { BarraComandos } from "../components/BarraComandos"
import { PedidosEnEspera } from "../components/PedidosEnEspera"
import { CargarCotizacionPopup } from "../components/CargarCotizacionPopup"
import { usePedidosEnEspera, guardarEnEspera } from "../lib/pedidos-espera"
import { usePOS, efectivoPrecio } from "../lib/pos-store"
import { useToasts } from "../hooks/useToasts"
import { crearCotizacion, actualizarCotizacion, type VentaResponse, type Cotizacion } from "../lib/client"

// Ancho a partir del cual el carrito se muestra como columna fija a la derecha.
// Por debajo, cae al drawer deslizable con FAB (terminales/pantallas angostas).
const ANCHO_CARRITO_FIJO = 1100

export function Venta() {
  const { state, dispatch, total } = usePOS()
  const navigate = useNavigate()
  const [mostrarCobro, setMostrarCobro] = useState(false)
  const [ventaCompletada, setVentaCompletada] = useState<VentaResponse | null>(null)
  // El carrito es columna fija en pantallas anchas; drawer en las angostas.
  const [carritoFijo, setCarritoFijo] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= ANCHO_CARRITO_FIJO
  )
  const [carritoAbierto, setCarritoAbierto] = useState(false)   // solo aplica en modo drawer
  const [esperaAbierta, setEsperaAbierta] = useState(false)
  const [cargarCotAbierto, setCargarCotAbierto] = useState(false)
  // Folio a auto-cargar cuando se llega con ?cotizacion=… desde el módulo admin.
  const [folioCotInicial, setFolioCotInicial] = useState<string | null>(null)
  // Cotización recién impresa (para reusar el Ticket como documento imprimible).
  const [cotizacionImpresa, setCotizacionImpresa] = useState<Cotizacion | null>(null)
  const [guardandoCot, setGuardandoCot] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const { pedidos, refrescar } = usePedidosEnEspera()
  const { toasts, push } = useToasts()
  const numItems = state.items.length

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

  // Deep-link "Cargar en venta" desde el módulo admin (?cotizacion=folio): abre
  // el popup auto-seleccionando esa cotización y limpia el parámetro de la URL.
  useEffect(() => {
    const folio = searchParams.get("cotizacion")
    if (!folio) return
    setFolioCotInicial(folio)
    setCargarCotAbierto(true)
    // Construir un objeto nuevo en vez de mutar el de estado del router.
    const next = new URLSearchParams(searchParams)
    next.delete("cotizacion")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

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

  // Pone el carrito actual en espera (guardar + liberar la caja) y refresca el badge.
  function ponerEnEspera() {
    if (state.items.length === 0) return
    const reg = guardarEnEspera(state.items, state.clienteActivo, total)
    dispatch({ type: "CLEAR" })
    refrescar()
    setCarritoAbierto(false)
    push(`Pedido "${reg.nombre}" puesto en espera`, "success")
  }

  // Guarda la cotización en el servidor (folio COT-) y abre el ticket para
  // imprimirla. Al cerrar el ticket se limpia el carrito (CLEAR sale del modo).
  async function imprimirCotizacion() {
    if (!cajero || state.items.length === 0 || guardandoCot) return
    setGuardandoCot(true)
    try {
      const items = state.items.map((i) => ({
        sku: i.sku,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: efectivoPrecio(i),
        impuesto: i.impuesto,
        ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre } : {}),
      }))
      const datosCliente = {
        cliente_id: state.clienteActivo?.id ?? null,
        cliente_nombre: state.clienteActivo?.nombre ?? null,
        num_precio: state.clienteActivo?.num_precio ?? null,
      }
      // Si la transacción nació de una cotización cargada, ACTUALIZA la misma
      // (mismo folio) en vez de crear una nueva — así no se duplica al reimprimir.
      const folioCargado = state.cotizacionCargadaFolio
      const cot = folioCargado
        ? await actualizarCotizacion(folioCargado, { items, ...datosCliente })
        : await crearCotizacion({ cajero: cajero.nombre, turno_id: cajero.turno_id, items, ...datosCliente })
      setCarritoAbierto(false)
      setCotizacionImpresa(cot)
      // Si era nueva, recordamos su folio para mantener el modo cotización ligado
      // (permite venderla luego marcándola convertida).
      if (!folioCargado) {
        dispatch({ type: "CARGAR_COTIZACION", items: state.items, cliente: state.clienteActivo, folio: cot.folio })
      }
      push(folioCargado ? `Cotización ${cot.folio} actualizada` : `Cotización ${cot.folio} guardada`, "success")
    } catch (e) {
      push(e instanceof Error ? e.message : "No se pudo guardar la cotización", "error")
    } finally {
      setGuardandoCot(false)
    }
  }

  // Cierra el ticket de cotización SIN limpiar: el carrito y el vínculo con la
  // cotización se conservan para poder seguir editándola o convertirla en venta.
  function cerrarCotizacionImpresa() {
    setCotizacionImpresa(null)
  }

  return (
    <div className={`venta-page${carritoFijo ? " venta-page--carrito-fijo" : ""}`}>
      {/* ===== Header fila 1 — identidad y contexto ===== */}
      <header className="pos-header">
        <span className="pos-marca">FERREMEX POS</span>
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
          {cajero.permisos.puede_ver_admin && (
            <button className="pos-header-btn" onClick={() => navigate("/admin")} title="Panel de administración">
              <Settings size={16} /> Panel
            </button>
          )}
          <button
            className="pos-header-btn pos-header-btn--salir"
            onClick={() => navigate("/", { replace: true })}
            title="Cerrar sesión"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      {/* ===== Header fila 2 — barra de comandos (incluye selector de cliente) ===== */}
      <BarraComandos
        pedidosEnEspera={pedidos.length}
        onAbrirEspera={() => setEsperaAbierta(true)}
        onCargarCotizacion={() => setCargarCotAbierto(true)}
      />

      {/* ===== Cuerpo: buscador (izq) + carrito (der, fijo o drawer) ===== */}
      <main className="venta-main">
        <section className={`venta-izquierda${carritoFijo ? "" : " venta-izquierda--full"}`}>
          <Buscador />
        </section>

        {/* Carrito como columna fija (pantallas anchas) */}
        {carritoFijo && (
          <aside className="venta-derecha">
            <Carrito onCobrar={abrirCobro} onImprimirCotizacion={imprimirCotizacion} onPonerEnEspera={ponerEnEspera} />
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
            <Carrito onCobrar={abrirCobro} onImprimirCotizacion={imprimirCotizacion} onPonerEnEspera={ponerEnEspera} />
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

      {/* ===== Ticket de venta (se imprime + gancho de factura) ===== */}
      {ventaCompletada && (
        <Ticket
          venta={ventaCompletada}
          cliente={state.clienteActivo}
          onImpreso={handleTicketImpreso}
        />
      )}

      {/* ===== Cargar cotización (popup cristal + comparación de precios) ===== */}
      <CargarCotizacionPopup
        open={cargarCotAbierto}
        folioInicial={folioCotInicial}
        onClose={() => { setCargarCotAbierto(false); setFolioCotInicial(null) }}
        pushToast={push}
      />

      {/* ===== Ticket de cotización impresa ===== */}
      {cotizacionImpresa && (
        <Ticket
          venta={{
            folio: cotizacionImpresa.folio,
            fecha: cotizacionImpresa.fecha,
            cajero: cotizacionImpresa.cajero,
            items: cotizacionImpresa.items,
            total: cotizacionImpresa.total,
            pago_efectivo: 0,
            pago_transferencia: 0,
            pago_credito: 0,
            cambio: 0,
          }}
          cliente={state.clienteActivo}
          esCotizacion
          onImpreso={cerrarCotizacionImpresa}
        />
      )}

      {/* ===== Toasts ===== */}
      <div className="venta-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`venta-toast venta-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  )
}
