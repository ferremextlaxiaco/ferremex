import { MedusaService } from "@medusajs/framework/utils"
import MovimientoSaldoCambio from "./models/movimiento-saldo-cambio"

/**
 * Service del módulo ferremex_saldo_cambio.
 *
 * MedusaService genera el CRUD base (listMovimientoSaldoCambios,
 * createMovimientoSaldoCambios, etc.). Mismo patrón que ferremex_monedero:
 * el "saldo" no se almacena, se DERIVA sumando movimientos no cancelados.
 */
class FerremexSaldoCambioService extends MedusaService({
  MovimientoSaldoCambio,
}) {
  /** Saldo a favor disponible de un cliente = suma de movimientos NO cancelados. */
  async saldoCliente(customer_id: string): Promise<number> {
    const movs = await this.listMovimientoSaldoCambios({ customer_id })
    return movs
      .filter((m) => !m.cancelado)
      .reduce((s, m) => s + Number(m.monto), 0)
  }

  /** Movimientos de un cliente, más recientes primero. */
  async movimientosCliente(customer_id: string) {
    return await this.listMovimientoSaldoCambios(
      { customer_id },
      { order: { fecha: "DESC" } }
    )
  }

  async agregarMovimiento(
    customer_id: string,
    mov: {
      tipo: "generado" | "consumido" | "ajuste"
      monto: number
      fecha?: string
      origen_cambio_folio?: string | null
      venta_consumo_folio?: string | null
      descripcion: string
    }
  ) {
    return await this.createMovimientoSaldoCambios({
      customer_id,
      tipo: mov.tipo,
      monto: mov.monto,
      fecha: mov.fecha ?? new Date().toISOString(),
      origen_cambio_folio: mov.origen_cambio_folio ?? null,
      venta_consumo_folio: mov.venta_consumo_folio ?? null,
      descripcion: mov.descripcion,
    })
  }

  /**
   * Anula el movimiento "generado" de un cambio (ej. al cancelar el cambio
   * original). No lo borra: lo marca cancelado para que deje de contar en el
   * saldo. Rechaza si el saldo ya fue consumido y no alcanza para revertir
   * (evita dejar al cliente con saldo negativo por una anulación tardía).
   */
  async anularMovimientosDeCambio(
    origen_cambio_folio: string,
    motivo: string,
    fecha_cancelacion: string
  ) {
    const movs = await this.listMovimientoSaldoCambios({ origen_cambio_folio, cancelado: false })
    const generado = movs.find((m) => m.tipo === "generado")
    if (!generado) return null

    const saldoActual = await this.saldoCliente(generado.customer_id)
    if (saldoActual < Number(generado.monto)) {
      throw new Error(
        "No se puede cancelar: el saldo a favor generado por este cambio ya fue consumido parcial o totalmente."
      )
    }

    return await this.updateMovimientoSaldoCambios({
      id: generado.id,
      cancelado: true,
      motivo_cancelacion: motivo,
      fecha_cancelacion,
    })
  }
}

/**
 * Firmas REALES (runtime) de los métodos CRUD de `MovimientoSaldoCambio`. El
 * pluralizador en runtime da "MovimientoSaldoCambios" (verificado con
 * pluralize("MovimientoSaldoCambio")), pero el codegen del .d.ts sugiere
 * "MovimientoSaldoCambioes" (mismo mismatch que ferremex_monedero/service.ts).
 */
interface FerremexSaldoCambioService {
  listMovimientoSaldoCambios(filter?: any, config?: any): Promise<any[]>
  createMovimientoSaldoCambios(data: any): Promise<any>
  updateMovimientoSaldoCambios(data: any): Promise<any>
  deleteMovimientoSaldoCambios(id: string | string[]): Promise<void>
}

export default FerremexSaldoCambioService
