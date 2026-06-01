import { model } from "@medusajs/framework/utils"
import Compra from "./compra"

/**
 * Una línea de artículo dentro de una compra (snapshot al momento de comprar:
 * código, nombre, cantidad, precio unitario y taxonomía). Espejo del shape
 * `articulos[]` del frontend (ComprasModule / ConsultarCompras).
 *
 * Es un snapshot inmutable: no se enlaza al producto vivo, preserva los datos
 * tal como estaban en la compra (para el comparativo de precios histórico).
 */
const ArticuloCompra = model.define("compra_articulo", {
  id: model.id().primaryKey(),
  codigo: model.text().default(""),
  nombre: model.text().default(""),
  cantidad: model.number().default(0),
  precio_unit: model.number().default(0),
  categoria: model.text().nullable(),
  departamento: model.text().nullable(),
  marca: model.text().nullable(),
  compra: model.belongsTo(() => Compra, { mappedBy: "articulos" }),
})

export default ArticuloCompra
