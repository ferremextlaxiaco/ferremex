import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"
import { comprasPorClienteEnPeriodo, resolverNivel } from "../_nivel"
import { aConfigPOS } from "../config/route"

/**
 * /caja/monedero/:customerId — detalle del monedero de un cliente (saldo, nivel
 * actual + siguiente con progreso, movimientos) y baja del servicio.
 *
 * Consumido por MonederoModule (drawer de detalle).
 */

/** GET /caja/monedero/:customerId */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const [config, saldo, movimientos, nivelesRaw] = await Promise.all([
      service.getOrCreateConfig(),
      service.saldoCliente(customerId),
      service.listMovimientoMonederos({ customer_id: customerId }, { take: 100000 }),
      service.listNivelMonederos({}),
    ])

    const periodoMeses = Number(config.periodo_nivel_meses) || 1
    const comprasPeriodo = comprasPorClienteEnPeriodo(periodoMeses).get(customerId) ?? 0
    const { actual, siguiente } = resolverNivel(comprasPeriodo, nivelesRaw)

    // Más reciente primero, exponiendo el shape que consume el frontend.
    const movs = movimientos
      .map((m: any) => ({
        id: m.id,
        tipo: m.tipo,
        puntos: Number(m.puntos) || 0,
        folio: m.folio ?? null,
        descripcion: m.descripcion ?? "",
        fecha: m.fecha ?? "",
        cancelado: !!m.cancelado,
        motivo_cancelacion: m.motivo_cancelacion ?? null,
        fecha_cancelacion: m.fecha_cancelacion ?? null,
      }))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

    res.json({
      customer_id: customerId,
      saldo,
      valor_saldo: Math.round(saldo * (Number(config.valor_punto) || 0) * 100) / 100,
      config: aConfigPOS(config),
      compras_periodo: comprasPeriodo,
      periodo_meses: periodoMeses,
      nivel_actual: actual,
      nivel_siguiente: siguiente,
      movimientos: movs,
    })
  } catch (e: any) {
    console.error("[caja/monedero/:customerId] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar el monedero del cliente" })
  }
}

/**
 * DELETE /caja/monedero/:customerId — da de baja al cliente del programa:
 * apaga metadata.monedero. NO borra sus movimientos (rastro auditable); si se
 * reinscribe conserva su saldo. Para llevar el saldo a 0 usa /reset.
 */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const [customer] = await customerModule.listCustomers({ id: customerId })
    if (!customer) { res.status(404).json({ error: "Cliente no encontrado" }); return }
    await customerModule.updateCustomers(customerId, {
      metadata: { ...(customer.metadata ?? {}), monedero: false },
    })
    res.json({ ok: true })
  } catch (e: any) {
    console.error("[caja/monedero/:customerId] DELETE error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo dar de baja al cliente del monedero" })
  }
}
