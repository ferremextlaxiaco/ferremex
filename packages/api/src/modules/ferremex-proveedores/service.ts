import { MedusaService } from "@medusajs/framework/utils"
import Proveedor from "./models/proveedor"
// Importado como FacturaProveedor (no "Factura") para que MedusaService genere
// métodos legibles: listFacturaProveedors / createFacturaProveedors.
import FacturaProveedor from "./models/factura-proveedor"

/**
 * Service del módulo ferremex_proveedores.
 *
 * MedusaService genera el CRUD base. OJO con la pluralización inglesa de Medusa:
 * el modelo `Proveedor` genera métodos `listProveedors` / `createProveedors`
 * (no "Proveedores"), igual que `MovimientoCartera` → `listMovimientoCarteras`.
 * Aquí añadimos helpers de negocio: el autoincremento del num_proveedor y la
 * carga del proveedor con sus facturas, para que las rutas /caja/proveedores no
 * repitan esa lógica.
 */
class FerremexProveedoresService extends MedusaService({
  Proveedor,
  FacturaProveedor,
}) {
  /** Carga un proveedor con sus facturas. null si no existe. */
  async getProveedorConFacturas(id: string) {
    const proveedores = await this.listProveedors({ id })
    if (proveedores.length === 0) return null
    const proveedor = proveedores[0]
    const facturas = await this.listFacturaProveedors({ proveedor_id: id })
    return { ...proveedor, facturas }
  }

  /**
   * Siguiente num_proveedor disponible (rellena el hueco más bajo), con padding
   * a 3 dígitos. Espejo de `siguienteNumProveedor` del frontend.
   */
  async siguienteNumProveedor(): Promise<string> {
    const proveedores = await this.listProveedors({})
    const usados = new Set(
      proveedores
        .map((p: any) => parseInt(p.num_proveedor, 10))
        .filter((n: number) => !isNaN(n) && n > 0)
    )
    let siguiente = 1
    while (usados.has(siguiente)) siguiente++
    return String(siguiente).padStart(3, "0")
  }

  /** Agrega una factura por pagar a un proveedor. */
  async agregarFactura(
    proveedor_id: string,
    factura: {
      numero_factura: string
      fecha_emision: string
      dias_credito: number
      monto: number
      descripcion: string
      pagada?: boolean
    }
  ) {
    return await this.createFacturaProveedors({
      ...factura,
      pagada: factura.pagada ?? false,
      proveedor_id,
    })
  }
}

export default FerremexProveedoresService
