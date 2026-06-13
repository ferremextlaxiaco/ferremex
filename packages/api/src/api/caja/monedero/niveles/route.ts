import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"

/**
 * /caja/monedero/niveles — niveles/tiers del programa (Bronce, Plata, Oro,
 * Constructor…). El nivel de un cliente se DERIVA de sus compras del periodo;
 * estos registros sólo definen los umbrales, multiplicadores y beneficios.
 *
 * Consumido por MonederoModule (tab Niveles, escribe), por el cálculo de nivel
 * del cliente (rutas /caja/monedero/clientes y /:customerId, lee) y por el motor
 * de devengo en POST /caja/ventas (aplica el multiplicador).
 */

export interface NivelMonederoPOS {
  id: string
  nombre: string
  orden: number
  umbral_periodo: number
  multiplicador: number
  valor_punto_bonus: number | null
  nivel_precio: number | null
  color: string | null
  activo: boolean
}

export function aNivelPOS(n: any): NivelMonederoPOS {
  return {
    id: n.id,
    nombre: n.nombre ?? "",
    orden: Number(n.orden) || 0,
    umbral_periodo: Number(n.umbral_periodo) || 0,
    multiplicador: Number(n.multiplicador) || 1,
    valor_punto_bonus: n.valor_punto_bonus != null ? Number(n.valor_punto_bonus) : null,
    nivel_precio: n.nivel_precio != null ? Number(n.nivel_precio) : null,
    color: n.color ?? null,
    activo: !!n.activo,
  }
}

export function sanearNivel(body: Partial<NivelMonederoPOS>): { data: Record<string, any> } | { error: string } {
  const nombre = String(body.nombre ?? "").trim()
  if (!nombre) return { error: "El nombre del nivel es requerido" }
  const orden = Number(body.orden)
  if (!Number.isFinite(orden) || orden < 0) return { error: "El orden del nivel debe ser ≥0" }
  const umbral_periodo = Number(body.umbral_periodo)
  if (!Number.isFinite(umbral_periodo) || umbral_periodo < 0) {
    return { error: "El umbral de compras del periodo no puede ser negativo" }
  }
  const multiplicador = Number(body.multiplicador)
  if (!Number.isFinite(multiplicador) || multiplicador <= 0) {
    return { error: "El multiplicador debe ser mayor a 0" }
  }
  let valor_punto_bonus: number | null = null
  if (body.valor_punto_bonus != null && String(body.valor_punto_bonus) !== "") {
    valor_punto_bonus = Number(body.valor_punto_bonus)
    if (!Number.isFinite(valor_punto_bonus) || valor_punto_bonus <= 0) {
      return { error: "El valor de punto bonus debe ser mayor a 0" }
    }
  }
  let nivel_precio: number | null = null
  if (body.nivel_precio != null && String(body.nivel_precio) !== "") {
    nivel_precio = Math.round(Number(body.nivel_precio))
    if (![2, 3, 4].includes(nivel_precio)) {
      return { error: "El nivel de precio del tier debe ser 2, 3 o 4" }
    }
  }
  const color = String(body.color ?? "").trim() || null
  return {
    data: {
      nombre,
      orden: Math.round(orden),
      umbral_periodo: Math.round(umbral_periodo * 100) / 100,
      multiplicador: Math.round(multiplicador * 100) / 100,
      valor_punto_bonus: valor_punto_bonus != null ? Math.round(valor_punto_bonus * 100) / 100 : null,
      nivel_precio,
      color,
      activo: body.activo !== undefined ? !!body.activo : true,
    },
  }
}

/** GET /caja/monedero/niveles — ordenados por `orden` ascendente. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const niveles = await service.listNivelMonederos({})
    niveles.sort((a: any, b: any) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    res.json(niveles.map(aNivelPOS))
  } catch (e: any) {
    console.error("[caja/monedero/niveles] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los niveles" })
  }
}

/** POST /caja/monedero/niveles */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const saneado = sanearNivel((req.body ?? {}) as Partial<NivelMonederoPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const creado = await service.createNivelMonederos(saneado.data)
    res.status(201).json(aNivelPOS(creado))
  } catch (e: any) {
    console.error("[caja/monedero/niveles] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear el nivel" })
  }
}
