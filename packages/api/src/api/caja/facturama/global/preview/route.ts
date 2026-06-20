import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson } from "../../../../../lib/json-store"
import { facturamaConfigurado } from "../../../../../lib/facturama"
import { construirResolverFiscal } from "../../../../../lib/facturable-resolver"
import {
  construirPreviewGlobal,
  esCandidataGlobal,
  type VentaGlobalIn,
  type DatosSku,
} from "../../../../../lib/global-builder"
import { FERREMEX_FACTURABLE } from "../../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../../modules/ferremex-facturable/service"

/**
 * GET /caja/facturama/global/preview?fecha=YYYY-MM-DD&caja_id=&forzar=1
 *
 * Calcula el preview de la factura global del día: agrupa las ventas de público
 * en general (sin factura nominativa ni global previa) del período, las clasifica
 * en ENTRAN / EXCLUIDAS / SIN CLAVE SAT según el saldo facturable y el depto, y
 * devuelve los totales. NO timbra ni consume saldo: solo proyecta.
 *
 * - `fecha`: día a facturar (default hoy). Periodicidad Diario (01).
 * - `caja_id`: opcional, limita a una caja física.
 * - `forzar`: "1" mueve a "entran" las excluidas SOLO por saldo insuficiente.
 *
 * Consumido por FacturacionModule (Tab Global).
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../../data/ventas-pos.json")

function cargarVentas(): VentaGlobalIn[] {
  return readJson<VentaGlobalIn[]>(VENTAS_FILE, [])
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const q = req.query as Record<string, string>
    const fecha = (q.fecha ?? "").trim() || new Date().toISOString().slice(0, 10)
    const cajaId = (q.caja_id ?? "").trim()
    const forzar = q.forzar === "1" || q.forzar === "true"

    // Ventas del día (por fecha) + caja opcional, que sean candidatas a global.
    const todas = cargarVentas()
    const delDia = todas.filter((v: any) => {
      if (typeof v.fecha !== "string" || v.fecha.slice(0, 10) !== fecha) return false
      if (cajaId && (v.caja_id ?? "") !== cajaId) return false
      return esCandidataGlobal(v)
    })

    // SKUs únicos del período → resolver fiscal (clave SAT, depto, descripción).
    const skus = [...new Set(delDia.flatMap((v) => (v.items ?? []).map((i) => (i.sku ?? "").trim())).filter(Boolean))]
    const resolverFiscal = await construirResolverFiscal(req.scope, skus)

    // Saldo facturable + deptos facturables del módulo ferremex_facturable.
    const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    const [saldos, deptos] = await Promise.all([
      facturable.listarSaldos({}),
      facturable.mapaDeptos(),
    ])
    const saldoPorSku = new Map<string, number>()
    for (const s of saldos) saldoPorSku.set(s.sku, Number(s.saldo) || 0)

    // Resolver por SKU: combina catálogo (clave/depto) + módulo facturable (saldo).
    const resolver = (sku: string): DatosSku => {
      const f = resolverFiscal(sku)
      const departamento = f?.departamento ?? ""
      return {
        claveSat: f?.claveSat ?? "",
        departamento,
        descripcion: f?.descripcion,
        // Depto facturable: sin fila registrada = false (conservador).
        deptoFacturable: departamento ? !!deptos[departamento] : false,
        // Saldo: si el SKU tiene fila, su saldo; si no, null = ilimitado.
        saldo: saldoPorSku.has(sku) ? (saldoPorSku.get(sku) as number) : null,
      }
    }

    const preview = construirPreviewGlobal(delDia, resolver, { forzarSaldo: forzar })

    res.json({
      fecha,
      caja_id: cajaId || null,
      forzar,
      configurado: facturamaConfigurado(),
      ...preview,
    })
  } catch (e: any) {
    console.error("[caja/facturama/global/preview] error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo calcular el preview de la factura global" })
  }
}
