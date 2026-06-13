import { Module } from "@medusajs/framework/utils"
import FerremexMonederoService from "./service"

export const FERREMEX_MONEDERO = "ferremex_monedero"

export default Module(FERREMEX_MONEDERO, {
  service: FerremexMonederoService,
})
