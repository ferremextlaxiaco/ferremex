import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)

  const [categorias, productos] = await Promise.all([
    productModule.listProductCategories(
      {},
      { select: ["id", "name", "rank"], order: { rank: "ASC" } }
    ),
    productModule.listProducts(
      {},
      { select: ["metadata"], take: 99999 }
    ),
  ])

  const departamentosSet = new Set<string>()
  for (const p of productos) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dep = (p.metadata as any)?.departamento
    if (dep && typeof dep === "string") departamentosSet.add(dep)
  }

  res.json({
    categorias: categorias.map((c) => ({ id: c.id, nombre: c.name })),
    departamentos: [...departamentosSet].sort(),
  })
}
