import { InventarioModule } from "../modules/InventarioModule"

/**
 * Ajuste de inventario. Antes era un `<iframe>` a un HTML estático fuera de React
 * (deuda POS-I6); ahora monta el módulo React `InventarioModule`, que consume
 * `ajustarInventario()` de client.ts y el sistema de toasts del POS.
 */
export function AdminInventario() {
  return <InventarioModule />
}
