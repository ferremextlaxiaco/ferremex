import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROMOCIONES } from "../../../modules/ferremex-promociones"
import type FerremexPromocionesService from "../../../modules/ferremex-promociones/service"

/**
 * /caja/promociones — CRUD de promociones del POS (módulo ferremex_promociones).
 * Dato maestro compartido entre terminales. Las reglas se aplican en el carrito
 * vía el motor del frontend (apps/pos/src/lib/promociones.ts).
 *
 * Consumido por: PromocionesModule (admin, escribe), ArticleDrawer (crear desde
 * artículo), y leído por la pantalla de venta para evaluar descuentos en vivo.
 */

export type TipoPromo = "porcentaje" | "nivel_precio" | "nxm" | "volumen"
export type ModoArticulos = "mismos" | "cruzada"
export type Segmento = "todos" | "cliente" | "grupo"
export type AlcanceVolumen = "todas" | "excedente"

export interface PromocionPOS {
  id: string
  nombre: string
  activa: boolean
  inicio: string | null
  fin: string | null
  prioridad: number
  tipo: TipoPromo
  porcentaje: number | null
  nivel_precio: number | null
  nxm_lleva: number | null
  nxm_paga: number | null
  volumen_min: number | null
  volumen_desc: number | null
  volumen_alcance: AlcanceVolumen | null
  modo_articulos: ModoArticulos
  skus_requeridos: string[]
  skus_beneficiados: string[]
  segmento: Segmento
  cliente_id: string | null
  grupo: string | null
  cantidad_minima: number | null
  max_unidades: number | null
  etiqueta: string | null
}

/** Normaliza un registro de BD al shape que espera el frontend. */
export function aPromocionPOS(p: any): PromocionPOS {
  return {
    id: p.id,
    nombre: p.nombre ?? "",
    activa: !!p.activa,
    inicio: p.inicio ?? null,
    fin: p.fin ?? null,
    prioridad: Number(p.prioridad) || 0,
    tipo: p.tipo,
    porcentaje: p.porcentaje != null ? Number(p.porcentaje) : null,
    nivel_precio: p.nivel_precio != null ? Number(p.nivel_precio) : null,
    nxm_lleva: p.nxm_lleva != null ? Number(p.nxm_lleva) : null,
    nxm_paga: p.nxm_paga != null ? Number(p.nxm_paga) : null,
    volumen_min: p.volumen_min != null ? Number(p.volumen_min) : null,
    volumen_desc: p.volumen_desc != null ? Number(p.volumen_desc) : null,
    volumen_alcance: p.volumen_alcance ?? null,
    modo_articulos: p.modo_articulos ?? "mismos",
    skus_requeridos: Array.isArray(p.skus_requeridos) ? p.skus_requeridos : [],
    skus_beneficiados: Array.isArray(p.skus_beneficiados) ? p.skus_beneficiados : [],
    segmento: p.segmento ?? "todos",
    cliente_id: p.cliente_id ?? null,
    grupo: p.grupo ?? null,
    cantidad_minima: p.cantidad_minima != null ? Number(p.cantidad_minima) : null,
    max_unidades: p.max_unidades != null ? Number(p.max_unidades) : null,
    etiqueta: p.etiqueta ?? null,
  }
}

const TIPOS: TipoPromo[] = ["porcentaje", "nivel_precio", "nxm", "volumen"]
const SEGMENTOS: Segmento[] = ["todos", "cliente", "grupo"]

