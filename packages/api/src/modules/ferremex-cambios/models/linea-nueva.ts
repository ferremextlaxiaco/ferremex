import { model } from "@medusajs/framework/utils"
import Cambio from "./cambio"

/** Un artículo nuevo que el cliente se lleva en el cambio, a precio de catálogo vigente. */
const LineaNueva = model.define("cambio_linea_nueva", {
  id: model.id().primaryKey(),
  sku: model.text(),
  descripcion: model.text(),
  cantidad: model.number(),
  precio_unitario: model.number(),
  subtotal: model.number(),
  cambio: model.belongsTo(() => Cambio, { mappedBy: "lineasNuevas" }),
})

export default LineaNueva
