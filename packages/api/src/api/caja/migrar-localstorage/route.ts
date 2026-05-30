import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { clientePOSACustomer, type ClientePOS } from "../clientes/_mapper"
import { listarClientesPOS, asignarGrupo, POS_FLAG } from "../clientes/route"
import { FERREMEX_CARTERA } from "../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../modules/ferremex-cartera/service"

/**
 * POST /caja/migrar-localstorage — migración one-shot de los datos que cada
 * terminal tiene en localStorage (pos_clientes, pos_grupos, pos_cartera) a la BD.
 *
 * Idempotente:
 *  - Un cliente se identifica por `num_cliente`. Si ya existe un Customer POS con
 *    ese num_cliente, NO se crea de nuevo (se reusa su id para el remapeo).
 *  - La cartera de un cliente se migra solo si el Customer destino aún no tiene
 *    movimientos (evita duplicar al re-ejecutar).
 *
 * Remapeo de ids: los movimientos de `pos_cartera` están indexados por el id
 * LOCAL del cliente (p.ej. "demo-001" o un uuid). Se remapean al `customer.id`
 * real de Medusa vía `num_cliente`.
 *
 * Body: { clientes: ClientePOS[], grupos?: string[], cartera?: Record<idLocal, CartEntrada> }
 */

interface Movimiento {
  tipo: "compra" | "pago"; monto: number; fecha: string
  folio?: string; plazo?: number; descripcion?: string; nota?: string
}
interface NotaCartera { fecha: string; hora: string; autor: string; texto: string }
interface HistorialLimite { fecha: string; usuario: string; anterior: number; nuevo: number; nota: string }
interface CartEntrada { movimientos?: Movimiento[]; notas?: NotaCartera[]; historialLimite?: HistorialLimite[] }

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    clientes?: (ClientePOS & { id?: string })[]
    grupos?: string[]
    cartera?: Record<string, CartEntrada>
  }
  const clientesIn = Array.isArray(body.clientes) ? body.clientes : []
  const gruposIn = Array.isArray(body.grupos) ? body.grupos : []
  const carteraIn = body.cartera ?? {}

  const resumen = {
    clientes_creados: 0,
    clientes_omitidos: 0,
    grupos_creados: 0,
    carteras_migradas: 0,
    carteras_omitidas: 0,
    movimientos: 0,
    huerfanos: [] as string[], // ids locales de cartera sin cliente correspondiente
  }

  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)

    // 1) Grupos: crear los que falten (marcados como POS).
    if (gruposIn.length) {
      const existentes = await customerModule.listCustomerGroups({}, { take: null })
      const yaExisten = new Set(existentes.map((g: any) => g.name))
      for (const name of gruposIn) {
        if (typeof name === "string" && name.trim() && !yaExisten.has(name)) {
          await customerModule.createCustomerGroups({ name, metadata: { pos_grupo: true } })
          resumen.grupos_creados++
        }
      }
    }

    // 2) Clientes: upsert por num_cliente. Construir mapa idLocal -> customer.id.
    const existentesPOS = await listarClientesPOS(req)
    const porNumCliente = new Map(existentesPOS.map((c) => [c.num_cliente, c.id]))
    const mapaIdLocalACustomer = new Map<string, string>()

    for (const cli of clientesIn) {
      const idLocal = cli.id ?? cli.num_cliente
      const yaExiste = cli.num_cliente && porNumCliente.has(cli.num_cliente)
      if (yaExiste) {
        mapaIdLocalACustomer.set(idLocal, porNumCliente.get(cli.num_cliente)!)
        resumen.clientes_omitidos++
        continue
      }
      const mapped = clientePOSACustomer(cli)
      const created = await customerModule.createCustomers({
        first_name: mapped.first_name,
        phone: mapped.phone,
        metadata: { ...mapped.metadata, [POS_FLAG]: true },
      })
      await asignarGrupo(req, created.id, cli.grupo)
      mapaIdLocalACustomer.set(idLocal, created.id)
      if (cli.num_cliente) porNumCliente.set(cli.num_cliente, created.id)
      resumen.clientes_creados++
    }

    // 3) Cartera: por cada entrada, remapear idLocal -> customer.id y migrar si el
    //    Customer destino no tiene movimientos todavía (idempotencia).
    for (const [idLocal, entrada] of Object.entries(carteraIn)) {
      const customerId = mapaIdLocalACustomer.get(idLocal)
      if (!customerId) {
        resumen.huerfanos.push(idLocal)
        continue
      }
      const existente = await carteraService.getCarteraCompleta(customerId)
      if (existente.movimientos.length > 0) {
        resumen.carteras_omitidas++
        continue
      }
      for (const m of entrada.movimientos ?? []) {
        await carteraService.agregarMovimiento(customerId, {
          tipo: m.tipo === "pago" ? "pago" : "compra",
          monto: Number(m.monto) || 0,
          fecha: m.fecha,
          folio: m.folio ?? null,
          plazo: m.plazo != null ? Number(m.plazo) : null,
          descripcion: m.descripcion ?? "",
          nota: m.nota ?? null,
        })
        resumen.movimientos++
      }
      for (const n of entrada.notas ?? []) {
        await carteraService.agregarNota(customerId, {
          fecha: n.fecha, hora: n.hora, autor: n.autor, texto: n.texto,
        })
      }
      for (const h of entrada.historialLimite ?? []) {
        await carteraService.registrarCambioLimite(customerId, {
          fecha: h.fecha, usuario: h.usuario,
          anterior: Number(h.anterior) || 0, nuevo: Number(h.nuevo) || 0, nota: h.nota,
        })
      }
      resumen.carteras_migradas++
    }

    res.json({ ok: true, resumen })
  } catch (e: any) {
    console.error("[caja/migrar-localstorage] error:", e?.message ?? e)
    res.status(500).json({ error: "Falló la migración", detalle: e?.message ?? String(e), resumen })
  }
}
