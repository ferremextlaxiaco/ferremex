import { model } from "@medusajs/framework/utils"

/**
 * Movimiento de saldo a favor por cambio de mercancía. Se genera cuando un
 * cliente cambia un artículo por otro de MENOR valor (nunca se devuelve
 * efectivo — ver módulo ferremex_cambios) y se consume en una compra futura
 * como método de pago. Enlazado directo por `customer_id` (sin entidad
 * "cliente" intermedia, igual que ferremex_monedero).
 */
const MovimientoSaldoCambio = model.define("saldo_cambio_movimiento", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  tipo: model.enum(["generado", "consumido", "ajuste"]),
  // Positivo = aumenta el saldo (generado/ajuste+); negativo = lo reduce
  // (consumido/ajuste-). El saldo disponible es la suma de no cancelados.
  monto: model.number(),
  fecha: model.text(), // ISO
  // Folio del cambio que generó este saldo (tipo="generado").
  origen_cambio_folio: model.text().nullable(),
  // Folio de la venta donde se gastó este saldo (tipo="consumido").
  venta_consumo_folio: model.text().nullable(),
  descripcion: model.text(),
  // Anulación auditable (ej. se cancela el cambio que lo generó). No se borra.
  cancelado: model.boolean().default(false),
  motivo_cancelacion: model.text().nullable(),
  fecha_cancelacion: model.text().nullable(),
})

export default MovimientoSaldoCambio
