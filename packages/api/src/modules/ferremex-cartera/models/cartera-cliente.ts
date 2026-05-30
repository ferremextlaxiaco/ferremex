import { model } from "@medusajs/framework/utils"
import Movimiento from "./movimiento"
import NotaCartera from "./nota-cartera"
import HistorialLimite from "./historial-limite"

/**
 * Raíz de la cartera de crédito de un cliente. Se enlaza 1:1 con un Customer
 * nativo de Medusa por `customer_id` (único). Agrupa los movimientos (cargos y
 * pagos), las notas y el historial de cambios de límite.
 *
 * El cálculo FIFO de saldos y el semáforo de vencimiento NO viven aquí: se
 * computan en el cliente (CarteraCredito.jsx) a partir de los movimientos
 * crudos que este módulo persiste.
 */
const CarteraCliente = model.define("cartera_cliente", {
  id: model.id().primaryKey(),
  // id del Customer nativo de Medusa (cus_...). Único: una cartera por cliente.
  customer_id: model.text().unique(),
  movimientos: model.hasMany(() => Movimiento, { mappedBy: "cartera" }),
  notas: model.hasMany(() => NotaCartera, { mappedBy: "cartera" }),
  historialLimite: model.hasMany(() => HistorialLimite, { mappedBy: "cartera" }),
})

export default CarteraCliente
