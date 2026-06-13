import { model } from "@medusajs/framework/utils"

/**
 * Configuración global del programa de Monedero Electrónico (puntos de lealtad).
 *
 * Singleton lógico: se mantiene UNA sola fila. El service expone
 * getOrCreateConfig() que la crea con defaults la primera vez. Dato maestro
 * compartido entre terminales (BD, terminal-agnostic).
 *
 * El motor de cálculo de puntos (devengo y canje) vive parcialmente aquí
 * (parámetros) y parcialmente en apps/pos/src/lib/monedero.ts (la fórmula),
 * que se aplica tanto en el backend (POST /caja/ventas) como en la UI (preview).
 */
const ConfigMonedero = model.define("monedero_config", {
  id: model.id().primaryKey(),
  // Cuánto vale 1 punto en pesos al canjear. Ej: 1.00 → 1 punto = $1.
  valor_punto: model.number().default(1),
  // % de generación de puntos por defecto para TODO producto (ej. 1.0 = 1%).
  // Las ReglaPuntos lo sobreescriben por marca/depto/categoría.
  tasa_base: model.number().default(1),
  // Tope: % máximo del total del ticket que se puede pagar con puntos (0–100).
  max_canje_pct: model.number().default(50),
  // Mínimo de puntos acumulados para poder canjear.
  min_puntos_canje: model.number().default(100),
  // Los puntos caducan tras N meses sin actividad. 0 = nunca caducan.
  vencimiento_meses: model.number().default(0),
  // Toggles de confirmación de canje (espejo de la config de Periféricos).
  confirmar_huella: model.boolean().default(false),
  confirmar_codigo: model.boolean().default(false),
  // Cómo redondear los puntos generados por línea: "abajo" (Math.floor),
  // "normal" (Math.round) o "ninguno" (decimales).
  redondeo: model.enum(["abajo", "normal", "ninguno"]).default("abajo"),
  // Ventana del periodo para el auto-ascenso de nivel: cuántos meses hacia atrás
  // se suman las compras del cliente para decidir su nivel (ej. 1 = mensual).
  periodo_nivel_meses: model.number().default(1),
})

export default ConfigMonedero
