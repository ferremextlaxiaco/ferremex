import { useState, useEffect, useRef } from "react"
import { ShoppingCart, X, Settings, LogOut, RefreshCw, UserCircle, ChevronDown, PanelRightClose, PanelRightOpen } from "lucide-react"
import { Navigate, useSearchParams, useNavigate } from "react-router-dom"
import { Buscador } from "../components/Buscador"
import { Carrito } from "../components/Carrito"
import { ModalCobro } from "../components/ModalCobro"
import { Ticket } from "../components/Ticket"
import { ComprobanteEncargo } from "../components/ComprobanteEncargo"
import { TicketsEntrega } from "../components/TicketsEntrega"
import { BarraComandos } from "../components/BarraComandos"
import { PedidosEnEspera } from "../components/PedidosEnEspera"
import { CargarCotizacionPopup } from "../components/CargarCotizacionPopup"
import { SelectorVendedor } from "../components/SelectorVendedor"
import { CambiarUsuarioModal } from "../components/CambiarUsuarioModal"
import { SelectorCajaModal } from "../components/SelectorCajaModal"
import { ArticuloLibreModal } from "../components/ArticuloLibreModal"
import { usePedidosEnEspera, guardarEnEspera } from "../lib/pedidos-espera"
import { usePOS, efectivoPrecio } from "../lib/pos-store"
import { claveLinea } from "../lib/promociones"
import { useToasts } from "../hooks/useToasts"
import { crearCotizacion, actualizarCotizacion, obtenerEncargoPorFolio, obtenerEntregaPorFolio, type VentaResponse, type Cotizacion, type EncargoFicha, type EntregaFicha } from "../lib/client"

// Ancho a partir del cual el carrito se muestra como columna fija a la derecha.
// Por debajo, cae al drawer deslizable con FAB (terminales/pantallas angostas).
const ANCHO_CARRITO_FIJO = 1100

