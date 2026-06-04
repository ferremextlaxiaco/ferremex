import { createElement, createContext, useContext, useReducer, type ReactNode } from "react"
import type { TicketConfig } from "./client"
import type { Cliente } from "./clientes"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CartItem {
  sku: string
  descripcion: string
  precio: number
  precio2?: number
  cantidad: number
  existencia: number
  /** Si true, `precio`/`precio2` ya incluyen IVA (16%). Para el desglose fiscal. */
  impuesto?: boolean
  mayoreoActivo?: boolean
  mayoreoMin?: number
  // Cuando el item forma parte de un paquete vendido, `precio` ya es el precio
  // prorrateado del paquete para esa línea, `paquete_id`/`paquete_nombre` lo
  // marcan, y `paqueteCantidad` es cuántas unidades aporta el paquete por copia
  // (para poder recomputar al agregar/quitar el paquete). El mayoreo NO aplica a
  // items de paquete (el precio del paquete manda).
  paquete_id?: string
  paquete_nombre?: string
  paqueteCantidad?: number
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
  | { type: "REMOVE"; sku: string }
  | { type: "ADD_PAQUETE"; paqueteId: string; paqueteNombre: string; lineas: LineaPaquete[] }
  | { type: "REMOVE_PAQUETE"; paqueteId: string }
  | { type: "CLEAR" }
  | { type: "SET_TICKET_CONFIG"; config: TicketConfig }
  | { type: "SET_CLIENTE"; cliente: Cliente | null }
  // Restaura un carrito completo (items + cliente) de una sola vez. Lo usa
  // "Pedidos en espera" al retomar un pedido/cotización guardado.
  | { type: "RESTORE_CART"; items: CartItem[]; cliente: Cliente | null }
  // Alterna el modo cotización (toggle "Convertir a cotización" ↔ "Convertir a
  // venta"). Al desactivarlo se olvida la cotización cargada (vuelve a venta limpia).
  | { type: "SET_MODO_COTIZACION"; activo: boolean }
  // Carga una cotización guardada al carrito: restaura items + cliente, entra en
  // modo cotización y recuerda su folio para enlazarla si se convierte en venta.
  | { type: "CARGAR_COTIZACION"; items: CartItem[]; cliente: Cliente | null; folio: string }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "SET_CAJERO":
      return { ...state, cajero: action.cajero }

    case "SET_TICKET_CONFIG":
      return { ...state, ticketConfig: action.config }

    case "SET_CLIENTE":
      return { ...state, clienteActivo: action.cliente }

    case "ADD_ITEM": {
      const existe = state.items.find((i) => i.sku === action.item.sku)
      if (existe) {
        if (existe.cantidad >= existe.existencia) return state
        return {
          ...state,
          items: state.items.map((i) =>
            i.sku === action.item.sku ? { ...i, cantidad: i.cantidad + 1 } : i
          ),
        }
      }
      return { ...state, items: [...state.items, { ...action.item, cantidad: 1 }] }
    }

    case "INCREMENT":
      return {
        ...state,
        items: state.items.map((i) =>
          i.sku === action.sku && i.cantidad < i.existencia
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
      const clamped = Math.max(1, Math.min(action.cantidad, state.items.find(i => i.sku === action.sku)?.existencia ?? action.cantidad))
      return {
        ...state,
        items: state.items.map((i) => i.sku === action.sku ? { ...i, cantidad: clamped } : i),
      }
    }

    case "REMOVE":
      return { ...state, items: state.items.filter((i) => i.sku !== action.sku) }

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

    case "CLEAR":
      // Al vaciar el carrito (o completar una venta) se reinicia el cliente
      // activo y se sale del modo cotización (transacción terminada).
      return { ...state, items: [], clienteActivo: null, modoCotizacion: false, cotizacionCargadaFolio: null }

    case "RESTORE_CART":
      // Reemplaza el carrito y el cliente con un pedido en espera retomado.
      return { ...state, items: action.items, clienteActivo: action.cliente }

    case "SET_MODO_COTIZACION":
      // Al apagar el modo cotización se olvida la cotización cargada.
      return {
        ...state,
        modoCotizacion: action.activo,
        cotizacionCargadaFolio: action.activo ? state.cotizacionCargadaFolio : null,
      }

    case "CARGAR_COTIZACION":
      return {
        ...state,
        items: action.items,
        clienteActivo: action.cliente,
        modoCotizacion: true,
        cotizacionCargadaFolio: action.folio,
      }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PosContextValue {
  state: PosState
  dispatch: React.Dispatch<PosAction>
  total: number
}

const PosContext = createContext<PosContextValue | null>(null)

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(posReducer, {
    cajero: null,
    items: [],
    ticketConfig: null,
    clienteActivo: null,
    modoCotizacion: false,
    cotizacionCargadaFolio: null,
  })
  const total = state.items.reduce((sum, i) => sum + efectivoPrecio(i) * i.cantidad, 0)
  return createElement(PosContext.Provider, { value: { state, dispatch, total } }, children)
}

export function usePOS() {
  const ctx = useContext(PosContext)
  if (!ctx) throw new Error("usePOS must be used within PosProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildTurnoId(): string {
  const now = new Date()
  const fecha = now.toISOString().slice(0, 10)
  const hora = now.getHours()
  const turno = hora < 14 ? "m" : "t"
  return `${fecha}-${turno}`
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
