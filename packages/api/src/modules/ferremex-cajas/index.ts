import { Module } from "@medusajs/framework/utils"
import FerremexCajasService from "./service"

export const FERREMEX_CAJAS = "ferremex_cajas"

export default Module(FERREMEX_CAJAS, {
  service: FerremexCajasService,
})
