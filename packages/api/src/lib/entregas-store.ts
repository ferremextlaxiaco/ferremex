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

/**
 * Servicio de FLETE cargado al cliente (opcional, separado del total de la venta).
 * Lo determina el vendedor. Puede cobrarse en tienda al hacer la compra o al
 * entregar (junto con la resta, pero como movimiento aparte). NO aparece en el
 * ticket de la venta; tiene su propio ticket de flete.
 */
export interface EntregaFlete {
  precio: number
  // true = se cobra al entregar (junto con la resta). false = ya se cobró en tienda.
  cobrar_al_entregar: boolean
  // Método con que se cobró en tienda (solo si NO es al entregar).
  metodo_tienda?: string
  // true una vez que el flete quedó cobrado (en tienda al vender, o al liquidar).
  cobrado: boolean
  fecha_cobro?: string // ISO, cuando se cobró
  // Cancelación (soft): no borra, marca cancelado con motivo. Si ya se había cobrado
  // en tienda, la ruta de cancelación genera un movimiento de reversa.
  cancelado?: boolean
  motivo_cancelacion?: string
  fecha_cancelacion?: string
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
  // Servicio de flete cargado al cliente (opcional, separado del total de la venta).
  flete?: EntregaFlete
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
  // Flete: precio + si se cobra al entregar (o ya se cobró en tienda) + método.
  flete?: { precio: number; cobrar_al_entregar: boolean; metodo_tienda?: string }
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

    // Flete (opcional): solo se guarda si el precio es > 0. Si se cobra en tienda,
    // el POST de ventas ya creó su movimiento y lo marca cobrado; si es al entregar,
    // queda pendiente hasta liquidar.
    const fletePrecio = Math.round((Number(data.flete?.precio) || 0) * 100) / 100
    const conFlete = !!data.flete && fletePrecio > 0.005
    const fleteAlEntregar = !!data.flete?.cobrar_al_entregar

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
      // Flete: cobrado=true si se cobró en tienda (no al entregar).
      ...(conFlete ? {
        flete: {
          precio: fletePrecio,
          cobrar_al_entregar: fleteAlEntregar,
          ...(fleteAlEntregar ? {} : { metodo_tienda: data.flete!.metodo_tienda ?? "efectivo" }),
          cobrado: !fleteAlEntregar,
          ...(fleteAlEntregar ? {} : { fecha_cobro: new Date().toISOString() }),
        },
      } : {}),
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

/**
 * Marca el flete como cobrado (al liquidar la entrega, cuando era "al entregar").
 * No-op si la ficha no tiene flete, ya está cobrado o está cancelado.
 */
export async function marcarFleteCobrado(
  id: string,
  metodo: string
): Promise<EntregaFicha | null> {
  let out: EntregaFicha | null = null
  await updateJson<EntregaFicha[]>(ENTREGAS_FILE, [], (fichas) => {
    const idx = fichas.findIndex((f) => f.id === id)
    if (idx === -1) return fichas
    const copia = [...fichas]
    const f = copia[idx]
    if (f.flete && !f.flete.cobrado && !f.flete.cancelado) {
      f.flete = {
        ...f.flete,
        cobrado: true,
        metodo_tienda: f.flete.metodo_tienda ?? metodo,
        fecha_cobro: new Date().toISOString(),
      }
    }
    copia[idx] = f
    out = f
    return copia
  })
  return out
}

/**
 * Cancela (soft) el flete de una ficha: marca `cancelado`, guarda motivo/fecha.
 * Devuelve `{ ficha, revertir }` donde `revertir` = monto a reversar en caja si el
 * flete YA se había cobrado en tienda (la ruta crea el movimiento de reversa). Si
 * no se había cobrado o no hay flete, `revertir = 0`.
 */
export async function cancelarFleteEntrega(
  id: string,
  motivo: string
): Promise<{ ficha: EntregaFicha | null; revertir: number; metodo?: string }> {
  let out: EntregaFicha | null = null
  let revertir = 0
  let metodo: string | undefined
  await updateJson<EntregaFicha[]>(ENTREGAS_FILE, [], (fichas) => {
    const idx = fichas.findIndex((f) => f.id === id)
    if (idx === -1) return fichas
    const copia = [...fichas]
    const f = copia[idx]
    if (f.flete && !f.flete.cancelado) {
      // Si ya se había cobrado en tienda (no al entregar), hay que reversar.
      if (f.flete.cobrado && !f.flete.cobrar_al_entregar) {
        revertir = Number(f.flete.precio) || 0
        metodo = f.flete.metodo_tienda
      }
      f.flete = {
        ...f.flete,
        cancelado: true,
        motivo_cancelacion: motivo,
        fecha_cancelacion: new Date().toISOString(),
      }
    }
    copia[idx] = f
    out = f
    return copia
  })
  return { ficha: out, revertir, metodo }
}
