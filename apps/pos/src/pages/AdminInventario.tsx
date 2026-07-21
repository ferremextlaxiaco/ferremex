import { Navigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import { InventarioModule } from "../modules/InventarioModule"

/**
 * Ajuste de inventario. Antes era un `<iframe>` a un HTML estático fuera de React
 * (deuda POS-I6); ahora monta el módulo React `InventarioModule`, que consume
 * `ajustarInventario()` de client.ts y el sistema de toasts del POS.
 */
export function AdminInventario() {
  const { state } = usePOS()

  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ajustar_inventario) return <Navigate to="/admin" replace />

  return <InventarioModule />
}
