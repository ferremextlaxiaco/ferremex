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

  async registrarCambioLimite(
    customer_id: string,
    cambio: { fecha: string; usuario: string; anterior: number; nuevo: number; nota: string }
  ) {
    const cartera = await this.getOrCreateCartera(customer_id)
    return await this.createHistorialLimites({ ...cambio, cartera_id: cartera.id })
  }
}

export default FerremexCarteraService
