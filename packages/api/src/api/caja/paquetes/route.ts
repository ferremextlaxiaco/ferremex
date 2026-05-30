import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "../../../lib/json-store"

/**
 * /caja/paquetes — paquetes / kits / combos del POS.
 *
 * Un paquete NO es un producto de Medusa: es una definición que agrupa varios
 * artículos (componentes) bajo un precio en conjunto. Al venderse, el carrito
 * mete los componentes reales y el inventario se descuenta de cada uno (que sí
 * tiene stock) vía /caja/ventas. Por eso aquí solo persistimos la definición.
 *
 * Persistencia en JSON (lib/json-store), igual que pedidos/ventas. Los SKU de
 * los componentes referencian artículos existentes; no se validan contra el
 * catálogo aquí (el front los toma de listarArticulos), pero sí se exige
 * estructura mínima.
 */

interface ComponentePaquete {
  sku: string
  descripcion: string
  cantidad: number
}

interface Paquete {
  id: string
  nombre: string
  componentes: ComponentePaquete[]
  precio_paquete: number
  // Nivel de precio (1-4) que se usó como base para sugerir el precio. Solo
  // informativo: el precio del paquete es el que manda.
  nivel_base: number
  // Galería de imágenes del paquete (URLs subidas vía /caja/imagen). La primera
  // es la principal (la que se muestra en ventas/lista/sugerencia). [] si no tiene.
  imagenes: string[]
  creado_en: string
  actualizado_en?: string
}

const PAQUETES_FILE = path.join(__dirname, "../../../../data/paquetes-pos.json")

function cargarPaquetes(): Paquete[] {
  const raw = readJson<Record<string, unknown>[]>(PAQUETES_FILE, [])
  // Normaliza paquetes legacy que tenían `imagen` (string) en vez de `imagenes[]`.
  return raw.map((p) => {
    if (!Array.isArray(p.imagenes)) {
      const legacy = typeof p.imagen === "string" && p.imagen ? [p.imagen] : []
      return { ...p, imagenes: legacy }
    }
    return p
  }) as unknown as Paquete[]
}

type DatosPaquete = Omit<Paquete, "id" | "creado_en" | "actualizado_en">
type ValidacionPaquete = { ok: false; error: string } | { ok: true; datos: DatosPaquete }

/** Normaliza y valida el cuerpo de un paquete. */
function validarBody(body: Partial<Paquete>): ValidacionPaquete {
  const nombre = String(body.nombre ?? "").trim()
  if (!nombre) return { ok: false, error: "El nombre del paquete es obligatorio" }

  if (!Array.isArray(body.componentes) || body.componentes.length < 2) {
    return { ok: false, error: "Un paquete requiere al menos 2 componentes" }
  }
  const componentes: ComponentePaquete[] = []
  for (const c of body.componentes) {
    const sku = String(c?.sku ?? "").trim()
    const cantidad = Number(c?.cantidad)
    if (!sku) return { ok: false, error: "Cada componente requiere un SKU" }
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      return { ok: false, error: `Cantidad inválida para el componente ${sku}` }
    }
    componentes.push({
      sku,
      descripcion: String(c?.descripcion ?? "").trim() || sku,
      cantidad: Math.floor(cantidad),
    })
  }
  // Evitar SKUs duplicados (sumar cantidades sería ambiguo para el descuento).
  const skus = componentes.map((c) => c.sku)
  if (new Set(skus).size !== skus.length) {
    return { ok: false, error: "Hay componentes con el mismo SKU repetido" }
  }

  const precio = Number(body.precio_paquete)
  if (!Number.isFinite(precio) || precio <= 0) {
    return { ok: false, error: "El precio del paquete debe ser mayor a 0" }
  }
  const nivel = Number(body.nivel_base)
  // Galería: acepta imagenes[] (nuevo) o imagen suelta (compat hacia atrás).
  let imagenes: string[] = []
  if (Array.isArray(body.imagenes)) {
    imagenes = body.imagenes.map((u) => String(u).trim()).filter(Boolean)
  } else if (typeof (body as { imagen?: unknown }).imagen === "string") {
    const u = String((body as { imagen?: unknown }).imagen).trim()
    if (u) imagenes = [u]
  }
  return {
    ok: true,
    datos: {
      nombre,
      componentes,
      precio_paquete: precio,
      nivel_base: nivel >= 1 && nivel <= 4 ? Math.floor(nivel) : 1,
      imagenes,
    },
  }
}

/** GET /caja/paquetes — lista todos los paquetes (más reciente primero). */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const paquetes = cargarPaquetes().sort((a, b) => (b.creado_en ?? "").localeCompare(a.creado_en ?? ""))
  res.json(paquetes)
}

/** POST /caja/paquetes — crea un paquete. Genera id server-side. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const v = validarBody((req.body ?? {}) as Partial<Paquete>)
  if (!v.ok) { res.status(400).json({ error: v.error }); return }
  const datos = v.datos

  const nuevo: Paquete = {
    id: crypto.randomBytes(6).toString("hex"),
    nombre: datos.nombre,
    componentes: datos.componentes,
    precio_paquete: datos.precio_paquete,
    nivel_base: datos.nivel_base,
    imagenes: datos.imagenes,
    creado_en: new Date().toISOString(),
  }
  await updateJson<Paquete[]>(PAQUETES_FILE, [], (paquetes) => [nuevo, ...paquetes])
  res.status(201).json(nuevo)
}

/** PUT /caja/paquetes — actualiza un paquete existente (id en body). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<Paquete>
  if (!body.id) { res.status(400).json({ error: "Falta id" }); return }

  const v = validarBody(body)
  if (!v.ok) { res.status(400).json({ error: v.error }); return }
  const datos = v.datos

  let error: string | null = null
  let actualizado: Paquete | null = null
  await updateJson<Paquete[]>(PAQUETES_FILE, [], (paquetes) => {
    const idx = paquetes.findIndex((p) => p.id === body.id)
    if (idx === -1) { error = "Paquete no encontrado"; return paquetes }
    const copia = [...paquetes]
    copia[idx] = {
      ...copia[idx],
      ...datos,
      id: copia[idx].id,
      creado_en: copia[idx].creado_en,
      actualizado_en: new Date().toISOString(),
    }
    actualizado = copia[idx]
    return copia
  })

  if (error) { res.status(404).json({ error }); return }
  res.json(actualizado!)
}

/** DELETE /caja/paquetes — elimina un paquete (id en query). */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.query as Record<string, string>).id
  if (!id) { res.status(400).json({ error: "Falta id" }); return }

  let existia = false
  await updateJson<Paquete[]>(PAQUETES_FILE, [], (paquetes) => {
    existia = paquetes.some((p) => p.id === id)
    return paquetes.filter((p) => p.id !== id)
  })
  if (!existia) { res.status(404).json({ error: "Paquete no encontrado" }); return }
  res.json({ ok: true })
}
