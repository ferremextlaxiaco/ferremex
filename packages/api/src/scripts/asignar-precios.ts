/**
 * asignar-precios.ts
 *
 * Crea price sets en el módulo Pricing y los vincula a las variantes de producto.
 * Necesario porque productModule.createProducts() directo no crea price sets.
 *
 * Fuente de precios: articulosExportados.xlsx (mismo Excel del import)
 * Precio usado: precio1 (precio de mostrador)
 *
 * Es idempotente: solo crea price sets para variantes que no tienen ninguno aún.
 *
 * Ejecutar: cd packages/api && bun run asignar:precios
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"
import { pesosAAmount } from "../lib/precio"

function parseNum(val: unknown): number {
  const n = parseFloat(String(val ?? "0"))
  return isNaN(n) ? 0 : n
}

function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export default async function asignarPrecios({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const pricingModule = container.resolve(Modules.PRICING)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  // ---------------------------------------------------------------------------
  // 1. Leer precios del Excel
  // ---------------------------------------------------------------------------

  const xlsxPath = path.join(__dirname, "../../../../articulosExportados.xlsx")
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`No se encontró: ${xlsxPath}`)
  }

  logger.info("Leyendo articulosExportados.xlsx...")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  // Construir mapa SKU → precio1 en centavos
  const precioPorSku = new Map<string, number>()
  for (const r of rawRows.slice(1)) {
    const clave = String(r[0] ?? "").trim()
    if (!clave) continue
    const precio1 = parseNum(r[7]) // columna H = precio1
    if (precio1 > 0) {
      precioPorSku.set(clave, pesosAAmount(precio1))
    }
  }
  logger.info(`Precios en Excel: ${precioPorSku.size} artículos con precio > 0`)

  // ---------------------------------------------------------------------------
  // 2. Cargar todas las variantes del sistema
  // ---------------------------------------------------------------------------

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // ---------------------------------------------------------------------------
  // 2. Detectar variantes con y sin price set (via query.graph cross-módulo)
  // ---------------------------------------------------------------------------

  logger.info("Cargando variantes y detectando cuáles ya tienen price set...")

  const { data: todasLasVariantes } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "price_set.id"],
    pagination: { take: 999999 },
  })

  logger.info(`Total variantes en sistema: ${todasLasVariantes.length}`)

  const variantesConPriceSet = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    todasLasVariantes.filter((v: any) => v.price_set?.id).map((v: any) => v.id)
  )

  logger.info(`Variantes ya con price set: ${variantesConPriceSet.size}`)

  // Filtrar solo las que necesitan price set Y tienen precio en el Excel
  const variantesSinPrecio = todasLasVariantes.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (v: any) => v.sku && !variantesConPriceSet.has(v.id) && precioPorSku.has(v.sku)
  )

  logger.info(`Variantes a las que se asignará precio: ${variantesSinPrecio.length}`)

  if (variantesSinPrecio.length === 0) {
    logger.info("Todos los precios ya están asignados. Nada que hacer.")
    return
  }

  // ---------------------------------------------------------------------------
  // 4. Crear price sets y vincular a variantes (en lotes de 200)
  // ---------------------------------------------------------------------------

  const lotes = chunked(variantesSinPrecio, 200)
  let totalCreados = 0

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i]

    // Crear price sets en lote
    const priceSets = await pricingModule.createPriceSets(
      lote.map((v) => ({
        prices: [
          {
            amount: precioPorSku.get(v.sku!)!,
            currency_code: "mxn",
          },
        ],
      }))
    )

    // Vincular cada variant_id → price_set_id
    await remoteLink.create(
      lote.map((v, idx) => ({
        [Modules.PRODUCT]: { variant_id: v.id },
        [Modules.PRICING]: { price_set_id: priceSets[idx].id },
      }))
    )

    totalCreados += lote.length

    if (i % 10 === 0 || i === lotes.length - 1) {
      logger.info(`  Lote ${i + 1}/${lotes.length} — ${totalCreados} price sets creados`)
    }
  }

  logger.info(`✅ Precios asignados: ${totalCreados} variantes con price set en MXN`)
}
