import { Module } from "@medusajs/framework/utils"
import FerremexCarteraService from "./service"

export const FERREMEX_CARTERA = "ferremex_cartera"

export default Module(FERREMEX_CARTERA, {
  service: FerremexCarteraService,
})
