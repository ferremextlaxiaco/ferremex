import { model } from "@medusajs/framework/utils"

/**
 * Marca de "departamento facturable". El usuario decide qué departamentos son
 * facturables (ej. Ferretería sí, Construcción no — o al revés, según su
 * estrategia fiscal). Un artículo solo puede facturarse si su departamento está
 * marcado como facturable Y tiene saldo facturable.
 *
 * Se identifica por el NOMBRE del departamento (la taxonomía del POS usa nombres
 * de depto; ver listarCatalogos). Solo se guardan filas para los departamentos
 * marcados; un depto sin fila = no facturable (default conservador).
 */
const DeptoFacturable = model.define("depto_facturable", {
  id: model.id().primaryKey(),
  // Nombre del departamento (coincide con la taxonomía Dept→Cat→Marca).
  departamento: model.text().unique(),
  facturable: model.boolean().default(true),
  actualizado_el: model.text().nullable(),
})

export default DeptoFacturable
