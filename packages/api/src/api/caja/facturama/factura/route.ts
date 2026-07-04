import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado, httpDeFacturamaError } from "../../../../lib/facturama"
import { ventaACfdiNominativo, validarEmisor, type VentaParaCFDI } from "../../../../lib/cfdi-mapper"
import { construirResolverFiscal } from "../../../../lib/facturable-resolver"
import { customerAClientePOS } from "../../clientes/_mapper"
import { leerConfigFacturacion } from "../_config"
import { FERREMEX_FACTURABLE } from "../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../modules/ferremex-facturable/service"

/**
 * POST /caja/facturama/factura — timbra una venta NOMINATIVA (cliente con RFC).
 *
 * Body: { folio, cliente_id? }. Si no se manda cliente_id, usa el cliente_id
 * guardado en la venta. Carga la venta de ventas-pos.json, lee los datos
 * fiscales del cliente (Customer.metadata), arma el CFDI 4.0 (mapper + resolvedor
 * de claves SAT por SKU) y lo timbra en Facturama. Guarda el resultado (uuid,
 * cfdi_id, estado, fecha) DENTRO de la venta, bajo el lock del archivo.
 *
 * Idempotente: si la venta ya está facturada (tiene cfdi_id), devuelve la
 * factura existente sin volver a timbrar.
 */

const VENTAS_FILE = path.join(__dirname, "../../../../../data/ventas-pos.json")