/** Limpia y valida el cuerpo a un objeto persistible. Devuelve {data} o {error}. */
export function sanearPromocion(
  body: Partial<PromocionPOS>
): { data: Record<string, any> } | { error: string } {
  const nombre = String(body.nombre ?? "").trim()
  if (!nombre) return { error: "El nombre de la promoción es requerido" }

  const tipo = body.tipo as TipoPromo
  if (!TIPOS.includes(tipo)) return { error: "Tipo de promoción inválido" }

  const reqRaw = Array.isArray(body.skus_requeridos) ? body.skus_requeridos : []
  const skus_requeridos = [...new Set(reqRaw.map((s) => String(s).trim()).filter(Boolean))]
  if (skus_requeridos.length === 0) {
    return { error: "Debes seleccionar al menos un artículo para la promoción" }
  }

  const modo: ModoArticulos = body.modo_articulos === "cruzada" ? "cruzada" : "mismos"
  let skus_beneficiados: string[]
  if (modo === "cruzada") {
    const benRaw = Array.isArray(body.skus_beneficiados) ? body.skus_beneficiados : []
    skus_beneficiados = [...new Set(benRaw.map((s) => String(s).trim()).filter(Boolean))]
    if (skus_beneficiados.length === 0) {
      return { error: "En una promoción cruzada debes elegir los artículos que reciben el descuento" }
    }
  } else {
    // Modo "mismos": lo requerido ES lo beneficiado.
    skus_beneficiados = skus_requeridos
  }

  // Validación por tipo de los campos numéricos relevantes.
  let porcentaje: number | null = null
  let nivel_precio: number | null = null
  let nxm_lleva: number | null = null
  let nxm_paga: number | null = null
  let volumen_min: number | null = null
  let volumen_desc: number | null = null
  let volumen_alcance: AlcanceVolumen | null = null

  if (tipo === "porcentaje") {
    porcentaje = Math.round(Number(body.porcentaje))
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      return { error: "El porcentaje debe estar entre 1 y 100" }
    }
  } else if (tipo === "nivel_precio") {
    nivel_precio = Math.round(Number(body.nivel_precio))
    if (![2, 3, 4].includes(nivel_precio)) {
      return { error: "El nivel de precio debe ser 2, 3 o 4" }
    }
  } else if (tipo === "nxm") {
    nxm_lleva = Math.round(Number(body.nxm_lleva))
    nxm_paga = Math.round(Number(body.nxm_paga))
    if (!Number.isFinite(nxm_lleva) || !Number.isFinite(nxm_paga) || nxm_lleva < 2 || nxm_paga < 1) {
      return { error: "En NxM, 'lleva' debe ser ≥2 y 'paga' ≥1" }
    }
    if (nxm_paga >= nxm_lleva) {
      return { error: "En NxM, 'paga' debe ser menor que 'lleva' (p. ej. 3x2)" }
    }
  } else if (tipo === "volumen") {
    volumen_min = Math.round(Number(body.volumen_min))
    volumen_desc = Math.round(Number(body.volumen_desc))
    volumen_alcance = body.volumen_alcance === "excedente" ? "excedente" : "todas"
    if (!Number.isFinite(volumen_min) || volumen_min < 2) {
      return { error: "El volumen mínimo debe ser ≥2 piezas" }
    }
    if (!Number.isFinite(volumen_desc) || volumen_desc <= 0 || volumen_desc > 100) {
      return { error: "El descuento por volumen debe estar entre 1 y 100%" }
    }
  }

  // Segmentación.
  const segmento: Segmento = SEGMENTOS.includes(body.segmento as Segmento)
    ? (body.segmento as Segmento)
    : "todos"
  let cliente_id: string | null = null
  let grupo: string | null = null
  if (segmento === "cliente") {
    cliente_id = String(body.cliente_id ?? "").trim() || null
    if (!cliente_id) return { error: "Selecciona el cliente al que aplica la promoción" }
  } else if (segmento === "grupo") {
    grupo = String(body.grupo ?? "").trim() || null
    if (!grupo) return { error: "Selecciona el grupo de clientes al que aplica la promoción" }
  }

  // Restricciones opcionales.
  const cantidad_minima =
    body.cantidad_minima != null && Number(body.cantidad_minima) > 0
      ? Math.round(Number(body.cantidad_minima))
      : null
  const max_unidades =
    body.max_unidades != null && Number(body.max_unidades) > 0
      ? Math.round(Number(body.max_unidades))
      : null

  // Vigencia: fechas ISO YYYY-MM-DD o null.
  const inicio = String(body.inicio ?? "").trim() || null
  const fin = String(body.fin ?? "").trim() || null
  if (inicio && fin && fin < inicio) {
    return { error: "La fecha de fin no puede ser anterior a la de inicio" }
  }

  const etiqueta = String(body.etiqueta ?? "").trim() || null

  return {
    data: {
      nombre,
      activa: body.activa !== undefined ? !!body.activa : true,
      inicio,
      fin,
      prioridad: Number.isFinite(Number(body.prioridad)) ? Math.round(Number(body.prioridad)) : 0,
      tipo,
      porcentaje,
      nivel_precio,
      nxm_lleva,
      nxm_paga,
      volumen_min,
      volumen_desc,
      volumen_alcance,
      modo_articulos: modo,
      skus_requeridos,
      skus_beneficiados,
      segmento,
      cliente_id,
      grupo,
      cantidad_minima,
      max_unidades,
      etiqueta,
    },
  }
}

/** GET /caja/promociones — lista todas, ordenadas por prioridad desc y nombre. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexPromocionesService = req.scope.resolve(FERREMEX_PROMOCIONES)
    const promos = await service.listPromocions({})
    promos.sort((a: any, b: any) => {
      const pd = (Number(b.prioridad) || 0) - (Number(a.prioridad) || 0)
      if (pd !== 0) return pd
      return String(a.nombre).localeCompare(String(b.nombre), "es", { numeric: true })
    })
    res.json(promos.map(aPromocionPOS))
  } catch (e: any) {
    console.error("[caja/promociones] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las promociones" })
  }
}

/** POST /caja/promociones — crea una promoción. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const saneado = sanearPromocion((req.body ?? {}) as Partial<PromocionPOS>)
    if ("error" in saneado) {
      res.status(400).json({ error: saneado.error }); return
    }
    const service: FerremexPromocionesService = req.scope.resolve(FERREMEX_PROMOCIONES)
    const creada = await service.createPromocions(saneado.data)
    res.status(201).json(aPromocionPOS(creada))
  } catch (e: any) {
    console.error("[caja/promociones] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo crear la promoción" })
  }
}
