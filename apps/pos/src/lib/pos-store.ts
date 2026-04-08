import { createElement, createContext, useContext, useReducer, type ReactNode } from "react"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CartItem {
  sku: string
  descripcion: string
  precio: number // pesos, sin centavos
  cantidad: number
}

export interface Cajero {
  nombre: string
  turno_id: string // ej: "2026-04-08-m"
}

interface PosState {
  cajero: Cajero | null
  items: CartItem[]
}

type PosAction =
  | { type: "SET_CAJERO"; cajero: Cajero }
  | { type: "ADD_ITEM"; item: Omit<CartItem, "cantidad"> }
  | { type: "INCREMENT"; sku: string }
  | { type: "DECREMENT"; sku: string }
  | { type: "REMOVE"; sku: string }
  | { type: "CLEAR" }

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function posReducer(state: PosState, action: PosAction): PosState {
  switch (action.type) {
    case "SET_CAJERO":
      return { ...state, cajero: action.cajero }

    case "ADD_ITEM": {
      const existe = state.items.find((i) => i.sku === action.item.sku)
      if (existe) {
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
          i.sku === action.sku ? { ...i, cantidad: i.cantidad + 1 } : i
        ),
      }

    case "DECREMENT":
      return {
        ...state,
        items: state.items
          .map((i) => (i.sku === action.sku ? { ...i, cantidad: i.cantidad - 1 } : i))
          .filter((i) => i.cantidad > 0),
      }

    case "REMOVE":
      return { ...state, items: state.items.filter((i) => i.sku !== action.sku) }

    case "CLEAR":
      return { ...state, items: [] }

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
  const [state, dispatch] = useReducer(posReducer, { cajero: null, items: [] })
  const total = state.items.reduce((sum, i) => sum + i.precio * i.cantidad, 0)
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
  const fecha = now.toISOString().slice(0, 10) // "2026-04-08"
  const hora = now.getHours()
  const turno = hora < 14 ? "m" : "t" // mañana o tarde
  return `${fecha}-${turno}`
}
