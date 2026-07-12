import { MedusaService } from "@medusajs/framework/utils"
import Cambio from "./models/cambio"
import LineaDevuelta from "./models/linea-devuelta"
import LineaNueva from "./models/linea-nueva"

/**
 * Service del módulo ferremex_cambios.
 *
 * MedusaService genera el CRUD base (listCambios, createCambios,
 * listLineaDevueltas, createLineaNuevas, etc.). Los helpers de negocio
 * encapsulan el patrón "crear raíz → crear líneas hijas" para que la ruta
 * /caja/cambios no lo repita.
 */
class FerremexCambiosService extends MedusaService({
  Cambio,
  LineaDevuelta,
  LineaNueva,
}) {
  /** Registra el cambio completo: raíz + líneas devueltas + líneas nuevas. */
  async registrarCambio(
    datos: {
      folio_cambio: string
      venta_origen_folio: string
      fecha: string
      cajero: string
      caja_id?: string | null
      caja_name?: string | null
      vendedor?: string | null
      customer_id?: string | null
      cliente_nombre?: string | null
      valor_devuelto: number
      valor_nuevo: number
      diferencia: number
      diferencia_cobrada?: number
      saldo_generado?: number
      venta_diferencia_folio?: string | null
    },
    lineasDevueltas: Array<{ sku: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }>,
    lineasNuevas: Array<{ sku: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }>
  ) {
    const cambio = await this.createCambios({
      ...datos,
      caja_id: datos.caja_id ?? null,
      caja_name: datos.caja_name ?? null,
      vendedor: datos.vendedor ?? null,
      customer_id: datos.customer_id ?? null,
      cliente_nombre: datos.cliente_nombre ?? null,
      diferencia_cobrada: datos.diferencia_cobrada ?? 0,
      saldo_generado: datos.saldo_generado ?? 0,
      venta_diferencia_folio: datos.venta_diferencia_folio ?? null,
    })

    await Promise.all([
      this.createLineaDevueltas(lineasDevueltas.map((l) => ({ ...l, cambio_id: cambio.id }))),
      this.createLineaNuevas(lineasNuevas.map((l) => ({ ...l, cambio_id: cambio.id }))),
    ])

    return await this.getCambioCompleto(cambio.id)
  }

  async getCambioCompleto(id: string) {
    const cambios = await this.listCambios({ id })
    const cambio = cambios[0]
    if (!cambio) return null
    const [lineasDevueltas, lineasNuevas] = await Promise.all([
      this.listLineaDevueltas({ cambio_id: id }),
      this.listLineaNuevas({ cambio_id: id }),
    ])
    return { ...cambio, lineasDevueltas, lineasNuevas }
  }

  async getCambioPorFolio(folio_cambio: string) {
    const cambios = await this.listCambios({ folio_cambio })
    if (!cambios[0]) return null
    return await this.getCambioCompleto(cambios[0].id)
  }

  /** Cambios (no cancelados o todos) cuya venta_origen_folio coincide, para marcar la venta original. */
  async cambiosDeVenta(venta_origen_folio: string) {
    return await this.listCambios({ venta_origen_folio })
  }

  async anularCambio(id: string, motivo: string, fecha_cancelacion: string) {
    const cambios = await this.listCambios({ id })
    const cambio = cambios[0]
    if (!cambio) throw new Error("Cambio no encontrado")
    if (cambio.estado === "cancelado") throw new Error("El cambio ya está cancelado")
    return await this.updateCambios({
      id,
      estado: "cancelado",
      motivo_cancelacion: motivo,
      fecha_cancelacion,
    })
  }
}

/**
 * Firmas REALES (runtime) de los métodos CRUD de `Cambio`. El pluralizador en
 * runtime da "Cambios" (verificado con pluralize("Cambio") == "Cambios"), pero
 * el codegen del .d.ts sugiere "Cambioes" (mismatch conocido, ver
 * ferremex_monedero/service.ts para el mismo patrón). LineaDevuelta/LineaNueva
 * NO se redeclaran: su pluralizador type/runtime coincide ("LineaDevueltas" /
 * "LineaNuevas"), redeclararlos causaría conflicto property-vs-method (TS2425).
 */
interface FerremexCambiosService {
  listCambios(filter?: any, config?: any): Promise<any[]>
  createCambios(data: any): Promise<any>
  updateCambios(data: any): Promise<any>
  deleteCambios(id: string | string[]): Promise<void>
}

export default FerremexCambiosService
