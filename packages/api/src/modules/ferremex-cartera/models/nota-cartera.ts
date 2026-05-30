import { model } from "@medusajs/framework/utils"
import CarteraCliente from "./cartera-cliente"

/** Nota libre sobre la cartera de un cliente (espejo de `NotaCartera`). */
const NotaCartera = model.define("cartera_nota", {
  id: model.id().primaryKey(),
  fecha: model.text(),
  hora: model.text(),
  autor: model.text(),
  texto: model.text(),
  cartera: model.belongsTo(() => CarteraCliente, { mappedBy: "notas" }),
})

export default NotaCartera
