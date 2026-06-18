import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_FACTURABLE } from "../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../modules/ferremex-facturable/service"

/**
 * /caja/facturable — saldo facturable por artículo (doble inventario fiscal).
 *
 * GET  → { saldos: SaldoFila[], deptos: Record<depto, boolean> }
 *        El frontend (tab "Facturable" de Artículos) hace el merge con los
 *        artículos que ya cargó (existencia física, clave SAT, depto), así esta
 *        ruta queda desacoplada de la maquinaria de productos.
 * POST → ajuste MANUAL del saldo de un artículo. Body:
 *        { sku, nuevo_saldo, motivo?, clave_sat?, descripcion?, departamento? }
 *        Registra un movimiento "ajuste" con el delta (auditable).
 *
 * Consumido por: ArticlesModule (tab Facturable). Las recargas automáticas
 * (compra Con Factura) y los consumos (al facturar) NO pasan por aquí: ocurren
 * en /caja/compras y en las rutas de Facturama respectivamente.
 */

interface SaldoFila {
  sku: string
  saldo: number
  clave_sat: string | null
  descripcion: string | null
  departamento: string | null
  actualizado_el: string | null
}

function aSaldoFila(s: any): SaldoFila {
  return {
    sku: s.sku,
    saldo: Number(s.saldo) || 0,
    clave_sat: s.clave_sat ?? null,
    descripcion: s.descripcion ?? null,
    departamento: s.departamento ?? null,
    actualizado_el: s.actualizado_el ?? null,
  }
}

/** GET /caja/facturable — saldos + mapa de departamentos facturables. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    const [saldos, deptos] = await Promise.all([
      service.listarSaldos({}),
      service.mapaDeptos(),
    ])
    res.json({ saldos: (saldos as any[]).map(aSaldoFila), deptos })
  } catch (e: any) {
    console.error("[caja/facturable] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cargar el saldo facturable" })
  }
}

interface AjusteBody {
  sku?: string
  nuevo_saldo?: number
  motivo?: string
  clave_sat?: string | null
  descripcion?: string | null
  departamento?: string | null
}

/** POST /caja/facturable — ajuste manual del saldo de un artículo. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as AjusteBody
    const sku = String(body.sku ?? "").trim()
    if (!sku) {
      res.status(400).json({ error: "Falta el sku del artículo" }); return
    }
    if (body.nuevo_saldo == null || !Number.isFinite(Number(body.nuevo_saldo))) {
      res.status(400).json({ error: "nuevo_saldo inválido" }); return
    }
    // Un artículo sin clave SAT no debería tener saldo facturable (no se podría
    // timbrar). Si el ajuste intenta SUBIR el saldo sin clave SAT, lo rechazamos.
    const nuevo = Math.trunc(Number(body.nuevo_saldo))
    const claveSat = (body.clave_sat ?? "").toString().trim()
    if (nuevo > 0 && !claveSat) {
      res.status(400).json({
        error: "Asigna una clave SAT al artículo antes de darle saldo facturable",
      }); return
    }

    const service: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    const { saldo } = await service.ajustarA(sku, nuevo, {
      motivo: body.motivo ?? "Ajuste manual",
      clave_sat: body.clave_sat ?? null,
      descripcion: body.descripcion ?? null,
      departamento: body.departamento ?? null,
    })
    res.json({ sku, saldo })
  } catch (e: any) {
    console.error("[caja/facturable] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo ajustar el saldo facturable" })
  }
}
