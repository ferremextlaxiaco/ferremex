// ---------------------------------------------------------------------------
// Clientes + Cartera de crédito.
//
// FASE 3: la persistencia migró de localStorage a la BD de Medusa.
//   - Clientes  → Customer nativo (+ metadata) vía /caja/clientes.
//   - Grupos    → customer_group nativo vía /caja/grupos.
//   - Cartera   → módulo ferremex_cartera vía /caja/cartera.
//
// Este archivo es ahora una FACHADA async sobre client.ts. Conserva los TIPOS
// (origen canónico) para no romper a sus consumidores. Las funciones de lectura
// de localStorage se conservan como `*Local` SOLO para que el componente de
// migración (MigracionNube) lea los datos viejos una última vez.
// ---------------------------------------------------------------------------

import {
  listarClientesAPI,
  crearClienteAPI,
  actualizarClienteAPI,
  eliminarClienteAPI,
  siguienteNumClienteAPI,
  listarGruposAPI,
  guardarGruposAPI,
  listarCarteraGlobalAPI,
  obtenerCarteraClienteAPI,
  agregarMovimientoCarteraAPI,
  anularMovimientoCarteraAPI,
} from "./client"

// ---------------------------------------------------------------------------
// Tipos (origen canónico — client.ts los importa con `import type`)
// ---------------------------------------------------------------------------

export interface Cliente {
  id: string
  // Datos generales
  num_cliente: string
  nombre: string
  telefono: string
  num_precio: number   // 1 – 4
  dias_credito: number
  limite_credito: number
  grupo: string
  monedero: boolean
  // Datos de facturación
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cfdi: string
  calle: string
  numero: string
  colonia: string
  ciudad: string
  estado: string
  cp: string
}

export interface Movimiento {
  id: string
  tipo: "compra" | "pago"
  monto: number
  fecha: string         // YYYY-MM-DD
  folio?: string
  plazo?: number
  descripcion: string
  nota?: string
  // Anulación de un abono registrado por error. Cuando `cancelado` es true, el
  // movimiento deja de contar en el cálculo de saldos (el monto vuelve a la
  // deuda) pero permanece visible como rastro auditable.
  cancelado?: boolean
  motivo_cancelacion?: string | null
  fecha_cancelacion?: string | null
}

export interface NotaCartera {
  id: string
  fecha: string
  hora: string
  autor: string
  texto: string
}

export interface HistorialLimite {
  id: string
  fecha: string
  usuario: string
  anterior: number
  nuevo: number
  nota: string
}

export interface CartEntrada {
  movimientos: Movimiento[]
  notas: NotaCartera[]
  historialLimite: HistorialLimite[]
}

// ---------------------------------------------------------------------------
// Clientes (BD)
// ---------------------------------------------------------------------------

/** Lista los clientes desde la BD. */
export async function loadClientes(): Promise<Cliente[]> {
  return listarClientesAPI()
}

/** Crea un cliente en la BD y devuelve el creado (con su id de Medusa). */
export async function crearCliente(cliente: Omit<Cliente, "id">): Promise<Cliente> {
  return crearClienteAPI(cliente)
}

/** Actualiza un cliente existente. */
export async function actualizarCliente(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
  return actualizarClienteAPI(id, cliente)
}

/** Elimina un cliente. */
export async function eliminarCliente(id: string): Promise<void> {
  return eliminarClienteAPI(id)
}

/** Siguiente num_cliente disponible (calculado server-side). */
export async function siguienteNumCliente(): Promise<string> {
  return siguienteNumClienteAPI()
}

// ---------------------------------------------------------------------------
// Grupos (customer_group nativo)
// ---------------------------------------------------------------------------

export async function loadGrupos(): Promise<string[]> {
  return listarGruposAPI()
}

export async function saveGrupos(grupos: string[]): Promise<string[]> {
  return guardarGruposAPI(grupos)
}

// ---------------------------------------------------------------------------
// Cartera (módulo ferremex_cartera)
// ---------------------------------------------------------------------------

/** Todas las carteras como Record<customer_id, CartEntrada>. */
export async function loadCartera(): Promise<Record<string, CartEntrada>> {
  return listarCarteraGlobalAPI()
}

/** Cartera de un cliente. */
export async function loadCarteraCliente(customerId: string): Promise<CartEntrada> {
  return obtenerCarteraClienteAPI(customerId)
}

