import { defineMiddlewares } from "@medusajs/medusa"

// Las rutas /caja/* no requieren cors explícito:
// en dev el proxy de Vite (puerto 7002→9000) las convierte en same-origin.
// En red local las cajas también acceden por Vite en 192.168.1.105:7002.
export default defineMiddlewares({
  routes: [],
})
