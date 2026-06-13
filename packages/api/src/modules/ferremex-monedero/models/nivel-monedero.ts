import { model } from "@medusajs/framework/utils"

/**
 * Un nivel/tier del programa de lealtad (Bronce, Plata, Oro, Constructor…).
 * Configurable por el admin. El nivel de un cliente NO se almacena: se DERIVA
 * de sus compras del periodo (config.periodo_nivel_meses) comparadas contra
 * `umbral_periodo`, eligiendo el nivel de mayor `orden` cuyo umbral se alcanza.
 *
 * Cada nivel aplica un `multiplicador` a los puntos ganados y, opcionalmente,
 * beneficios extra: mejor valor de canje (`valor_punto_bonus`) y/o forzar un
 * nivel de precio del cliente (`nivel_precio` 2|3|4).
 */
const NivelMonedero = model.define("monedero_nivel", {
  id: model.id().primaryKey(),
  nombre: model.text(),
  // Orden ascendente del tier (1 = más bajo). Define la jerarquía de ascenso.
  orden: model.number().default(0),
  // Compras (MXN) acumuladas en el periodo necesarias para alcanzar el nivel.
  // El nivel base (orden 1) normalmente lleva umbral 0.
  umbral_periodo: model.number().default(0),
  // Factor sobre los puntos ganados (1.0 = sin bonus, 2.0 = doble).
  multiplicador: model.number().default(1),
  // Beneficio opcional: mejor valor de canje para clientes de este nivel.
  // null = usa el valor_punto global.
  valor_punto_bonus: model.number().nullable(),
  // Beneficio opcional: fuerza este nivel de precio (2|3|4) al cliente.
  // null = respeta el num_precio propio del cliente.
  nivel_precio: model.number().nullable(),
  // Color del badge en la UI (hex). Ej. "#f59e0b" para Oro.
  color: model.text().nullable(),
  activo: model.boolean().default(true),
})

export default NivelMonedero
