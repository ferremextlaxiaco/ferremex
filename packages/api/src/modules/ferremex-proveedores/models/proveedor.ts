import { model } from "@medusajs/framework/utils"
import FacturaProveedor from "./factura-proveedor"

/**
 * Un proveedor de la ferretería. Dato maestro compartido entre terminales.
 * Antes vivía en localStorage (`pos_proveedores`), aislado por navegador.
 *
 * Las `facturas` son cuentas POR PAGAR (crédito que el proveedor nos otorga),
 * el espejo estructural de la cartera de clientes (cuentas por cobrar). El
 * cálculo de vencimiento/semáforo (estadoFactura, diasRestantes) NO vive aquí:
 * se computa en el cliente (lib/proveedores.ts) a partir de las facturas crudas.
 */
const Proveedor = model.define("proveedor", {
  id: model.id().primaryKey(),
  // Número visible del proveedor (autoincremento server-side, único).
  num_proveedor: model.text().unique(),
  nombre: model.text(),
  contacto: model.text().nullable(),
  telefono: model.text().nullable(),
  email: model.text().nullable(),
  dias_credito: model.number().default(0),
  limite_credito: model.number().default(0),
  rfc: model.text().nullable(),
  notas: model.text().nullable(),
  facturas: model.hasMany(() => FacturaProveedor, { mappedBy: "proveedor" }),
})

export default Proveedor
