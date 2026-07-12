import { model } from "@medusajs/framework/utils"
import Cambio from "./cambio"

/**
 * Un artículo devuelto en un cambio. Precio al de la VENTA ORIGINAL (lo que el
 * cliente pagó), no el vigente — evita regalar o cobrar de más por
 * fluctuaciones de precio entre la venta y el cambio.
 */
const LineaDevuelta = model.define("cambio_linea_devuelta", {
  id: model.id().primaryKey(),
  sku: model.text(),
  descripcion: model.text(),
  cantidad: model.number(),
  precio_unitario: model.number(),
  subtotal: model.number(),
  cambio: model.belongsTo(() => Cambio, { mappedBy: "lineasDevueltas" }),
})

export default LineaDevuelta
