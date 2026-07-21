import { Module } from "@medusajs/framework/utils"
import FerremexComisionesService from "./service"

export const FERREMEX_COMISIONES = "ferremex_comisiones"

export default Module(FERREMEX_COMISIONES, {
  service: FerremexComisionesService,
})
