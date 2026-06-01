// ---------------------------------------------------------------------------
// FACHADA DE PROVEEDORES — async sobre la BD de Medusa (módulo ferremex_proveedores).
//
// FASE 3 (continuación): la persistencia migró de localStorage a la BD. Los
// tipos y la lógica de negocio pura (vencimiento, semáforo) se conservan aquí;
// el acceso a datos pasa por /caja/proveedores/* vía client.ts. Las funciones
// `*Local` se conservan SOLO para el componente de migración
// (MigracionProveedoresCajas), igual que en lib/clientes.ts.
// ---------------------------------------------------------------------------

import {
  listarProveedoresAPI,
  siguienteNumProveedorAPI,
  crearProveedorAPI,
  actualizarProveedorAPI,
  eliminarProveedorAPI,
  agregarFacturaAPI,
  actualizarFacturaAPI,
  eliminarFacturaAPI,
} from "./client"

// ---------------------------------------------------------------------------
// Tipos (origen canónico — no cambian respecto a la versión localStorage)
// ---------------------------------------------------------------------------

export interface FacturaCredito {
  id: string
  numero_factura: string
  fecha_emision: string   // "YYYY-MM-DD"
  dias_credito: number
  monto: number
  descripcion: string
  pagada: boolean
}

export interface Proveedor {
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
  facturas: FacturaCredito[]
}

// ---------------------------------------------------------------------------
// Acceso a datos (async, BD) — espejo de lib/clientes.ts
// ---------------------------------------------------------------------------

/** Carga todos los proveedores con sus facturas desde la BD. */
export async function loadProveedores(): Promise<Proveedor[]> {
  return listarProveedoresAPI()
}

/** Siguiente num_proveedor disponible (server-side). */
export async function siguienteNumProveedorAsync(): Promise<string> {
  return siguienteNumProveedorAPI()
}

/** Crea un proveedor (sin facturas). Devuelve el creado. */
export async function crearProveedor(
  data: Omit<Proveedor, "id" | "facturas">
): Promise<Proveedor> {
  return crearProveedorAPI(data)
}

/** Actualiza los datos generales de un proveedor. */
export async function actualizarProveedor(
  id: string,
  data: Partial<Omit<Proveedor, "id" | "facturas">>
): Promise<Proveedor> {
  return actualizarProveedorAPI(id, data)
}

/** Elimina un proveedor (y sus facturas, en cascada server-side). */
export async function eliminarProveedor(id: string): Promise<void> {
  return eliminarProveedorAPI(id)
}

/** Agrega una factura por pagar a un proveedor. */
export async function agregarFactura(
  proveedorId: string,
  factura: Omit<FacturaCredito, "id">
): Promise<FacturaCredito> {
  return agregarFacturaAPI(proveedorId, factura)
}

/** Actualiza una factura (incluye marcar pagada). */
export async function actualizarFactura(
  proveedorId: string,
  facturaId: string,
  data: Partial<Omit<FacturaCredito, "id">>
): Promise<FacturaCredito> {
  return actualizarFacturaAPI(proveedorId, facturaId, data)
}

/** Elimina una factura. */
export async function eliminarFactura(proveedorId: string, facturaId: string): Promise<void> {
  return eliminarFacturaAPI(proveedorId, facturaId)
}

// ---------------------------------------------------------------------------
// Autoincremento (puro — usado por la migración y como utilidad de cálculo)
// ---------------------------------------------------------------------------

export function siguienteNumProveedor(proveedores: Proveedor[]): string {
  const usados = new Set(
    proveedores
      .map((p) => parseInt(p.num_proveedor, 10))
      .filter((n) => !isNaN(n) && n > 0)
  )
  let siguiente = 1
  while (usados.has(siguiente)) siguiente++
  return String(siguiente).padStart(3, "0")
}

// ---------------------------------------------------------------------------
// Helpers de fechas y estado (lógica de negocio PURA — se queda en el cliente)
// ---------------------------------------------------------------------------

export function diasRestantes(factura: FacturaCredito): number {
  const emision = new Date(factura.fecha_emision + "T12:00:00")
  const vence = new Date(emision)
  vence.setDate(vence.getDate() + factura.dias_credito)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  vence.setHours(0, 0, 0, 0)
  return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export type EstadoFactura = "pagada" | "vencida" | "urgente" | "proxima" | "ok"

export function estadoFactura(f: FacturaCredito): EstadoFactura {
  if (f.pagada) return "pagada"
  const dias = diasRestantes(f)
  if (dias < 0) return "vencida"
  if (dias <= 7) return "urgente"
  if (dias <= 15) return "proxima"
  return "ok"
}

export function fechaVencimientoISO(f: FacturaCredito): string {
  const d = new Date(f.fecha_emision + "T12:00:00")
  d.setDate(d.getDate() + f.dias_credito)
  return d.toISOString().slice(0, 10)
}

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// localStorage legacy — SOLO para el componente de migración
// (MigracionProveedoresCajas). Espejo de los helpers *Local de lib/clientes.ts.
// ---------------------------------------------------------------------------

export const STORAGE_KEY_PROVEEDORES = "pos_proveedores"
export const STORAGE_KEY_MIGRADO_PROV_CAJAS = "pos_migrado_proveedores_cajas_v1"

/** Lee los proveedores guardados en localStorage (datos pre-migración). */
export function loadProveedoresLocal(): Proveedor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVEEDORES)
    if (!raw) return []
    return JSON.parse(raw) as Proveedor[]
  } catch {
    return []
  }
}

/** True si hay proveedores en localStorage aún no migrados. */
export function hayProveedoresLocalesSinMigrar(): boolean {
  if (localStorage.getItem(STORAGE_KEY_MIGRADO_PROV_CAJAS) === "1") return false
  return loadProveedoresLocal().length > 0
}

/** Marca la migración de proveedores/cajas como completada. */
export function marcarMigradoProvCajas(): void {
  localStorage.setItem(STORAGE_KEY_MIGRADO_PROV_CAJAS, "1")
}
