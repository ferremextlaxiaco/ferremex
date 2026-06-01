import { Module } from "@medusajs/framework/utils"
import FerremexProveedoresService from "./service"

export const FERREMEX_PROVEEDORES = "ferremex_proveedores"

export default Module(FERREMEX_PROVEEDORES, {
  service: FerremexProveedoresService,
})
