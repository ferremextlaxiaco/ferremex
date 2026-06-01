import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_PROVEEDORES } from "../../../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../../../modules/ferremex-proveedores/service"

/**
 * /caja/proveedores — CRUD de proveedores del POS + sus facturas por pagar.
 * Dato maestro compartido entre terminales (antes en localStorage
 * `pos_proveedores`). Las facturas se gestionan como subrecurso
 * (/caja/proveedores/:id/facturas/...), espejo de la cartera de clientes.
 *
 * El shape devuelto coincide con el tipo `Proveedor` del frontend
 * (apps/pos/src/lib/proveedores.ts): { id, num_proveedor, nombre, contacto,
 * telefono, email, dias_credito, limite_credito, rfc, notas, facturas[] }.
 */

export interface FacturaProveedorPOS {
  id: string
  numero_factura: string
  fecha_emision: string
  dias_credito: number
  monto: number
  descripcion: string
  pagada: boolean
}

export interface ProveedorPOS {
  id: string
  num_proveedor: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  dias_credito: number
  limite_credito: number
  rfc: string
  notas: string
  facturas: FacturaProveedorPOS[]
}

/** Normaliza un registro de BD (con nullables) al shape plano del frontend. */
export function aProveedorPOS(p: any, facturas: any[] = []): ProveedorPOS {
  return {
    id: p.id,
    num_proveedor: p.num_proveedor ?? "",
    nombre: p.nombre ?? "",
    contacto: p.contacto ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    dias_credito: p.dias_credito ?? 0,
    limite_credito: p.limite_credito ?? 0,
    rfc: p.rfc ?? "",
    notas: p.notas ?? "",
    facturas: facturas.map(aFacturaPOS),
  }
}

export function aFacturaPOS(f: any): FacturaProveedorPOS {
  return {
    id: f.id,
    numero_factura: f.numero_factura ?? "",
    fecha_emision: f.fecha_emision ?? "",
    dias_credito: f.dias_credito ?? 0,
    monto: f.monto ?? 0,
    descripcion: f.descripcion ?? "",
    pagada: !!f.pagada,
  }
}

/** Carga todos los proveedores con sus facturas. */
export async function listarProveedoresConFacturas(
  service: FerremexProveedoresService
): Promise<ProveedorPOS[]> {
  const proveedores = await service.listProveedors({})
  const facturas = await service.listFacturaProveedors({})
  const porProveedor = new Map<string, any[]>()
  for (const f of facturas as any[]) {
    const arr = porProveedor.get(f.proveedor_id) ?? []
    arr.push(f)
    porProveedor.set(f.proveedor_id, arr)
  }
  return (proveedores as any[]).map((p) => aProveedorPOS(p, porProveedor.get(p.id) ?? []))
}

/** GET /caja/proveedores — lista. `?siguiente-num=1` devuelve solo el siguiente número. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    if ((req.query as Record<string, string>)["siguiente-num"] === "1") {
      res.json({ num_proveedor: await service.siguienteNumProveedor() })
      return
    }
    const proveedores = await listarProveedoresConFacturas(service)
    proveedores.sort((a, b) =>
      a.num_proveedor.localeCompare(b.num_proveedor, undefined, { numeric: true })
    )
    res.json(proveedores)
  } catch (e: any) {
    console.error("[caja/proveedores] GET error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudieron cargar los proveedores" })
  }
}

/** POST /caja/proveedores — crea un proveedor. Valida nombre y num_proveedor único. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = (req.body ?? {}) as Partial<ProveedorPOS>
    if (!body.nombre || !String(body.nombre).trim()) {
      res.status(400).json({ error: "El nombre del proveedor es requerido" }); return
    }
    const service: FerremexProveedoresService = req.scope.resolve(FERREMEX_PROVEEDORES)
    const existentes = await service.listProveedors({})
    if (
      body.num_proveedor &&
      (existentes as any[]).some((p) => p.num_proveedor === body.num_proveedor)
    ) {
      res.status(409).json({ error: `El número de proveedor ${body.num_proveedor} ya existe` })
      return
    }
    const num_proveedor = body.num_proveedor || (await service.siguienteNumProveedor())
    const creado = await service.createProveedors({
      num_proveedor,
      nombre: String(body.nombre).trim(),
      contacto: body.contacto ?? null,
      telefono: body.telefono ?? null,
      email: body.email ?? null,
      dias_credito: body.dias_credito ?? 0,
      limite_credito: body.limite_credito ?? 0,
      rfc: body.rfc ?? null,
      notas: body.notas ?? null,
    })
    res.status(201).json(aProveedorPOS(creado, []))
  } catch (e: any) {
    // Si dos terminales pasan el check de num_proveedor y colisionan en el INSERT,
    // el unique constraint de BD lanza aquí. Devolver 409 (no 500) para que el
    // cliente reintente con el siguiente número.
    const msg = String(e?.message ?? e)
    if (/unique|duplicate|num_proveedor/i.test(msg)) {
      res.status(409).json({ error: "Ese número de proveedor ya existe (intenta de nuevo)" })
      return
    }
    console.error("[caja/proveedores] POST error:", msg)
    res.status(500).json({ error: "No se pudo crear el proveedor" })
  }
}
