import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { FERREMEX_CARTERA } from "../../../../../modules/ferremex-cartera"
import type FerremexCarteraService from "../../../../../modules/ferremex-cartera/service"

/**
 * POST /caja/cartera/:customerId/limite — cambia el límite de crédito.
 *
 * Dos efectos: (1) registra el cambio en el historial auditable de la cartera,
 * (2) actualiza el valor vigente en `customer.metadata.limite_credito`.
 * No hay transacción distribuida entre el módulo cartera y el Customer: se
 * escribe primero el historial (log auditable) y luego la metadata; si la
 * segunda falla, el historial queda como rastro y se puede reintentar.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { customerId } = req.params
  const body = (req.body ?? {}) as Record<string, unknown>
  const nuevo = Number(body.nuevo)
  if (!Number.isFinite(nuevo) || nuevo < 0) {
    res.status(400).json({ error: "nuevo (límite) debe ser un número >= 0" }); return
  }
  try {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const [customer] = await customerModule.listCustomers({ id: customerId })
    if (!customer) {
      res.status(404).json({ error: "Cliente no encontrado" }); return
    }
    const anterior =
      body.anterior != null
        ? Number(body.anterior)
        : Number((customer as any).metadata?.limite_credito ?? 0)

    const now = new Date()
    const carteraService: FerremexCarteraService = req.scope.resolve(FERREMEX_CARTERA)
    const registro = await carteraService.registrarCambioLimite(customerId, {
      fecha: typeof body.fecha === "string" ? body.fecha : now.toISOString().slice(0, 10),
      usuario: typeof body.usuario === "string" ? body.usuario : "—",
      anterior: Number.isFinite(anterior) ? anterior : 0,
      nuevo,
      nota: typeof body.nota === "string" ? body.nota : "",
    })

    // Actualizar el límite vigente en la metadata del Customer.
    await customerModule.updateCustomers(customerId, {
      metadata: { ...((customer as any).metadata ?? {}), limite_credito: nuevo },
    })

    res.status(201).json(registro)
  } catch (e: any) {
    console.error("[caja/cartera/:customerId/limite] POST error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cambiar el límite" })
  }
}
