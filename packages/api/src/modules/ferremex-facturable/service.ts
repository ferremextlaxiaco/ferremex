import { MedusaService } from "@medusajs/framework/utils"
import SaldoFacturable from "./models/saldo-facturable"
import MovimientoFacturable from "./models/movimiento-facturable"
import DeptoFacturable from "./models/depto-facturable"

/**
 * Service del módulo ferremex_facturable — saldo facturable por artículo +
 * marca de departamento facturable + bitácora de movimientos.
 *
 * GOTCHA pluralización (igual que ferremex_monedero/compras): los modelos
 * terminan en consonante, así que el pluralizador inglés añade "s":
 *   SaldoFacturable      → listSaldoFacturables / createSaldoFacturables / ...
 *   MovimientoFacturable → listMovimientoFacturables / ...
 *   DeptoFacturable      → listDeptoFacturables / ...
 * Si el codegen sugiriera otra forma (…es), resolver con interface merge como en
 * monedero. De momento las firmas runtime coinciden.
 *
 * Toda mutación de saldo pasa por `aplicarMovimiento`: escribe el movimiento de
 * auditoría y deja el saldo = suma de movimientos del SKU (fuente de verdad =
 * la bitácora; el campo `saldo` es un acumulado materializado).
 */
type TipoMov = "recarga" | "consumo" | "ajuste"

interface AplicarMovInput {
  sku: string
  tipo: TipoMov
  cantidad: number // con signo: + entra, − sale
  folio_ref?: string | null
  cfdi_ref?: string | null
  motivo?: string | null
  // Snapshots para poblar/actualizar el saldo (informativos).
  clave_sat?: string | null
  descripcion?: string | null
  departamento?: string | null
  fecha?: string // ISO; default ahora
}

class FerremexFacturableService extends MedusaService({
  SaldoFacturable,
  MovimientoFacturable,
  DeptoFacturable,
}) {
  // ── Saldo por SKU ──────────────────────────────────────────────────────────

  /** Devuelve la fila de saldo de un SKU (o null si nunca tuvo movimientos). */
  async obtenerSaldo(sku: string): Promise<any | null> {
    const filas = await this.listSaldoFacturables({ sku })
    return (filas as any[])[0] ?? null
  }

  /** Saldo numérico de un SKU (0 si no existe). */
  async saldoDeSku(sku: string): Promise<number> {
    const fila = await this.obtenerSaldo(sku)
    return fila ? Number(fila.saldo) || 0 : 0
  }

  /** Lista todos los saldos (filtrables). */
  async listarSaldos(filtro: Record<string, any> = {}): Promise<any[]> {
    return (await this.listSaldoFacturables(filtro)) as any[]
  }

  /**
   * Aplica un movimiento al saldo de un SKU: registra la bitácora y actualiza
   * (o crea) la fila de saldo acumulado. Devuelve el nuevo saldo.
   */
  async aplicarMovimiento(input: AplicarMovInput): Promise<{ saldo: number; movimiento: any }> {
    const fecha = input.fecha ?? new Date().toISOString()
    const cantidad = Number(input.cantidad) || 0

    const movimiento = await this.createMovimientoFacturables({
      sku: input.sku,
      tipo: input.tipo,
      cantidad,
      folio_ref: input.folio_ref ?? null,
      cfdi_ref: input.cfdi_ref ?? null,
      motivo: input.motivo ?? null,
      fecha,
    })

    const existente = await this.obtenerSaldo(input.sku)
    const nuevoSaldo = (existente ? Number(existente.saldo) || 0 : 0) + cantidad

    if (existente) {
      await this.updateSaldoFacturables({
        id: existente.id,
        saldo: nuevoSaldo,
        // Refrescar snapshots si vienen en el input (no pisar con null).
        ...(input.clave_sat != null ? { clave_sat: input.clave_sat } : {}),
        ...(input.descripcion != null ? { descripcion: input.descripcion } : {}),
        ...(input.departamento != null ? { departamento: input.departamento } : {}),
        actualizado_el: fecha,
      })
    } else {
      await this.createSaldoFacturables({
        sku: input.sku,
        saldo: nuevoSaldo,
        clave_sat: input.clave_sat ?? null,
        descripcion: input.descripcion ?? null,
        departamento: input.departamento ?? null,
        actualizado_el: fecha,
      })
    }

    return { saldo: nuevoSaldo, movimiento }
  }

  /** Recarga (compra Con Factura, o reversa de cancelación). cantidad > 0. */
  async recargar(
    sku: string,
    cantidad: number,
    opts: { folio_ref?: string | null; motivo?: string | null; clave_sat?: string | null; descripcion?: string | null; departamento?: string | null } = {}
  ) {
    return this.aplicarMovimiento({ sku, tipo: "recarga", cantidad: Math.abs(cantidad), ...opts })
  }

  /** Consumo al facturar. cantidad > 0 (se resta internamente). */
  async consumir(
    sku: string,
    cantidad: number,
    opts: { folio_ref?: string | null; cfdi_ref?: string | null; motivo?: string | null } = {}
  ) {
    return this.aplicarMovimiento({ sku, tipo: "consumo", cantidad: -Math.abs(cantidad), ...opts })
  }

  /** Ajuste manual: fija el saldo a `nuevoSaldo` registrando el delta como movimiento. */
  async ajustarA(
    sku: string,
    nuevoSaldo: number,
    opts: { motivo?: string | null; clave_sat?: string | null; descripcion?: string | null; departamento?: string | null } = {}
  ) {
    const actual = await this.saldoDeSku(sku)
    const delta = Number(nuevoSaldo) - actual
    return this.aplicarMovimiento({ sku, tipo: "ajuste", cantidad: delta, ...opts })
  }

  /** Movimientos de un SKU (auditoría), más reciente primero. */
  async listarMovimientos(sku: string): Promise<any[]> {
    const movs = (await this.listMovimientoFacturables({ sku })) as any[]
    return movs.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  }

  // ── Departamentos facturables ───────────────────────────────────────────────

  /** Mapa { departamento: facturable } de los deptos con fila registrada. */
  async mapaDeptos(): Promise<Record<string, boolean>> {
    const filas = (await this.listDeptoFacturables({})) as any[]
    const mapa: Record<string, boolean> = {}
    for (const f of filas) mapa[f.departamento] = !!f.facturable
    return mapa
  }

  /** ¿El departamento está marcado facturable? (sin fila = false, conservador). */
  async esDeptoFacturable(departamento: string): Promise<boolean> {
    if (!departamento) return false
    const filas = (await this.listDeptoFacturables({ departamento })) as any[]
    return filas[0] ? !!filas[0].facturable : false
  }

  /** Marca/desmarca un departamento como facturable (upsert). */
  async marcarDepto(departamento: string, facturable: boolean) {
    const filas = (await this.listDeptoFacturables({ departamento })) as any[]
    const actualizado_el = new Date().toISOString()
    if (filas[0]) {
      return this.updateDeptoFacturables({ id: filas[0].id, facturable, actualizado_el })
    }
    return this.createDeptoFacturables({ departamento, facturable, actualizado_el })
  }
}

export default FerremexFacturableService
