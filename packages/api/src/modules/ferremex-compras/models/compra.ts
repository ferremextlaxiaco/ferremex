import { model } from "@medusajs/framework/utils"
import ArticuloCompra from "./articulo-compra"

/**
 * Una compra registrada (recepción de factura/nota de proveedor). Dato
 * compartido entre terminales. Antes vivía en localStorage
 * (`pos_historial_compras`), aislado por navegador.
 *
 * `proveedor_id` enlaza al catálogo (ferremex_proveedores); `proveedor` (nombre)
 * se conserva como snapshot para mostrar/compatibilidad histórica. El estado
 * "Recibida"/"Cancelada" y la auditoría de cancelación viven aquí.
 */
const Compra = model.define("compra", {
  id: model.id().primaryKey(),
  // Único: evita compras duplicadas con el mismo folio (última línea de defensa
  // ante el race check-then-write del frontend, multi-terminal).
  folio: model.text().unique(),
  proveedor: model.text(), // snapshot del nombre al momento de la compra
  proveedor_id: model.text().nullable(), // FK lógica al catálogo de proveedores
  fecha: model.text(), // YYYY-MM-DD
  tipo: model.text().default("Factura"),
  estado: model.text().default("Recibida"), // "Recibida" | "Cancelada"
  subtotal: model.number().default(0),
  iva: model.number().default(0),
  total: model.number().default(0),
  cancelada_el: model.text().nullable(), // ISO datetime
  motivo_cancelacion: model.text().nullable(),
  articulos: model.hasMany(() => ArticuloCompra, { mappedBy: "compra" }),
})

export default Compra
