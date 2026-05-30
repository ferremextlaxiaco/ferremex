import { defineMiddlewares } from "@medusajs/medusa"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { validarPosToken } from "../lib/pos-auth"

// Las rutas /caja/* no requieren cors explícito:
// en dev el proxy de Vite (puerto 7002→9000) las convierte en same-origin.
// En red local las cajas también acceden por Vite en 192.168.1.105:7002.
//
// Las rutas mutantes (POST/PUT/PATCH/DELETE) están protegidas por un token
// compartido del POS (header X-POS-Token validado contra POS_TOKEN). Es un
// puente hasta tener autenticación de cajero real: evita que cualquier
// dispositivo en la LAN registre ventas, resetee folios o cambie config.
// Si POS_TOKEN no está definido en el entorno, la validación se desactiva (dev).
function requerirPosToken(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  // Defensa adicional: /caja/login nunca exige token (es el punto de entrada).
  // El matcher de abajo ya lo excluye vía especificidad, pero cubrimos también el
  // caso de que el path llegue como "/caja/login" o "/login" (relativo al mount).
  const p = req.path
  if (p === "/caja/login" || p === "/login" || p.endsWith("/caja/login")) {
    next()
    return
  }
  if (!validarPosToken(req)) {
    res.status(401).json({ error: "Token POS inválido o ausente" })
    return
  }
  next()
}

export default defineMiddlewares({
  routes: [
    {
      // Matcher exacto para login SIN token (mayor especificidad → se aplica antes).
      matcher: "/caja/login",
      method: ["POST"],
      middlewares: [],
    },
    {
      matcher: "/caja/*",
      method: ["POST", "PUT", "PATCH", "DELETE"],
      middlewares: [requerirPosToken],
    },
  ],
})