interface VentaRegistro {
  folio: string
  fecha: string
  estado?: string
  items?: { sku?: string; descripcion?: string; cantidad: number; precio_unitario: number }[]
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_credito?: number
  pago_puntos?: number
  cliente_id?: string | null
  cliente_nombre?: string | null
  // Marca de inclusión en una factura global timbrada (bloquea la nominativa).
  global_uuid?: string | null
  global_cfdi_id?: string | null
  // Datos de la factura, una vez timbrada:
  factura?: {
    cfdi_id: string
    uuid: string | null
    fecha: string
    receptor_rfc: string
    receptor_nombre: string
    total: number | null
  }
  [k: string]: unknown
}

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!facturamaConfigurado()) {
    res.status(503).json({ error: "Facturama no está configurado en el servidor (.env)" })
    return
  }

  const body = (req.body ?? {}) as { folio?: string; cliente_id?: string }
  const folio = String(body.folio ?? "").trim()
  if (!folio) {
    res.status(400).json({ error: "Falta el folio de la venta" }); return
  }

  // Cargar la venta.
  const venta = cargarVentas().find((v) => v.folio === folio)
  if (!venta) {
    res.status(404).json({ error: "Venta no encontrada" }); return
  }
  if (venta.estado === "cancelada") {
    res.status(400).json({ error: "No se puede facturar una venta cancelada" }); return
  }
  // Idempotencia: ya facturada.
  if (venta.factura?.cfdi_id) {
    res.json({ ya_facturada: true, factura: venta.factura }); return
  }
  // Ya incluida en una factura GLOBAL timbrada: no se puede facturar nominativa
  // (ese ingreso ya está declarado al SAT; sería doble facturación). El operador
  // debe cancelar la global primero si quiere emitir nominativa.
  if (venta.global_uuid || venta.global_cfdi_id) {
    res.status(409).json({
      error: "Esta venta ya está incluida en la factura global del día. Para facturarla a nombre del cliente, primero cancela la factura global correspondiente.",
    }); return
  }
  if (!venta.items?.length) {
    res.status(400).json({ error: "La venta no tiene artículos" }); return
  }

  // Resolver el cliente (RFC + datos fiscales).
  const clienteId = String(body.cliente_id ?? venta.cliente_id ?? "").trim()
  if (!clienteId) {
    res.status(400).json({ error: "La venta no tiene cliente. Asigna un cliente con RFC para facturar." }); return
  }

  let cliente
  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const c = await customerModule.retrieveCustomer(clienteId, { relations: ["groups"] })
    cliente = customerAClientePOS(c as any)
  } catch {
    res.status(404).json({ error: "Cliente no encontrado" }); return
  }

  // Validar datos fiscales mínimos del receptor.
  const faltan: string[] = []
  if (!cliente.rfc?.trim()) faltan.push("RFC")
  if (!cliente.razon_social?.trim()) faltan.push("Razón social")
  if (!cliente.regimen_fiscal?.trim()) faltan.push("Régimen fiscal")
  if (!cliente.cfdi?.trim()) faltan.push("Uso de CFDI")
  if (!cliente.cp?.trim()) faltan.push("Código postal")
  if (faltan.length) {
    res.status(400).json({ error: `Faltan datos fiscales del cliente: ${faltan.join(", ")}` }); return
  }

  // Cliente Facturama + validación del emisor.
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

  // Resolvedor de claves SAT por SKU (consulta el catálogo).
  const skus = (venta.items ?? []).map((i) => i.sku ?? "").filter(Boolean)
  const resolver = await construirResolverFiscal(req.scope, skus)

  // Armar el CFDI nominativo.
  const ventaParaCFDI: VentaParaCFDI = {
    folio: venta.folio,
    fecha: venta.fecha,
    items: (venta.items ?? []).map((i) => ({
      sku: i.sku ?? "",
      descripcion: i.descripcion ?? "",
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    })),
    pago_efectivo: venta.pago_efectivo,
    pago_transferencia: venta.pago_transferencia,
    pago_tarjeta: venta.pago_tarjeta,
    pago_credito: venta.pago_credito,
    pago_puntos: venta.pago_puntos,
  }
  const { cfdi, skusSinClave } = ventaACfdiNominativo(
    ventaParaCFDI,
    {
      rfc: cliente.rfc,
      nombre: cliente.razon_social,
      regimenFiscal: cliente.regimen_fiscal,
      usoCfdi: cliente.cfdi,
      cp: cliente.cp,
    },
    client.emisor,
    resolver,
    { serie: leerConfigFacturacion().serie_nominativa || null }
  )

  // BLOQUEO: todos los artículos deben tener clave SAT para poder facturar. Sin
  // ella no se puede emitir un CFDI válido (antes se usaba una clave genérica;
  // ahora se rechaza para no timbrar comprobantes con datos incompletos).
  if (skusSinClave.length) {
    const descPorSku = new Map<string, string>()
    for (const it of venta.items ?? []) {
      if (it.sku) descPorSku.set(it.sku, it.descripcion ?? it.sku)
    }
    const nombres = skusSinClave.map((sku) => `"${descPorSku.get(sku) ?? sku}"`)
    const lista = nombres.length === 1
      ? `el artículo ${nombres[0]} no tiene`
      : `los artículos ${nombres.join(", ")} no tienen`
    res.status(422).json({
      error: `No se puede facturar: ${lista} clave SAT. Asígnala en Artículos (o en Saldo facturable) e inténtalo de nuevo.`,
      skus_sin_clave: skusSinClave,
    })
    return
  }

  // Timbrar.
  let timbrada
  try {
    timbrada = await client.crearCfdi(cfdi)
  } catch (e) {
    if (e instanceof FacturamaError) {
      const { status, body } = httpDeFacturamaError(e)
      res.status(status).json({ ...body, skus_sin_clave: skusSinClave.length ? skusSinClave : undefined })
      return
    }
    console.error("[caja/facturama/factura] Error inesperado:", e)
    res.status(500).json({ error: "No se pudo timbrar la factura" })
    return
  }

  // Guardar el resultado en la venta (bajo lock).
  const factura = {
    cfdi_id: timbrada.Id,
    uuid: timbrada.Complement?.TaxStamp?.Uuid ?? null,
    fecha: new Date().toISOString(),
    receptor_rfc: cliente.rfc,
    receptor_nombre: cliente.razon_social,
    total: timbrada.Total ?? null,
  }
  // Switch de cliente: si la venta era a público en general (sin cliente) y se
  // facturó eligiendo uno, se REASIGNA el cliente a la venta de forma permanente
  // (queda atribuida a él en el historial y ya no es candidata a la global).
  const reasignarCliente = !venta.cliente_id && !!clienteId
  try {
    await withFileLock(VENTAS_FILE, async () => {
      const ventas = cargarVentas()
      const idx = ventas.findIndex((v) => v.folio === folio)
      if (idx !== -1 && !ventas[idx].factura?.cfdi_id) {
        ventas[idx] = {
          ...ventas[idx],
          factura,
          ...(reasignarCliente
            ? { cliente_id: clienteId, cliente_nombre: cliente.razon_social || cliente.nombre || null }
            : {}),
        }
        writeJsonAtomic(VENTAS_FILE, ventas)
      }
    })
  } catch (e: any) {
    // El CFDI ya se timbró; si falla guardar, lo logueamos pero devolvemos éxito
    // con el folio fiscal para que no se intente timbrar de nuevo.
    console.error(`[caja/facturama/factura] Timbrado OK pero no se guardó en la venta ${folio}:`, e?.message ?? e)
  }

  // Consumir saldo facturable de cada SKU facturado (igual que la global). La
  // factura nominativa SÍ respalda piezas, así que baja el saldo. Se PERMITE
  // sobregiro: si un SKU no tiene saldo suficiente (o su depto no es "facturable"
  // —eso solo excluye de la GLOBAL, no de la nominativa—), el saldo queda negativo
  // (semáforo rojo) como aviso de que falta respaldo de compra. `cfdi_ref` enlaza
  // el consumo al CFDI para poder revertirlo si la factura se cancela.
  // Cantidades agrupadas por SKU (una venta puede repetir un SKU en varias líneas).
  const cantPorSku = new Map<string, number>()
  for (const it of venta.items ?? []) {
    const sku = (it.sku ?? "").trim()
    if (!sku) continue
    cantPorSku.set(sku, (cantPorSku.get(sku) ?? 0) + (Number(it.cantidad) || 0))
  }
  try {
    const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
    for (const [sku, cantidad] of cantPorSku) {
      if (cantidad <= 0) continue
      try {
        await facturable.consumir(sku, cantidad, {
          folio_ref: venta.folio,
          cfdi_ref: timbrada.Id,
          motivo: `Factura nominativa ${venta.folio}`,
        })
      } catch (e: any) {
        // El CFDI ya está timbrado en el SAT: un fallo de consumo NO debe romper la
        // respuesta, pero se loguea para que el operador ajuste el saldo a mano.
        console.error(`[caja/facturama/factura] No se consumió saldo de ${sku} (venta ${venta.folio}):`, e?.message ?? e)
      }
    }
  } catch (e: any) {
    console.error(`[caja/facturama/factura] No se pudo consumir saldo facturable de la venta ${venta.folio}:`, e?.message ?? e)
  }

  res.json({ factura, skus_sin_clave: skusSinClave.length ? skusSinClave : undefined })
}
