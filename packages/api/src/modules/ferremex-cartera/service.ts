import { MedusaService } from "@medusajs/framework/utils"
import CarteraCliente from "./models/cartera-cliente"
// Importado como MovimientoCartera (no "Movimiento") para que MedusaService
// genere métodos legibles: listMovimientoCarteras / createMovimientoCarteras.
// El pluralizador inglés convierte "Movimiento" → "Movimientoes" (feo y frágil).
import MovimientoCartera from "./models/movimiento"
import NotaCartera from "./models/nota-cartera"
import HistorialLimite from "./models/historial-limite"

/**
 * Service del módulo ferremex_cartera.
 *
 * MedusaService genera el CRUD base (listCarteraClientes, createMovimientos,
 * etc.). Aquí añadimos helpers de negocio que encapsulan el patrón
 * "asegurar cartera del cliente → agregar hijo", para que las rutas /caja/cartera
 * no repitan ese get-or-create.
 */
class FerremexCarteraService extends MedusaService({
  CarteraCliente,
  MovimientoCartera,
  NotaCartera,
  HistorialLimite,
}) {
  /** Devuelve la cartera del cliente, creándola si no existe. */
  async getOrCreateCartera(customer_id: string): Promise<{ id: string; customer_id: string }> {
    const existentes = await this.listCarteraClientes({ customer_id })
    if (existentes.length > 0) {
      return existentes[0] as { id: string; customer_id: string }
    }
    const creada = await this.createCarteraClientes({ customer_id })
    return creada as { id: string; customer_id: string }
  }

  /**
   * Saldo (deuda) actual del cliente en cartera de crédito.
   * = Σ(compras vigentes) − Σ(pagos vigentes), acotado a ≥ 0.
   * Excluye movimientos cancelados (abonos anulados / compras revertidas), igual
   * que el cálculo FIFO del front (`calcularSaldos` en CarteraCredito.jsx).
   * Un saldo pagado de más no se vuelve "a favor": el piso es 0.
   */
  async saldoCliente(customer_id: string): Promise<number> {
    const { balance } = await this.estadoCredito(customer_id)
    return balance
  }

  /**
   * Estado de crédito del cliente: saldo (deuda) + deuda vencida.
   * Replica el FIFO del front (`calcularSaldos`): los pagos se aplican a las
   * compras más antiguas primero; una compra queda "vencida" si su fecha + plazo
   * ya pasó y aún tiene saldo sin cubrir. `plazoDefault` se usa por compra cuando
   * el movimiento no trae su propio `plazo`.
   */
  async estadoCredito(
    customer_id: string,
    plazoDefault = 30
  ): Promise<{ balance: number; overdue: number }> {
    const cartera = await this.getOrCreateCartera(customer_id)
    const movs = await this.listMovimientoCarteras({ cartera_id: cartera.id })
    const activos = movs.filter((m) => !m.cancelado)
    // Orden ascendente por fecha para el FIFO.
    const sorted = [...activos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))

    let pool = 0
    for (const m of sorted) if (m.tipo === "pago") pool += Number(m.monto) || 0

    let balance = 0
    let overdue = 0
    const hoy = Date.now()
    for (const m of sorted) {
      if (m.tipo !== "compra") continue
      const monto = Number(m.monto) || 0
      const restante = pool >= monto ? 0 : monto - pool
      pool = Math.max(0, pool - monto)
      if (restante <= 0.005) continue
      balance += restante
      // ¿Está vencida? fecha de la compra + plazo < hoy.
      const due = new Date(String(m.fecha) + "T12:00:00")
      due.setDate(due.getDate() + (Number(m.plazo) || plazoDefault))
      if (due.getTime() < hoy) overdue += restante
    }
    return {
      balance: Math.max(0, Math.round(balance * 100) / 100),
      overdue: Math.max(0, Math.round(overdue * 100) / 100),
    }
  }

  /** Carga la cartera completa de un cliente (movimientos + notas + historial). */
  async getCarteraCompleta(customer_id: string) {
    const cartera = await this.getOrCreateCartera(customer_id)
    const [movimientos, notas, historialLimite] = await Promise.all([
      this.listMovimientoCarteras({ cartera_id: cartera.id }),
      this.listNotaCarteras({ cartera_id: cartera.id }),
      this.listHistorialLimites({ cartera_id: cartera.id }),
    ])
    return { customer_id, movimientos, notas, historialLimite }
  }

  async agregarMovimiento(
    customer_id: string,
    mov: {
      tipo: "compra" | "pago"
      monto: number
      fecha: string
      folio?: string | null
      plazo?: number | null
      descripcion: string
      nota?: string | null
    }
  ) {
    const cartera = await this.getOrCreateCartera(customer_id)
    return await this.createMovimientoCarteras({ ...mov, cartera_id: cartera.id })
  }

  async agregarNota(
    customer_id: string,
    nota: { fecha: string; hora: string; autor: string; texto: string }
  ) {
    const cartera = await this.getOrCreateCartera(customer_id)
    return await this.createNotaCarteras({ ...nota, cartera_id: cartera.id })
  }

  /**
   * Anula un movimiento (típicamente un abono registrado por error). No lo
   * borra: lo marca cancelado para que deje de contar en el cálculo de saldos
   * (el monto "regresa" a la deuda) pero quede rastro auditable. Valida que el
   * movimiento pertenezca a la cartera del cliente y que no esté ya cancelado.
   */
  async anularMovimiento(
    customer_id: string,
    movimiento_id: string,
    motivo: string,
    fecha_cancelacion: string
  ) {
    const cartera = await this.getOrCreateCartera(customer_id)
    const movs = await this.listMovimientoCarteras({ id: movimiento_id, cartera_id: cartera.id })
    const mov = movs[0]
    if (!mov) {
      throw new Error("Movimiento no encontrado en la cartera de este cliente")
    }
    if (mov.cancelado) {
      throw new Error("El movimiento ya está cancelado")
    }
    return await this.updateMovimientoCarteras({
      id: movimiento_id,
      cancelado: true,
      motivo_cancelacion: motivo,
      fecha_cancelacion,
    })
  }

  async registrarCambioLimite(
    customer_id: string,
    cambio: { fecha: string; usuario: string; anterior: number; nuevo: number; nota: string }
  ) {
    const cartera = await this.getOrCreateCartera(customer_id)
    return await this.createHistorialLimites({ ...cambio, cartera_id: cartera.id })
  }
}

export default FerremexCarteraService
