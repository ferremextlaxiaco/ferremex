import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, withFileLock } from "../../../lib/json-store"
import { agregarEncargosAPedidos, type EncargoLinea } from "../../../lib/pedidos-encargo"
import { crearEncargoFicha, type EncargoArticulo } from "../../../lib/encargos-store"
import { crearEntregaFicha, type EntregaArticulo } from "../../../lib/entregas-store"
import { FERREMEX_CARTERA } from "../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../modules/ferremex-cartera/service"
import { FERREMEX_MONEDERO } from "../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../modules/ferremex-monedero/service"
import { FERREMEX_SALDO_CAMBIO } from "../../../modules/ferremex-saldo-cambio"
import type FerremexSaldoCambioService from "../../../modules/ferremex-saldo-cambio/service"

interface ItemVenta {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  // Si el item forma parte de un paquete vendido, lo marcan (el precio_unitario
  // ya viene prorrateado desde el front). Opcionales y retrocompatibles.
  paquete_id?: string
  paquete_nombre?: string
  // Venta por encargo (Fase 3): la línea se vende SIN stock. El backend salta la
  // validación de existencia para ella, descuenta en negativo, y la agrega al
  // pedido abierto de su proveedor. `proveedor_id`/`proveedor` = destino del pedido.
  encargo?: boolean
  // Modo encargo GLOBAL (reposición): la línea NO descuenta inventario aunque haya
  // stock. Solo genera el pedido al proveedor. Cuando true, `encargo` también lo es.
  no_descontar?: boolean
  // Existencia disponible de la línea (la conoce el front). En encargo MIXTO define
  // cuánto se vende hoy (min(cantidad, existencia)) y cuánto falta (se encarga).
  existencia?: number
  proveedor_id?: string
  proveedor?: string
}

interface VentaBody {
  cajero: string
  turno_id: string
  // Caja física donde se hizo la venta (id del catálogo ferremex_cajas, heredada
  // del cajero logueado en la terminal). El corte de caja agrupa por este campo
  // (arqueo del cajón físico, no por cajero). Ventas viejas sin caja_id se
  // agrupan como "sin caja". Opcional/retrocompatible.
  caja_id?: string | null
  caja_name?: string | null
  // Vendedor de ESTA venta: quién la realizó. Por defecto = el cajero logueado,
  // pero editable en el panel de venta (un admin puede vender en la caja de otro).
  // Es solo registro/atribución; NO afecta el corte (que agrupa por caja).
  vendedor?: string | null
  items: ItemVenta[]
  pago_efectivo: number
  pago_transferencia?: number
  // Pago con tarjeta bancaria (crédito/débito vía TPV). Como la transferencia, NO
  // es efectivo: no entra al cajón ni al efectivo esperado del corte, pero sí se
  // cuenta en los totales del turno (columna propia ventas_tarjeta).
  pago_tarjeta?: number
  pago_credito?: number
  // Pago con puntos del Monedero Electrónico (en MXN). Los puntos consumidos =
  // pago_puntos / valor_punto. El backend valida saldo y registra el canje
  // transaccionalmente. Requiere cliente_id (cliente inscrito al monedero).
  pago_puntos?: number
  // Puntos GANADOS por esta compra, calculados por el motor del frontend
  // (lib/monedero.ts) que tiene la taxonomía y la config cargadas. El backend
  // los persiste como movimiento "ganado" transaccional. 0/omitido = sin puntos.
  puntos_ganados?: number
  // Pago con "saldo a favor por cambio" (módulo ferremex_saldo_cambio, en MXN,
  // 1:1 con pesos — sin tasa de conversión, a diferencia de los puntos). El
  // backend valida saldo y registra el consumo transaccionalmente. Requiere
  // cliente_id (es el saldo del cliente el que se descuenta). Concepto de
  // negocio DISTINTO al Monedero de lealtad — no se mezclan.
  pago_saldo_cambio?: number
  // Cliente a crédito: si pago_credito > 0, el cargo se registra en su cartera
  // de forma transaccional (dentro del lock de la venta). `cliente_id` es el id
  // del Customer nativo de Medusa.
  cliente_id?: string
  cliente_nombre?: string
  plazo?: number
  // Venta por encargo (Fase 3): ficha del cliente que se llena al cobrar (nombre,
  // teléfono, motivo, tiempo de entrega, notas). Se persiste como EncargoFicha
  // (encargos-pos.json) para el módulo de consulta "Encargos". El anticipo NO va
  // aquí: se deriva de lo cobrado (efectivo+transferencia+tarjeta) sobre el total
  // de las líneas por encargo. Solo se crea si hay ≥1 línea con `encargo`.
  encargo_ficha?: {
    cliente_nombre: string
    telefono: string
    motivo?: string
    tiempo_entrega?: string
    correo?: string | null
    notas?: string | null
    // Anticipo que el cliente deja hoy por la porción de encargo (> 0). El resto
    // (total_encargo − anticipo) queda pendiente: en la cartera del cliente si
    // está registrado y tiene crédito, o solo en la ficha (cliente esporádico).
    anticipo?: number
    // Si true, la resta del encargo se carga a la CARTERA del cliente (requiere
    // cliente_id con crédito). Si false/omitido, la resta vive solo en la ficha
    // (cliente esporádico o registrado sin crédito). Lo decide el frontend según
    // el cliente activo; el backend lo respeta solo si hay cliente_id.
    resta_a_cartera?: boolean
  }
  // Entrega A DOMICILIO. Dos naturalezas según `pagada`:
  //  - `pagada` omitido/false = CONTRA ENTREGA (pago diferido): la venta se registra
  //    y DESCUENTA inventario, pero NO se cobra hoy (queda `por_cobrar`). El pago se
  //    registra al liquidar. Requiere `paga` (a veces un tercero).
  //  - `pagada: true` = ENVÍO CON PAGO EN TIENDA: la venta se cobra HOY (total o un
  //    ABONO parcial; el pago capturado entra al corte). Si el abono no cubre el
  //    total, la RESTA la cobra el repartidor al entregar. `paga` no aplica.
  // En ambos casos se persiste una EntregaFicha para el módulo "Entregas a domicilio".
  entrega_ficha?: {
    pagada?: boolean
    direccion: string
    recibe: { nombre: string; telefono: string }
    paga?: { nombre: string; telefono: string }
    comentarios?: string
    // Con cuánto pagará el cliente el resto al recibir → cambio del repartidor.
    paga_con?: number
  }
}

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CONFIG_FILE = path.join(__dirname, "../../../../data/ticket-config.json")
const COUNTER_FILE = path.join(__dirname, "../../../../data/folio-counter.json")

