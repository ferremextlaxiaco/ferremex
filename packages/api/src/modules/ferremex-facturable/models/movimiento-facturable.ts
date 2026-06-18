import { model } from "@medusajs/framework/utils"

/**
 * Movimiento del saldo facturable de un artículo. Bitácora auditable: TODO
 * cambio al saldo deja un registro (nunca se edita el saldo "a ciegas").
 *
 * tipo:
 *   "recarga" — entra respaldo fiscal (compra Con Factura, o reversa de cancelación)
 *   "consumo" — sale respaldo (al emitir un CFDI que incluye estas piezas)
 *   "ajuste"  — corrección manual del usuario (con motivo)
 *
 * cantidad lleva signo: + entra al saldo, − sale del saldo.
 */
const MovimientoFacturable = model.define("movimiento_facturable", {
  id: model.id().primaryKey(),
  sku: model.text(),
  tipo: model.text(), // "recarga" | "consumo" | "ajuste"
  cantidad: model.number().default(0), // con signo
  // Folio de la compra (recarga) o de la venta/CFDI (consumo) que lo originó.
  folio_ref: model.text().nullable(),
  // UUID/Id del CFDI cuando el movimiento viene de facturar (para reversa).
  cfdi_ref: model.text().nullable(),
  motivo: model.text().nullable(),
  fecha: model.text(), // ISO datetime
})

export default MovimientoFacturable
