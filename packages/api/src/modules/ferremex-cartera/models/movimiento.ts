import { model } from "@medusajs/framework/utils"
import CarteraCliente from "./cartera-cliente"

/**
 * Un movimiento de cartera: una "compra" (cargo a crédito, normalmente
 * generado al cobrar una venta a crédito) o un "pago" (abono del cliente).
 * Espejo del tipo `Movimiento` del frontend (lib/clientes.ts).
 */
const MovimientoCartera = model.define("cartera_movimiento", {
  id: model.id().primaryKey(),
  tipo: model.enum(["compra", "pago"]),
  monto: model.number(),
  fecha: model.text(), // YYYY-MM-DD
  folio: model.text().nullable(),
  plazo: model.number().nullable(),
  descripcion: model.text(),
  nota: model.text().nullable(),
  // Anulación de un abono registrado por error. El movimiento NO se borra
  // (rastro auditable): se marca cancelado y deja de contar en el cálculo de
  // saldos (el monto "regresa" a la deuda). Aplica sobre todo a tipo="pago".
  cancelado: model.boolean().default(false),
  motivo_cancelacion: model.text().nullable(),
  fecha_cancelacion: model.text().nullable(), // ISO timestamp
  cartera: model.belongsTo(() => CarteraCliente, { mappedBy: "movimientos" }),
})

export default MovimientoCartera
