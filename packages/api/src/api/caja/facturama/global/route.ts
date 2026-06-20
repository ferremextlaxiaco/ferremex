import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError } from "../../../../lib/facturama"
import { itemsACfdiGlobal, validarEmisor, type ItemVentaCFDI } from "../../../../lib/cfdi-mapper"
import { construirResolverFiscal } from "../../../../lib/facturable-resolver"
import { construirPreviewGlobal, esCandidataGlobal, type VentaGlobalIn, type DatosSku } from "../../../../lib/global-builder"
import { FERREMEX_FACTURABLE } from "../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../modules/ferremex-facturable/service"
import { leerConfigFacturacion } from "../_config"

/**
 * POST /caja/facturama/global — timbra la FACTURA GLOBAL del día.
 *
 * Body: { fecha?: YYYY-MM-DD, caja_id?, forzar?: boolean }.
 *
 * Bajo lock del archivo de ventas:
 *  1. Re-calcula el preview (las líneas que ENTRAN) con datos frescos.
 *  2. Bloquea si hay artículos sin clave SAT (rompería el timbrado).
 *  3. Timbra el CFDI global en Facturama (Periodicity 01 = Diario, desglose).
 *  4. CONSUME el saldo facturable de cada SKU incluido (el "switch" confirmado).
 *  5. Marca las ventas candidatas con `global_uuid` para no re-facturarlas.
 *  6. Guarda el registro de la global en globales-pos.json (historial cruzado).
 *
 * Idempotencia suave: si ya existe una global del mismo (fecha, caja_id) vigente,
 * se rechaza para no duplicar (el usuario debe cancelarla primero).
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")
const GLOBALES_FILE = path.join(__dirname, "../../../../../data/globales-pos.json")

interface GlobalRegistro {
  id: string                // uuid local
  cfdi_id: string
  uuid: string | null
  fecha_periodo: string     // YYYY-MM-DD
  caja_id: string | null
  fecha_timbrado: string    // ISO
  total: number | null
  folios_incluidos: string[]
  cancelada?: boolean
}

function cargarVentas(): (VentaGlobalIn & Record<string, unknown>)[] {
  return readJson<(VentaGlobalIn & Record<string, unknown>)[]>(VENTAS_FILE, [])
}
function cargarGlobales(): GlobalRegistro[] {
  return readJson<GlobalRegistro[]>(GLOBALES_FILE, [])
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor (.env)" }); return
  }

  const body = (req.body ?? {}) as { fecha?: string; caja_id?: string; forzar?: boolean }
  const fecha = (body.fecha ?? "").trim() || new Date().toISOString().slice(0, 10)
  const cajaId = (body.caja_id ?? "").trim()
  const forzar = body.forzar === true

  // Rechazar duplicado: ya hay una global vigente para (fecha, caja).
  const globalExistente = cargarGlobales().find(
    (g) => g.fecha_periodo === fecha && (g.caja_id ?? "") === cajaId && !g.cancelada
  )
  if (globalExistente) {
    res.status(409).json({
      error: `Ya existe una factura global para ${fecha}${cajaId ? " (esa caja)" : ""}. Cancélala antes de re-emitir.`,
      global: globalExistente,
    })
    return
  }

  // Cliente Facturama + emisor.
  let client: FacturamaClient
  try {
    client = new FacturamaClient()
  } catch (e: any) {
    res.status(503).json({ error: e?.message ?? "Facturama no configurado" }); return
  }
  const faltanEmisor = validarEmisor(client.emisor)
  if (faltanEmisor.length) {
    res.status(503).json({ error: `Falta configurar el emisor: ${faltanEmisor.join(", ")}` }); return
  }

  // Ventas candidatas del período + resolver fiscal y saldo facturable.
  const todas = cargarVentas()
  const delDia = todas.filter((v: any) => {
    if (typeof v.fecha !== "string" || v.fecha.slice(0, 10) !== fecha) return false
    if (cajaId && (v.caja_id ?? "") !== cajaId) return false
    return esCandidataGlobal(v)
  })
  if (delDia.length === 0) {
    res.status(400).json({ error: "No hay ventas de público sin facturar para ese período." }); return
  }

  const skus = [...new Set(delDia.flatMap((v) => (v.items ?? []).map((i) => (i.sku ?? "").trim())).filter(Boolean))]
  const resolverFiscal = await construirResolverFiscal(req.scope, skus)
  const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
  const [saldos, deptos] = await Promise.all([facturable.listarSaldos({}), facturable.mapaDeptos()])
  const saldoPorSku = new Map<string, number>()
  for (const s of saldos) saldoPorSku.set(s.sku, Number(s.saldo) || 0)

  const resolverSku = (sku: string): DatosSku => {
    const f = resolverFiscal(sku)
    const departamento = f?.departamento ?? ""
    return {
      claveSat: f?.claveSat ?? "",
      departamento,
      descripcion: f?.descripcion,
      deptoFacturable: departamento ? !!deptos[departamento] : false,
      saldo: saldoPorSku.has(sku) ? (saldoPorSku.get(sku) as number) : null,
    }
  }

  const preview = construirPreviewGlobal(delDia, resolverSku, { forzarSaldo: forzar })

  // Bloqueante: artículos sin clave SAT.
  if (preview.totales.hayBloqueante) {
    res.status(400).json({
      error: "Hay artículos sin clave SAT. Asígnala antes de timbrar la global.",
      sin_clave_sat: preview.sinClaveSat.map((l) => ({ sku: l.sku, descripcion: l.descripcion })),
    })
    return
  }
  if (preview.entran.length === 0) {
    res.status(400).json({
      error: "Ningún artículo del período tiene respaldo facturable (depto facturable + saldo).",
    })
    return
  }

  // Líneas que ENTRAN → items CFDI (precio unitario = importe / cantidad).
  const items: ItemVentaCFDI[] = preview.entran.map((l) => ({
    sku: l.sku,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.cantidad > 0 ? l.importe / l.cantidad : l.importe,
  }))

  const cfg = leerConfigFacturacion()
  const { cfdi } = itemsACfdiGlobal(items, client.emisor, resolverFiscal, {
    fechaPeriodo: fecha,
    periodicidad: cfg.periodicidad_global ?? "01",
    serie: cfg.serie_global || null,
  })

  // Timbrar.
  let timbrada
  try {
    timbrada = await client.crearCfdi(cfdi)
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json(body); return
    }
    console.error("[caja/facturama/global] Error inesperado al timbrar:", e)
    res.status(500).json({ error: "No se pudo timbrar la factura global" }); return
  }

  const uuid = timbrada.Complement?.TaxStamp?.Uuid ?? null
  const ahora = new Date().toISOString()
  const idLocal = `glob_${fecha.replace(/-/g, "")}_${cajaId || "all"}_${(uuid ?? timbrada.Id).slice(0, 8)}`

  // Consumir saldo facturable de cada SKU incluido (el "switch") + marcar ventas.
  const consumos: { sku: string; cantidad: number }[] = preview.entran
    .filter((l) => l.saldoDisponible != null) // solo SKUs que manejan saldo
    .map((l) => ({ sku: l.sku, cantidad: l.cantidad }))

  // Acumulamos los SKUs cuyo consumo de saldo FALLÓ para devolverlos: el CFDI ya
  // está timbrado en el SAT (no se puede deshacer aquí), así que el fallo NO debe
  // ser silencioso — el operador debe ajustar esos saldos manualmente.
  const consumosFallidos: { sku: string; cantidad: number; error: string }[] = []
  for (const c of consumos) {
    try {
      await facturable.consumir(c.sku, c.cantidad, {
        cfdi_ref: timbrada.Id,
        motivo: `Factura global ${fecha}`,
      })
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      console.error(`[caja/facturama/global] No se consumió saldo de ${c.sku}:`, msg)
      consumosFallidos.push({ sku: c.sku, cantidad: c.cantidad, error: msg })
    }
  }

  // Marcar ventas incluidas con global_uuid (bajo lock) + persistir el registro.
  const folios = preview.foliosCandidatos
  try {
    await withFileLock(VENTAS_FILE, async () => {
      const ventas = cargarVentas()
      let cambiadas = 0
      for (const v of ventas as any[]) {
        if (folios.includes(v.folio) && !v.global_uuid) {
          v.global_uuid = uuid ?? timbrada.Id
          v.global_cfdi_id = timbrada.Id
          cambiadas++
        }
      }
      if (cambiadas) writeJsonAtomic(VENTAS_FILE, ventas)
    })
  } catch (e: any) {
    console.error("[caja/facturama/global] Timbrado OK pero no se marcaron las ventas:", e?.message ?? e)
  }

  const registro: GlobalRegistro = {
    id: idLocal,
    cfdi_id: timbrada.Id,
    uuid,
    fecha_periodo: fecha,
    caja_id: cajaId || null,
    fecha_timbrado: ahora,
    total: timbrada.Total ?? null,
    folios_incluidos: folios,
  }
  // Persistir el registro + DETECTAR DUPLICADO bajo el mismo lock: si entre la
  // verificación inicial y aquí otra petición timbró una global del mismo
  // período (carrera), ambos CFDIs ya existen en el SAT. Guardamos el nuestro de
  // todas formas (no podemos perderlo) pero lo señalamos para que el operador
  // concilie. El timbrado va FUERA del lock (no bloquear durante el HTTP).
  let duplicadoDetectado = false
  try {
    await withFileLock(GLOBALES_FILE, async () => {
      const globales = cargarGlobales()
      duplicadoDetectado = globales.some(
        (g) => g.cfdi_id !== registro.cfdi_id && g.fecha_periodo === fecha && (g.caja_id ?? "") === cajaId && !g.cancelada
      )
      globales.push(registro)
      writeJsonAtomic(GLOBALES_FILE, globales)
    })
  } catch (e: any) {
    console.error("[caja/facturama/global] No se guardó el registro de la global:", e?.message ?? e)
  }

  res.json({
    global: registro,
    consumos,
    ...(consumosFallidos.length ? { consumos_fallidos: consumosFallidos } : {}),
    ...(duplicadoDetectado ? { duplicado_detectado: true } : {}),
  })
}