function cargarVentas(): unknown[] {
  return readJson<unknown[]>(VENTAS_FILE, [])
}

interface FormatoFolio { modo: "secuencial" | "fecha"; prefijo: string; digitos: number }

function cargarFormatoFolio(): FormatoFolio | null {
  return readJson<{ formato_folio?: FormatoFolio }>(CONFIG_FILE, {}).formato_folio ?? null
}

/**
 * Genera un folio. En modo secuencial, lee+incrementa el contador y lo guarda
 * de forma atómica. DEBE llamarse dentro del lock de VENTAS_FILE para que el
 * incremento del contador sea atómico respecto a otras ventas concurrentes.
 */
function generarFolio(): string {
  const fmt = cargarFormatoFolio()
  if (!fmt || fmt.modo !== "secuencial") {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const rand = crypto.randomBytes(2).toString("hex").toUpperCase()
    return `POS-${fecha}-${rand}`
  }
  const n = readJson<{ contador: number }>(COUNTER_FILE, { contador: 0 }).contador + 1
  writeJsonAtomic(COUNTER_FILE, { contador: n })
  return `${fmt.prefijo}${n.toString().padStart(fmt.digitos, "0")}`
}

/** GET /caja/ventas — lista todas las ventas (filtrables por ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD) */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { desde, hasta } = req.query as Record<string, string>
  let ventas = cargarVentas() as Record<string, unknown>[]
  if (desde) ventas = ventas.filter((v) => typeof v.fecha === "string" && v.fecha.slice(0, 10) >= desde)
  if (hasta) ventas = ventas.filter((v) => typeof v.fecha === "string" && v.fecha.slice(0, 10) <= hasta)
  ventas = ventas.sort((a, b) => {
    const fa = typeof a.fecha === "string" ? a.fecha : ""
    const fb = typeof b.fecha === "string" ? b.fecha : ""
    return fb.localeCompare(fa)
  })
  res.json(ventas)
}