/**
 * Registra un movimiento de crédito en la cartera del cliente.
 *
 * Nota: los cargos derivados de una VENTA a crédito ya NO se registran aquí —
 * el backend los crea transaccionalmente dentro de POST /caja/ventas. Esta
 * función cubre abonos/pagos y cargos manuales desde la pantalla de Cartera.
 */
export async function agregarMovimientoCredito(
  clienteId: string,
  mov: Omit<Movimiento, "id">
): Promise<Movimiento> {
  return agregarMovimientoCarteraAPI(clienteId, mov)
}

/**
 * Anula un abono (movimiento de pago) registrado por error. No lo borra: el
 * backend lo marca cancelado, con lo que el monto vuelve a la deuda al
 * recalcular saldos. `motivo` es obligatorio (rastro auditable).
 */
export async function anularAbono(
  clienteId: string,
  movimientoId: string,
  motivo: string
): Promise<Movimiento> {
  return anularMovimientoCarteraAPI(clienteId, movimientoId, motivo)
}

/**
 * Campos mínimos para timbrar un CFDI 4.0 nominativo (Facturama). Si alguno
 * falta, el cliente no se puede facturar todavía. Centraliza la regla para que
 * el chip "Puede facturar" (pantalla de venta) y el panel de FacturarBoton usen
 * el mismo criterio.
 */
export function camposFiscalesFaltantes(c: Cliente | null | undefined): string[] {
  if (!c) return ["RFC", "Razón social", "Régimen fiscal", "Uso de CFDI", "Código postal"]
  const faltan: string[] = []
  if (!c.rfc?.trim()) faltan.push("RFC")
  if (!c.razon_social?.trim()) faltan.push("Razón social")
  if (!c.regimen_fiscal?.trim()) faltan.push("Régimen fiscal")
  if (!c.cfdi?.trim()) faltan.push("Uso de CFDI")
  if (!c.cp?.trim()) faltan.push("Código postal")
  return faltan
}

/** True si el cliente tiene todos los datos fiscales para emitir CFDI. */
export function clientePuedeFacturar(c: Cliente | null | undefined): boolean {
  return camposFiscalesFaltantes(c).length === 0
}

// ---------------------------------------------------------------------------
// localStorage legacy — SOLO para el componente de migración (MigracionNube).
// No usar en código nuevo. Lee los datos que cada terminal capturó antes de
// la Fase 3 para subirlos a la BD una sola vez.
// ---------------------------------------------------------------------------

export const STORAGE_KEY_CLIENTES = "pos_clientes"
export const STORAGE_KEY_GRUPOS = "pos_grupos"
export const STORAGE_KEY_CARTERA = "pos_cartera"
export const STORAGE_KEY_MIGRADO = "pos_migrado_v1"

/** Lee los clientes guardados en localStorage (datos pre-Fase 3). */
export function loadClientesLocal(): Cliente[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLIENTES)
    if (!raw) return []
    const lista: unknown[] = JSON.parse(raw)
    return lista.map((c: any) => ({
      ...c,
      monedero: typeof c.monedero === "boolean" ? c.monedero : Number(c.monedero) > 0,
      num_precio: Math.min(4, Math.max(1, Number(c.num_precio) || 1)),
    })) as Cliente[]
  } catch {
    return []
  }
}

/** Lee los grupos guardados en localStorage (datos pre-Fase 3). */
export function loadGruposLocal(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRUPOS)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** Lee la cartera guardada en localStorage (datos pre-Fase 3). */
export function loadCarteraLocal(): Record<string, CartEntrada> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CARTERA)
    return raw ? (JSON.parse(raw) as Record<string, CartEntrada>) : {}
  } catch {
    return {}
  }
}

/** True si hay datos viejos en localStorage que aún no se han migrado. */
export function hayDatosLocalesSinMigrar(): boolean {
  if (localStorage.getItem(STORAGE_KEY_MIGRADO) === "1") return false
  return loadClientesLocal().length > 0 || Object.keys(loadCarteraLocal()).length > 0
}

/** Marca la migración como completada (no borra los datos viejos: red de seguridad). */
export function marcarMigrado(): void {
  localStorage.setItem(STORAGE_KEY_MIGRADO, "1")
}
