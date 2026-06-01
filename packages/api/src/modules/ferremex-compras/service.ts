import { MedusaService } from "@medusajs/framework/utils"
import Compra from "./models/compra"
// Importado como ArticuloCompra: el pluralizador inglés genera listArticuloCompras.
import ArticuloCompra from "./models/articulo-compra"

/**
 * Service del módulo ferremex_compras.
 *
 * MedusaService genera el CRUD base. OJO con la pluralización inglesa: el modelo
 * `Compra` genera `listCompras`/`createCompras` (coincide con el español por
 * casualidad), `ArticuloCompra` → `listArticuloCompras`. Aquí añadimos helpers
 * para crear una compra con sus artículos y cargarla completa.
 */
class FerremexComprasService extends MedusaService({
  Compra,
  ArticuloCompra,
}) {
  /** Crea una compra con sus líneas de artículo en una sola operación. */
  async crearCompraConArticulos(
    compra: {
      folio: string
      proveedor: string
      proveedor_id?: string | null
      fecha: string
      tipo?: string
      estado?: string
      subtotal?: number
      iva?: number
      total?: number
    },
    articulos: {
      codigo?: string
      nombre?: string
      cantidad?: number
      precio_unit?: number
      categoria?: string | null
      departamento?: string | null
      marca?: string | null
    }[]
  ) {
    const creada = await this.createCompras({
      folio: compra.folio,
      proveedor: compra.proveedor,
      proveedor_id: compra.proveedor_id ?? null,
      fecha: compra.fecha,
      tipo: compra.tipo ?? "Factura",
      estado: compra.estado ?? "Recibida",
      subtotal: compra.subtotal ?? 0,
      iva: compra.iva ?? 0,
      total: compra.total ?? 0,
    })
    const compraId = (creada as any).id
    for (const a of articulos) {
      await this.createArticuloCompras({
        codigo: a.codigo ?? "",
        nombre: a.nombre ?? "",
        cantidad: Number(a.cantidad) || 0,
        precio_unit: Number(a.precio_unit) || 0,
        categoria: a.categoria ?? null,
        departamento: a.departamento ?? null,
        marca: a.marca ?? null,
        compra_id: compraId,
      })
    }
    return creada
  }

  /** Carga las compras (filtradas) con sus artículos. */
  async listarComprasConArticulos(filtro: Record<string, any> = {}) {
    const compras = await this.listCompras(filtro)
    const compraIds = (compras as any[]).map((c) => c.id)
    if (compraIds.length === 0) return []
    // Filtrar artículos a las compras cargadas (evita traer toda la tabla cuando
    // se filtra por proveedor_id o se consulta una sola compra).
    const articulos = await this.listArticuloCompras({ compra_id: compraIds })
    const porCompra = new Map<string, any[]>()
    for (const a of articulos as any[]) {
      const arr = porCompra.get(a.compra_id) ?? []
      arr.push(a)
      porCompra.set(a.compra_id, arr)
    }
    return (compras as any[]).map((c) => ({ ...c, articulos: porCompra.get(c.id) ?? [] }))
  }
}

export default FerremexComprasService
