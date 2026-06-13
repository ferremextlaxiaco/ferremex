import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_MONEDERO } from "../../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../../modules/ferremex-monedero/service"

/**
 * /caja/monedero/reglas — overrides de la tasa de generación de puntos por
 * ámbito de la taxonomía (marca/departamento/categoría). `tasa = 0` = excluido.
 *
 * Consumido por MonederoModule (tab Reglas, escribe) y por el motor de devengo
 * en POST /caja/ventas (lee, vía el service del módulo).
 */

const AMBITOS = ["marca", "departamento", "categoria"] as const

export interface ReglaPuntosPOS {
  id: string
  ambito: (typeof AMBITOS)[number]
  ref: string
  tasa: number
  activa: boolean
}

export function aReglaPOS(r: any): ReglaPuntosPOS {
  return {
    id: r.id,
    ambito: AMBITOS.includes(r.ambito) ? r.ambito : "marca",
    ref: r.ref ?? "",
    tasa: Number(r.tasa) || 0,
    activa: !!r.activa,
  }
}

export function sanearRegla(body: Partial<ReglaPuntosPOS>): { data: Record<string, any> } | { error: string } {
  const ambito = body.ambito as ReglaPuntosPOS["ambito"]
  if (!AMBITOS.includes(ambito)) return { error: "Ámbito inválido (marca, departamento o categoría)" }
  const ref = String(body.ref ?? "").trim()
  if (!ref) return { error: "Selecciona la marca, departamento o categoría de la regla" }
  const tasa = Number(body.tasa)
  if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) {
    return { error: "La tasa debe estar entre 0 y 100% (0 = excluido)" }
  }
  return {
    data: {
      ambito,
      ref,
      tasa: Math.round(tasa * 100) / 100,
      activa: body.activa !== undefined ? !!body.activa : true,
    },
  }
}

/** GET /caja/monedero/reglas */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    const reglas = await service.listReglaPuntos({})
    reglas.sort((a: any, b: any) => String(a.ref).localeCompare(String(b.ref), "es", { numeric: true }))
    res.json(reglas.map(aReglaPOS))
  } catch (e: any) {
    console.error("[caja/monedero/reglas] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las reglas de puntos" })
  }
}

/** POST /caja/monedero/reglas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const saneado = sanearRegla((req.body ?? {}) as Partial<ReglaPuntosPOS>)
    if ("error" in saneado) { res.status(400).json({ error: saneado.error }); return }
    const service: FerremexMonederoService = req.scope.resolve(FERREMEX_MONEDERO)
    // Evitar duplicados por (ambito, ref): una regla por ámbito+referencia.
    const existentes = await service.listReglaPuntos({ ambito: saneado.data.ambito, ref: saneado.data.ref })
    if (existentes.length > 0) {
      res.status(400).json({ error: `Ya existe una regla para "${saneado.data.ref}" en ese ámbito` }); return
    }
    const creada = await service.createReglaPuntos(saneado.data)
    res.status(201).json(aReglaPOS(creada))
  } catch (e: any) {
    console.error("[caja/monedero/reglas] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear la regla de puntos" })
  }
}
