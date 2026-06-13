import { model } from "@medusajs/framework/utils"

/**
 * Override de la tasa de generación de puntos para un ámbito de la taxonomía
 * (marca, departamento o categoría). Sobreescribe la `tasa_base` global del
 * ConfigMonedero para los productos que caen en ese ámbito.
 *
 * Resolución de tasa por línea de venta (la primera que aplique gana):
 *   marca → categoría → departamento → tasa_base
 * (la más específica primero). `tasa = 0` significa EXCLUIDO: ese ámbito no
 * genera puntos (productos sin margen: cemento, varilla, etc.).
 *
 * `ref` referencia un nombre de la taxonomía de listarCatalogos() (no FK dura),
 * igual que las promociones enlazan por SKU sin relación: la taxonomía vive en
 * otro módulo (categorías de Medusa + metadata).
 */
const ReglaPuntos = model.define("monedero_regla", {
  id: model.id().primaryKey(),
  ambito: model.enum(["marca", "departamento", "categoria"]),
  // Nombre del ámbito tal como aparece en listarCatalogos() (ej. "Truper").
  // Se compara por nombre normalizado en el motor.
  ref: model.text(),
  // % de generación. 0 = excluido (no genera puntos).
  tasa: model.number().default(0),
  activa: model.boolean().default(true),
})

export default ReglaPuntos
