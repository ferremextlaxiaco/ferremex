import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "./json-store"

/**
 * Store de FICHAS DE ENCARGO (Fase 3 — venta por encargo).
 *
 * Una "ficha de encargo" es el documento de atención al cliente que se llena al
 * cobrar una venta sobre pedido: datos del cliente (nombre/teléfono), motivo,
 * tiempo estimado de entrega, montos (total/anticipo/resta) y el status del
 * encargo (Pendiente → Recibido → Entregado). Es distinta del PEDIDO A PROVEEDOR
 * (ver pedidos-encargo.ts): un cliente puede encargar productos de varios
 * proveedores en una sola venta → 1 ficha por venta, N líneas en N pedidos.
 *
 * Se enlaza con la venta por `folio` (el de la venta que la originó). El módulo
 * de consulta "Encargos" del POS lee de aquí, NO de los pedidos de proveedor.
 *
 * Persistencia: JSON atómico vía json-store (mismo patrón que ventas/pedidos).
 * Toma su propio lock de ENCARGOS_FILE; NO debe llamarse mientras se tiene ya
 * ese lock (el POST de ventas usa el lock de VENTAS_FILE, distinto → sin deadlock).
 */

const ENCARGOS_FILE = path.join(__dirname, "../../data/encargos-pos.json")

/** Status del encargo (ciclo de vida del pedido del cliente). */
export type EncargoStatus = "pendiente" | "recibido" | "entregado" | "cancelado"

/** Un abono/pago posterior al anticipo (liquidación al entregar, o parcial). */
export interface EncargoAbono {
  id: string
  monto: number
  fecha: string // ISO
  metodo?: string // efectivo | transferencia | tarjeta
  nota?: string
}

/** Una línea de artículo encargado (copia informativa para la ficha). */
export interface EncargoArticulo {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  proveedor?: string | null
  proveedor_id?: string | null
}

export interface EncargoFicha {
  id: string
  folio: string // folio de la venta que originó el encargo
  fecha: string // ISO, momento del cobro
  // ── Datos del cliente (obligatorios en el formulario) ──
  cliente_nombre: string
  telefono: string
  motivo: string
  tiempo_entrega: string // texto libre: "3 a 5 días hábiles", "próxima semana"…
  // ── Opcionales ──
  correo?: string | null
  notas?: string | null
  // Si la venta se ató a un cliente registrado (cartera), su id de Customer.
  cliente_id?: string | null
  // ── Montos ──
  total: number // total de las líneas por encargo
  anticipo: number // lo cobrado hoy (anticipo)
  // resta = total - anticipo - Σ abonos (se deriva; se guarda para lectura simple)
  abonos: EncargoAbono[]
  // ── Estado ──
  status: EncargoStatus
  // Artículos encargados (informativos para la ficha / comprobante).
  articulos: EncargoArticulo[]
  // Historial de cambios de status (auditable).
  historial: { fecha: string; de: EncargoStatus; a: EncargoStatus; nota?: string }[]
}

/** Datos que llegan al crear la ficha (desde el POST de ventas). */
export interface NuevaEncargoFicha {
  folio: string
  cliente_nombre: string
  telefono: string
  motivo: string
  tiempo_entrega: string
  correo?: string | null
  notas?: string | null
  cliente_id?: string | null
  total: number
  anticipo: number
  articulos: EncargoArticulo[]
}

export function cargarEncargos(): EncargoFicha[] {
  return readJson<EncargoFicha[]>(ENCARGOS_FILE, [])
}

/** Suma de abonos posteriores al anticipo. */
export function totalAbonado(f: EncargoFicha): number {
  return (f.abonos ?? []).reduce((s, a) => s + (Number(a.monto) || 0), 0)
}

/** Resta pendiente de pago = total − anticipo − abonos. Nunca negativa. */
export function restaEncargo(f: EncargoFicha): number {
  return Math.max(0, (f.total || 0) - (f.anticipo || 0) - totalAbonado(f))
}

/**
 * Crea una ficha de encargo. Idempotente por folio: si ya existe una ficha para
 * ese folio de venta, la devuelve sin duplicar (evita doble registro si el POST
 * se reintenta). Toma el lock de ENCARGOS_FILE.
 */
export async function crearEncargoFicha(data: NuevaEncargoFicha): Promise<EncargoFicha> {
  let creada: EncargoFicha | null = null
  await updateJson<EncargoFicha[]>(ENCARGOS_FILE, [], (fichas) => {
    const existente = fichas.find((f) => f.folio === data.folio)
    if (existente) { creada = existente; return fichas }
    const ficha: EncargoFicha = {
      id: crypto.randomBytes(8).toString("hex"),
      folio: data.folio,
      fecha: new Date().toISOString(),
      cliente_nombre: data.cliente_nombre,
      telefono: data.telefono,
      motivo: data.motivo,
      tiempo_entrega: data.tiempo_entrega,
      correo: data.correo ?? null,
      notas: data.notas ?? null,
      cliente_id: data.cliente_id ?? null,
      total: Number(data.total) || 0,
      anticipo: Number(data.anticipo) || 0,
      abonos: [],
      status: "pendiente",
      articulos: data.articulos ?? [],
      historial: [],
    }
    creada = ficha
    return [ficha, ...fichas]
  })
  return creada!
}

/** Cambia el status de una ficha, registrando el cambio en su historial. */
export async function actualizarStatusEncargo(
  id: string,
  nuevo: EncargoStatus,
  nota?: string
): Promise<EncargoFicha | null> {
  let out: EncargoFicha | null = null
  await updateJson<EncargoFicha[]>(ENCARGOS_FILE, [], (fichas) => {
    const idx = fichas.findIndex((f) => f.id === id)
    if (idx === -1) return fichas
    const copia = [...fichas]
    const f = copia[idx]
    if (f.status !== nuevo) {
      f.historial = [
        ...(f.historial ?? []),
        { fecha: new Date().toISOString(), de: f.status, a: nuevo, ...(nota ? { nota } : {}) },
      ]
      f.status = nuevo
    }
    copia[idx] = f
    out = f
    return copia
  })
  return out
}

/** Registra un abono (pago parcial / liquidación) sobre una ficha. */
export async function agregarAbonoEncargo(
  id: string,
  abono: { monto: number; metodo?: string; nota?: string }
): Promise<EncargoFicha | null> {
  let out: EncargoFicha | null = null
  await updateJson<EncargoFicha[]>(ENCARGOS_FILE, [], (fichas) => {
    const idx = fichas.findIndex((f) => f.id === id)
    if (idx === -1) return fichas
    const copia = [...fichas]
    const f = copia[idx]
    f.abonos = [
      ...(f.abonos ?? []),
      {
        id: crypto.randomBytes(6).toString("hex"),
        monto: Number(abono.monto) || 0,
        fecha: new Date().toISOString(),
        ...(abono.metodo ? { metodo: abono.metodo } : {}),
        ...(abono.nota ? { nota: abono.nota } : {}),
      },
    ]
    copia[idx] = f
    out = f
    return copia
  })
  return out
}
