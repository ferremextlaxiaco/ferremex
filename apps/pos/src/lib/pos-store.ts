import {
  createElement,
  createContext,
  useContext,
  useReducer,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react"
import type { TicketConfig, Promocion } from "./client"
import { listarPromociones } from "./client"
import type { Cliente } from "./clientes"
import {
  calcularPromosCarrito,
  contextoDeCliente,
  claveLinea,
  type LineaPromo,
} from "./promociones"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CartItem {
  sku: string
  descripcion: string
  precio: number
  precio2?: number
  // Niveles de precio 3 y 4 (Distribuidor / Especial). Solo se cargan cuando el
  // backend los expone (para promos de tipo "nivel_precio"); opcionales y
  // retrocompatibles — su ausencia no afecta el precio base ni el mayoreo.
  precio3?: number
  precio4?: number
  cantidad: number
  existencia: number
  // Marca del producto (de la búsqueda). Opcional y retrocompatible. La usa el
  // motor del Monedero Electrónico (lib/monedero.ts) para resolver la tasa de
  // puntos por taxonomía. Su ausencia hace que la línea use la tasa base salvo
  // que matchee por departamento/categoría reales (ver abajo).
  marca?: string | null
  // Departamento y categoría REALES del producto (de su metadata). El motor del
  // Monedero los usa directo para resolver reglas por departamento/categoría aun
  // cuando el producto no tiene marca. Opcionales/retrocompatibles.
  departamento?: string | null
  categoria?: string | null
  // Proveedor del producto (de la búsqueda). Se propaga al carrito para la venta
  // por encargo: si la línea se vende sin stock, alimenta el pedido de este
  // proveedor. Vacío = sin proveedor asignado (pedido "sin asignar").
  proveedor?: string | null
  proveedor_id?: string | null
  // Marca de "venta por encargo": la línea se vende SIN existencia (sobre pedido).
  // La activa el cajero al confirmar el modal de encargo en el cobro. Cuando true,
  // el carrito no bloquea el cobro por esta línea y el backend descuenta en negativo.
  esEncargo?: boolean
  /** Si true, `precio`/`precio2` ya incluyen IVA (16%). Para el desglose fiscal. */
  impuesto?: boolean
  mayoreoActivo?: boolean
  mayoreoMin?: number
  // Venta fraccionada (granel): si true, la línea acepta cantidad DECIMAL y el
  // carrito ofrece captura por monto ($) con recálculo automático de la cantidad.
  // `unidadVenta` = código SAT de la unidad (kg/m/L) para mostrarla junto al peso.
  granel?: boolean
  unidadVenta?: string
  // Artículo especial (a granel): la línea se agregó eligiendo una PRESENTACIÓN
  // (m³/carretilla/bote). `esGranel` marca que su inventario es INFORMATIVO — el
  // carrito nunca la topa por existencia y el backend descuenta sin bloquear.
  // `presentacion` = nombre mostrado ("Carretilla"). `granelFactor` = equivalencia
  // en unidad base por unidad de presentación (para el descuento informativo; 0/
  // null = no descuenta). El descuento total = cantidad × granelFactor.
  esGranel?: boolean
  presentacion?: string
  granelFactor?: number | null
  // SKU REAL del producto padre (sin el sufijo de presentación). El `sku` de la
  // línea es compuesto (`PADRE::presId`) para que cada presentación sea su propia
  // línea; `granelSku` es el que el backend usa para descontar inventario.
  granelSku?: string
  // Cuando el item forma parte de un paquete vendido, `precio` ya es el precio
  // prorrateado del paquete para esa línea, `paquete_id`/`paquete_nombre` lo
  // marcan, y `paqueteCantidad` es cuántas unidades aporta el paquete por copia
  // (para poder recomputar al agregar/quitar el paquete). El mayoreo NO aplica a
  // items de paquete (el precio del paquete manda).
  paquete_id?: string
  paquete_nombre?: string
  paqueteCantidad?: number
  // Artículo "libre": capturado a mano en venta porque no existe en el catálogo
  // (ej. una caja de cartón, un servicio puntual). Su `sku` es generado
  // (LIBRE-<timestamp>) y NUNCA corresponde a un producto real de Medusa — no es
  // reportable ni reutilizable. Se marca para que ticket/carrito lo distingan.
  libre?: boolean
  // Línea de SERVICIO DE FLETE. Es un producto Medusa real (SKU SERVICIO-FLETE)
  // con clave SAT → suma al total y aparece en el ticket como cualquier línea, y
  // es FACTURABLE. Pero NO genera puntos de monedero (es un servicio, no compra),
  // y su precio lo define el vendedor en la ficha de entrega. Solo puede haber una
  // línea de flete por venta.
  esFlete?: boolean
}

/** Los 4 modos de la pantalla de venta (derivados de los flags del estado). */
export type ModoVenta = "venta" | "cotizacion" | "encargo" | "reposicion"

/** Modo de venta actual derivado de los flags. Fuente única para el selector. */
export function modoVentaActual(s: { modoCotizacion: boolean; modoEncargo: boolean; encargoReposicion: boolean }): ModoVenta {
  if (s.modoCotizacion) return "cotizacion"
  if (s.modoEncargo) return s.encargoReposicion ? "reposicion" : "encargo"
  return "venta"
}

export function efectivoPrecio(item: CartItem): number {
  // Items de paquete usan su precio prorrateado tal cual (sin mayoreo).
  if (item.paquete_id) return item.precio
  if (item.mayoreoActivo && item.precio2 && item.mayoreoMin && item.cantidad >= item.mayoreoMin) {
    return item.precio2
  }
  return item.precio
}

export interface Permisos {
  puede_vender: boolean
  puede_cotizar: boolean
  puede_anular: boolean
  puede_ver_corte: boolean
  puede_ver_admin: boolean
}

export interface Cajero {
  id: string
  nombre: string
  alias?: string
  rol: "admin" | "supervisor" | "cajero"
  turno_id: string
  // Caja física asignada al empleado (heredada al iniciar sesión). Sella el
  // corte y acota sus movimientos. null/undefined si el empleado no tiene caja.
  caja_id?: string | null
  caja_nombre?: string | null
  permisos: Permisos
}

interface PosState {
  cajero: Cajero | null
  items: CartItem[]
  ticketConfig: TicketConfig | null
  clienteActivo: Cliente | null
  // Modo cotización: el carrito se trata como presupuesto (imprime cotización en
  // vez de cobrar; no descuenta inventario). `cotizacionCargadaFolio` guarda el
  // folio de la cotización que se cargó (si la transacción nació de una), para
  // marcarla "convertida" al venderse.
  modoCotizacion: boolean
  cotizacionCargadaFolio: string | null
  // Modo encargo: el carrito se cobra como venta sobre pedido (ficha + anticipo +
  // pedido al proveedor). Excluyente con modoCotizacion. Tiene DOS sub-modos según
  // `encargoReposicion`:
  //   - MIXTO (encargoReposicion=false): se puede mezclar stock y faltantes; las
  //     líneas con stock SÍ descuentan inventario, los faltantes/excedentes se
  //     encargan (inventario en negativo). Resolución automática por existencia.
  //   - REPOSICIÓN (encargoReposicion=true): NADA descuenta inventario aunque haya
  //     stock; todo se pide al proveedor (no_descontar en todas las líneas).
  // Se resetean al terminar la venta (CLEAR).
  modoEncargo: boolean
  encargoReposicion: boolean
  // Vendedor de la venta actual (quién la hace). `null` = el cajero logueado.
  // Se cambia en el panel de venta cuando otra persona atiende en esta caja; es
  // solo atribución (reportes/comisiones), NO afecta el corte (que agrupa por
  // caja). Se resetea al terminar la venta (CLEAR) y al cambiar de cajero.
  vendedorVenta: { id: string; nombre: string } | null
}

// Línea de un componente de paquete tal como entra al carrito: trae su precio
// prorrateado ya calculado y la cantidad que aporta una copia del paquete.
export interface LineaPaquete {
  sku: string
  descripcion: string
  precioProrrateado: number
  cantidad: number
  existencia: number
}

type PosAction =
  | { type: "SET_CAJERO"; cajero: Cajero }
  | { type: "ADD_ITEM"; item: Omit<CartItem, "cantidad"> }
  | { type: "INCREMENT"; sku: string }
  | { type: "DECREMENT"; sku: string }
  | { type: "SET_CANTIDAD"; sku: string; cantidad: number }
  // Marca/desmarca una línea como "venta por encargo" (sin stock). Si `sku` se
  // omite, aplica a TODAS las líneas que exceden su existencia (uso del modal de
  // encargo: "vender todo lo faltante por encargo").
  | { type: "SET_ENCARGO"; sku?: string; esEncargo: boolean }
  | { type: "REMOVE"; sku: string }
  // Agrega/actualiza (o quita, con precio<=0) la línea de SERVICIO DE FLETE del
  // carrito. Solo hay una línea de flete por venta. La usa la ficha de entrega a
  // domicilio: al confirmar con flete, se inserta la línea con el precio elegido.
  | { type: "SET_FLETE"; sku: string; descripcion: string; precio: number; impuesto: boolean }
  | { type: "ADD_PAQUETE"; paqueteId: string; paqueteNombre: string; lineas: LineaPaquete[] }
  | { type: "REMOVE_PAQUETE"; paqueteId: string }
  // Vacía SOLO los productos del carrito. NO toca el cliente, el vendedor ni el
  // modo cotización — es lo que hace el botón "Vaciar" (quitar lo agregado). Para
  // el reset total de fin de transacción usa CLEAR.
  | { type: "CLEAR_ITEMS" }
  // Reset TOTAL de la transacción: items + cliente + vendedor + modo cotización.
  // Se usa al completar la venta o al poner el carrito en espera (ya guardado
  // aparte). NO lo uses para el botón "Vaciar".
  | { type: "CLEAR" }
  | { type: "SET_TICKET_CONFIG"; config: TicketConfig }
  | { type: "SET_CLIENTE"; cliente: Cliente | null }
  // Cambia el vendedor de la venta actual. `null` vuelve al cajero logueado.
  | { type: "SET_VENDEDOR"; vendedor: { id: string; nombre: string } | null }
  // Asigna/cambia la caja física de la sesión actual (cuando el cajero no traía
  // caja asignada y la elige al vender, o la cambia). No re-loguea; el corte y
  // los movimientos se agrupan por esta caja. Queda activa toda la sesión.
  | { type: "SET_CAJA"; caja_id: string | null; caja_nombre: string | null }
  // Restaura un carrito completo (items + cliente) de una sola vez. Lo usa
  // "Pedidos en espera" al retomar un pedido/cotización guardado.
  | { type: "RESTORE_CART"; items: CartItem[]; cliente: Cliente | null }
  // Alterna el modo cotización (toggle "Convertir a cotización" ↔ "Convertir a
  // venta"). Al desactivarlo se olvida la cotización cargada (vuelve a venta limpia).
  | { type: "SET_MODO_COTIZACION"; activo: boolean }
  // Activa/desactiva el modo encargo. `reposicion` elige el sub-modo: false =
  // mixto (descuenta lo que hay, encarga faltantes), true = reposición (no
  // descuenta nada). Excluyente con cotización.
  | { type: "SET_MODO_ENCARGO"; activo: boolean; reposicion?: boolean }
  // Carga una cotización guardada al carrito: restaura items + cliente, entra en
  // modo cotización y recuerda su folio para enlazarla si se convierte en venta.
  | { type: "CARGAR_COTIZACION"; items: CartItem[]; cliente: Cliente | null; folio: string }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "SET_CAJERO":
      // Cambiar de cajero descarta el vendedor manual de la venta (vuelve al nuevo
      // cajero por defecto).
      return { ...state, cajero: action.cajero, vendedorVenta: null }

    case "SET_TICKET_CONFIG":
      return { ...state, ticketConfig: action.config }

    case "SET_CLIENTE":
      return { ...state, clienteActivo: action.cliente }

    case "SET_VENDEDOR":
      return { ...state, vendedorVenta: action.vendedor }

    case "SET_CAJA":
      // Solo cambia la caja de la sesión; conserva cajero, turno y permisos.
      if (!state.cajero) return state
      return { ...state, cajero: { ...state.cajero, caja_id: action.caja_id, caja_nombre: action.caja_nombre } }

    case "ADD_ITEM": {
      const existe = state.items.find((i) => i.sku === action.item.sku)
      // Un item marcado como encargo (o una línea ya de encargo) no se topa al
      // inventario: se vende sobre pedido (puede quedar en negativo al cobrar).
      // El modo encargo global libera el tope para TODO el carrito.
      const esEncargo = state.modoEncargo || !!action.item.esEncargo || !!existe?.esEncargo
      // Artículo especial (granel): inventario informativo → nunca se topa por
      // existencia (igual que cotización/encargo). El bloqueo real es el switch
      // "Agotado", que el front valida antes de despachar ADD_ITEM.
      const esGranelLinea = !!action.item.esGranel || !!existe?.esGranel
      if (existe) {
        // En cotización, encargo o granel no se topa al inventario. En venta normal sí.
        if (!state.modoCotizacion && !esEncargo && !esGranelLinea && existe.cantidad >= existe.existencia) return state
        return {
          ...state,
          items: state.items.map((i) =>
            i.sku === action.item.sku
              ? { ...i, cantidad: i.cantidad + 1, ...(action.item.esEncargo ? { esEncargo: true } : {}) }
              : i
          ),
        }
      }
      return { ...state, items: [...state.items, { ...action.item, cantidad: 1 }] }
    }

    case "INCREMENT":
      return {
        ...state,
        items: state.items.map((i) =>
          // En cotización, modo encargo o granel (inventario informativo) se
          // permite exceder la existencia.
          i.sku === action.sku && (state.modoCotizacion || state.modoEncargo || i.esGranel || i.cantidad < i.existencia)
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        ),
      }

    case "DECREMENT":
      return {
        ...state,
        items: state.items
          .map((i) => (i.sku === action.sku ? { ...i, cantidad: i.cantidad - 1 } : i))
          .filter((i) => i.cantidad > 0),
      }

    case "SET_CANTIDAD": {
      // En cotización o si la línea es ENCARGO, el tope es la cantidad pedida (no
      // la existencia); en venta normal, se limita a lo disponible en inventario.
      const linea = state.items.find(i => i.sku === action.sku)
      const existencia = linea?.existencia ?? action.cantidad
      // Granel = inventario informativo → sin tope (como cotización/encargo).
      const sinTope = state.modoCotizacion || state.modoEncargo || !!linea?.esEncargo || !!linea?.esGranel
      const tope = sinTope ? action.cantidad : existencia
      // Granel: se permite cantidad DECIMAL (ej. 0.541 kg o 1.5 m³), mínimo 0.001
      // y redondeada a 3 decimales. Aplica a la venta fraccionada (`granel`) y a
      // las presentaciones de artículo especial (`esGranel`). No-granel: entero,
      // mínimo 1 (como siempre).
      const esGranel = !!linea?.granel || !!linea?.esGranel
      const min = esGranel ? 0.001 : 1
      const bruto = Math.max(min, Math.min(action.cantidad, tope))
      const clamped = esGranel ? Math.round(bruto * 1000) / 1000 : bruto
      return {
        ...state,
        items: state.items.map((i) => i.sku === action.sku ? { ...i, cantidad: clamped } : i),
      }
    }

    case "SET_ENCARGO":
      return {
        ...state,
        items: state.items.map((i) => {
          // Con sku: solo esa línea. Sin sku: todas las que exceden su existencia.
          const aplica = action.sku ? i.sku === action.sku : i.cantidad > i.existencia
          return aplica ? { ...i, esEncargo: action.esEncargo } : i
        }),
      }

    case "REMOVE":
      return { ...state, items: state.items.filter((i) => i.sku !== action.sku) }

    case "SET_FLETE": {
      // Quita cualquier línea de flete previa (solo una por venta).
      const sinFlete = state.items.filter((i) => !i.esFlete)
      // Precio <= 0 = quitar el flete (no re-agregar).
      if (!(action.precio > 0)) return { ...state, items: sinFlete }
      const lineaFlete: CartItem = {
        sku: action.sku,
        descripcion: action.descripcion,
        precio: Math.round(action.precio * 100) / 100,
        cantidad: 1,
        existencia: 0,
        impuesto: action.impuesto,
        esFlete: true,
      }
      // El flete va al FINAL del carrito (después de la mercancía).
      return { ...state, items: [...sinFlete, lineaFlete] }
    }

    case "ADD_PAQUETE": {
      // Agrega (o incrementa) una copia del paquete: por cada línea suma su
      // `cantidad` a la línea de carrito de ese paquete+sku. Si el SKU ya está
      // suelto (sin paquete), lo absorbe al paquete. Respeta existencia.
      let items = [...state.items]
      for (const l of action.lineas) {
        const idx = items.findIndex(
          (i) => i.sku === l.sku && (i.paquete_id === action.paqueteId || !i.paquete_id)
        )
        if (idx >= 0) {
          const actual = items[idx]
          const nuevaCant = Math.min(actual.existencia, actual.cantidad + l.cantidad)
          items[idx] = {
            ...actual,
            cantidad: nuevaCant,
            precio: l.precioProrrateado,
            paquete_id: action.paqueteId,
            paquete_nombre: action.paqueteNombre,
            paqueteCantidad: l.cantidad,
          }
        } else {
          items.push({
            sku: l.sku,
            descripcion: l.descripcion,
            precio: l.precioProrrateado,
            cantidad: Math.min(l.existencia, l.cantidad),
            existencia: l.existencia,
            paquete_id: action.paqueteId,
            paquete_nombre: action.paqueteNombre,
            paqueteCantidad: l.cantidad,
          })
        }
      }
      return { ...state, items }
    }

    case "REMOVE_PAQUETE":
      // Quita por completo todas las líneas de ese paquete del carrito.
      return { ...state, items: state.items.filter((i) => i.paquete_id !== action.paqueteId) }

    case "CLEAR_ITEMS":
      // Botón "Vaciar": quita SOLO los productos agregados. Conserva el cliente,
      // el vendedor y el modo cotización — la transacción sigue en curso, el
      // cajero solo quiere reempezar la captura de artículos.
      return { ...state, items: [] }

    case "CLEAR":
      // Reset TOTAL: al completar una venta o poner el carrito en espera se
      // reinicia el cliente activo, el vendedor manual y se sale del modo
      // cotización (la transacción terminó / se guardó aparte).
      return { ...state, items: [], clienteActivo: null, vendedorVenta: null, modoCotizacion: false, modoEncargo: false, encargoReposicion: false, cotizacionCargadaFolio: null }

    case "RESTORE_CART":
      // Reemplaza el carrito y el cliente con un pedido en espera retomado.
      return { ...state, items: action.items, clienteActivo: action.cliente }

    case "SET_MODO_COTIZACION":
      // Al apagar el modo cotización se olvida la cotización cargada. Cotización y
      // encargo son excluyentes: activar cotización apaga el modo encargo.
      return {
        ...state,
        modoCotizacion: action.activo,
        modoEncargo: action.activo ? false : state.modoEncargo,
        encargoReposicion: action.activo ? false : state.encargoReposicion,
        cotizacionCargadaFolio: action.activo ? state.cotizacionCargadaFolio : null,
      }

    case "SET_MODO_ENCARGO":
      // Modo encargo (mixto o reposición según `reposicion`). Excluyente con
      // cotización: activarlo apaga el modo cotización.
      return {
        ...state,
        modoEncargo: action.activo,
        encargoReposicion: action.activo ? !!action.reposicion : false,
        modoCotizacion: action.activo ? false : state.modoCotizacion,
        cotizacionCargadaFolio: action.activo ? null : state.cotizacionCargadaFolio,
      }

    case "CARGAR_COTIZACION":
      return {
        ...state,
        items: action.items,
        clienteActivo: action.cliente,
        modoCotizacion: true,
        modoEncargo: false,
        encargoReposicion: false,
        cotizacionCargadaFolio: action.folio,
      }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Instrumentación de diagnóstico (Bug: venta sin cliente pese a estar elegido)
// ---------------------------------------------------------------------------
// Envuelve el reducer y registra TODA transición de `clienteActivo` (id + nombre)
// junto con la acción que la causó y un stack trace, para poder identificar qué
// acción borra el cliente la próxima vez que ocurra. Ligero: solo hace algo
// cuando el cliente realmente cambia. Se puede quitar una vez diagnosticado.
function posReducerConTraza(state: PosState, action: PosAction): PosState {
  const next = posReducer(state, action)
  const antes = state.clienteActivo
  const despues = next.clienteActivo
  if (antes?.id !== despues?.id) {
    const marca = `[POS clienteActivo] ${action.type}: ` +
      `${antes ? `${antes.nombre} (${antes.id})` : "∅"} → ` +
      `${despues ? `${despues.nombre} (${despues.id})` : "∅"}`
    // Perder el cliente (algo → ∅) es lo sospechoso: lo marcamos con warn + stack
    // para ver desde qué componente se despachó. Ganarlo o cambiarlo va como info.
    if (antes && !despues) {
      // eslint-disable-next-line no-console
      console.warn(marca, "\n", new Error("traza de dispatch").stack)
    } else {
      // eslint-disable-next-line no-console
      console.info(marca)
    }
  }
  return next
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PosContextValue {
  state: PosState
  dispatch: React.Dispatch<PosAction>
  /** Total del carrito YA con promociones aplicadas (igual a base/mayoreo si no hay promos). */
  total: number
  /** Resultado de promociones por línea (sku → LineaPromo). Para badges/desglose. */
  promosCarrito: Map<string, LineaPromo>
  /** Suma de descuentos de promoción aplicados al carrito (0 si ninguno). */
  ahorroPromos: number
  /** Catálogo completo de promociones activas (para consultar si un SKU participa). */
  promos: Promocion[]
  /** Recarga el catálogo de promociones (llamar tras crear/editar/borrar en admin). */
  refrescarPromos: () => void
}

const PosContext = createContext<PosContextValue | null>(null)

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(posReducerConTraza, {
    cajero: null,
    items: [],
    ticketConfig: null,
    clienteActivo: null,
    modoCotizacion: false,
    cotizacionCargadaFolio: null,
    modoEncargo: false,
    encargoReposicion: false,
    vendedorVenta: null,
  })

  // Catálogo de promociones activas. Se carga una vez al montar y se puede
  // refrescar tras editar promos en el admin. Si falla la carga, queda vacío
  // (degradación segura: el carrito funciona como antes, sin promos).
  const [promos, setPromos] = useState<Promocion[]>([])

  // Carga interna: devuelve su propia función de cancelación para el efecto de
  // montaje (evita setState tras desmontar en StrictMode).
  const cargarPromos = useCallback(() => {
    let cancelado = false
    listarPromociones()
      .then((p) => { if (!cancelado) setPromos(p) })
      .catch(() => { if (!cancelado) setPromos([]) })
    return () => { cancelado = true }
  }, [])

  // Pública (para el admin tras editar): dispara la recarga sin exponer cleanup.
  const refrescarPromos = useCallback(() => { cargarPromos() }, [cargarPromos])

  useEffect(() => cargarPromos(), [cargarPromos])

  // Cálculo de promociones por línea + total, memorizado sobre items/cliente/promos.
  const { promosCarrito, total, ahorroPromos } = useMemo(() => {
    const ctx = contextoDeCliente(state.clienteActivo)
    const mapa = calcularPromosCarrito(state.items, promos, ctx)
    let t = 0
    let ahorro = 0
    for (const item of state.items) {
      const linea = mapa.get(claveLinea(item))
      t += linea ? linea.importe : efectivoPrecio(item) * item.cantidad
      ahorro += linea?.descuento ?? 0
    }
    return {
      promosCarrito: mapa,
      total: Math.round(t * 100) / 100,
      ahorroPromos: Math.round(ahorro * 100) / 100,
    }
  }, [state.items, state.clienteActivo, promos])

  return createElement(
    PosContext.Provider,
    { value: { state, dispatch, total, promosCarrito, ahorroPromos, promos, refrescarPromos } },
    children
  )
}

export function usePOS() {
  const ctx = useContext(PosContext)
  if (!ctx) throw new Error("usePOS must be used within PosProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Una franja horaria (de la config de turnos). */
export interface FranjaTurno { id: string; nombre: string; desde: string; hasta: string }

/** Minutos desde medianoche para "HH:MM" (NaN si malformado). */
function minutosHHMM(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Franja a la que pertenece una hora local (min desde medianoche), o null. */
export function franjaActual(franjas: FranjaTurno[], now = new Date()): FranjaTurno | null {
  const min = now.getHours() * 60 + now.getMinutes()
  for (const f of franjas) {
    const a = minutosHHMM(f.desde), b = minutosHHMM(f.hasta)
    if (isNaN(a) || isNaN(b)) continue
    if (a <= b ? (min >= a && min < b) : (min >= a || min < b)) return f
  }
  return null
}

/**
 * Construye el turno_id que se sella al iniciar sesión.
 *  - Modo "día" (default): `YYYY-MM-DD` — un turno por día (corte continuo por
 *    caja, horario flexible). Es el comportamiento por defecto de Fase 1.
 *  - Modo "turnos": `YYYY-MM-DD-<franjaId>` según la franja de la hora actual; si
 *    ninguna franja cubre la hora, cae a día completo.
 * `cfg` viene de obtenerConfigTurnos(); sin cfg → modo día.
 */
export function buildTurnoId(cfg?: { modo: "dia" | "turnos"; franjas: FranjaTurno[] } | null): string {
  const now = new Date()
  const fecha = now.toISOString().slice(0, 10)
  if (!cfg || cfg.modo !== "turnos") return fecha
  const f = franjaActual(cfg.franjas, now)
  return f ? `${fecha}-${f.id}` : fecha
}

/**
 * Dado un turno_id `YYYY-MM-DD-m|t`, devuelve el id del turno siguiente:
 *   - mañana (m) → tarde (t) del mismo día
 *   - tarde (t)  → mañana (m) del día siguiente
 * Se usa en el corte para registrar el fondo dejado en el turno entrante.
 * Si el formato no es reconocible, cae al turno actual (buildTurnoId).
 */
export function siguienteTurnoId(turnoId: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(m|t)$/.exec(turnoId ?? "")
  if (!m) return buildTurnoId()
  const [, y, mes, d, parte] = m
  if (parte === "m") return `${y}-${mes}-${d}-t`
  // tarde → mañana del día siguiente
  const fecha = new Date(Date.UTC(Number(y), Number(mes) - 1, Number(d)))
  fecha.setUTCDate(fecha.getUTCDate() + 1)
  return `${fecha.toISOString().slice(0, 10)}-m`
}
