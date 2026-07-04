import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { renderToBuffer } from "@react-pdf/renderer"
import React from "react"
import path from "path"
import fs from "fs"
import { OCDocument } from "./OcDocument"

const STATIC_DIR = path.resolve(__dirname, "../../../../static")

async function buildImageMap(items: any[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  await Promise.all(items.map(async (item) => {
    const url = item.thumbnail || item.imagenUrl
    const key = item._id || item.articuloId || item.id
    if (!url || !key) return

    if (url.startsWith("data:")) {
      map[key] = url
      if (item.articuloId && item.articuloId !== key) map[item.articuloId] = url
    } else if (url.startsWith("/static/")) {
      const filename = url.slice("/static/".length)
      // Contención de path traversal: normalizar y exigir que el resultado siga
      // dentro de STATIC_DIR. Sin esto, un thumbnail "/static/../../data/x.json"
      // permitiría leer archivos arbitrarios del servidor e incrustarlos en el PDF.
      const filePath = path.normalize(path.join(STATIC_DIR, filename))
      if (!filePath.startsWith(STATIC_DIR + path.sep)) return
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath)
        const ext = path.extname(filename).slice(1).toLowerCase()
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`
        const dataUri = `data:${mime};base64,${buf.toString("base64")}`
        map[key] = dataUri
        if (item.articuloId && item.articuloId !== key) map[item.articuloId] = dataUri
      }
    }
  }))
  return map
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const {
    rows           = [],
    freeItems      = [],
    proveedor      = null,
    ocNumber,
    fechaEmision,
    mostrarPrecios  = true,
    mostrarImagenes = true,
  } = req.body as any

  if (!ocNumber) {
    res.status(400).json({ error: "Se requiere ocNumber" })
    return
  }

  try {
    const allItems = [...rows, ...freeItems]
    const imageMap = mostrarImagenes ? await buildImageMap(allItems) : {}

    const element = React.createElement(OCDocument, {
      rows, freeItems, imageMap, proveedor,
      ocNumber, fechaEmision,
      mostrarPrecios, mostrarImagenes,
    })

    // renderToBuffer tipa su argumento como ReactElement<DocumentProps>; el
    // elemento de OCDocument es válido en runtime pero no calza con ese tipo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any)

    // Sanitizar ocNumber antes de interpolarlo en el header para evitar
    // header injection (comillas / saltos de línea malformarían el response).
    const safeOc = String(ocNumber).replace(/[^a-zA-Z0-9_\-]/g, "_")
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="${safeOc}.pdf"`)
    res.send(buffer)
  } catch (err) {
    console.error("[caja/generar-oc] Error generando PDF:", err)
    res.status(500).json({ error: "No se pudo generar el PDF de la orden de compra" })
  }
}
