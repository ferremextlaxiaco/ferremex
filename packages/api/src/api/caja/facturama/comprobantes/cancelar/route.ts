import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError, type MotivoCancelacion } from "../../../../../lib/facturama"
import { FERREMEX_FACTURABLE } from "../../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../../modules/ferremex-facturable/service"

/**
 * POST /caja/facturama/comprobantes/cancelar
 * Body: { cfdi_id, motivo: "01"|"02"|"03"|"04", uuid_replacement? }
 *
 * Cancela un CFDI en Facturama y propaga el estado al POS:
 *  - Si es una factura GLOBAL → la marca cancelada, RECARGA el saldo facturable
 *    que había consumido (reversa del "switch") y desmarca las ventas incluidas
 *    para que puedan re-entrar a una nueva global.
 *  - Si es una factura NOMINATIVA → marca factura.cancelada en la venta.
 *
 * Motivo 01 (sustitución) requiere uuid_replacement.
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../../data/ventas-pos.json")
const GLOBALES_FILE = path.join(__dirname, "../../../../../../data/globales-pos.json")

interface GlobalRegistro {
  id: string
  cfdi_id: string
  uuid: string | null
  fecha_periodo: string
  folios_incluidos: string[]
  cancelada?: boolean
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor (.env)" }); return
  }

  const body = (req.body ?? {}) as { cfdi_id?: string; motivo?: string; uuid_replacement?: string }
  const cfdiId = String(body.cfdi_id ?? "").trim()
  const motivo = (String(body.motivo ?? "02").trim() as MotivoCancelacion)
  if (!cfdiId) { res.status(400).json({ error: "Falta el cfdi_id" }); return }
  if (!["01", "02", "03", "04"].includes(motivo)) { res.status(400).json({ error: "Motivo inválido (01–04)" }); return }
  if (motivo === "01" && !body.uuid_replacement) {
    res.status(400).json({ error: "El motivo 01 (sustitución) requiere el UUID del comprobante que lo reemplaza" }); return
  }

  // Cancelar en Facturama.
  try {
    const client = new FacturamaClient()
    await client.cancelarCfdi(cfdiId, motivo, body.uuid_replacement)
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json(body); return
    }
    console.error("[caja/facturama/comprobantes/cancelar] error:", e)
    res.status(500).json({ error: "No se pudo cancelar el comprobante" }); return
  }

  // Propagar al POS. ¿Es una global?
  const globales = readJson<GlobalRegistro[]>(GLOBALES_FILE, [])
  const global = globales.find((g) => g.cfdi_id === cfdiId)

  if (global) {
    // Reversa del consumo de saldo facturable: recargar lo que la global descontó.
    try {
      const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
      const consumos = await facturable.listarConsumosPorCfdi(cfdiId)
      for (const m of consumos) {
        // consumo guardó cantidad negativa; recargamos el valor absoluto.
        await facturable.recargar(m.sku, Math.abs(Number(m.cantidad) || 0), {
          motivo: `Reversa por cancelación de global ${global.fecha_periodo}`,
        })
      }
    } catch (e: any) {
      console.error("[caja/facturama/comprobantes/cancelar] No se revirtió el saldo:", e?.message ?? e)
    }

    // Marcar global cancelada + desmarcar ventas incluidas.
    try {
      await withFileLock(GLOBALES_FILE, async () => {
        const gs = readJson<GlobalRegistro[]>(GLOBALES_FILE, [])
        const idx = gs.findIndex((g) => g.cfdi_id === cfdiId)
        if (idx !== -1) { gs[idx].cancelada = true; writeJsonAtomic(GLOBALES_FILE, gs) }
      })
      await withFileLock(VENTAS_FILE, async () => {
        const ventas = readJson<any[]>(VENTAS_FILE, [])
        let n = 0
        for (const v of ventas) {
          if (v.global_cfdi_id === cfdiId || global.folios_incluidos.includes(v.folio)) {
            if (v.global_uuid || v.global_cfdi_id) { v.global_uuid = null; v.global_cfdi_id = null; n++ }
          }
        }
        if (n) writeJsonAtomic(VENTAS_FILE, ventas)
      })
    } catch (e: any) {
      console.error("[caja/facturama/comprobantes/cancelar] No se actualizó la global/ventas:", e?.message ?? e)
    }

    res.json({ ok: true, tipo: "global" }); return
  }

  // Nominativa: revertir el saldo facturable que consumió + marcar cancelada.
  // Reversa del consumo: recargar lo que la factura nominativa había descontado
  // (mismo mecanismo que la global, cruzando por cfdi_ref). Idempotente en la
  // práctica porque solo se cancela una vez.
  try {
    const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    const consumos = await facturable.listarConsumosPorCfdi(cfdiId)
    for (const m of consumos) {
      await facturable.recargar(m.sku, Math.abs(Number(m.cantidad) || 0), {
        folio_ref: m.folio_ref ?? null,
        motivo: `Reversa por cancelación de factura ${m.folio_ref ?? cfdiId}`,
      })
    }
  } catch (e: any) {
    console.error("[caja/facturama/comprobantes/cancelar] No se revirtió el saldo de la nominativa:", e?.message ?? e)
  }

  try {
    await withFileLock(VENTAS_FILE, async () => {
      const ventas = readJson<any[]>(VENTAS_FILE, [])
      const idx = ventas.findIndex((v) => v.factura?.cfdi_id === cfdiId)
      if (idx !== -1) {
        ventas[idx].factura = { ...ventas[idx].factura, cancelada: true }
        writeJsonAtomic(VENTAS_FILE, ventas)
      }
    })
  } catch (e: any) {
    console.error("[caja/facturama/comprobantes/cancelar] No se marcó la venta:", e?.message ?? e)
  }

  res.json({ ok: true, tipo: "nominativa" })
}
