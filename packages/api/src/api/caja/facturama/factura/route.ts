import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import { readJson, writeJsonAtomic, withFileLock } from "../../../../lib/json-store"
import { FacturamaClient, FacturamaError, facturamaConfigurado } from "../../../../lib/facturama"
import { ventaACfdiNominativo, validarEmisor, type VentaParaCFDI } from "../../../../lib/cfdi-mapper"
import { construirResolverFiscal } from "../../../../lib/facturable-resolver"
import { customerAClientePOS } from "../../clientes/_mapper"

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
    resolver
  )

  // Timbrar.
  let timbrada
  try {
    timbrada = await client.crearCfdi(cfdi)
  } catch (e) {
    if (e instanceof FacturamaError) {
      res.status(e.status >= 400 && e.status < 500 ? 400 : 502).json({
        error: e.message,
        detalle: e.detalle,
        skus_sin_clave: skusSinClave.length ? skusSinClave : undefined,
      })
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
  try {
    await withFileLock(VENTAS_FILE, async () => {
      const ventas = cargarVentas()
      const idx = ventas.findIndex((v) => v.folio === folio)
      if (idx !== -1 && !ventas[idx].factura?.cfdi_id) {
        ventas[idx] = { ...ventas[idx], factura }
        writeJsonAtomic(VENTAS_FILE, ventas)
      }
    })
  } catch (e: any) {
    // El CFDI ya se timbró; si falla guardar, lo logueamos pero devolvemos éxito
    // con el folio fiscal para que no se intente timbrar de nuevo.
    console.error(`[caja/facturama/factura] Timbrado OK pero no se guardó en la venta ${folio}:`, e?.message ?? e)
  }

  res.json({ factura, skus_sin_clave: skusSinClave.length ? skusSinClave : undefined })
}
