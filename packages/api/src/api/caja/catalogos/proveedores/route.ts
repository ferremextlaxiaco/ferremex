import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { productosPublicadosMeta } from "../../../../lib/productos-meta-cache"

// ---------------------------------------------------------------------------
// GET /caja/catalogos/proveedores — resumen de proveedores presentes en los
// productos de un nivel de catálogo (departamento/categoría/marca).
//
// Antes esto se calculaba en el FRONTEND llamando a /caja/articulos?departamento=
// (que arma el ArticuloPOS completo — relaciones + precio + existencia — para
// TODO el conjunto) solo para agrupar por `proveedor`. En un departamento
// grande (15k+ productos) esa llamada bloqueaba el event loop de Node por
// minutos, colgando el POS entero para todos los usuarios. Este endpoint solo
// necesita metadata (departamento/categoria/marca/proveedor), nunca relaciones
// ni precios, así que es barato incluso para el catálogo completo.
// ---------------------------------------------------------------------------

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)

  const departamento = String(req.query["departamento"] ?? "").trim()
  const categoria    = String(req.query["categoria"]    ?? "").trim()
  const marca        = String(req.query["marca"]        ?? "").trim()

  if (!departamento && !categoria && !marca) {
    res.json({ lista: [], sinAsignar: 0, total: 0 })
    return
  }

  let candidatos: { id: string; metadata: Record<string, unknown> }[]
  if (categoria) {
    const foundCats = await productModule.listProductCategories(
      { name: categoria },
      { select: ["id", "name"], relations: ["products"], take: 10 }
    )
    const ids = new Set(
      (foundCats as any[]).flatMap((c) => // eslint-disable-line @typescript-eslint/no-explicit-any
        ((c.products ?? []) as any[]).map((p: any) => p.id) // eslint-disable-line @typescript-eslint/no-explicit-any
      )
    )
    const meta = await productosPublicadosMeta(productModule)
    candidatos = (meta as any[]).filter((p) => ids.has(p.id)) // eslint-disable-line @typescript-eslint/no-explicit-any
  } else {
    candidatos = await productosPublicadosMeta(productModule) as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  if (departamento) {
    candidatos = candidatos.filter((p) => (p.metadata?.departamento as string | undefined)?.trim() === departamento)
  }
  if (marca) {
    candidatos = candidatos.filter((p) => (p.metadata?.marca as string | undefined)?.trim() === marca)
  }

  const conteo = new Map<string, number>()
  let sinAsignar = 0
  for (const p of candidatos) {
    const proveedor = (p.metadata?.proveedor as string | undefined)?.trim() ?? ""
    if (!proveedor) { sinAsignar++; continue }
    conteo.set(proveedor, (conteo.get(proveedor) ?? 0) + 1)
  }
  const lista = [...conteo.entries()]
    .map(([nombre, n]) => ({ nombre, n }))
    .sort((a, b) => b.n - a.n)

  res.json({ lista, sinAsignar, total: candidatos.length })
}
