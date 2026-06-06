import { MedusaService } from "@medusajs/framework/utils"
import Promocion from "./models/promocion"

/**
 * Service del módulo ferremex_promociones.
 *
 * MedusaService genera el CRUD base (listPromocions, createPromocions,
 * updatePromocions, deletePromocions — OJO: pluralización inglesa de Medusa,
 * "Promocions" no "Promociones"). Las reglas de promoción son simples de
 * persistir; toda la lógica de APLICACIÓN vive en el motor del frontend
 * (apps/pos/src/lib/promociones.ts), así que aquí no añadimos helpers.
 */
class FerremexPromocionesService extends MedusaService({
  Promocion,
}) {}

export default FerremexPromocionesService
