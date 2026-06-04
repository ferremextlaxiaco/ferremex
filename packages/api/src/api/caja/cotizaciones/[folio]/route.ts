import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateJson, readJson } from "../../../../lib/json-store"
import { COTIZACIONES_FILE, type CotizacionRegistro, type ItemCotizacion } from "../route"

/** GET /caja/cotizaciones/:folio — una cotización por folio. 404 si no existe. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const folio = String(req.params.folio ?? "").trim()
  const cot = readJson<CotizacionRegistro[]>(COTIZACIONES_FILE, []).find((c) => c.folio === folio)
  if (!cot) {
    res.status(404).json({ error: "Cotización no encontrada" })
    return
  }
  res.json(cot)
}

interface ActualizarBody {
  items: ItemCotizacion[]
  cliente_id?: string | null
  cliente_nombre?: string | null
  num_precio?: number | null
}

/**
 * PUT /caja/cotizaciones/:folio — actualiza una cotización existente (mismo
 * folio y fecha original). La usa "Imprimir cotización" cuando la transacción
 * nació de una cotización cargada: se sobrescribe en vez de duplicar. No se
 * puede editar una cotización ya convertida en venta (409).
 */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const folio = String(req.params.folio ?? "").trim()
  const body = (req.body ?? {}) as ActualizarBody

  if (!body.items?.length) {
    res.status(400).json({ error: "La cotización requiere items" })
    return
  }
  if (body.items.some((i) => !i.sku || !(i.cantidad > 0))) {
    res.status(400).json({ error: "Cada item requiere sku y cantidad > 0" })
    return
  }

  let actualizada: CotizacionRegistro | null = null
  let existe = false
  let convertida = false
  await updateJson<CotizacionRegistro[]>(COTIZACIONES_FILE, [], (cots) => {
    const idx = cots.findIndex((c) => c.folio === folio)
    if (idx === -1) return cots
    existe = true
    if (cots[idx].estado === "convertida") { convertida = true; return cots }
    const total = body.items.reduce((s, i) => s + Number(i.precio_unitario) * i.cantidad, 0)
    const copia = [...cots]
    copia[idx] = {
      ...copia[idx], // conserva folio, fecha, cajero, turno_id, estado
      items: body.items.map((i) => ({
        sku: i.sku,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        subtotal: Number(i.precio_unitario) * i.cantidad,
        ...(i.impuesto != null ? { impuesto: !!i.impuesto } : {}),
        ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre ?? undefined } : {}),
      })),
      total,
      cliente_id: body.cliente_id ?? null,
      cliente_nombre: body.cliente_nombre ?? null,
      num_precio: body.num_precio != null ? Number(body.num_precio) : null,
    }
    actualizada = copia[idx]
    return copia
  })

  if (!existe) { res.status(404).json({ error: "Cotización no encontrada" }); return }
  if (convertida) { res.status(409).json({ error: "No se puede editar una cotización ya vendida" }); return }
  res.json(actualizada!)
}

/**
 * PATCH /caja/cotizaciones/:folio — marca la cotización como convertida en venta.
 * Body `{ estado: "convertida", folio_venta }`. Idempotente. Enlaza al folio de
 * la venta para trazabilidad.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const folio = String(req.params.folio ?? "").trim()
  const body = (req.body ?? {}) as { estado?: string; folio_venta?: string }

  if (body.estado !== "convertida") {
    res.status(400).json({ error: "estado inválido (solo se admite 'convertida')" })
    return
  }

  let actualizada: CotizacionRegistro | null = null
  let existe = false
  await updateJson<CotizacionRegistro[]>(COTIZACIONES_FILE, [], (cots) => {
    const idx = cots.findIndex((c) => c.folio === folio)
    if (idx === -1) return cots
    existe = true
    // Idempotente: si ya está convertida, no la pisamos (conserva el primer enlace).
    if (cots[idx].estado === "convertida") { actualizada = cots[idx]; return cots }
    const copia = [...cots]
    copia[idx] = {
      ...copia[idx],
      estado: "convertida",
      folio_venta: body.folio_venta ?? null,
      convertida_en: new Date().toISOString(),
    }
    actualizada = copia[idx]
    return copia
  })

  if (!existe) {
    res.status(404).json({ error: "Cotización no encontrada" })
    return
  }
  res.json(actualizada!)
}
