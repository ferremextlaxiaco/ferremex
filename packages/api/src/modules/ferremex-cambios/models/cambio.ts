import { model } from "@medusajs/framework/utils"
import LineaDevuelta from "./linea-devuelta"
import LineaNueva from "./linea-nueva"

/**
 * Registro de un cambio de artículo (devolución con cambio, NO reembolso).
 * El cliente regresa artículos de una venta previa (`venta_origen_folio`) y se
 * lleva otro(s) del catálogo. Nunca se devuelve efectivo:
 *   - Si el valor nuevo >= el devuelto: la diferencia se cobra y se registra
 *     como una venta normal aparte (`venta_diferencia_folio`).
 *   - Si el valor nuevo < el devuelto: la diferencia se acredita como saldo a
 *     favor (módulo ferremex_saldo_cambio), requiere `customer_id`.
 */
const Cambio = model.define("cambio", {
  id: model.id().primaryKey(),
  folio_cambio: model.text().unique(),
  venta_origen_folio: model.text(),
  fecha: model.text(), // ISO
  cajero: model.text(),
  caja_id: model.text().nullable(),
  caja_name: model.text().nullable(),
  vendedor: model.text().nullable(),
  customer_id: model.text().nullable(),
  cliente_nombre: model.text().nullable(),
  valor_devuelto: model.number(),
  valor_nuevo: model.number(),
  // valor_nuevo - valor_devuelto. Positivo = se cobró; negativo = saldo a favor.
  diferencia: model.number(),
  diferencia_cobrada: model.number().default(0),
  saldo_generado: model.number().default(0),
  venta_diferencia_folio: model.text().nullable(),
  estado: model.enum(["completado", "cancelado"]).default("completado"),
  motivo_cancelacion: model.text().nullable(),
  fecha_cancelacion: model.text().nullable(),
  lineasDevueltas: model.hasMany(() => LineaDevuelta, { mappedBy: "cambio" }),
  lineasNuevas: model.hasMany(() => LineaNueva, { mappedBy: "cambio" }),
})

export default Cambio
