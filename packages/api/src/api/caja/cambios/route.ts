import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, withFileLock } from "../../../lib/json-store"
import { FERREMEX_CAMBIOS } from "../../../modules/ferremex-cambios"
import type FerremexCambiosService from "../../../modules/ferremex-cambios/service"
import { FERREMEX_SALDO_CAMBIO } from "../../../modules/ferremex-saldo-cambio"
import type FerremexSaldoCambioService from "../../../modules/ferremex-saldo-cambio/service"
import { FERREMEX_MONEDERO } from "../../../modules/ferremex-monedero"
import type FerremexMonederoService from "../../../modules/ferremex-monedero/service"

const VENTAS_FILE = path.join(__dirname, "../../../../data/ventas-pos.json")
const CONFIG_FILE = path.join(__dirname, "../../../../data/ticket-config.json")
const COUNTER_FILE = path.join(__dirname, "../../../../data/folio-counter.json")

interface VentaRegistro {
  folio: string
  estado?: string
  items?: { sku?: string; cantidad: number; descripcion?: string; precio_unitario?: number }[]
  cambios?: string[]
  [k: string]: unknown
}

function cargarVentas(): VentaRegistro[] {
  return readJson<VentaRegistro[]>(VENTAS_FILE, [])
}

interface FormatoFolio { modo: "secuencial" | "fecha"; prefijo: string; digitos: number }

function cargarFormatoFolio(): FormatoFolio | null {
  return readJson<{ formato_folio?: FormatoFolio }>(CONFIG_FILE, {}).formato_folio ?? null
}