/** POST /caja/ventas */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const body = req.body as VentaBody
  const { cajero, turno_id, items } = body
  // Castear pagos a Number: si el body los envía como string, la coerción de JS
  // ("500" + 0) rompería la validación de importe más abajo.
  const pago_efectivo = Number(body.pago_efectivo ?? 0)
  const pago_transferencia = Number(body.pago_transferencia ?? 0)
  const pago_tarjeta = Number(body.pago_tarjeta ?? 0)
  const pago_credito = Number(body.pago_credito ?? 0)
  const pago_puntos = Number(body.pago_puntos ?? 0)
  const puntos_ganados = Math.max(0, Math.round(Number(body.puntos_ganados ?? 0)))
  const pago_saldo_cambio = Number(body.pago_saldo_cambio ?? 0)

  if (!cajero || !turno_id || !items?.length) {
    res.status(400).json({ error: "Faltan campos requeridos: cajero, turno_id, items" })
    return
  }
  if (items.some((i) => !i.sku || !(i.cantidad > 0))) {
    res.status(400).json({ error: "Cada item requiere sku y cantidad > 0" })
    return
  }
  if (![pago_efectivo, pago_transferencia, pago_tarjeta, pago_credito, pago_puntos, pago_saldo_cambio].every((n) => Number.isFinite(n))) {
    res.status(400).json({ error: "Montos de pago inválidos" })
    return
  }
  // Si hay pago a crédito, se requiere un cliente para cargarlo en su cartera.
  if (pago_credito > 0 && !body.cliente_id) {
    res.status(400).json({ error: "Una venta a crédito requiere cliente_id" })
    return
  }
  // El pago con puntos requiere un cliente (es su saldo el que se descuenta).
  if (pago_puntos > 0 && !body.cliente_id) {
    res.status(400).json({ error: "El pago con puntos requiere cliente_id" })
    return
  }
  // El pago con saldo a favor requiere un cliente (es su saldo el que se descuenta).
  if (pago_saldo_cambio > 0 && !body.cliente_id) {
    res.status(400).json({ error: "El pago con saldo a favor requiere cliente_id" })
    return
  }

  const total = items.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0)
  const total_pagado = pago_efectivo + pago_transferencia + pago_tarjeta + pago_credito + pago_puntos + pago_saldo_cambio

  // ── Entrega A DOMICILIO ────────────────────────────────────────────────────
  // `hayEntrega`      → viene ficha de entrega (pagada o contra entrega).
  // `entregaPagada`   → el cliente ya pagó en tienda; se cobra HOY normal.
  // `esContraEntrega` → pago diferido; NO se cobra hoy (queda `por_cobrar`).
  const hayEntrega = !!body.entrega_ficha
  const entregaPagada = hayEntrega && !!body.entrega_ficha!.pagada
  const esContraEntrega = hayEntrega && !entregaPagada
  if (hayEntrega) {
    const ef = body.entrega_ficha!
    // Dirección + quién recibe son obligatorios siempre (en ambos modos).
    if (!ef.direccion?.trim() || !ef.recibe?.nombre?.trim() || !ef.recibe?.telefono?.trim()) {
      res.status(400).json({ error: "La entrega requiere dirección y nombre+teléfono de quién recibe" })
      return
    }
    // "Quién paga" ya no se captura por separado: en contra entrega el que recibe
    // es el mismo que paga. Si el front no envía `paga`, se copia de `recibe`.
    if (esContraEntrega && (!ef.paga?.nombre?.trim() || !ef.paga?.telefono?.trim())) {
      ef.paga = { nombre: ef.recibe.nombre, telefono: ef.recibe.telefono }
    }
  }

  // ── Venta por encargo: pago parcial (anticipo) ────────────────────────────
  // Cuando hay líneas por encargo, el cliente puede dejar solo un ANTICIPO por
  // la parte ENCARGADA (el faltante); la parte con stock se paga completa hoy.
  //   - MIXTO: por línea, se venden min(cantidad, existencia) y se encarga el
  //     resto → total_encargo = Σ (faltante × precio).
  //   - REPOSICIÓN (no_descontar): se encarga toda la cantidad → faltante = cantidad.
  // Reglas: anticipo > 0 y ≤ total_encargo.
  const hayEncargo = items.some((i) => i.encargo)
  const faltanteDe = (i: ItemVenta): number => {
    if (!i.encargo) return 0
    if (i.no_descontar) return i.cantidad // reposición: todo se encarga
    return Math.max(0, i.cantidad - (Number(i.existencia) || 0)) // mixto: solo el faltante
  }
  const total_encargo = Math.round(items.reduce((s, i) => s + i.precio_unitario * faltanteDe(i), 0) * 100) / 100
  // Todo lo que se cobra hoy = total − lo encargado (que solo lleva anticipo).
  const total_stock = Math.round((total - total_encargo) * 100) / 100
  // Hay algo que encargar solo si el faltante total > 0. En mixto, si todas las
  // líneas de encargo tenían stock suficiente, no hay faltante → se cobra como
  // venta normal (sin anticipo obligatorio).
  const hayFaltante = total_encargo > 0.005
  // Anticipo solicitado (solo aplica si hay faltante que encargar).
  const anticipoSolicitado = hayFaltante ? Number(body.encargo_ficha?.anticipo ?? 0) : 0

  if (hayFaltante) {
    if (!(anticipoSolicitado > 0)) {
      res.status(400).json({ error: "Una venta por encargo requiere un anticipo mayor a $0" })
      return
    }
    if (anticipoSolicitado > total_encargo + 0.01) {
      res.status(400).json({ error: `El anticipo no puede exceder el total del encargo ($${total_encargo.toFixed(2)})` })
      return
    }
  }

  // Monto que DEBE cubrirse hoy.
  //  - Contra entrega: $0 (se cobra al liquidar).
  //  - Envío con pago en tienda (entregaPagada): $0 obligatorio → el cajero puede
  //    dejar un ABONO parcial; la resta la cobra el repartidor. Lo que capture se
  //    cobra hoy y entra al corte.
  //  - Encargo: parte con stock + anticipo.
  //  - Venta normal: el total.
  const pago_requerido = (esContraEntrega || entregaPagada) ? 0
    : hayFaltante ? Math.round((total_stock + anticipoSolicitado) * 100) / 100
    : total

  if (total_pagado < pago_requerido - 0.01) {
    res.status(400).json({ error: hayFaltante ? "El pago no cubre la parte con existencia más el anticipo" : "El pago es menor al total" })
    return
  }
  // Envío con pago en tienda: el abono efectivo puede exceder el total (se devuelve
  // cambio), pero los métodos SIN cambio (transferencia/tarjeta/crédito/puntos) no
  // pueden exceder el total — sería cobrar de más sin forma de devolverlo.
  if (entregaPagada) {
    const sinCambio = pago_transferencia + pago_tarjeta + pago_credito + pago_puntos + pago_saldo_cambio
    if (sinCambio > total + 0.01) {
      res.status(400).json({ error: "El pago sin efectivo no puede exceder el total de la venta" })
      return
    }
  }

  // Serializamos toda la venta bajo el lock del archivo de ventas. Esto convierte
  // el bloque check → decrement → folio → guardar en una sección crítica atómica
  // respecto a otras ventas concurrentes, eliminando: (a) sobreventa por race
  // check→decrement, (b) folios secuenciales duplicados, (c) pérdida de registros
  // por read-modify-write concurrente.
  // La resta del encargo va a cartera si: hay encargo, queda resta > 0, el
  // frontend lo pidió (resta_a_cartera) y hay cliente_id (con crédito). Si no,
  // la resta vive solo en la ficha.
  const restaEncargo = hayFaltante ? Math.round((total_encargo - anticipoSolicitado) * 100) / 100 : 0
  const restaACartera = hayFaltante && restaEncargo > 0.01 && !!body.encargo_ficha?.resta_a_cartera && !!body.cliente_id

  const carteraService: FerremexCarteraService | null =
    (pago_credito > 0 || restaACartera) ? req.scope.resolve(FERREMEX_CARTERA) : null

  // Monedero: lo resolvemos si hay puntos a ganar o a canjear. La validación de
  // saldo (canje) y el tope de canje se hacen ANTES del lock para fallar barato;
  // el registro de movimientos ocurre DENTRO del lock (transaccional con la venta).
  const monederoService: FerremexMonederoService | null =
    (pago_puntos > 0 || puntos_ganados > 0) && body.cliente_id
      ? req.scope.resolve(FERREMEX_MONEDERO)
      : null

  let puntos_canjeados = 0
  // Puntos ganados ya saneados (entero ≥0). Se recortan abajo a un tope coherente
  // con el importe para que un body manipulado no pueda inflar el devengo.
  let puntos_ganados_final = puntos_ganados
  if (monederoService && body.cliente_id) {
    try {
      const cfg = await monederoService.getOrCreateConfig()
      const valorPunto = Number(cfg.valor_punto) || 0
      if ((pago_puntos > 0 || puntos_ganados > 0) && valorPunto <= 0) {
        res.status(400).json({ error: "El valor del punto no está configurado" }); return
      }

      // Canje (resta de puntos): validar tope y saldo.
      if (pago_puntos > 0) {
        // Tope: el pago con puntos no puede exceder max_canje_pct del total.
        const topePesos = total * ((Number(cfg.max_canje_pct) || 0) / 100)
        if (pago_puntos > topePesos + 0.01) {
          res.status(400).json({
            error: `Con puntos solo puedes cubrir hasta ${cfg.max_canje_pct}% del ticket ($${topePesos.toFixed(2)})`,
          }); return
        }
        puntos_canjeados = Math.ceil(pago_puntos / valorPunto)
        const saldo = await monederoService.saldoCliente(body.cliente_id)
        if (puntos_canjeados > saldo) {
          res.status(400).json({ error: `Puntos insuficientes: requiere ${puntos_canjeados}, disponible ${saldo}` }); return
        }
      }

      // Devengo: el motor del frontend calcula puntos_ganados, pero acotamos
      // server-side a un máximo coherente con el importe del ticket para que un
      // body manipulado no acredite puntos arbitrarios. El factor 5 cubre el
      // multiplicador del nivel más alto razonable (≤5×) sin replicar el motor.
      if (puntos_ganados > 0 && valorPunto > 0) {
        const tasaMax = Math.max(Number(cfg.tasa_base) || 0, 100) // techo permisivo
        const topePuntos = Math.ceil(((total * (tasaMax / 100)) / valorPunto) * 5)
        if (puntos_ganados_final > topePuntos) {
          console.warn(`[caja/ventas] puntos_ganados recortado de ${puntos_ganados} a ${topePuntos} (cliente ${body.cliente_id})`)
          puntos_ganados_final = topePuntos
        }
      }
    } catch (e: any) {
      console.error("[caja/ventas] Validación de monedero falló:", e?.message ?? e)
      res.status(500).json({ error: "No se pudo validar el monedero" }); return
    }
  }

  // Saldo a favor por cambio (ferremex_saldo_cambio): 1:1 con pesos, sin tasa de
  // conversión (a diferencia de los puntos). La validación de saldo se hace ANTES
  // del lock para fallar barato; el registro del consumo ocurre DENTRO del lock
  // (transaccional con la venta).
  const saldoCambioService: FerremexSaldoCambioService | null =
    pago_saldo_cambio > 0 && body.cliente_id
      ? req.scope.resolve(FERREMEX_SALDO_CAMBIO)
      : null

  if (saldoCambioService && body.cliente_id) {
    try {
      const saldoDisponible = await saldoCambioService.saldoCliente(body.cliente_id)
      if (pago_saldo_cambio > saldoDisponible + 0.01) {
        res.status(400).json({
          error: `Saldo a favor insuficiente: requiere $${pago_saldo_cambio.toFixed(2)}, disponible $${saldoDisponible.toFixed(2)}`,
        }); return
      }
    } catch (e: any) {
      console.error("[caja/ventas] Validación de saldo a favor falló:", e?.message ?? e)
      res.status(500).json({ error: "No se pudo validar el saldo a favor" }); return
    }
  }

  try {
    const resultado = await withFileLock(VENTAS_FILE, async () => {
      // Cargar inventario y validar stock
      const skus = items.map((i) => i.sku)
      const inventoryItems = await inventoryModule.listInventoryItems(
        { sku: skus },
        { select: ["id", "sku"], take: skus.length + 10 }
      )
      const itemPorSku = new Map(inventoryItems.map((i) => [i.sku, i.id]))
      const niveles = await inventoryModule.listInventoryLevels(
        { inventory_item_id: inventoryItems.map((i) => i.id) },
        { select: ["id", "inventory_item_id", "location_id", "stocked_quantity"], take: inventoryItems.length + 10 }
      )
      const nivelPorItemId = new Map(niveles.map((n) => [n.inventory_item_id, n]))

      // Validar que ningún item supere el stock disponible. Las líneas marcadas
      // como ENCARGO se exceptúan: se venden sobre pedido (inventario a negativo).
      for (const item of items) {
        if (item.encargo) continue
        const inventoryItemId = itemPorSku.get(item.sku)
        if (!inventoryItemId) {
          // SKU sin inventory item: lo registramos pero advertimos en log en vez
          // de descontarlo en silencio.
          console.warn(`[caja/ventas] SKU sin inventory item, no se descuenta: ${item.sku}`)
          continue
        }
        const nivel = nivelPorItemId.get(inventoryItemId)
        if (!nivel) continue
        if (item.cantidad > nivel.stocked_quantity) {
          return {
            error: `Stock insuficiente para "${item.descripcion}": solicitado ${item.cantidad}, disponible ${nivel.stocked_quantity}`,
          } as const
        }
      }

      // RE-VALIDACIÓN del canje de puntos DENTRO del lock, antes de tocar el
      // inventario: el saldo pudo cambiar entre la validación pre-lock y aquí
      // (otra venta concurrente del mismo cliente). Se hace antes del decremento
      // para poder retornar un error limpio sin efectos colaterales en stock.
      if (monederoService && body.cliente_id && puntos_canjeados > 0) {
        const saldoActual = await monederoService.saldoCliente(body.cliente_id)
        if (puntos_canjeados > saldoActual) {
          return {
            error: `Puntos insuficientes: requiere ${puntos_canjeados}, disponible ${saldoActual}`,
          } as const
        }
      }

      // RE-VALIDACIÓN del saldo a favor DENTRO del lock, antes de tocar el
      // inventario: por si otra venta concurrente del mismo cliente ya lo consumió.
      if (saldoCambioService && body.cliente_id && pago_saldo_cambio > 0) {
        const saldoActual = await saldoCambioService.saldoCliente(body.cliente_id)
        if (pago_saldo_cambio > saldoActual + 0.01) {
          return {
            error: `Saldo a favor insuficiente: requiere $${pago_saldo_cambio.toFixed(2)}, disponible $${saldoActual.toFixed(2)}`,
          } as const
        }
      }

      // Descontar inventario acumulando lo aplicado para poder revertir ante error.
      // `encargadoPorSku` guarda cuántas piezas de cada SKU quedan ENCARGADAS al
      // proveedor (el faltante), para alimentar el pedido con la cantidad correcta.
      const aplicados: { itemId: string; locationId: string; cantidad: number }[] = []
      const encargadoPorSku = new Map<string, number>()
      try {
        for (const item of items) {
          const inventoryItemId = itemPorSku.get(item.sku)
          const nivel = inventoryItemId ? nivelPorItemId.get(inventoryItemId) : undefined
          const stockDisp = nivel?.stocked_quantity ?? 0

          // REPOSICIÓN (no_descontar): nada toca inventario; TODO se encarga.
          if (item.no_descontar) {
            if (item.encargo) encargadoPorSku.set(item.sku, item.cantidad)
            continue
          }

          // ENCARGO MIXTO: descuenta lo que HAY (nunca a negativo) y encarga el
          // faltante. Vende 2 de 5 pedidas → descuenta 2, encarga 3.
          if (item.encargo) {
            const aDescontar = Math.max(0, Math.min(item.cantidad, stockDisp))
            const aEncargar = item.cantidad - aDescontar
            if (aEncargar > 0) encargadoPorSku.set(item.sku, aEncargar)
            if (aDescontar > 0 && inventoryItemId && nivel) {
              await inventoryModule.adjustInventory(inventoryItemId, nivel.location_id, -aDescontar)
              aplicados.push({ itemId: inventoryItemId, locationId: nivel.location_id, cantidad: aDescontar })
            }
            continue
          }

          // VENTA NORMAL: descuenta la cantidad completa (ya validada contra stock).
          if (!inventoryItemId || !nivel) continue
          await inventoryModule.adjustInventory(inventoryItemId, nivel.location_id, -item.cantidad)
          aplicados.push({ itemId: inventoryItemId, locationId: nivel.location_id, cantidad: item.cantidad })
        }

        // Generar folio (dentro del lock → contador atómico) y persistir la venta.
        const registro = {
          folio: generarFolio(),
          fecha: new Date().toISOString(),
          cajero,
          turno_id,
          // Caja física de la venta (para el arqueo por caja) y vendedor que la
          // realizó (atribución; default al cajero logueado si no se especifica).
          caja_id: body.caja_id ?? null,
          caja_name: body.caja_name ?? null,
          vendedor: body.vendedor ?? cajero,
          items: items.map((i) => ({
            sku: i.sku, // necesario para reintegrar inventario al cancelar la venta
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            subtotal: i.precio_unitario * i.cantidad,
            // Traza del paquete (si aplica) para ticket / historial / corte.
            ...(i.paquete_id ? { paquete_id: i.paquete_id, paquete_nombre: i.paquete_nombre ?? null } : {}),
            // Marca de venta por encargo (para ticket / historial / rastreo).
            // `no_descontar` se persiste para que la CANCELACIÓN no reintegre
            // inventario de líneas que nunca lo descontaron (modo encargo global).
            ...(i.encargo ? { encargo: true, proveedor: i.proveedor ?? null, ...(i.no_descontar ? { no_descontar: true } : {}) } : {}),
          })),
          // `total` de la venta = lo COBRADO HOY (para que el corte cuadre). Sin
          // encargo es el total normal; con encargo es parte-con-stock + anticipo;
          // contra entrega es 0 (se cobra al liquidar); envío con pago en tienda es
          // el ABONO capturado, ACOTADO al total (un sobrepago en efectivo devuelve
          // cambio, no infla el corte). La resta se cobra al entregar.
          total: entregaPagada ? Math.min(Math.round(total_pagado * 100) / 100, total) : pago_requerido,
          // Contra entrega: estado por_cobrar + el monto real que se cobrará al
          // entregar (para el ticket del cliente, la hoja del repartidor y el corte).
          ...(esContraEntrega ? {
            estado: "por_cobrar",
            metodo_pago: "contra_entrega",
            entrega_total: Math.round(total * 100) / 100,
          } : {}),
          // Envío con pago en tienda: la venta se cobró (total o abono). Se marca la
          // entrega para el historial; si quedó resta, `entrega_total` = lo que cobra
          // el repartidor (total − abono), y el estado es por_cobrar hasta liquidar.
          ...(entregaPagada ? (() => {
            const resta = Math.max(0, Math.round((total - total_pagado) * 100) / 100)
            return {
              entrega_domicilio: "pagada",
              entrega_total: resta,           // lo que cobra el repartidor (0 si pagó todo)
              ...(resta > 0.005 ? { estado: "por_cobrar" } : {}),
            }
          })() : {}),
          // Trazabilidad del encargo: total real de lo encargado, anticipo cobrado
          // hoy y resta pendiente. Solo se persisten cuando hay faltante encargado.
          ...(hayFaltante ? {
            encargo_total: Math.round(total_encargo * 100) / 100,
            encargo_anticipo: Math.round(anticipoSolicitado * 100) / 100,
            encargo_resta: Math.round((total_encargo - anticipoSolicitado) * 100) / 100,
          } : {}),
          pago_efectivo,
          pago_transferencia,
          pago_tarjeta,
          pago_credito,
          // Monedero: pago con puntos (MXN), puntos consumidos y puntos ganados.
          // Se persisten para el ticket, el historial y para revertir al cancelar.
          pago_puntos,
          puntos_canjeados,
          puntos_ganados: puntos_ganados_final,
          // Saldo a favor por cambio (ferremex_saldo_cambio, 1:1 con pesos). Se
          // persiste para el ticket, el historial y para revertirlo al cancelar.
          pago_saldo_cambio,
          // cliente_id se persiste para poder revertir el cargo a crédito si la
          // venta se cancela (PATCH /caja/ventas/:folio).
          cliente_id: body.cliente_id ?? null,
          cliente_nombre: body.cliente_nombre ?? null,
          // El cambio solo se devuelve sobre el excedente de EFECTIVO, restando
          // lo cubierto por otros métodos. Se calcula sobre lo COBRADO HOY. En envío
          // con pago en tienda (entregaPagada) la base es min(abono, total): un abono
          // parcial no genera cambio, pero un sobrepago en efectivo sí lo devuelve.
          cambio: Math.max(0, pago_efectivo - Math.max(0, (entregaPagada ? Math.min(Math.round(total_pagado * 100) / 100, total) : pago_requerido) - pago_transferencia - pago_tarjeta - pago_credito - pago_puntos - pago_saldo_cambio)),
        }

        // Cargo a crédito: registrar el movimiento en la cartera del cliente.
        // Se hace ANTES de escribir la venta para que, si el cargo falla, el
        // catch revierta el inventario y la venta NO se persista (atomicidad
        // cargo+venta). El orden inverso (venta primero) dejaría como peor caso
        // un cargo huérfano con folio de una venta inexistente; este orden deja
        // como peor caso —solo si writeJsonAtomic fallara tras un cargo OK— un
        // cargo sin venta, detectable y reversible por folio. La escritura JSON
        // local es prácticamente infalible una vez superada la validación.
        if (carteraService && pago_credito > 0 && body.cliente_id) {
          await carteraService.agregarMovimiento(body.cliente_id, {
            tipo: "compra",
            monto: pago_credito,
            fecha: registro.fecha.slice(0, 10),
            folio: registro.folio,
            plazo: body.plazo != null ? Number(body.plazo) : null,
            descripcion: `Venta a crédito ${registro.folio}`,
          })
        }

        // Resta de encargo a cartera: cuando el cliente registrado (con crédito)
        // deja anticipo y el resto se le carga a su cuenta. Transaccional con la
        // venta (mismo lock), igual que el cargo a crédito de arriba. La ficha del
        // encargo se marca resta_en_cartera=true para no cobrarla también ahí.
        if (carteraService && restaACartera && body.cliente_id) {
          await carteraService.agregarMovimiento(body.cliente_id, {
            tipo: "compra",
            monto: restaEncargo,
            fecha: registro.fecha.slice(0, 10),
            folio: registro.folio,
            plazo: body.plazo != null ? Number(body.plazo) : null,
            descripcion: `Resta de encargo ${registro.folio}`,
          })
        }

        // Monedero: canje (resta de puntos) y devengo (suma de puntos), ambos
        // transaccionales con la venta. El canje primero para que, si el saldo
        // cambió entre la validación y aquí, falle antes de otorgar nuevos puntos.
        // El saldo ya se re-validó dentro del lock (antes de decrementar
        // inventario), así que aquí solo registramos.
        if (monederoService && body.cliente_id) {
          if (puntos_canjeados > 0) {
            await monederoService.agregarMovimiento(body.cliente_id, {
              tipo: "canjeado",
              puntos: -puntos_canjeados,
              folio: registro.folio,
              descripcion: `Canje en venta ${registro.folio}`,
              fecha: registro.fecha,
            })
          }
          if (puntos_ganados_final > 0) {
            await monederoService.agregarMovimiento(body.cliente_id, {
              tipo: "ganado",
              puntos: puntos_ganados_final,
              folio: registro.folio,
              descripcion: `Puntos por venta ${registro.folio}`,
              fecha: registro.fecha,
            })
          }
        }

        // Saldo a favor por cambio: registrar el consumo transaccional con la
        // venta (mismo lock; el saldo ya se re-validó arriba antes de tocar
        // inventario). Monto NEGATIVO (reduce el saldo del cliente).
        if (saldoCambioService && body.cliente_id && pago_saldo_cambio > 0) {
          await saldoCambioService.agregarMovimiento(body.cliente_id, {
            tipo: "consumido",
            monto: -pago_saldo_cambio,
            venta_consumo_folio: registro.folio,
            descripcion: `Consumo en venta ${registro.folio}`,
            fecha: registro.fecha,
          })
        }

        const ventas = cargarVentas()
        ventas.push(registro)
        writeJsonAtomic(VENTAS_FILE, ventas)
        // Devolvemos el faltante encargado por SKU para alimentar el pedido al
        // proveedor con la cantidad correcta (en mixto = lo que no había en stock).
        return { registro, encargado: Object.fromEntries(encargadoPorSku) } as const
      } catch (err) {
        // Compensación: revertir los decrementos ya aplicados para no dejar el
        // inventario descontado sin venta registrada.
        for (const a of aplicados) {
          try {
            await inventoryModule.adjustInventory(a.itemId, a.locationId, +a.cantidad)
          } catch (revertErr) {
            console.error(`[caja/ventas] Falló revertir inventario de ${a.itemId}:`, revertErr)
          }
        }
        throw err
      }
    })

    if ("error" in resultado) {
      res.status(400).json({ error: resultado.error })
      return
    }

    // Venta por encargo (Fase 3): fuera del lock de ventas (el helper toma su
    // propio lock de pedidos → sin deadlock), alimentar el pedido abierto de cada
    // proveedor con las líneas marcadas como encargo. Es best-effort: si falla, la
    // venta YA quedó registrada (el encargo se puede recrear a mano desde Pedidos).
    // La cantidad encargada = el faltante calculado dentro del lock (mixto:
    // cantidad − stock; reposición: cantidad completa). Líneas cuyo faltante es 0
    // (había stock suficiente en mixto) NO generan pedido al proveedor.
    const encargado = resultado.encargado ?? {}
    const encargos: EncargoLinea[] = items
      .filter((i) => i.encargo && (encargado[i.sku] ?? 0) > 0)
      .map((i) => ({
        sku: i.sku,
        clave: i.sku,
        descripcion: i.descripcion,
        cantidad: encargado[i.sku],
        proveedor_id: i.proveedor_id ?? null,
        proveedor: i.proveedor ?? null,
        origen_venta: resultado.registro.folio,
      }))
    if (encargos.length > 0) {
      try {
        await agregarEncargosAPedidos(encargos)
      } catch (e) {
        console.error("[caja/ventas] Venta OK pero falló alimentar pedidos de encargo:", e)
      }
    }

    // Ficha de encargo (atención al cliente): si la venta trae líneas por encargo
    // y el cajero llenó la ficha, la persistimos para el módulo de consulta
    // "Encargos". Best-effort: la venta ya quedó registrada. El anticipo es el
    // capturado en la ficha (validado > 0 y ≤ total_encargo). La resta queda en la
    // ficha, salvo que se haya cargado a cartera (restaACartera → resta_en_cartera).
    if (encargos.length > 0 && body.encargo_ficha?.cliente_nombre && body.encargo_ficha?.telefono) {
      try {
        // Los artículos de la ficha reflejan lo realmente ENCARGADO (el faltante),
        // no la cantidad total pedida (parte de la cual pudo venderse hoy).
        const articulos: EncargoArticulo[] = items
          .filter((i) => i.encargo && (encargado[i.sku] ?? 0) > 0)
          .map((i) => ({
            sku: i.sku,
            descripcion: i.descripcion,
            cantidad: encargado[i.sku],
            precio_unitario: i.precio_unitario,
            proveedor: i.proveedor ?? null,
            proveedor_id: i.proveedor_id ?? null,
          }))
        await crearEncargoFicha({
          folio: resultado.registro.folio,
          cliente_nombre: body.encargo_ficha.cliente_nombre,
          telefono: body.encargo_ficha.telefono,
          motivo: body.encargo_ficha.motivo ?? "",
          tiempo_entrega: body.encargo_ficha.tiempo_entrega ?? "",
          correo: body.encargo_ficha.correo ?? null,
          notas: body.encargo_ficha.notas ?? null,
          cliente_id: body.cliente_id ?? null,
          total: Math.round(total_encargo * 100) / 100,
          anticipo: Math.round(anticipoSolicitado * 100) / 100,
          resta_en_cartera: restaACartera,
          articulos,
        })
      } catch (e) {
        console.error("[caja/ventas] Venta OK pero falló crear la ficha de encargo:", e)
      }
    }

    // Ficha de entrega a domicilio (pagada o contra entrega). Persistimos a dónde
    // va, quién recibe y (en contra entrega) quién paga, para el módulo "Entregas a
    // domicilio" y la hoja del repartidor. En la pagada, la venta ya se cobró hoy;
    // en contra entrega quedó `por_cobrar`. Best-effort (la venta ya está registrada).
    if (hayEntrega && body.entrega_ficha) {
      try {
        const ef = body.entrega_ficha
        const articulosEntrega: EntregaArticulo[] = items.map((i) => ({
          sku: i.sku,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        }))
        await crearEntregaFicha({
          folio: resultado.registro.folio,
          pagada: entregaPagada,
          direccion: ef.direccion,
          recibe: { nombre: ef.recibe.nombre, telefono: ef.recibe.telefono },
          // En la entrega pagada no hay "quién paga" (pagó el cliente en caja).
          paga: entregaPagada
            ? undefined
            : { nombre: ef.paga!.nombre, telefono: ef.paga!.telefono },
          comentarios: ef.comentarios ?? "",
          total: Math.round(total * 100) / 100,
          // Envío con pago en tienda: el abono capturado y su desglose de métodos.
          // El store calcula la resta (total − abono) que cobra el repartidor.
          ...(entregaPagada ? {
            pagos_tienda: {
              ...(pago_efectivo > 0 ? { efectivo: pago_efectivo } : {}),
              ...(pago_transferencia > 0 ? { transferencia: pago_transferencia } : {}),
              ...(pago_tarjeta > 0 ? { tarjeta: pago_tarjeta } : {}),
            },
          } : {}),
          // Con cuánto pagará el resto al recibir → cambio del repartidor.
          ...(ef.paga_con != null ? { paga_con: Number(ef.paga_con) } : {}),
          articulos: articulosEntrega,
          cliente_id: body.cliente_id ?? null,
        })
      } catch (e) {
        console.error("[caja/ventas] Venta OK pero falló crear la ficha de entrega:", e)
      }
    }

    res.json(resultado.registro)
  } catch (err) {
    console.error("[caja/ventas] Error registrando venta:", err)
    res.status(500).json({ error: "No se pudo registrar la venta" })
  }
}
