import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, withFileLock } from "../../../lib/json-store"

/**
 * /caja/cotizaciones — presupuestos / cotizaciones formales del POS.
 *
 * A diferencia de "Pedidos en espera" (borradores locales por terminal), una
 * cotización es un documento terminal-agnostic con folio (`COT-...`), guardado
 * server-side en JSON (espejo del patrón de /caja/ventas). NO descuenta
 * inventario: es un presupuesto. Al venderse, se marca `convertida` y se enlaza
 * al folio de la venta resultante (trazabilidad).
 */

interface ItemCotizacion {
  sku: string
  descripcion: string
  cantidad: number
  // Precio tal como se cotizó (snapshot). Permite avisar al cargar si el precio
  // actual del artículo cambió respecto a este.
  precio_unitario: number
  // Si el item lleva IVA (precio ya incluye 16%), para el desglose fiscal.
  impuesto?: boolean
  paquete_id?: string
  paquete_nombre?: string
}

interface CotizacionBody {
  cajero: string
  turno_id: string
  items: ItemCotizacion[]
  cliente_id?: string | null
  cliente_nombre?: string | null
  // num_precio del cliente al cotizar (para reaplicar el nivel correcto al cargar).
  num_precio?: number | null
}

interface CotizacionRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  items: (ItemCotizacion & { subtotal: number })[]
  total: number
  cliente_id: string | null
  cliente_nombre: string | null
  num_precio: number | null
  // "vigente" | "convertida". Una cotización convertida guarda el folio de venta.
  estado: "vigente" | "convertida"
  folio_venta?: string | null
  convertida_en?: string | null
}

const COTIZACIONES_FILE = path.join(__dirname, "../../../../data/cotizaciones-pos.json")

function cargarCotizaciones(): CotizacionRegistro[] {
  return readJson<CotizacionRegistro[]>(COTIZACIONES_FILE, [])
}

/** Folio propio de cotización: `COT-YYYYMMDD-<2 hex>`. Independiente del de ventas. */
function generarFolioCotizacion(): string {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase()
  return `COT-${fecha}-${rand}`
}

/** GET /caja/cotizaciones — lista (filtros ?desde=&hasta=&estado=). Reciente primero. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { desde, hasta, estado } = req.query as Record<string, string>
  let cots = cargarCotizaciones()
  if (desde) cots = cots.filter((c) => c.fecha.slice(0, 10) >= desde)
  if (hasta) cots = cots.filter((c) => c.fecha.slice(0, 10) <= hasta)
  if (estado === "vigente" || estado === "convertida") cots = cots.filter((c) => c.estado === estado)
  cots = cots.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
  res.json(cots)
}

/** POST /caja/cotizaciones — guarda una cotización (genera folio). NO toca inventario. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as CotizacionBody
  const { cajero, turno_id, items } = body

  if (!cajero || !turno_id || !items?.length) {
    res.status(400).json({ error: "Faltan campos requeridos: cajero, turno_id, items" })
    return
  }
  if (items.some((i) => !i.sku || !(i.cantidad > 0))) {
    res.status(400).json({ error: "Cada item requiere sku y cantidad > 0" })
    return
  }

  const total = items.reduce((s, i) => s + Number(i.precio_unitario) * i.cantidad, 0)

  // Folio bajo lock para que dos cotizaciones concurrentes no compartan archivo a medias.
  const registro = await withFileLock(COTIZACIONES_FILE, async () => {
    const reg: CotizacionRegistro = {
      folio: generarFolioCotizacion(),
      fecha: new Date().toISOString(),
      cajero,
      turno_id,
      items: items.map((i) => ({
        sku: i.sku,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        subtotal: Number(i.precio_unitario) * i.cantidad,
        ...(i.impuesto != null ? { impuesto: !!i.impuesto } : {}),
        ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre ?? undefined } : {}),
      })),
      total,
      cliente_id: body.cliente_id ?? null,
      cliente_nombre: body.cliente_nombre ?? null,
      num_precio: body.num_precio != null ? Number(body.num_precio) : null,
      estado: "vigente",
      folio_venta: null,
      convertida_en: null,
    }
    const cots = cargarCotizaciones()
    cots.push(reg)
    writeJsonAtomic(COTIZACIONES_FILE, cots)
    return reg
  })

  res.status(201).json(registro)
}

export { COTIZACIONES_FILE }
export type { CotizacionRegistro, ItemCotizacion }
