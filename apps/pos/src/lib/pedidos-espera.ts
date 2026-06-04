import { useState, useEffect, useCallback } from "react"
import type { CartItem } from "./pos-store"
import type { Cliente } from "./clientes"
import { uuid } from "./utils"

/**
 * Pedidos en espera / cotizaciones — almacén local por terminal.
 *
 * Son borradores en curso (carrito + cliente guardados para atender a otra
 * persona), NO ventas: viven en localStorage por terminal a propósito, igual
 * que `ferremex_pedidos_espera` de PedidosModule. Cada caja tiene su fila.
 *
 * El hook y los helpers viven aquí (no en el componente) para que el módulo
 * del componente exporte solo componentes — requisito de React Fast Refresh.
 */

export const STORAGE_KEY = "pos_pedidos_espera"

export interface PedidoEspera {
  id: string
  nombre: string            // etiqueta libre ("Sr. López", "Obra calle 5")
  guardado_en: string       // ISO
  items: CartItem[]
  cliente: Cliente | null
  total: number
}

export function leerEspera(): PedidoEspera[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PedidoEspera[]) : []
  } catch {
    return []
  }
}

export function escribirEspera(lista: PedidoEspera[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
}

/**
 * Guarda un carrito en la fila de espera y devuelve el registro creado.
 * Nombre por defecto: la etiqueta dada → nombre del cliente → "Pedido HH:MM".
 * Centraliza la lógica para que el botón del carrito y el panel la compartan.
 */
export function guardarEnEspera(
  items: CartItem[],
  cliente: Cliente | null,
  total: number,
  etiqueta?: string
): PedidoEspera {
  const nombre =
    etiqueta?.trim() ||
    cliente?.nombre ||
    `Pedido ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`
  const nuevo: PedidoEspera = {
    id: uuid(),
    nombre,
    guardado_en: new Date().toISOString(),
    items,
    cliente,
    total,
  }
  escribirEspera([nuevo, ...leerEspera()])
  return nuevo
}

/**
 * Hook compartido: expone la lista en espera y un `refrescar()` explícito.
 *
 * El badge de la pantalla de venta y el panel usan instancias independientes de
 * este hook; tras cada mutación el panel llama su propio `refrescar()` y el del
 * padre vía callback (el evento "storage" NO se dispara en la misma pestaña).
 */
export function usePedidosEnEspera() {
  const [pedidos, setPedidos] = useState<PedidoEspera[]>(() => leerEspera())

  const refrescar = useCallback(() => setPedidos(leerEspera()), [])

  useEffect(() => {
    // Sincroniza si otra pestaña/instancia cambia la lista.
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) refrescar()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [refrescar])

  return { pedidos, refrescar }
}
