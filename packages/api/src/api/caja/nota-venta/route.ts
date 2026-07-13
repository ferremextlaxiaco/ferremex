import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import path from "path"
import fs from "fs"
import { readJson } from "../../../lib/json-store"
import { NotaVentaDocument, type NotaVentaItem, type NotaVentaOpts } from "./NotaVentaDocument"

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const STATIC_DIR = path.resolve(__dirname, "../../../../static")

interface VentaItem { sku?: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }
interface Venta {
  folio: string
  fecha: string
  cajero: string
  vendedor?: string | null
  items: VentaItem[]
  cliente_id?: string | null
  cliente_nombre?: string | null
  metodo_pago?: string | null
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_credito?: number
}

/** Convierte un thumbnail (URL absoluta o /static/…) a dataURI, con contención de
 *  path traversal (idéntico criterio que /caja/generar-oc). */
function thumbnailToDataUri(thumbnail: string | null): string | null {
  if (!thumbnail) return null
  if (thumbnail.startsWith("data:")) return thumbnail
  let rel = thumbnail
  if (!rel.startsWith("/static/")) {
    try { rel = new URL(thumbnail).pathname } catch { return null }
  }
  if (!rel.startsWith("/static/")) return null
  const filename = rel.slice("/static/".length)
  const filePath = path.normalize(path.join(STATIC_DIR, filename))
  if (!filePath.startsWith(STATIC_DIR + path.sep)) return null
  if (!fs.existsSync(filePath)) return null
  const buf = fs.readFileSync(filePath)
  const ext = path.extname(filename).slice(1).toLowerCase()
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`
  return `data:${mime};base64,${buf.toString("base64")}`
}

/** Deriva una etiqueta de forma de pago legible desde los montos de la venta. */
function formaPago(v: Venta): string {
  const partes: string[] = []
  if ((v.pago_efectivo ?? 0) > 0) partes.push("Efectivo")
  if ((v.pago_transferencia ?? 0) > 0) partes.push("Transferencia")
  if ((v.pago_tarjeta ?? 0) > 0) partes.push("Tarjeta")
  if ((v.pago_credito ?? 0) > 0) partes.push("Crédito")
  if (v.metodo_pago === "contra_entrega") return "Contra entrega"
  return partes.length ? partes.join(" + ") : "—"
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { folio, opts } = req.body as { folio?: string; opts?: Partial<NotaVentaOpts> }
  if (!folio) {
    res.status(400).json({ error: "Se requiere folio" })
    return
  }

  const ventas = readJson<Venta[]>(VENTAS_FILE, [])
  const venta = ventas.find((x) => x.folio === folio)
  if (!venta) {
    res.status(404).json({ error: `No se encontró la venta ${folio}` })
    return
  }

  const options: NotaVentaOpts = {
    imagen: opts?.imagen ?? true,
    sku: opts?.sku ?? true,
    precio: opts?.precio ?? true,
    cliente: opts?.cliente ?? true,
    vendedor: opts?.vendedor ?? true,
    notas: opts?.notas ?? false,
    notasTexto: typeof opts?.notasTexto === "string" ? opts.notasTexto.slice(0, 600) : "",
  }

  try {
    const productModule = req.scope.resolve(Modules.PRODUCT)

    // Resolver por SKU: thumbnail (para imageMap) + flag de impuesto (para el
    // desglose de IVA correcto, respetando productos exentos). Una sola pasada.
    const skus = [...new Set(venta.items.map((i) => i.sku).filter((x): x is string => !!x))]
    const imageMap: Record<string, string> = {}
    const impuestoPorSku: Record<string, boolean> = {}

    if (skus.length) {
      const variantes = await productModule.listProductVariants(
        { sku: skus },
        { select: ["id", "sku", "product_id"], take: skus.length }
      )
      // product_id → skus (una variante por SKU en este catálogo).
      const prodIds = [...new Set(variantes.map((v) => v.product_id).filter((x): x is string => !!x))]
      const productos = prodIds.length
        ? await productModule.listProducts(
            { id: prodIds },
            { select: ["id", "thumbnail", "metadata"], take: prodIds.length }
          )
        : []
      const prodPorId = new Map(productos.map((p) => [p.id, p]))
      for (const variante of variantes) {
        const sku = variante.sku
        if (!sku) continue
        const prod = variante.product_id ? prodPorId.get(variante.product_id) : null
        if (!prod) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (prod.metadata ?? {}) as any
        impuestoPorSku[sku] = !!meta.impuesto
        if (options.imagen) {
          const dataUri = thumbnailToDataUri(prod.thumbnail ?? null)
          if (dataUri) imageMap[sku] = dataUri
        }
      }
    }

    // RFC del cliente (si la venta tiene cliente registrado).
    let clienteRfc: string | null = null
    if (options.cliente && venta.cliente_id) {
      try {
        const customerModule = req.scope.resolve(Modules.CUSTOMER)
        const c = await customerModule.retrieveCustomer(venta.cliente_id, { select: ["id", "metadata"] })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rfc = (c?.metadata as any)?.rfc
        if (rfc && String(rfc).trim()) clienteRfc = String(rfc).trim()
      } catch { /* sin RFC, no bloquea */ }
    }

    const items: NotaVentaItem[] = venta.items.map((i) => ({
      sku: i.sku ?? "",
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      // Por defecto gravado (16%). Solo se marca exento si la metadata lo dice.
      impuesto: i.sku ? (impuestoPorSku[i.sku] ?? true) : true,
    }))

    const fechaLegible = new Date(venta.fecha).toLocaleString("es-MX", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    })

    const element = React.createElement(NotaVentaDocument, {
      folio: venta.folio,
      fecha: fechaLegible,
      cajero: venta.cajero,
      vendedor: venta.vendedor ?? null,
      clienteNombre: venta.cliente_nombre ?? null,
      clienteRfc,
      metodoPago: formaPago(venta),
      items,
      imageMap,
      opts: options,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    const safeFolio = String(venta.folio).replace(/[^a-zA-Z0-9_\-]/g, "_")
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="nota-${safeFolio}.pdf"`)
    res.send(buffer)
  } catch (err) {
    console.error("[caja/nota-venta] Error generando PDF:", err)
    res.status(500).json({ error: "No se pudo generar la nota de venta" })
  }
}
