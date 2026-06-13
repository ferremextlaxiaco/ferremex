import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"
import { comprasPorClienteEnPeriodo, resolverNivel } from "../_nivel"

/**
 * /caja/monedero/clientes — tabla del módulo: todos los clientes POS inscritos
 * al monedero (metadata.monedero === true) con su saldo de puntos y nivel
 * derivado. Devuelve también KPIs (inscritos, puntos en circulación).
 *
 * Consumido por MonederoModule (tab Clientes). Lectura agregada de tres fuentes:
 * Customers (clientes), módulo ferremex_monedero (saldos + niveles) y
 * ventas-pos.json (compras del periodo, para el nivel).
 */

export interface ClienteMonederoFila {
  id: string
  num_cliente: string
  nombre: string
  telefono: string
  puntos: number
  valor: number
  nivel_nombre: string | null
  nivel_color: string | null
  compras_periodo: number
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const customerModule = req.scope.resolve(Modules.CUSTOMER)

    const [config, saldos, nivelesRaw, customers] = await Promise.all([
      service.getOrCreateConfig(),
      service.saldosGlobales(),
      service.listNivelMonederos({}),
      customerModule.listCustomers({}, { take: null }),
    ])

    const inscritos = customers.filter(
      (c: any) => c.metadata?.monedero === true || c.metadata?.monedero === "true"
    )
    const compras = comprasPorClienteEnPeriodo(Number(config.periodo_nivel_meses) || 1)

    const valorPunto = Number(config.valor_punto) || 0
    const filas: ClienteMonederoFila[] = inscritos.map((c: any) => {
      const m = c.metadata ?? {}
      const comprasPeriodo = compras.get(c.id) ?? 0
      const { actual } = resolverNivel(comprasPeriodo, nivelesRaw)
      const nombre =
        (typeof m.nombre === "string" && m.nombre) ||
        [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
      const puntos = saldos[c.id] ?? 0
      // El valor en pesos usa el valor_punto_bonus del nivel si existe.
      const vp = actual?.valor_punto_bonus != null ? Number(actual.valor_punto_bonus) : valorPunto
      return {
        id: c.id,
        num_cliente: typeof m.num_cliente === "string" ? m.num_cliente : "",
        nombre,
        telefono: c.phone ?? "",
        puntos,
        valor: Math.round(puntos * vp * 100) / 100,
        nivel_nombre: actual?.nombre ?? null,
        nivel_color: actual?.color ?? null,
        compras_periodo: comprasPeriodo,
      }
    })

    filas.sort((a, b) => a.num_cliente.localeCompare(b.num_cliente, undefined, { numeric: true }))

    const puntos_circulacion = filas.reduce((s, f) => s + f.puntos, 0)
    res.json({
      clientes: filas,
      kpis: {
        inscritos: filas.length,
        puntos_circulacion,
        valor_circulacion: Math.round(puntos_circulacion * (Number(config.valor_punto) || 0) * 100) / 100,
      },
    })
  } catch (e: any) {
    console.error("[caja/monedero/clientes] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los clientes del monedero" })
  }
}
