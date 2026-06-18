import { Module } from "@medusajs/framework/utils"
import FerremexFacturableService from "./service"

export const FERREMEX_FACTURABLE = "ferremex_facturable"

export default Module(FERREMEX_FACTURABLE, {
  service: FerremexFacturableService,
})
