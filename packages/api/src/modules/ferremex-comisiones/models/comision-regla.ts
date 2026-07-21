import { model } from "@medusajs/framework/utils"

/**
 * % de comisión que un EMPLEADO recibe sobre un ámbito de la taxonomía (marca,
 * categoría o departamento) ya habilitado en ComisionEje. Mismo patrón que
 * ferremex_monedero/ReglaPuntos, pero por empleado (no global): dos empleados
 * pueden tener % distinto para la misma marca según su desempeño/antigüedad.
 *
 * Resolución de la tasa por línea de venta (la más específica primero, la
 * primera que aplique gana):
 *   marca → categoría → departamento → 0% (sin regla = sin comisión)
 * No hay tasa base: a diferencia del monedero, aquí "sin regla" es 0% a
 * propósito (decisión de negocio — solo comisiona lo explícitamente asignado).
 *
 * `empleado_id` referencia al usuario POS (id string en JSON usuarios-pos.json,
 * no FK dura — igual criterio que el resto de módulos ferremex_* que enlazan
 * con entidades fuera de BD Medusa).
 */
const ComisionRegla = model.define("comision_regla", {
  id: model.id().primaryKey(),
  empleado_id: model.text(),
  ambito: model.enum(["marca", "categoria", "departamento"]),
  ref: model.text(),
  // float (no number/integer): las comisiones necesitan decimales reales
  // (ej. 2.5%, 1.75%) — a diferencia de monedero_regla.tasa, que sí trunca.
  tasa: model.float().default(0),
  activa: model.boolean().default(true),
})

export default ComisionRegla
