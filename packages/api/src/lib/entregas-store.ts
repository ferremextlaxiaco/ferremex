import * as path from "path"
import * as crypto from "crypto"
import { readJson, updateJson } from "./json-store"

/**
 * Store de FICHAS DE ENTREGA (venta a domicilio con pago contra entrega).
 *
 * Dos naturalezas de entrega a domicilio conviven en esta ficha:
 *
 *  1. CONTRA ENTREGA (`pagada: false`, la original): el cajero cobra con el método
 *     "Contra entrega". La venta se registra y DESCUENTA inventario (el material
 *     sale a domicilio), pero NO se cobra hoy: queda `por_cobrar`. La ficha guarda
 *     quién paga (a veces un tercero — el "jefe") y el monto a cobrar. Se liquida
 *     cuando el repartidor regresa con el dinero (cobro al corte de ESE día).
 *
 *  2. CON ENVÍO Y PAGO EN TIENDA (`pagada: true`): el cliente pagó en tienda al
 *     hacer la compra (venta normal) y solo falta enviárselo. El pago puede ser:
 *       - TOTAL  → `resta = 0`: solo hay que entregar ("Marcar como entregada").
 *       - PARCIAL (abono) → `resta > 0`: dejó un abono hoy y el repartidor cobra la
 *         resta al entregar. `abonado` = lo pagado hoy, `pagos_tienda` = su desglose.
 *     La venta nace cobrada por el abono (entra al corte de hoy). La resta se cobra
 *     el día de la entrega (movimiento de caja de ESE día, como en contra entrega).
 *
 * El módulo "Entregas a domicilio" del POS lee de aquí. Para las de contra entrega
 * liquida el cobro; para las pagadas solo marca la entrega como completada.
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
  // Naturaleza de la entrega. `true` = venta con pago en tienda + envío a domicilio
  // (total o abono parcial). `false`/omitido = contra entrega (todo se cobra al
  // liquidar). Default false para compatibilidad con fichas existentes.
  pagada?: boolean
  // ── Datos de entrega (obligatorios en el formulario) ──
  direccion: string
  recibe: EntregaContacto
  // Quién paga. En contra entrega es obligatorio (a veces un tercero). En una
  // entrega ya pagada no aplica (pagó el cliente en caja) → puede venir vacío.
  paga: EntregaContacto
  comentarios: string // referencias físicas del lugar
  // ── Monto ──
  total: number // total de la venta
  // Abono pagado en tienda hoy (solo `pagada`). 0 = no abonó nada / no aplica.
  abonado?: number
  // Lo que el repartidor cobra al entregar. Contra entrega = total. Pagada con
  // abono parcial = total − abonado. Pagada total = 0 (solo entregar).
  resta?: number
  // Desglose de métodos del abono en tienda (para el ticket del repartidor).
  pagos_tienda?: { efectivo?: number; transferencia?: number; tarjeta?: number }
  // Con cuánto pagará el cliente al recibir (para el CAMBIO del repartidor). Aplica
  // cuando hay algo por cobrar (contra entrega, o pagada con resta > 0).
  paga_con?: number
  // ── Estado ──
  status: EntregaStatus
  // Pago registrado al liquidar (contra entrega). En una ficha `pagada` queda null:
  // el dinero ya entró en la venta, aquí no se cobra nada.
  pago: EntregaPago | null
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
  // `true` = ya pagada en tienda (solo enviar). Omitido/false = contra entrega.
  pagada?: boolean
  direccion: string
  recibe: EntregaContacto
  // Opcional cuando `pagada` (nadie cobra al entregar). Obligatorio en contra entrega.
  paga?: EntregaContacto
  comentarios?: string
  total: number
  // Abono en tienda (solo pagada) y su desglose de métodos.
  abonado?: number
  pagos_tienda?: { efectivo?: number; transferencia?: number; tarjeta?: number }
  // Con cuánto pagará el cliente al recibir → para el cambio.
  paga_con?: number
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
    const total = Math.round((Number(data.total) || 0) * 100) / 100
    const pagada = !!data.pagada
    // Abono en tienda (solo pagada): suma del desglose de métodos, acotado al total.
    const pt = data.pagos_tienda ?? {}
    const abonoBruto = pagada
      ? (Number(pt.efectivo) || 0) + (Number(pt.transferencia) || 0) + (Number(pt.tarjeta) || 0)
      : 0
    const abonado = Math.min(total, Math.round(abonoBruto * 100) / 100)
    // Lo que cobra el repartidor. Contra entrega = todo. Pagada = total − abono.
    const resta = Math.max(0, Math.round((total - (pagada ? abonado : 0)) * 100) / 100)
    // El "paga con" (para el cambio) solo tiene sentido si hay algo por cobrar.
    const guardarPagaCon = resta > 0.005 && Number(data.paga_con) > 0

    const ficha: EntregaFicha = {
      id: crypto.randomBytes(8).toString("hex"),
      folio: data.folio,
      fecha: new Date().toISOString(),
      pagada,
      direccion: data.direccion,
      recibe: data.recibe,
      // En una entrega pagada no hay "quién paga" (pagó el cliente en caja).
      paga: data.paga ?? { nombre: "", telefono: "" },
      comentarios: data.comentarios ?? "",
      total,
      abonado,
      resta,
      // Desglose del abono en tienda, solo si hubo abono (pagada parcial/total).
      ...(pagada && abonado > 0.005
        ? { pagos_tienda: {
            ...(Number(pt.efectivo) > 0 ? { efectivo: Math.round(Number(pt.efectivo) * 100) / 100 } : {}),
            ...(Number(pt.transferencia) > 0 ? { transferencia: Math.round(Number(pt.transferencia) * 100) / 100 } : {}),
            ...(Number(pt.tarjeta) > 0 ? { tarjeta: Math.round(Number(pt.tarjeta) * 100) / 100 } : {}),
          } }
        : {}),
      ...(guardarPagaCon ? { paga_con: Math.round(Number(data.paga_con) * 100) / 100 } : {}),
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
