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
  cartera: model.belongsTo(() => CarteraCliente, { mappedBy: "movimientos" }),
})

export default MovimientoCartera
