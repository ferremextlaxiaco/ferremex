import { Module } from "@medusajs/framework/utils"
import FerremexCambiosService from "./service"

export const FERREMEX_CAMBIOS = "ferremex_cambios"

export default Module(FERREMEX_CAMBIOS, {
  service: FerremexCambiosService,
})
