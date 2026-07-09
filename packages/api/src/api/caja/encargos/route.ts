import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  cargarEncargos,
  crearEncargoFicha,
  restaEncargo,
  totalAbonado,
  type EncargoFicha,
  type NuevaEncargoFicha,
} from "../../../lib/encargos-store"

/**
 * /caja/encargos — fichas de venta por encargo (atención al cliente).
 *
 * Distinta de /caja/pedidos (pedido A PROVEEDOR): aquí vive la ficha del cliente
 * (nombre, teléfono, motivo, tiempo de entrega, montos, status). El módulo de
 * consulta "Encargos" del POS lee de aquí. La ficha normalmente se crea desde el
 * POST de /caja/ventas (venta por encargo); este POST directo existe para altas
 * manuales o reprocesos.
 */

/** Enriquece una ficha con los derivados (resta, abonado) para el cliente. */
function conDerivados(f: EncargoFicha) {
  return { ...f, resta: restaEncargo(f), abonado: totalAbonado(f) }
}

/** GET /caja/encargos — lista todas las fichas (más reciente primero). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { status } = req.query as Record<string, string>
  let fichas = cargarEncargos()
  if (status) fichas = fichas.filter((f) => f.status === status)
  fichas = fichas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
  res.json(fichas.map(conDerivados))
}

/** POST /caja/encargos — alta manual de una ficha (normalmente la crea ventas). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as Partial<NuevaEncargoFicha>
  if (!body.folio || !body.cliente_nombre || !body.telefono) {
    res.status(400).json({ error: "La ficha requiere folio, cliente_nombre y telefono" })
    return
  }
  const ficha = await crearEncargoFicha({
    folio: body.folio,
    cliente_nombre: body.cliente_nombre,
    telefono: body.telefono,
    motivo: body.motivo ?? "",
    tiempo_entrega: body.tiempo_entrega ?? "",
    correo: body.correo ?? null,
    notas: body.notas ?? null,
    cliente_id: body.cliente_id ?? null,
    total: Number(body.total) || 0,
    anticipo: Number(body.anticipo) || 0,
    articulos: Array.isArray(body.articulos) ? body.articulos : [],
  })
  res.status(201).json(conDerivados(ficha))
}
