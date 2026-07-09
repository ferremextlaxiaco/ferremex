import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, updateJson } from "../../../lib/json-store"

/**
 * /caja/pedidos — pedidos a proveedor.
 *
 * Antes vivían solo en localStorage (cada terminal con su copia aislada) y el
 * folio se generaba con una variable de módulo mutable que reiniciaba a 1 en
 * cada recarga (POS-C4). Ahora se persisten en JSON server-side con folio
 * secuencial generado en el servidor.
 */

interface PedidoArticulo {
  clave?: string
  descripcion?: string
  cantidad: number
  // Presentes en renglones generados por una venta por encargo (Fase 3).
  sku?: string
  origen_venta?: string
}

interface Pedido {
  id: string
  folio: string
  fecha: string
  proveedor?: string | null
  proveedorId?: string | null
  status: string
  // true si el pedido nació/creció de ventas por encargo.
  esEncargo?: boolean
  articulos: PedidoArticulo[]
  [k: string]: unknown
}

const PEDIDOS_FILE = path.join(__dirname, "../../../../data/pedidos-pos.json")
const COUNTER_FILE = path.join(__dirname, "../../../../data/pedido-counter.json")

function cargarPedidos(): Pedido[] {
  return readJson<Pedido[]>(PEDIDOS_FILE, [])
}

/**
 * Folio de pedido PED-YYYYMMDD-NNN, contador secuencial por servidor.
 * DEBE invocarse dentro del lock de PEDIDOS_FILE (lo hace el POST) para que el
 * incremento del contador sea atómico respecto a otros POST concurrentes.
 */
function generarFolioPedido(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const n = readJson<{ contador: number }>(COUNTER_FILE, { contador: 0 }).contador + 1
  writeJsonAtomic(COUNTER_FILE, { contador: n })
  return `PED-${ymd}-${String(n).padStart(3, "0")}`
}

/** GET /caja/pedidos — lista todos los pedidos (más reciente primero). */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const pedidos = cargarPedidos().sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
  res.json(pedidos)
}

/** POST /caja/pedidos — crea un pedido. Genera id y folio server-side. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<Pedido>
  if (!Array.isArray(body.articulos) || body.articulos.length === 0) {
    res.status(400).json({ error: "El pedido requiere al menos un artículo" })
    return
  }

  // Construimos el pedido DENTRO del lock de PEDIDOS_FILE para que el folio
  // secuencial (que toca COUNTER_FILE) sea atómico respecto a otros POST.
  let nuevo: Pedido | null = null
  await updateJson<Pedido[]>(PEDIDOS_FILE, [], (pedidos) => {
    nuevo = {
      id: crypto.randomBytes(6).toString("hex"),
      folio: generarFolioPedido(),
      fecha: typeof body.fecha === "string" ? body.fecha : new Date().toISOString().slice(0, 10),
      proveedor: body.proveedor ?? null,
      proveedorId: body.proveedorId ?? null,
      status: typeof body.status === "string" ? body.status : "borrador",
      articulos: body.articulos!.map((a) => ({
        clave: a.clave,
        descripcion: a.descripcion,
        cantidad: Number(a.cantidad) || 0,
        ...(a.sku ? { sku: a.sku } : {}),
        ...(a.origen_venta ? { origen_venta: a.origen_venta } : {}),
      })),
    }
    return [nuevo, ...pedidos]
  })
  res.status(201).json(nuevo!)
}

/** PUT /caja/pedidos — actualiza un pedido existente (id en body). */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<Pedido>
  if (!body.id) {
    res.status(400).json({ error: "Falta id" })
    return
  }

  let error: string | null = null
  let actualizado: Pedido | null = null
  await updateJson<Pedido[]>(PEDIDOS_FILE, [], (pedidos) => {
    const idx = pedidos.findIndex((p) => p.id === body.id)
    if (idx === -1) { error = "Pedido no encontrado"; return pedidos }
    const copia = [...pedidos]
    copia[idx] = { ...copia[idx], ...body, id: copia[idx].id, folio: copia[idx].folio }
    actualizado = copia[idx]
    return copia
  })

  if (error) { res.status(404).json({ error }); return }
  res.json(actualizado!)
}

/** DELETE /caja/pedidos — elimina un pedido (id en query). */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.query as Record<string, string>).id
  if (!id) {
    res.status(400).json({ error: "Falta id" })
    return
  }
  let existia = false
  await updateJson<Pedido[]>(PEDIDOS_FILE, [], (pedidos) => {
    existia = pedidos.some((p) => p.id === id)
    return pedidos.filter((p) => p.id !== id)
  })
  if (!existia) {
    res.status(404).json({ error: "Pedido no encontrado" })
    return
  }
  res.json({ ok: true })
}
