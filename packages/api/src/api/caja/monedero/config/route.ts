import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"

/**
 * /caja/monedero/config — configuración global del programa de Monedero
 * Electrónico (valor del punto, tasa base, tope/mínimo de canje, vencimiento,
 * toggles de confirmación). Singleton: GET devuelve la fila única (creándola con
 * defaults la primera vez); PUT la actualiza.
 *
 * Consumido por MonederoModule (tab Configuración, escribe), y por el motor de
 * devengo/canje en POST /caja/ventas (lee).
 */

const REDONDEOS = ["abajo", "normal", "ninguno"] as const

export interface ConfigMonederoPOS {
  id: string
  valor_punto: number
  tasa_base: number
  max_canje_pct: number
  min_puntos_canje: number
  vencimiento_meses: number
  confirmar_huella: boolean
  confirmar_codigo: boolean
  redondeo: (typeof REDONDEOS)[number]
  periodo_nivel_meses: number
}

export function aConfigPOS(c: any): ConfigMonederoPOS {
  return {
    id: c.id,
    valor_punto: Number(c.valor_punto) || 0,
    tasa_base: Number(c.tasa_base) || 0,
    max_canje_pct: Number(c.max_canje_pct) || 0,
    min_puntos_canje: Number(c.min_puntos_canje) || 0,
    vencimiento_meses: Number(c.vencimiento_meses) || 0,
    confirmar_huella: !!c.confirmar_huella,
    confirmar_codigo: !!c.confirmar_codigo,
    redondeo: REDONDEOS.includes(c.redondeo) ? c.redondeo : "abajo",
    periodo_nivel_meses: Number(c.periodo_nivel_meses) || 1,
  }
}

/** Limpia y valida el cuerpo del PUT. */
function sanearConfig(body: Partial<ConfigMonederoPOS>): { data: Record<string, any> } | { error: string } {
  const valor_punto = Number(body.valor_punto)
  if (!Number.isFinite(valor_punto) || valor_punto <= 0) {
    return { error: "El valor del punto debe ser mayor a 0" }
  }
  const tasa_base = Number(body.tasa_base)
  if (!Number.isFinite(tasa_base) || tasa_base < 0 || tasa_base > 100) {
    return { error: "La tasa base debe estar entre 0 y 100%" }
  }
  const max_canje_pct = Number(body.max_canje_pct)
  if (!Number.isFinite(max_canje_pct) || max_canje_pct < 0 || max_canje_pct > 100) {
    return { error: "El tope de canje debe estar entre 0 y 100%" }
  }
  const min_puntos_canje = Number(body.min_puntos_canje)
  if (!Number.isFinite(min_puntos_canje) || min_puntos_canje < 0) {
    return { error: "El mínimo de canje no puede ser negativo" }
  }
  const vencimiento_meses = Number(body.vencimiento_meses)
  if (!Number.isFinite(vencimiento_meses) || vencimiento_meses < 0) {
    return { error: "El vencimiento (meses) no puede ser negativo" }
  }
  const periodo_nivel_meses = Number(body.periodo_nivel_meses)
  if (!Number.isFinite(periodo_nivel_meses) || periodo_nivel_meses < 1) {
    return { error: "El periodo de nivel debe ser de al menos 1 mes" }
  }
  return {
    data: {
      valor_punto: Math.round(valor_punto * 100) / 100,
      tasa_base: Math.round(tasa_base * 100) / 100,
      max_canje_pct: Math.round(max_canje_pct),
      min_puntos_canje: Math.round(min_puntos_canje),
      vencimiento_meses: Math.round(vencimiento_meses),
      confirmar_huella: !!body.confirmar_huella,
      confirmar_codigo: !!body.confirmar_codigo,
      redondeo: REDONDEOS.includes(body.redondeo as any) ? body.redondeo : "abajo",
      periodo_nivel_meses: Math.round(periodo_nivel_meses),
    },
  }
}

/** GET /caja/monedero/config */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const cfg = await service.getOrCreateConfig()
    res.json(aConfigPOS(cfg))
  } catch (e: any) {
    console.error("[caja/monedero/config] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar la configuración del monedero" })
  }
}

/** PUT /caja/monedero/config */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const saneado = sanearConfig((req.body ?? {}) as Partial<ConfigMonederoPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const cfg = await service.getOrCreateConfig()
    await service.updateConfigMonederos({ id: cfg.id, ...saneado.data })
    const [actualizado] = await service.listConfigMonederos({ id: cfg.id })
    res.json(aConfigPOS(actualizado))
  } catch (e: any) {
    console.error("[caja/monedero/config] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo guardar la configuración del monedero" })
  }
}
