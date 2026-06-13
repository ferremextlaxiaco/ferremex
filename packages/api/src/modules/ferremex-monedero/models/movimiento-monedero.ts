import { model } from "@medusajs/framework/utils"

/**
 * Un movimiento del monedero de un cliente: el "estado de cuenta" de puntos.
 * Patrón idéntico a MovimientoCartera (auditable, soft-cancel). El SALDO de un
 * cliente = suma de `puntos` de sus movimientos NO cancelados.
 *
 * No hay entidad raíz por cliente (a diferencia de la cartera): cada movimiento
 * lleva su `customer_id` directo. Esto simplifica el get-or-create (no hace
 * falta crear una cuenta antes del primer movimiento) y el cálculo del saldo es
 * un simple filtro+suma por customer_id.
 *
 * Convención de signo de `puntos`:
 *   ganado   → positivo (compra que generó puntos)
 *   canjeado → negativo (puntos usados como pago)
 *   ajuste   → +/- (corrección manual del admin)
 *   vencido  → negativo (caducidad)
 *   reset    → negativo (lleva el saldo a 0; monto = -saldo previo)
 */
const MovimientoMonedero = model.define("monedero_movimiento", {
  id: model.id().primaryKey(),
  // id del Customer nativo de Medusa (cus_...).
  customer_id: model.text(),
  tipo: model.enum(["ganado", "canjeado", "ajuste", "vencido", "reset"]),
  puntos: model.number(),
  // Folio de la venta que originó el movimiento (trazabilidad). null para
  // ajustes/reset manuales.
  folio: model.text().nullable(),
  descripcion: model.text(),
  fecha: model.text(), // ISO timestamp
  // Soft-cancel (mismo patrón que cartera): no se borra, deja de contar en el
  // saldo y queda rastro. Aplica al revertir un "ganado" si se cancela su venta.
  cancelado: model.boolean().default(false),
  motivo_cancelacion: model.text().nullable(),
  fecha_cancelacion: model.text().nullable(),
})

export default MovimientoMonedero
