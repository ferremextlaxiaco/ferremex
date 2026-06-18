import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FERREMEX_COMPRAS } from "../../../../modules/ferremex-compras"
import type FerremexComprasService from "../../../../modules/ferremex-compras/service"
import { FERREMEX_FACTURABLE } from "../../../../modules/ferremex-facturable"
import type FerremexFacturableService from "../../../../modules/ferremex-facturable/service"
import { aCompraPOS } from "../route"

/** /caja/compras/:id — cancelación de una compra. */

/**
 * PATCH /caja/compras/:id — cancela una compra (estado → Cancelada + auditoría).
 * Body: { estado: "Cancelada", motivo }. Idempotente: si ya está cancelada, no
 * sobreescribe el motivo/fecha originales. El descuento de inventario lo hace el
 * frontend (ConsultarCompras vía incrementarInventario con deltas negativos),
 * como ya ocurría con localStorage.
 */
export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  try {
    const service: FerremexComprasService = req.scope.resolve(FERREMEX_COMPRAS)
    const [compra] = await service.listCompras({ id })
    if (!compra) {
      res.status(404).json({ error: "Compra no encontrada" }); return
    }
    const body = (req.body ?? {}) as { estado?: string; motivo?: string }
    if (body.estado !== "Cancelada") {
      res.status(400).json({ error: "Solo se admite estado 'Cancelada'" }); return
    }
    const motivo = String(body.motivo ?? "").trim()
    if (motivo.length < 5) {
      res.status(400).json({ error: "El motivo debe tener al menos 5 caracteres" }); return
    }
    // Idempotente: si ya está cancelada, devolverla sin re-escribir la auditoría.
    if ((compra as any).estado !== "Cancelada") {
      await service.updateCompras({
        id,
        estado: "Cancelada",
        cancelada_el: new Date().toISOString(),
        motivo_cancelacion: motivo,
      })

      // Reversa del SALDO FACTURABLE: si la compra cancelada era "Con Factura",
      // las piezas que sumó al saldo facturable se restan (ya no hay respaldo
      // fiscal). Cargamos sus artículos para conocer cantidades por SKU.
      // Best-effort: no debe impedir la cancelación de la compra.
      const tipo = ((compra as any).tipo ?? "Factura").toString().trim().toLowerCase()
      if (tipo === "factura") {
        try {
          const facturable: FerremexFacturableService = req.scope.resolve(FERREMEX_FACTURABLE)
          const [conArts] = await service.listarComprasConArticulos({ id })
          const folioRef = String((compra as any).folio ?? "")
          for (const a of (conArts as any)?.articulos ?? []) {
            const sku = (a.codigo ?? "").toString().trim()
            const cant = Number(a.cantidad) || 0
            if (!sku || cant <= 0) continue
            // Resta del saldo (movimiento "ajuste" negativo, motivo claro).
            await facturable.aplicarMovimiento({
              sku,
              tipo: "ajuste",
              cantidad: -cant,
              folio_ref: folioRef,
              motivo: `Cancelación de compra con factura ${folioRef}`,
            })
          }
        } catch (e: any) {
          console.error("[caja/compras/:id] reversa de saldo facturable falló:", e?.message ?? e)
        }
      }
    }
    const [actualizada] = await service.listarComprasConArticulos({ id })
    res.json(aCompraPOS(actualizada))
  } catch (e: any) {
    console.error("[caja/compras/:id] PATCH error:", e?.message ?? e)
    res.status(500).json({ error: "No se pudo cancelar la compra" })
  }
}
