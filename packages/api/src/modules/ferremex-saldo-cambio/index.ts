import { Module } from "@medusajs/framework/utils"
import FerremexSaldoCambioService from "./service"

export const FERREMEX_SALDO_CAMBIO = "ferremex_saldo_cambio"

export default Module(FERREMEX_SALDO_CAMBIO, {
  service: FerremexSaldoCambioService,
})
