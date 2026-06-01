import { Module } from "@medusajs/framework/utils"
import FerremexComprasService from "./service"

export const FERREMEX_COMPRAS = "ferremex_compras"

export default Module(FERREMEX_COMPRAS, {
  service: FerremexComprasService,
})
