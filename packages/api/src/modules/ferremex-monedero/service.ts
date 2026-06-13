import { MedusaService } from "@medusajs/framework/utils"
import ConfigMonedero from "./models/config-monedero"
import ReglaPuntos from "./models/regla-puntos"
import NivelMonedero from "./models/nivel-monedero"
import MovimientoMonedero from "./models/movimiento-monedero"

/**
 * Service del módulo ferremex_monedero.
 *
 * MedusaService genera el CRUD base. OJO: el pluralizador EN RUNTIME genera
 * "Monederos" (un solo -s), igual que MovimientoCartera → "MovimientoCarteras".
 * Verificado por introspección del service en runtime:
 *   ConfigMonedero      → listConfigMonederos / createConfigMonederos / update… / delete…
 *   ReglaPuntos         → listReglaPuntos / createReglaPuntos / …
 *   NivelMonedero       → listNivelMonederos / createNivelMonederos / …
 *   MovimientoMonedero  → listMovimientoMonederos / createMovimientoMonederos / …
 *
 * El .d.ts del codegen sugiere "Monederoes" (pluralizador distinto al runtime),
 * por eso declaramos abajo (interface merge) las firmas REALES que usamos: así
 * el service y las rutas consumidoras tipan contra los métodos que existen en
 * runtime, sin @ts-expect-error disperso.
 *
 * Aquí también añadimos helpers de negocio que encapsulan patrones repetidos
 * para que las rutas no los dupliquen.
 */
class FerremexMonederoService extends MedusaService({
  ConfigMonedero,
  ReglaPuntos,
  NivelMonedero,
  MovimientoMonedero,
}) {
  /** Devuelve la config global, creándola con defaults si aún no existe. */
  async getOrCreateConfig() {
    const existentes = await this.listConfigMonederos({})
    if (existentes.length > 0) return existentes[0]
    return await this.createConfigMonederos({})
  }

  /** Saldo de puntos de un cliente = suma de movimientos NO cancelados. */
  async saldoCliente(customer_id: string): Promise<number> {
    const movs = await this.listMovimientoMonederos({ customer_id })
    return movs
      .filter((m) => !m.cancelado)
      .reduce((s, m) => s + Number(m.puntos), 0)
  }

  /**
   * Saldos de TODOS los clientes con movimientos, en un solo barrido.
   * Devuelve Map<customer_id, puntos>. Usado por la tabla del módulo admin.
   */
  async saldosGlobales(): Promise<Record<string, number>> {
    const movs = await this.listMovimientoMonederos({}, { take: 100000 })
    const acc: Record<string, number> = {}
    for (const m of movs) {
      if (m.cancelado) continue
      acc[m.customer_id] = (acc[m.customer_id] ?? 0) + Number(m.puntos)
    }
    return acc
  }

  /** Registra un movimiento de puntos. `fecha` se rellena si no se pasa. */
  async agregarMovimiento(
    customer_id: string,
    mov: {
      tipo: "ganado" | "canjeado" | "ajuste" | "vencido" | "reset"
      puntos: number
      folio?: string | null
      descripcion: string
      fecha?: string
    }
  ) {
    return await this.createMovimientoMonederos({
      customer_id,
      tipo: mov.tipo,
      puntos: mov.puntos,
      folio: mov.folio ?? null,
      descripcion: mov.descripcion,
      fecha: mov.fecha ?? new Date().toISOString(),
    })
  }

  /**
   * Resetea el saldo de un cliente a 0 registrando un movimiento "reset"
   * negativo igual al saldo actual (rastro auditable, no borra historial).
   * Devuelve los puntos restados (0 si ya estaba en 0).
   */
  async resetearCliente(customer_id: string, motivo: string): Promise<number> {
    const saldo = await this.saldoCliente(customer_id)
    if (saldo === 0) return 0
    await this.createMovimientoMonederos({
      customer_id,
      tipo: "reset",
      puntos: -saldo,
      folio: null,
      descripcion: motivo || "Reseteo de puntos",
      fecha: new Date().toISOString(),
    })
    return saldo
  }

  /**
   * Cancela (soft) los movimientos "ganado" asociados a un folio de venta.
   * Se usa al cancelar una venta: los puntos que generó se revierten. No toca
   * los canjes (esos se reembolsan aparte si aplica). Devuelve cuántos canceló.
   */
  async revertirGanadosDeFolio(folio: string, motivo: string): Promise<number> {
    const movs = await this.listMovimientoMonederos({ folio, tipo: "ganado" })
    let n = 0
    const fecha = new Date().toISOString()
    for (const m of movs) {
      if (m.cancelado) continue
      await this.updateMovimientoMonederos({
        id: m.id,
        cancelado: true,
        motivo_cancelacion: motivo,
        fecha_cancelacion: fecha,
      })
      n++
    }
    return n
  }
}

/**
 * Firmas REALES (runtime) de los métodos CRUD generados por MedusaService.
 * Conciliación del mismatch type/runtime del pluralizador (ver doc del service).
 * Tipos laxos a propósito: son los métodos genéricos de MedusaService; lo que
 * nos importa es que existan con el nombre runtime ("…Monederos").
 */
interface FerremexMonederoService {
  // ConfigMonedero
  listConfigMonederos(filter?: any, config?: any): Promise<any[]>
  createConfigMonederos(data?: any): Promise<any>
  updateConfigMonederos(data: any): Promise<any>
  deleteConfigMonederos(id: string | string[]): Promise<void>
  // NivelMonedero
  listNivelMonederos(filter?: any, config?: any): Promise<any[]>
  createNivelMonederos(data: any): Promise<any>
  updateNivelMonederos(data: any): Promise<any>
  deleteNivelMonederos(id: string | string[]): Promise<void>
  // MovimientoMonedero
  listMovimientoMonederos(filter?: any, config?: any): Promise<any[]>
  createMovimientoMonederos(data: any): Promise<any>
  updateMovimientoMonederos(data: any): Promise<any>
  deleteMovimientoMonederos(id: string | string[]): Promise<void>
  // ReglaPuntos: NO se declara aquí. Su pluralizador type/runtime coincide
  // ("ReglaPuntos"), así que los métodos ya existen bien tipados en la base;
  // redeclararlos provocaría un conflicto property-vs-method (TS2425).
}

export default FerremexMonederoService
