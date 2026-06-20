import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError, type CfdiResponse } from "../../../../lib/facturama"

/**
 * GET /caja/facturama/comprobantes — historial de CFDIs emitidos.
 *
 * Lee los CFDIs reales desde Facturama (verdad fiscal, estado vigente/cancelado
 * en vivo) y los CRUZA con las ventas/globales del POS para anexar el folio de
 * la venta ligada y distinguir nominativa vs global.
 *
 * Query: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&tipo=nominativa|global&estado=&q=
 *
 * Consumido por FacturacionModule (Tab Comprobantes).
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")
const GLOBALES_FILE = path.join(__dirname, "../../../../../data/globales-pos.json")

interface VentaRegistro {
  folio: string
  factura?: { cfdi_id?: string }
  [k: string]: unknown
}
interface GlobalRegistro {
  id: string
  cfdi_id: string
  uuid: string | null
  folios_incluidos: string[]
}

/** Normaliza el estado de Facturama a "Vigente"/"Cancelado". */
function normalizarEstado(c: CfdiResponse): string {
  const raw = String(c.Status ?? "").toLowerCase()
  if (c.IsActive === false || raw.includes("cancel")) return "Cancelado"
  return "Vigente"
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor (.env)" }); return
  }

  const q = req.query as Record<string, string>
  const desde = (q.desde ?? "").trim()
  const hasta = (q.hasta ?? "").trim()
  const tipoFiltro = (q.tipo ?? "").trim() // "nominativa" | "global" | ""
  const estadoFiltro = (q.estado ?? "").trim().toLowerCase()
  const texto = (q.q ?? "").trim()

  // Traer CFDIs de Facturama por rango (status según filtro).
  let cfdis: CfdiResponse[]
  try {
    const client = new FacturamaClient()
    cfdis = await client.listarCfdis({
      dateStart: desde || undefined,
      dateEnd: hasta || undefined,
      keyword: texto || undefined,
      status: estadoFiltro === "cancelado" ? "canceled" : estadoFiltro === "vigente" ? "active" : undefined,
    })
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json(body); return
    }
    console.error("[caja/facturama/comprobantes] error listando:", e)
    res.status(500).json({ error: "No se pudo consultar los comprobantes" }); return
  }

  // Índices de cruce: cfdi_id → folio de venta (nominativa) y set de globales.
  const ventas = readJson<VentaRegistro[]>(VENTAS_FILE, [])
  const folioPorCfdi = new Map<string, string>()
  for (const v of ventas) {
    const id = v.factura?.cfdi_id
    if (id) folioPorCfdi.set(id, v.folio)
  }
  const globales = readJson<GlobalRegistro[]>(GLOBALES_FILE, [])
  const globalPorCfdi = new Map<string, GlobalRegistro>()
  for (const g of globales) globalPorCfdi.set(g.cfdi_id, g)

  const comprobantes = (cfdis ?? []).map((c) => {
    // Global: o está registrada en globales-pos.json (emitida desde este módulo),
    // o su receptor es el genérico de público en general (CFDIs globales viejos).
    const esGlobal = globalPorCfdi.has(c.Id) || (c.Rfc ?? "").toUpperCase() === "XAXX010101000"
    return {
      cfdi_id: c.Id,
      uuid: c.Uuid ?? c.Complement?.TaxStamp?.Uuid ?? null,
      serie: c.Serie ?? null,
      folio_cfdi: c.Folio ?? null,
      fecha: c.Date ?? "",
      tipo: esGlobal ? ("global" as const) : ("nominativa" as const),
      receptor_rfc: c.Rfc ?? "",
      receptor_nombre: c.TaxName ?? "",
      total: c.Total ?? null,
      estado: normalizarEstado(c),
      folio_venta: folioPorCfdi.get(c.Id) ?? null,
      email: c.Email ?? null,
    }
  })

  // Filtro por tipo (post-cruce, porque "global" lo determina el cruce local).
  const filtrados = tipoFiltro
    ? comprobantes.filter((c) => c.tipo === tipoFiltro)
    : comprobantes

  // Orden: más reciente primero.
  filtrados.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  res.json({ comprobantes: filtrados, total: filtrados.length })
}
