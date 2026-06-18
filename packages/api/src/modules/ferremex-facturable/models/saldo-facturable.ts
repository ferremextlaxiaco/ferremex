import { model } from "@medusajs/framework/utils"

/**
 * Saldo facturable de un artículo: cuántas PIEZAS tienen respaldo de factura de
 * compra (CFDI de proveedor) + clave SAT. Es independiente del stock físico
 * (módulo INVENTORY): el físico es lo que hay en bodega; este saldo es el
 * "presupuesto fiscal" de cuántas unidades se pueden timbrar.
 *
 * Reglas (ver módulo ferremex_facturable):
 *  - Sube al recibir una compra marcada "Con Factura" (recarga).
 *  - NO se mueve al vender con ticket; solo baja al FACTURAR (consumo).
 *  - Puede quedar NEGATIVO (sobregiro): el usuario eligió permitir facturar de
 *    más con advertencia. El negativo se marca en rojo en la UI.
 *  - Un artículo sin clave SAT no debería tener saldo (se valida en la ruta/UI).
 */
const SaldoFacturable = model.define("saldo_facturable", {
  id: model.id().primaryKey(),
  // SKU del artículo (clave). Único: un saldo por artículo.
  sku: model.text().unique(),
  // Piezas con respaldo fiscal. Puede ser negativo (sobregiro permitido).
  saldo: model.number().default(0),
  // Espejo de la clave SAT del artículo al momento del último movimiento
  // (informativo; la fuente de verdad es el catálogo de artículos).
  clave_sat: model.text().nullable(),
  // Descripción del artículo (snapshot para mostrar sin re-consultar).
  descripcion: model.text().nullable(),
  // Departamento del artículo (snapshot, para filtrar/agrupar).
  departamento: model.text().nullable(),
  actualizado_el: model.text().nullable(), // ISO datetime
})

export default SaldoFacturable
