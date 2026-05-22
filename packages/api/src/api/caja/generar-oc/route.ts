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
      const filePath = path.join(STATIC_DIR, filename)
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

  const allItems = [...rows, ...freeItems]
  const imageMap = mostrarImagenes ? await buildImageMap(allItems) : {}

  const element = React.createElement(OCDocument, {
    rows, freeItems, imageMap, proveedor,
    ocNumber, fechaEmision,
    mostrarPrecios, mostrarImagenes,
  })

  const buffer = await renderToBuffer(element)

  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `inline; filename="${ocNumber}.pdf"`)
  res.send(buffer)
}
