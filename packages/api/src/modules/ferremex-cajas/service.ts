import { MedusaService } from "@medusajs/framework/utils"
import Caja from "./models/caja"

/**
 * Service del módulo ferremex_cajas.
 *
 * MedusaService genera el CRUD base (listCajas, createCajas, updateCajas,
 * deleteCajas). El catálogo de cajas es simple, así que no añadimos helpers de
 * negocio: las rutas /caja/cajas usan el CRUD generado directamente.
 */
class FerremexCajasService extends MedusaService({
  Caja,
}) {}

export default FerremexCajasService
