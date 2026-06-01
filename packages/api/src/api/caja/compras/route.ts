import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMPRAS } from "../../../modules/ferremex-compras"
import type FerremexComprasService from "../../../modules/ferremex-compras/service"

/**
 * /caja/compras — historial de compras (recepciones) del POS.
 * Dato compartido entre terminales (antes en localStorage `pos_historial_compras`).
 * Consumido por ComprasModule (escribe al confirmar) y ConsultarCompras (lee/cancela).
 *
 * El shape devuelto coincide con el `registroCompra` del frontend:
 * { id, folio, proveedor, proveedorId, fecha, tipo, estado, articulos[],
 *   subtotal, iva, total, canceladaEl, motivoCancelacion }.
 * Los artículos usan `precioUnit` (camelCase) en el frontend; en BD es `precio_unit`.
 */

interface ArticuloCompraIn {
  codigo?: string; nombre?: string; cantidad?: number; precioUnit?: number
  categoria?: string; departamento?: string; marca?: string
}
export interface CompraIn {
  folio?: string; proveedor?: string; proveedorId?: string | null; fecha?: string
  tipo?: string; estado?: string; subtotal?: number; iva?: number; total?: number
  articulos?: ArticuloCompraIn[]
}

/** Normaliza un registro de BD (+ sus artículos) al shape del frontend. */
export function aCompraPOS(c: any): any {
  return {
    id: c.id,
    folio: c.folio ?? "",
    proveedor: c.proveedor ?? "",
    proveedorId: c.proveedor_id ?? null,
    fecha: c.fecha ?? "",
    tipo: c.tipo ?? "Factura",
    estado: c.estado ?? "Recibida",
    subtotal: c.subtotal ?? 0,
    iva: c.iva ?? 0,
    total: c.total ?? 0,
    canceladaEl: c.cancelada_el ?? null,
    motivoCancelacion: c.motivo_cancelacion ?? null,
    articulos: (c.articulos ?? []).map((a: any) => ({
      codigo: a.codigo ?? "",
      nombre: a.nombre ?? "",
      cantidad: a.cantidad ?? 0,
      precioUnit: a.precio_unit ?? 0,
      categoria: a.categoria ?? "",
      departamento: a.departamento ?? "",
      marca: a.marca ?? "",
    })),
  }
}

/** GET /caja/compras — lista compras (más reciente primero). `?proveedor_id=` filtra. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexComprasService = req.scope.resolve(FERREMEX_COMPRAS)
    const proveedorId = (req.query as Record<string, string>).proveedor_id
    const filtro = proveedorId ? { proveedor_id: proveedorId } : {}
    const compras = await service.listarComprasConArticulos(filtro)
    // Orden: por fecha desc, luego por created_at desc (estable para mismo día).
    compras.sort((a: any, b: any) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0
      return cb - ca
    })
    res.json(compras.map(aCompraPOS))
  } catch (e: any) {
    console.error("[caja/compras] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar las compras" })
  }
}

/** POST /caja/compras — registra una compra con sus artículos. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as CompraIn
    if (!body.folio || !String(body.folio).trim()) {
      res.status(400).json({ error: "El folio de la compra es requerido" }); return
    }
    const service: FerremexComprasService = req.scope.resolve(FERREMEX_COMPRAS)
    const creada = await service.crearCompraConArticulos(
      {
        folio: String(body.folio).trim(),
        proveedor: body.proveedor ?? "",
        proveedor_id: body.proveedorId ?? null,
        fecha: body.fecha ?? new Date().toISOString().slice(0, 10),
        tipo: body.tipo ?? "Factura",
        estado: body.estado ?? "Recibida",
        subtotal: Number(body.subtotal) || 0,
        iva: Number(body.iva) || 0,
        total: Number(body.total) || 0,
      },
      (body.articulos ?? []).map((a) => ({
        codigo: a.codigo,
        nombre: a.nombre,
        cantidad: a.cantidad,
        precio_unit: a.precioUnit,
        categoria: a.categoria ?? null,
        departamento: a.departamento ?? null,
        marca: a.marca ?? null,
      }))
    )
    // Releer con artículos para devolver el shape completo.
    const [completa] = await service.listarComprasConArticulos({ id: (creada as any).id })
    res.status(201).json(aCompraPOS(completa ?? creada))
  } catch (e: any) {
    // folio único en BD: si choca (race entre terminales), devolver 409 con el
    // folio para que el frontend avise sin acumular duplicados.
    const msg = String(e?.message ?? e)
    if (/unique|duplicate|folio/i.test(msg)) {
      res.status(409).json({ error: "Ya existe una compra con ese folio" })
      return
    }
    console.error("[caja/compras] POST error:", msg)
    res.status(500).json({ error: "No se pudo registrar la compra" })
  }
}
