import { Module } from "@medusajs/framework/utils"
import FerremexPromocionesService from "./service"

export const FERREMEX_PROMOCIONES = "ferremex_promociones"

export default Module(FERREMEX_PROMOCIONES, {
  service: FerremexPromocionesService,
})
