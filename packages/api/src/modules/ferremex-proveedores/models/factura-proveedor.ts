import { model } from "@medusajs/framework/utils"
import Proveedor from "./proveedor"

/**
 * Una factura por pagar a un proveedor (cuenta por pagar). Espejo del tipo
 * `FacturaCredito` del frontend (lib/proveedores.ts).
 *
 * Importado en el service como `FacturaProveedor` (no "Factura") para que el
 * pluralizador inglés genere métodos legibles: listFacturaProveedors /
 * createFacturaProveedors.
 */
const FacturaProveedor = model.define("proveedor_factura", {
  id: model.id().primaryKey(),
  numero_factura: model.text(),
  fecha_emision: model.text(), // YYYY-MM-DD
  dias_credito: model.number(),
  monto: model.number(),
  descripcion: model.text(),
  pagada: model.boolean().default(false),
  proveedor: model.belongsTo(() => Proveedor, { mappedBy: "facturas" }),
})

export default FacturaProveedor
