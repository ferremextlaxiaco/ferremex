import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"

// POST /caja/imagen
// Body: { dataUrl: "data:image/jpeg;base64,..." }
// Usa el módulo de archivos de Medusa (hoy: local static/, mañana: S3/R2 sin cambiar código)
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any
  const { dataUrl } = body

  if (!dataUrl || typeof dataUrl !== "string") {
    res.status(400).json({ error: "Se requiere dataUrl" })
    return
  }

  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/)
  if (!match) {
    res.status(400).json({ error: "Formato no válido. Se acepta: jpeg, png, webp" })
    return
  }

  const ext      = match[1] === "jpeg" ? "jpg" : match[1]
  const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`
  const filename = `pos_${randomUUID().replace(/-/g, "").slice(0, 12)}.${ext}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileModule = req.scope.resolve(Modules.FILE) as any

  // createFiles acepta base64 directamente en `content`
  const [file] = await fileModule.createFiles([{
    filename,
    mimeType,
    content: match[2],   // base64 puro (sin el prefijo data:...)
    access:  "public",
  }])

  res.json({ url: file.url })
}