export function Venta() {
  const { state, dispatch, total, promosCarrito } = usePOS()
  const navigate = useNavigate()
  const [mostrarCobro, setMostrarCobro] = useState(false)
  const [ventaCompletada, setVentaCompletada] = useState<VentaResponse | null>(null)
  // Comprobante de encargo a mostrar tras el ticket (venta por encargo).
  const [comprobanteEncargo, setComprobanteEncargo] = useState<EncargoFicha | null>(null)
  // Tickets de entrega (cliente + repartidor) tras una venta contra entrega, en
  // vez del ticket normal (no hubo pago hoy).
  const [ticketsEntrega, setTicketsEntrega] = useState<{ venta: VentaResponse; ficha: EntregaFicha } | null>(null)
  // El carrito es columna fija en pantallas anchas; drawer en las angostas.
  const [carritoFijo, setCarritoFijo] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= ANCHO_CARRITO_FIJO
  )
  const [carritoAbierto, setCarritoAbierto] = useState(false)   // solo aplica en modo drawer
  // Colapsar la columna fija del carrito (solo modo ancho). Se recuerda por terminal.
  const [carritoColapsado, setCarritoColapsado] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("pos_carrito_colapsado") === "1"
  )
  const [esperaAbierta, setEsperaAbierta] = useState(false)
  const [cargarCotAbierto, setCargarCotAbierto] = useState(false)
  const [cambiarUsuario, setCambiarUsuario] = useState(false)
  // Menú "Sesión": agrupa Cambiar usuario + Cerrar sesión en un solo botón.
  const [menuSesion, setMenuSesion] = useState(false)
  const menuSesionRef = useRef<HTMLDivElement>(null)
  // Selector de caja. `obligatorio` = se abrió porque intentó cobrar sin caja
  // (al elegir caja se reanuda el cobro). false = cambio voluntario desde el chip.
  const [selectorCaja, setSelectorCaja] = useState<null | { obligatorio: boolean }>(null)
  const [articuloLibreAbierto, setArticuloLibreAbierto] = useState(false)
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

  // Mostrar/ocultar la columna del carrito (modo ancho), recordando la preferencia.
  function toggleCarritoColapsado() {
    setCarritoColapsado((prev) => {
      const next = !prev
      try { localStorage.setItem("pos_carrito_colapsado", next ? "1" : "0") } catch { /* noop */ }
      return next
    })
  }

  // Cerrar el menú "Sesión" con Escape o clic fuera.
  useEffect(() => {
    if (!menuSesion) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuSesion(false) }
    const onClick = (e: MouseEvent) => {
      if (menuSesionRef.current && !menuSesionRef.current.contains(e.target as Node)) setMenuSesion(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onClick)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onClick)
    }
  }, [menuSesion])

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
    // Venta con entrega a domicilio (contra entrega, envío con abono o envío ya
    // pagado completo): en vez del ticket normal, cargar la ficha y mostrar los
    // comprobantes de entrega (cliente + repartidor + flete si lo hay). Cubre el
    // caso de pago completo, que NO queda "por_cobrar" pero sí lleva
    // `entrega_domicilio: "pagada"`.
    if (venta.estado === "por_cobrar" || venta.metodo_pago === "contra_entrega" || venta.entrega_domicilio) {
      obtenerEntregaPorFolio(venta.folio)
        .then((ficha) => {
          if (ficha) setTicketsEntrega({ venta, ficha })
          else setVentaCompletada(venta) // fallback: ticket normal si no hay ficha
        })
        .catch(() => setVentaCompletada(venta))
      return
    }
    setVentaCompletada(venta)
  }

  function handleTicketImpreso() {
    const venta = ventaCompletada
    setVentaCompletada(null)
    // Venta por encargo: tras el ticket, cargar la ficha recién creada y ofrecer
    // el comprobante de encargo (el papel que el cliente conserva). Best-effort:
    // si no hay ficha (no se llenó) o falla la carga, simplemente no se abre.
    if (venta?.items?.some((i) => i.encargo)) {
      obtenerEncargoPorFolio(venta.folio)
        .then((f) => { if (f) setComprobanteEncargo(f) })
        .catch(() => { /* sin comprobante, no bloquea */ })
    }
  }

  function abrirCobro() {
    setCarritoAbierto(false)
    // No se puede vender sin una caja: el corte se agrupa por caja física. Si el
    // usuario no tiene caja (ni asignada ni elegida), se le exige elegir una
    // primero; al elegirla se reanuda el cobro automáticamente.
    if (!cajero.caja_id) {
      setSelectorCaja({ obligatorio: true })
      return
    }
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
      const items = state.items.map((i) => {
        // Precio unitario ya con promoción aplicada (consistente con la venta).
        const linea = promosCarrito.get(claveLinea(i))
        const precioUnit = linea && i.cantidad > 0
          ? Math.round((linea.importe / i.cantidad) * 100) / 100
          : efectivoPrecio(i)
        return {
          sku: i.sku,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: precioUnit,
          impuesto: i.impuesto,
          ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre } : {}),
        }
      })
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
        {/* Bloque izquierdo: marca + fecha/turno de contexto (no interactiva). */}
        <div className="pos-header-izquierda">
          <span className="pos-marca">FERREMEX POS</span>
          <span className="pos-sesion-turno pos-marca-turno">{cajero.turno_id}</span>
        </div>
        <div className="pos-header-derecha">
          <span className="pos-sesion">
            {/* Chip de caja clickeable: cambia la caja activa de la sesión. Si no
                hay caja, invita a elegir una (necesaria para vender). */}
            <button
              type="button"
              className={`pos-sesion-caja${cajero.caja_nombre ? "" : " pos-sesion-caja--sin"}`}
              onClick={() => setSelectorCaja({ obligatorio: false })}
              title={cajero.caja_nombre ? "Cambiar de caja" : "Selecciona una caja para vender"}
              style={{ cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit" }}
            >
              {cajero.caja_nombre ? `🟢 ${cajero.caja_nombre}` : "○ Sin caja"}
            </button>
          </span>
          {/* Vendedor de la venta actual (atribución; no afecta el corte). */}
          <SelectorVendedor />
          {cajero.permisos.puede_ver_admin && (
            <button className="pos-header-btn" onClick={() => navigate("/admin")} title="Panel de administración">
              <Settings size={16} /> Panel
            </button>
          )}
          {/* Menú "Sesión": agrupa Cambiar usuario + Cerrar sesión. */}
          <div className="pos-sesion-menu-wrap" ref={menuSesionRef}>
            <button
              className="pos-header-btn"
              onClick={() => setMenuSesion((v) => !v)}
              title="Opciones de sesión"
              aria-haspopup="menu"
              aria-expanded={menuSesion}
            >
              <UserCircle size={16} /> Sesión
              <ChevronDown size={14} style={{ marginLeft: 2, transform: menuSesion ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {menuSesion && (
              <div className="pos-sesion-menu" role="menu">
                <button
                  role="menuitem"
                  className="pos-sesion-menu-item"
                  onClick={() => { setMenuSesion(false); setCambiarUsuario(true) }}
                >
                  <RefreshCw size={16} /> Cambiar usuario
                </button>
                <button
                  role="menuitem"
                  className="pos-sesion-menu-item pos-sesion-menu-item--salir"
                  onClick={() => { setMenuSesion(false); navigate("/", { replace: true }) }}
                >
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== Header fila 2 — barra de comandos (incluye selector de cliente) ===== */}
      <BarraComandos
        pedidosEnEspera={pedidos.length}
        onAbrirEspera={() => setEsperaAbierta(true)}
        onCargarCotizacion={() => setCargarCotAbierto(true)}
        onArticuloLibre={() => setArticuloLibreAbierto(true)}
      />

      {/* ===== Cuerpo: buscador (izq) + carrito (der, fijo o drawer) ===== */}
      <main className="venta-main">
        <section className={`venta-izquierda${carritoFijo ? "" : " venta-izquierda--full"}`}>
          <Buscador />
        </section>

        {/* Carrito como columna fija (pantallas anchas). Se puede colapsar para
            dar todo el ancho al buscador; la preferencia se recuerda. */}
        {carritoFijo && !carritoColapsado && (
          <aside className="venta-derecha">
            <button
              className="carrito-colapsar-btn"
              onClick={toggleCarritoColapsado}
              title="Ocultar carrito"
              aria-label="Ocultar carrito"
            >
              <PanelRightClose size={18} />
            </button>
            <Carrito onCobrar={abrirCobro} onImprimirCotizacion={imprimirCotizacion} onPonerEnEspera={ponerEnEspera} />
          </aside>
        )}
      </main>

      {/* Botón flotante para volver a mostrar el carrito cuando está colapsado */}
      {carritoFijo && carritoColapsado && (
        <button className="carrito-mostrar-fab" onClick={toggleCarritoColapsado} title="Mostrar carrito">
          <PanelRightOpen size={20} />
          <span className="carrito-mostrar-fab-texto">Carrito</span>
          {numItems > 0 && <span className="carrito-fab-badge">{numItems}</span>}
        </button>
      )}

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
          pushToast={push}
        />
      )}

      {/* ===== Comprobante de encargo (venta sobre pedido) ===== */}
      {comprobanteEncargo && (
        <ComprobanteEncargo
          ficha={comprobanteEncargo}
          negocio={state.ticketConfig?.encabezado?.nombre || "FERREMEX"}
          onCerrar={() => setComprobanteEncargo(null)}
        />
      )}

      {/* ===== Tickets de entrega (cliente + repartidor) ===== */}
      {ticketsEntrega && (
        <TicketsEntrega
          venta={ticketsEntrega.venta}
          ficha={ticketsEntrega.ficha}
          onCerrar={() => setTicketsEntrega(null)}
        />
      )}

      {/* ===== Cargar cotización (popup cristal + comparación de precios) ===== */}
      <CargarCotizacionPopup
        open={cargarCotAbierto}
        folioInicial={folioCotInicial}
        onClose={() => { setCargarCotAbierto(false); setFolioCotInicial(null) }}
        pushToast={push}
      />

      {/* ===== Cambiar usuario sin cerrar caja ===== */}
      {cambiarUsuario && <CambiarUsuarioModal onClose={() => setCambiarUsuario(false)} />}

      {/* ===== Artículo libre (fuera de catálogo) ===== */}
      {articuloLibreAbierto && <ArticuloLibreModal onClose={() => setArticuloLibreAbierto(false)} />}

      {/* ===== Selector de caja (al cobrar sin caja, o cambio voluntario) ===== */}
      {selectorCaja && (
        <SelectorCajaModal
          obligatorio={selectorCaja.obligatorio}
          onClose={() => setSelectorCaja(null)}
          // Si se abrió por intento de cobro, al elegir caja se reanuda el cobro.
          onElegida={() => { if (selectorCaja.obligatorio) setMostrarCobro(true) }}
        />
      )}

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
            pago_tarjeta: 0,
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
