import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Script: reparar-inventario.ts
//
// Corrige el inventario importado con import-productos.ts.
// El módulo productModule.createProducts() no crea inventory items
// automáticamente — eso solo lo hace el workflow HTTP.
//
// Este script:
//  1. Lee existencias del Excel original
//  2. Crea InventoryItem por cada variant que no tenga uno
//  3. Linkea variant ↔ inventory_item via remoteLink
//  4. Crea InventoryLevel para los que tienen existencia > 0
// ---------------------------------------------------------------------------

function parseNum(val: unknown): number {
  const n = parseFloat(String(val ?? "0"))
  return isNaN(n) ? 0 : n
}

function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export default async function repararInventario({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const remoteLink = container.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  // -------------------------------------------------------------------------
  // 1. Leer existencias del Excel
  // -------------------------------------------------------------------------

  const xlsxPath = path.join(process.cwd(), "../../articulosExportados.xlsx")

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`No se encontró articulosExportados.xlsx en: ${xlsxPath}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  // Columna 0 = CLAVE (SKU), columna 14 = EXISTENCIA
  const existenciaPorSku = new Map<string, number>()
  for (const row of rawRows.slice(1)) {
    const sku = String(row[0] ?? "").trim()
    if (sku) {
      existenciaPorSku.set(sku, parseNum(row[14]))
    }
  }
  logger.info(`Artículos leídos del Excel: ${existenciaPorSku.size}`)

  // -------------------------------------------------------------------------
  // 2. Obtener todos los variants del catálogo
  // -------------------------------------------------------------------------

  logger.info("Cargando variantes del catálogo...")
  const variants = await productModule.listProductVariants(
    {},
    { select: ["id", "sku"], take: 999999 }
  )
  logger.info(`Variantes en catálogo: ${variants.length}`)

  // -------------------------------------------------------------------------
  // 3. Detectar qué variants ya tienen inventory_item linkeado
  // -------------------------------------------------------------------------

  logger.info("Verificando inventory items existentes...")

  const existingItems = await inventoryModule.listInventoryItems(
    {},
    { select: ["id", "sku"], take: 999999 }
  )
  const existingSkus = new Set(existingItems.map((i) => i.sku).filter(Boolean))
  logger.info(`Inventory items existentes: ${existingItems.length}`)

  // Variants que no tienen inventory item todavía
  const variantsSinItem = variants.filter(
    (v) => v.sku && !existingSkus.has(v.sku)
  )
  logger.info(`Variants sin inventory item: ${variantsSinItem.length}`)

  if (variantsSinItem.length === 0) {
    logger.info("Todos los variants ya tienen inventory item.")
  }

  // -------------------------------------------------------------------------
  // 4. Crear inventory items en lotes de 200
  // -------------------------------------------------------------------------

  let itemsCreados = 0
  const skuToItemId = new Map<string, string>(
    existingItems.filter((i) => i.sku).map((i) => [i.sku!, i.id])
  )

  if (variantsSinItem.length > 0) {
    logger.info("Creando inventory items...")
    const lotes = chunked(variantsSinItem, 200)

    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i]
      try {
        const created = await inventoryModule.createInventoryItems(
          lote.map((v) => ({
            sku: v.sku!,
            title: v.sku!,
            requires_shipping: true,
          }))
        )
        for (let j = 0; j < created.length; j++) {
          skuToItemId.set(lote[j].sku!, created[j].id)
        }
        itemsCreados += created.length
      } catch (err: unknown) {
        logger.error(`Error creando items en lote ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
      }

      if ((i + 1) % 10 === 0 || i === lotes.length - 1) {
        logger.info(`Items creados: ${itemsCreados}/${variantsSinItem.length}`)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. Crear links variant ↔ inventory_item
  // -------------------------------------------------------------------------

  logger.info("Creando links variant ↔ inventory_item...")

  // Construir la lista de links a crear
  const linksACrear: Array<{ variantId: string; itemId: string }> = []

  for (const v of variants) {
    if (!v.sku) continue
    const itemId = skuToItemId.get(v.sku)
    if (itemId) {
      linksACrear.push({ variantId: v.id, itemId })
    }
  }

  logger.info(`Links a crear: ${linksACrear.length}`)

  let linksCreados = 0
  const lotesLinks = chunked(linksACrear, 200)

  for (let i = 0; i < lotesLinks.length; i++) {
    const lote = lotesLinks[i]
    try {
      await (remoteLink as any).create(
        lote.map(({ variantId, itemId }) => ({
          [Modules.PRODUCT]: { variant_id: variantId },
          [Modules.INVENTORY]: { inventory_item_id: itemId },
        }))
      )
      linksCreados += lote.length
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // Si el link ya existe, ignorar el error
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already")) {
        linksCreados += lote.length // contar como ok
      } else {
        logger.error(`Error en links lote ${i + 1}: ${msg}`)
      }
    }

    if ((i + 1) % 10 === 0 || i === lotesLinks.length - 1) {
      logger.info(`Links procesados: ${linksCreados}/${linksACrear.length}`)
    }
  }

  // -------------------------------------------------------------------------
  // 6. Crear inventory levels para variantes con existencia > 0
  // -------------------------------------------------------------------------

  const [stockLocation] = await stockLocationModule.listStockLocations({}, { take: 1 })
  if (!stockLocation) {
    logger.error("No se encontró ningún almacén. Ejecuta el seed primero.")
    return
  }
  logger.info(`Almacén: "${stockLocation.name}" (${stockLocation.id})`)

  // Ver qué levels ya existen
  const levelsExistentes = await inventoryModule.listInventoryLevels(
    { location_id: stockLocation.id },
    { select: ["inventory_item_id"], take: 999999 }
  )
  const itemsConLevel = new Set(levelsExistentes.map((l) => l.inventory_item_id))
  logger.info(`Inventory levels ya existentes: ${levelsExistentes.length}`)

  // Construir los niveles a crear
  const nivelesACrear: Array<{
    inventory_item_id: string
    location_id: string
    stocked_quantity: number
  }> = []

  for (const [sku, existencia] of existenciaPorSku.entries()) {
    if (existencia <= 0) continue
    const itemId = skuToItemId.get(sku)
    if (!itemId) continue
    if (itemsConLevel.has(itemId)) continue
    nivelesACrear.push({
      inventory_item_id: itemId,
      location_id: stockLocation.id,
      stocked_quantity: Math.round(existencia),
    })
  }

  logger.info(`Inventory levels a crear: ${nivelesACrear.length}`)

  let nivelesCreados = 0
  const lotesNiveles = chunked(nivelesACrear, 200)

  for (const lote of lotesNiveles) {
    try {
      await inventoryModule.createInventoryLevels(lote)
      nivelesCreados += lote.length
    } catch (err: unknown) {
      logger.error(`Error creando niveles: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  logger.info(`Inventory levels creados: ${nivelesCreados}`)

  // -------------------------------------------------------------------------
  // Resumen
  // -------------------------------------------------------------------------

  logger.info("=== Reparación de inventario completada ===")
  logger.info(`  Inventory items creados : ${itemsCreados}`)
  logger.info(`  Links creados           : ${linksCreados}`)
  logger.info(`  Inventory levels creados: ${nivelesCreados}`)
}
