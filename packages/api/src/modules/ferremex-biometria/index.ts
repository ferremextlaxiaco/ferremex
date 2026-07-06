import { Module } from "@medusajs/framework/utils"
import FerremexBiometriaService from "./service"

export const FERREMEX_BIOMETRIA = "ferremex_biometria"

export default Module(FERREMEX_BIOMETRIA, {
  service: FerremexBiometriaService,
})
