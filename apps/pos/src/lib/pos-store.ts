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
  mayoreoActivo?: boolean
  mayoreoMin?: number
}

export function efectivoPrecio(item: CartItem): number {
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
  permisos: Permisos
}

interface PosState {
  cajero: Cajero | null
  items: CartItem[]
  ticketConfig: TicketConfig | null
  clienteActivo: Cliente | null
}

type PosAction =
  | { type: "SET_CAJERO"; cajero: Cajero }
  | { type: "ADD_ITEM"; item: Omit<CartItem, "cantidad"> }
  | { type: "INCREMENT"; sku: string }
  | { type: "DECREMENT"; sku: string }
  | { type: "SET_CANTIDAD"; sku: string; cantidad: number }
  | { type: "REMOVE"; sku: string }
  | { type: "CLEAR" }
  | { type: "SET_TICKET_CONFIG"; config: TicketConfig }
  | { type: "SET_CLIENTE"; cliente: Cliente | null }

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

    case "CLEAR":
      // Al vaciar el carrito (o completar una venta) se reinicia el cliente activo
      return { ...state, items: [], clienteActivo: null }

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
