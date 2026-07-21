import { model } from "@medusajs/framework/utils"

/**
 * Marca qué ámbito de la taxonomía (marca, categoría o departamento) ADMITE
 * comisión para vendedores. Es un toggle GLOBAL (no por empleado): se activa
 * desde el módulo Catálogos, junto a la edición de cada Depto/Cat/Marca.
 *
 * Solo si un eje está `habilitado` aquí puede tener ComisionRegla asociadas en
 * Empleados — si se deshabilita, las reglas de empleados sobre él quedan
 * inertes (no se borran, por si se re-habilita después).
 *
 * `ref` es el nombre normalizado del ámbito tal como aparece en
 * listarCatalogos() (igual criterio que ferremex_monedero/ReglaPuntos.ref):
 * los ids derivados de Catálogos (dep-…, cat-…, mar-…) se recalculan en cada
 * carga a partir de metadata de productos y NO son estables, así que no sirven
 * como llave — el nombre sí es la referencia estable de negocio.
 */
const ComisionEje = model.define("comision_eje", {
  id: model.id().primaryKey(),
  ambito: model.enum(["marca", "categoria", "departamento"]),
  ref: model.text(),
  habilitado: model.boolean().default(true),
})

export default ComisionEje
