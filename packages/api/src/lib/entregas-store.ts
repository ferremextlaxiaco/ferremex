import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "./json-store"

/**
 * Store de FICHAS DE ENTREGA (venta a domicilio con pago contra entrega).
 *
 * Cuando el cajero cobra con el método "Contra entrega", la venta se registra y
 * DESCUENTA inventario (el material sale a domicilio), pero NO se cobra hoy: queda
 * `por_cobrar`. Esta ficha guarda a dónde se lleva, quién recibe, quién paga (a
 * veces un tercero — el "jefe"), referencias del lugar y el monto a cobrar.
 *
 * El módulo "Por cobrar" del POS lee de aquí y liquida la venta cuando el
 * repartidor regresa con el dinero (registra el pago en el corte de ESE día).
 *
 * Se enlaza con la venta por `folio`. Persistencia: JSON atómico (mismo patrón
 * que encargos/ventas). Toma su propio lock de ENTREGAS_FILE; el POST de ventas
 * usa el lock de VENTAS_FILE (distinto → sin deadlock).
 */

const ENTREGAS_FILE = path.join(__dirname, "../../data/entregas-pos.json")

/** Estado de la entrega. */
export type EntregaStatus = "por_entregar" | "entregada" | "cancelada"

/** Datos de contacto de una persona (recibe / paga). */
export interface EntregaContacto {
  nombre: string
  telefono: string
}

/** Artículo de la entrega (para la hoja del repartidor / comprobante). */
export interface EntregaArticulo {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
}

/** Pago registrado al liquidar la entrega. */
export interface EntregaPago {
  monto: number
  metodo: string // efectivo | transferencia | tarjeta
  fecha: string // ISO
  nota?: string
}

export interface EntregaFicha {
  id: string
  folio: string // folio de la venta que originó la entrega
  fecha: string // ISO, momento del cobro
  // ── Datos de entrega (obligatorios en el formulario) ──
  direccion: string
  recibe: EntregaContacto
  paga: EntregaContacto
  comentarios: string // referencias físicas del lugar
  // ── Monto ──
  total: number // total de la venta = lo que se cobra al entregar
  // ── Estado ──
  status: EntregaStatus
  pago: EntregaPago | null // se llena al liquidar
  // Artículos (para la hoja del repartidor y el comprobante).
  articulos: EntregaArticulo[]
  // Cliente registrado, si la venta se ató a uno (opcional).
  cliente_id?: string | null
  // Historial de cambios de estado (auditable).
  historial: { fecha: string; de: EntregaStatus; a: EntregaStatus; nota?: string }[]
}

/** Datos que llegan al crear la ficha (desde el POST de ventas). */
export interface NuevaEntregaFicha {
  folio: string
  direccion: string
  recibe: EntregaContacto
  paga: EntregaContacto
  comentarios?: string
  total: number
  articulos: EntregaArticulo[]
  cliente_id?: string | null
}

export function cargarEntregas(): EntregaFicha[] {
  return readJson<EntregaFicha[]>(ENTREGAS_FILE, [])
}

/**
 * Crea una ficha de entrega. Idempotente por folio: si ya existe una para ese
 * folio, la devuelve sin duplicar (evita doble registro si el POST se reintenta).
 */
export async function crearEntregaFicha(data: NuevaEntregaFicha): Promise<EntregaFicha> {
  let creada: EntregaFicha | null = null
  await updateJson<EntregaFicha[]>(ENTREGAS_FILE, [], (fichas) => {
    const existente = fichas.find((f) => f.folio === data.folio)
    if (existente) { creada = existente; return fichas }
    const ficha: EntregaFicha = {
      id: crypto.randomBytes(8).toString("hex"),
      folio: data.folio,
      fecha: new Date().toISOString(),
      direccion: data.direccion,
      recibe: data.recibe,
      paga: data.paga,
      comentarios: data.comentarios ?? "",
      total: Number(data.total) || 0,
      status: "por_entregar",
      pago: null,
      articulos: data.articulos ?? [],
      cliente_id: data.cliente_id ?? null,
      historial: [],
    }
    creada = ficha
    return [ficha, ...fichas]
  })
  return creada!
}

/** Cambia el status de una ficha, registrando el cambio en su historial. */
export async function actualizarStatusEntrega(
  id: string,
  nuevo: EntregaStatus,
  nota?: string
): Promise<EntregaFicha | null> {
  let out: EntregaFicha | null = null
  await updateJson<EntregaFicha[]>(ENTREGAS_FILE, [], (fichas) => {
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

/** Registra el pago (liquidación) de una entrega. */
export async function registrarPagoEntrega(
  id: string,
  pago: { monto: number; metodo: string; nota?: string }
): Promise<EntregaFicha | null> {
  let out: EntregaFicha | null = null
  await updateJson<EntregaFicha[]>(ENTREGAS_FILE, [], (fichas) => {
    const idx = fichas.findIndex((f) => f.id === id)
    if (idx === -1) return fichas
    const copia = [...fichas]
    const f = copia[idx]
    f.pago = {
      monto: Number(pago.monto) || 0,
      metodo: pago.metodo,
      fecha: new Date().toISOString(),
      ...(pago.nota ? { nota: pago.nota } : {}),
    }
    copia[idx] = f
    out = f
    return copia
  })
  return out
}