/** Folio de VENTA (diferencia cobrada), mismo generador que /caja/ventas. */
function generarFolioVenta(): string {
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

/** Folio propio de CAMBIO: CAM-YYYYMMDD-<2 hex>. Sin contador (no comparte secuencia con ventas). */
function generarFolioCambio(): string {
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase()
  return `CAM-${fecha}-${rand}`
}

interface LineaDevueltaBody { sku: string; cantidad: number }
interface LineaNuevaBody { sku: string; descripcion: string; cantidad: number; precio_unitario: number }

interface CambioBody {
  venta_origen_folio: string
  cajero: string
  turno_id: string
  caja_id?: string | null
  caja_name?: string | null
  vendedor?: string | null
  customer_id?: string | null
  cliente_nombre?: string | null
  lineas_devueltas: LineaDevueltaBody[]
  lineas_nuevas: LineaNuevaBody[]
  // Pago de la diferencia (solo si diferencia > 0). Mismo desglose que /caja/ventas,
  // sin crédito: un cambio no se fía. Puntos y saldo a favor sí se permiten (son
  // saldo YA acumulado del cliente, mismo motor de validación que /caja/ventas).
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_puntos?: number
  pago_saldo_cambio?: number
}

/** GET /caja/cambios — lista, opcional ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cambiosService: FerremexCambiosService = req.scope.resolve(FERREMEX_CAMBIOS)
  const { desde, hasta } = req.query as Record<string, string>
  let cambios = await cambiosService.listCambios({}, { order: { fecha: "DESC" }, take: 5000 })
  if (desde) cambios = cambios.filter((c) => typeof c.fecha === "string" && c.fecha.slice(0, 10) >= desde)
  if (hasta) cambios = cambios.filter((c) => typeof c.fecha === "string" && c.fecha.slice(0, 10) <= hasta)
  res.json(cambios)
}

/**
 * POST /caja/cambios — procesa un cambio de artículo(s).
 *
 * Reintegra a inventario lo devuelto, descuenta lo nuevo, y liquida la
 * diferencia: si valor_nuevo >= valor_devuelto se cobra (registrada como venta
 * normal enlazada); si es menor, se acredita saldo a favor (requiere cliente).
 * Nunca se devuelve efectivo. Todo bajo el lock de ventas (comparte atomicidad
 * de inventario con /caja/ventas).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const inventoryModule = req.scope.resolve(Modules.INVENTORY)
  const body = req.body as CambioBody
  const { venta_origen_folio, cajero, turno_id, lineas_devueltas, lineas_nuevas } = body

  if (!venta_origen_folio || !cajero || !turno_id) {
    res.status(400).json({ error: "Faltan campos requeridos: venta_origen_folio, cajero, turno_id" })
    return
  }
  // Líneas nuevas es OPCIONAL: si viene vacío, es una "solo devolución" (el
  // cliente no se lleva nada ahora) y el 100% del valor devuelto se acredita
  // como saldo a favor. Requiere cliente igual que cualquier saldo a favor.
  if (!lineas_devueltas?.length) {
    res.status(400).json({ error: "Se requiere al menos una línea devuelta" })
    return
  }
  if (lineas_devueltas.some((l) => !l.sku || !(l.cantidad > 0))) {
    res.status(400).json({ error: "Cada línea devuelta requiere sku y cantidad > 0" })
    return
  }
  if ((lineas_nuevas ?? []).some((l) => !l.sku || !l.descripcion || !(l.cantidad > 0) || !(l.precio_unitario > 0))) {
    res.status(400).json({ error: "Cada línea nueva requiere sku, descripcion, cantidad > 0 y precio_unitario > 0" })
    return
  }

  const pago_efectivo = Number(body.pago_efectivo ?? 0)
  const pago_transferencia = Number(body.pago_transferencia ?? 0)
  const pago_tarjeta = Number(body.pago_tarjeta ?? 0)
  const pago_puntos = Number(body.pago_puntos ?? 0)
  const pago_saldo_cambio = Number(body.pago_saldo_cambio ?? 0)
  if (![pago_efectivo, pago_transferencia, pago_tarjeta, pago_puntos, pago_saldo_cambio].every((n) => Number.isFinite(n) && n >= 0)) {
    res.status(400).json({ error: "Montos de pago inválidos" })
    return
  }
  // El pago con puntos/saldo a favor requiere cliente (es su saldo el que se descuenta).
  if ((pago_puntos > 0 || pago_saldo_cambio > 0) && !body.customer_id) {
    res.status(400).json({ error: "El pago con puntos o saldo a favor requiere un cliente identificado" })
    return
  }

  // Venta original: cargarla y validar cada línea devuelta contra lo realmente
  // vendido (permite cambio parcial: se llevó 5, regresa 3).
  const ventas = cargarVentas()
  const idxOrigen = ventas.findIndex((v) => v.folio === venta_origen_folio)
  if (idxOrigen === -1) {
    res.status(404).json({ error: "Venta original no encontrada" })
    return
  }
  const ventaOrigen = ventas[idxOrigen]
  if (ventaOrigen.estado === "cancelada") {
    res.status(400).json({ error: "La venta original está cancelada" })
    return
  }
  const itemsOrigen = ventaOrigen.items ?? []

  const lineasDevueltasResueltas: { sku: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[] = []
  for (const l of lineas_devueltas) {
    const itemOrigen = itemsOrigen.find((i) => i.sku === l.sku)
    if (!itemOrigen) {
      res.status(400).json({ error: `El SKU "${l.sku}" no está en la venta original` })
      return
    }
    if (l.cantidad > itemOrigen.cantidad) {
      res.status(400).json({
        error: `No se puede devolver ${l.cantidad} de "${l.sku}": solo se vendieron ${itemOrigen.cantidad}`,
      })
      return
    }
    const precio_unitario = Number(itemOrigen.precio_unitario ?? 0)
    lineasDevueltasResueltas.push({
      sku: l.sku,
      descripcion: itemOrigen.descripcion ?? l.sku,
      cantidad: l.cantidad,
      precio_unitario,
      subtotal: Math.round(precio_unitario * l.cantidad * 100) / 100,
    })
  }

  const lineasNuevasResueltas = (lineas_nuevas ?? []).map((l) => ({
    sku: l.sku,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precio_unitario,
    subtotal: Math.round(l.precio_unitario * l.cantidad * 100) / 100,
  }))

  const valor_devuelto = Math.round(lineasDevueltasResueltas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100
  const valor_nuevo = Math.round(lineasNuevasResueltas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100
  const diferencia = Math.round((valor_nuevo - valor_devuelto) * 100) / 100

  // Nunca se devuelve efectivo: si genera saldo a favor, exige cliente.
  if (diferencia < -0.005 && !body.customer_id) {
    res.status(400).json({ error: "El saldo a favor requiere un cliente identificado" })
    return
  }
  // Si se cobra diferencia, el pago debe cubrirla exactamente (sin cambio: un
  // cambio de artículo no maneja vuelto, solo cobra lo que falta).
  if (diferencia > 0.005) {
    const total_pagado = Math.round((pago_efectivo + pago_transferencia + pago_tarjeta + pago_puntos + pago_saldo_cambio) * 100) / 100
    if (total_pagado < diferencia - 0.01) {
      res.status(400).json({ error: `El pago no cubre la diferencia de $${diferencia.toFixed(2)}` })
      return
    }
  }

  const cambiosService: FerremexCambiosService = req.scope.resolve(FERREMEX_CAMBIOS)
  // Se resuelve tanto para GENERAR saldo (diferencia < 0) como para CONSUMIR
  // saldo preexistente al cobrar la diferencia (pago_saldo_cambio > 0) — casos
  // mutuamente excluyentes por signo de `diferencia`, sin riesgo de pisado.
  const saldoCambioService: FerremexSaldoCambioService | null =
    diferencia < -0.005 || (pago_saldo_cambio > 0 && body.customer_id)
      ? req.scope.resolve(FERREMEX_SALDO_CAMBIO)
      : null
  const monederoService: FerremexMonederoService | null =
    pago_puntos > 0 && body.customer_id ? req.scope.resolve(FERREMEX_MONEDERO) : null

  let puntos_canjeados = 0
  if (monederoService && body.customer_id && pago_puntos > 0) {
    try {
      const cfg = await monederoService.getOrCreateConfig()
      const valorPunto = Number(cfg.valor_punto) || 0
      if (valorPunto <= 0) {
        res.status(400).json({ error: "El valor del punto no está configurado" }); return
      }
      // Tope: el pago con puntos no puede exceder max_canje_pct del NUEVO total
      // (valor_nuevo), igual criterio que /caja/ventas usa sobre el total del ticket.
      const topePesos = valor_nuevo * ((Number(cfg.max_canje_pct) || 0) / 100)
      if (pago_puntos > topePesos + 0.01) {
        res.status(400).json({
          error: `Con puntos solo puedes cubrir hasta ${cfg.max_canje_pct}% del artículo nuevo ($${topePesos.toFixed(2)})`,
        }); return
      }
      puntos_canjeados = Math.ceil(pago_puntos / valorPunto)
      const saldo = await monederoService.saldoCliente(body.customer_id)
      if (puntos_canjeados > saldo) {
        res.status(400).json({ error: `Puntos insuficientes: requiere ${puntos_canjeados}, disponible ${saldo}` }); return
      }
    } catch (e: any) {
      console.error("[caja/cambios] Validación de monedero falló:", e?.message ?? e)
      res.status(500).json({ error: "No se pudo validar el monedero" }); return
    }
  }

  if (saldoCambioService && body.customer_id && pago_saldo_cambio > 0) {
    try {
      const saldoDisponible = await saldoCambioService.saldoCliente(body.customer_id)
      if (pago_saldo_cambio > saldoDisponible + 0.01) {
        res.status(400).json({
          error: `Saldo a favor insuficiente: requiere $${pago_saldo_cambio.toFixed(2)}, disponible $${saldoDisponible.toFixed(2)}`,
        }); return
      }
    } catch (e: any) {
      console.error("[caja/cambios] Validación de saldo a favor falló:", e?.message ?? e)
      res.status(500).json({ error: "No se pudo validar el saldo a favor" }); return
    }
  }

  try {
    const resultado = await withFileLock(VENTAS_FILE, async () => {
      // Reintegrar inventario de lo devuelto (best-effort por SKU sin inventory
      // item, igual que /caja/ventas) y validar+descontar stock de lo nuevo.
      const skusDevueltos = lineasDevueltasResueltas.map((l) => l.sku)
      const skusNuevos = lineasNuevasResueltas.map((l) => l.sku)
      const todosSkus = Array.from(new Set([...skusDevueltos, ...skusNuevos]))
      const inventoryItems = await inventoryModule.listInventoryItems(
        { sku: todosSkus },
        { select: ["id", "sku"], take: todosSkus.length + 10 }
      )
      const itemPorSku = new Map(inventoryItems.map((i) => [i.sku, i.id]))
      const niveles = await inventoryModule.listInventoryLevels(
        { inventory_item_id: inventoryItems.map((i) => i.id) },
        { select: ["id", "inventory_item_id", "location_id", "stocked_quantity"], take: inventoryItems.length + 10 }
      )
      const nivelPorItemId = new Map(niveles.map((n) => [n.inventory_item_id, n]))

      // Validar stock disponible de lo nuevo ANTES de tocar nada (no se puede
      // entregar lo que no hay).
      for (const l of lineasNuevasResueltas) {
        const invId = itemPorSku.get(l.sku)
        const nivel = invId ? nivelPorItemId.get(invId) : undefined
        if (!nivel) continue // sin inventory item: se permite igual que /caja/ventas (advertido abajo)
        if (l.cantidad > nivel.stocked_quantity) {
          return {
            error: `Stock insuficiente para "${l.descripcion}": solicitado ${l.cantidad}, disponible ${nivel.stocked_quantity}`,
          } as const
        }
      }

      // RE-VALIDACIÓN de puntos/saldo a favor DENTRO del lock, antes de tocar
      // inventario: el saldo pudo cambiar entre la validación pre-lock y aquí
      // (otra operación concurrente del mismo cliente), igual criterio que /caja/ventas.
      if (monederoService && body.customer_id && puntos_canjeados > 0) {
        const saldoActual = await monederoService.saldoCliente(body.customer_id)
        if (puntos_canjeados > saldoActual) {
          return {
            error: `Puntos insuficientes: requiere ${puntos_canjeados}, disponible ${saldoActual}`,
          } as const
        }
      }
      if (saldoCambioService && body.customer_id && pago_saldo_cambio > 0) {
        const saldoActual = await saldoCambioService.saldoCliente(body.customer_id)
        if (pago_saldo_cambio > saldoActual + 0.01) {
          return {
            error: `Saldo a favor insuficiente: requiere $${pago_saldo_cambio.toFixed(2)}, disponible $${saldoActual.toFixed(2)}`,
          } as const
        }
      }

      const aplicados: { itemId: string; locationId: string; cantidad: number }[] = []
      try {
        // Reintegrar lo devuelto.
        for (const l of lineasDevueltasResueltas) {
          const invId = itemPorSku.get(l.sku)
          const nivel = invId ? nivelPorItemId.get(invId) : undefined
          if (!invId || !nivel) {
            console.warn(`[caja/cambios] SKU sin inventory item, no se reintegra: ${l.sku}`)
            continue
          }
          await inventoryModule.adjustInventory(invId, nivel.location_id, +l.cantidad)
          aplicados.push({ itemId: invId, locationId: nivel.location_id, cantidad: -l.cantidad })
        }
        // Descontar lo nuevo.
        for (const l of lineasNuevasResueltas) {
          const invId = itemPorSku.get(l.sku)
          const nivel = invId ? nivelPorItemId.get(invId) : undefined
          if (!invId || !nivel) {
            console.warn(`[caja/cambios] SKU sin inventory item, no se descuenta: ${l.sku}`)
            continue
          }
          await inventoryModule.adjustInventory(invId, nivel.location_id, -l.cantidad)
          aplicados.push({ itemId: invId, locationId: nivel.location_id, cantidad: +l.cantidad })
        }

        const folio_cambio = generarFolioCambio()
        const fecha = new Date().toISOString()
        let venta_diferencia_folio: string | null = null
        let diferencia_cobrada = 0
        let saldo_generado = 0

        // Diferencia a cobrar: se registra como venta normal enlazada (entra al
        // corte/historial). Reusa el mismo generador de folio que /caja/ventas
        // (comparte contador si el formato es secuencial).
        if (diferencia > 0.005) {
          diferencia_cobrada = diferencia
          venta_diferencia_folio = generarFolioVenta()
          const ventaDiferencia = {
            folio: venta_diferencia_folio,
            fecha,
            cajero,
            turno_id,
            caja_id: body.caja_id ?? null,
            caja_name: body.caja_name ?? null,
            vendedor: body.vendedor ?? cajero,
            items: lineasNuevasResueltas.map((l) => ({
              sku: l.sku,
              descripcion: `${l.descripcion} (diferencia por cambio ${folio_cambio})`,
              cantidad: 1,
              precio_unitario: l.subtotal,
              subtotal: l.subtotal,
            })),
            total: diferencia_cobrada,
            pago_efectivo,
            pago_transferencia,
            pago_tarjeta,
            pago_credito: 0,
            pago_puntos,
            puntos_canjeados,
            pago_saldo_cambio,
            cliente_id: body.customer_id ?? null,
            cliente_nombre: body.cliente_nombre ?? null,
            cambio_origen_folio: folio_cambio,
            cambio: Math.max(0, pago_efectivo - Math.max(0, diferencia_cobrada - pago_transferencia - pago_tarjeta - pago_puntos - pago_saldo_cambio)),
          }
          ventas.push(ventaDiferencia)

          // Monedero: canje de puntos, transaccional con la venta de diferencia
          // (el saldo ya se re-validó arriba antes de tocar inventario).
          if (monederoService && body.customer_id && puntos_canjeados > 0) {
            await monederoService.agregarMovimiento(body.customer_id, {
              tipo: "canjeado",
              puntos: -puntos_canjeados,
              folio: venta_diferencia_folio,
              descripcion: `Canje en cambio ${folio_cambio} (venta ${venta_diferencia_folio})`,
              fecha,
            })
          }
          // Saldo a favor preexistente consumido para cubrir la diferencia
          // (distinto del saldo_generado más abajo, que es cuando el cambio
          // GENERA saldo — mutuamente excluyentes por signo de `diferencia`).
          if (saldoCambioService && body.customer_id && pago_saldo_cambio > 0) {
            await saldoCambioService.agregarMovimiento(body.customer_id, {
              tipo: "consumido",
              monto: -pago_saldo_cambio,
              venta_consumo_folio: venta_diferencia_folio,
              descripcion: `Consumo en cambio ${folio_cambio} (venta ${venta_diferencia_folio})`,
              fecha,
            })
          }
        }

        // Saldo a favor: se acredita transaccional (dentro del lock).
        if (diferencia < -0.005 && saldoCambioService && body.customer_id) {
          saldo_generado = Math.round(Math.abs(diferencia) * 100) / 100
          await saldoCambioService.agregarMovimiento(body.customer_id, {
            tipo: "generado",
            monto: saldo_generado,
            fecha,
            origen_cambio_folio: folio_cambio,
            descripcion: `Saldo a favor por cambio ${folio_cambio} (venta ${venta_origen_folio})`,
          })
        }

        // Marcar la venta original con traza del cambio (visible en SalesHistory).
        const cambiosPrevios = Array.isArray(ventaOrigen.cambios) ? ventaOrigen.cambios : []
        ventas[idxOrigen] = { ...ventaOrigen, cambios: [...cambiosPrevios, folio_cambio] }

        writeJsonAtomic(VENTAS_FILE, ventas)

        const cambio = await cambiosService.registrarCambio(
          {
            folio_cambio,
            venta_origen_folio,
            fecha,
            cajero,
            caja_id: body.caja_id ?? null,
            caja_name: body.caja_name ?? null,
            vendedor: body.vendedor ?? cajero,
            customer_id: body.customer_id ?? null,
            cliente_nombre: body.cliente_nombre ?? null,
            valor_devuelto,
            valor_nuevo,
            diferencia,
            diferencia_cobrada,
            saldo_generado,
            venta_diferencia_folio,
          },
          lineasDevueltasResueltas,
          lineasNuevasResueltas
        )

        return { cambio } as const
      } catch (err) {
        // Compensación: revertir ajustes de inventario ya aplicados.
        for (const a of aplicados) {
          try {
            await inventoryModule.adjustInventory(a.itemId, a.locationId, -a.cantidad)
          } catch (revertErr) {
            console.error(`[caja/cambios] Falló revertir inventario de ${a.itemId}:`, revertErr)
          }
        }
        throw err
      }
    })

    if ("error" in resultado) {
      res.status(400).json({ error: resultado.error })
      return
    }
    res.json(resultado.cambio)
  } catch (err) {
    console.error("[caja/cambios] Error procesando cambio:", err)
    res.status(500).json({ error: "No se pudo procesar el cambio" })
  }
}
