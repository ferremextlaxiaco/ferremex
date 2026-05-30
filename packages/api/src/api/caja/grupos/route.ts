import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/**
 * /caja/grupos — grupos de clientes del POS, modelados con customer_group NATIVO.
 *
 * Los grupos POS se marcan con `metadata.pos_grupo === true` para no mezclarlos
 * con grupos de e-commerce futuros. El contrato con el frontend es una lista
 * plana de nombres (string[]), igual que el viejo `pos_grupos` de localStorage.
 */

const POS_GRUPO_FLAG = "pos_grupo"

const GRUPOS_DEFAULT = ["Familia", "Empresa", "Gobierno", "Constructor", "Distribuidor"]

async function listarNombresGrupos(req: MedusaRequest): Promise<string[]> {
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const groups = await customerModule.listCustomerGroups({}, { take: null })
  const nombres = groups
    .filter((g: any) => g.metadata?.[POS_GRUPO_FLAG] === true)
    .map((g: any) => g.name as string)
  return nombres
}

/** GET /caja/grupos — nombres de los grupos POS. Si no hay ninguno, devuelve los default. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const nombres = await listarNombresGrupos(req)
    nombres.sort((a, b) => a.localeCompare(b))
    res.json(nombres.length > 0 ? nombres : GRUPOS_DEFAULT)
  } catch (e: any) {
    console.error("[caja/grupos] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los grupos" })
  }
}

/**
 * PUT /caja/grupos — sincroniza la lista de grupos: crea los nombres que falten.
 * Body: `{ grupos: string[] }`. No borra grupos existentes (un cliente podría usarlos).
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const grupos = (req.body as { grupos?: unknown })?.grupos
    if (!Array.isArray(grupos)) {
      res.status(400).json({ error: "Body debe incluir grupos: string[]" }); return
    }
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const existentes = await customerModule.listCustomerGroups({}, { take: null })
    const yaExisten = new Set(existentes.map((g: any) => g.name))
    const aCrear = grupos
      .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      .filter((g) => !yaExisten.has(g))
    for (const name of aCrear) {
      await customerModule.createCustomerGroups({ name, metadata: { [POS_GRUPO_FLAG]: true } })
    }
    const nombres = await listarNombresGrupos(req)
    nombres.sort((a, b) => a.localeCompare(b))
    res.json(nombres)
  } catch (e: any) {
    console.error("[caja/grupos] PUT error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron guardar los grupos" })
  }
}

export { POS_GRUPO_FLAG }
