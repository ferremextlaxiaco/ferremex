import { model } from "@medusajs/framework/utils"
import CarteraCliente from "./cartera-cliente"

/**
 * Registro de un cambio en el límite de crédito del cliente (espejo de
 * `HistorialLimite`). El valor vigente del límite vive en
 * `customer.metadata.limite_credito`; aquí queda la bitácora auditable.
 */
const HistorialLimite = model.define("cartera_historial_limite", {
  id: model.id().primaryKey(),
  fecha: model.text(),
  usuario: model.text(),
  anterior: model.number(),
  nuevo: model.number(),
  nota: model.text(),
  cartera: model.belongsTo(() => CarteraCliente, { mappedBy: "historialLimite" }),
})

export default HistorialLimite
