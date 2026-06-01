import { model } from "@medusajs/framework/utils"

/**
 * Una caja física del POS (terminal de cobro). Dato maestro compartido entre
 * terminales. Antes vivía en localStorage (`pos_cajas_catalogo`), aislado por
 * navegador; ahora es terminal-agnostic en BD.
 *
 * La asignación caja↔empleado NO vive aquí: se persiste como `caja_id` en el
 * registro del usuario POS (usuarios.json), porque los empleados aún no están
 * en BD. Ver /caja/usuarios.
 */
const Caja = model.define("caja", {
  id: model.id().primaryKey(),
  nombre: model.text(),
  descripcion: model.text().nullable(),
  activa: model.boolean().default(true),
})

export default Caja
