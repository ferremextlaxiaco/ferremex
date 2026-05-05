import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Script: actualizar-localizacion.ts
//
// Lee la columna "Loc." (col 11) de RepExistencias.xlsx y actualiza el campo
// metadata.localizacion de cada producto en Medusa.
//
// Idempotente: se puede volver a correr sin duplicar datos. Si la localización
// del Excel ya coincide con la que está en Medusa, no hace nada.
//
// Uso: bun run actualizar:localizacion (desde packages/api)
// ---------------------------------------------------------------------------

function parseStr(val: unknown): string {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// Índices de columna en RepExistencias.xlsx (fila 4 = encabezados, datos desde fila 5)
const COL_CLAVE = 0   // "Clave"
const COL_LOC   = 11  // "Loc."

export default async function actualizarLocalizacion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)

  // -------------------------------------------------------------------------
  // 1. Leer RepExistencias.xlsx
  // -------------------------------------------------------------------------

  const xlsxPath = path.join(process.cwd(), "../../RepExistencias.xlsx")

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(
      `No se encontró el archivo: ${xlsxPath}\n` +
      `Coloca RepExistencias.xlsx en la raíz del proyecto (c:\\ferremex\\).`
    )
  }

  logger.info("Leyendo RepExistencias.xlsx...")

  // xlsx es CJS — usar require() para evitar problemas de interop con Medusa
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // Los datos empiezan en la fila 5 (índice 5); la fila 4 es el encabezado
  const dataRows = rows.slice(5).filter((r) => parseStr(r[COL_CLAVE]) !== "")

  // Construir mapa SKU → localizacion (solo filas con localización no vacía)
  const locPorSku = new Map<string, string>()
  for (const r of dataRows) {
    const sku = parseStr(r[COL_CLAVE])
    const loc = parseStr(r[COL_LOC])
    if (sku && loc) {
      locPorSku.set(sku, loc)
    }
  }

  logger.info(`Filas leídas del Excel         : ${dataRows.length}`)
  logger.info(`SKUs con localización asignada : ${locPorSku.size}`)

  if (locPorSku.size === 0) {
    logger.info("No hay localizaciones para actualizar en el Excel. Saliendo.")
    return
  }

  // -------------------------------------------------------------------------
  // 2. Cargar todos los variants para obtener SKU → product_id
  // -------------------------------------------------------------------------

  logger.info("Cargando variantes del catálogo...")

  const allVariants = await productModule.listProductVariants(
    {},
    { select: ["id", "sku", "product_id"], take: 999999 }
  )

  logger.info(`Variantes cargadas: ${allVariants.length}`)

  // Mapa SKU → product_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productIdPorSku = new Map<string, string>(
    allVariants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((v: any) => v.sku && v.product_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((v: any) => [v.sku as string, v.product_id as string])
  )

  // -------------------------------------------------------------------------
  // 3. Determinar qué productos necesitan actualización
  //    Cargar metadata actual de los productos afectados para comparar
  // -------------------------------------------------------------------------

  // Filtrar solo los SKUs del Excel que existen en el catálogo
  const skusAActualizar = [...locPorSku.keys()].filter((sku) => productIdPorSku.has(sku))

  logger.info(`SKUs con localización que existen en el catálogo: ${skusAActualizar.length}`)

  if (skusAActualizar.length === 0) {
    logger.warn("Ningún SKU del Excel coincide con productos en Medusa. Revisa que articulosExportados.xlsx esté actualizado.")
    return
  }

  // Obtener los product_ids únicos
  const productIds = [...new Set(skusAActualizar.map((sku) => productIdPorSku.get(sku)!))]

  // Cargar metadata actual en lotes de 500
  logger.info(`Cargando metadata de ${productIds.length} productos...`)

  const productosActuales = new Map<string, Record<string, unknown>>()
  const lotesIds = chunked(productIds, 500)

  for (const lote of lotesIds) {
    const prods = await productModule.listProducts(
      { id: lote },
      { select: ["id", "metadata"], take: lote.length + 10 }
    )
    for (const p of prods) {
      productosActuales.set(p.id, (p.metadata ?? {}) as Record<string, unknown>)
    }
  }

  // -------------------------------------------------------------------------
  // 4. Detectar cuáles realmente cambiaron (idempotencia)
  // -------------------------------------------------------------------------

  interface Cambio {
    productId: string
    localizacion: string
  }

  const cambios: Cambio[] = []

  for (const sku of skusAActualizar) {
    const productId = productIdPorSku.get(sku)!
    const nuevaLoc = locPorSku.get(sku)!
    const metaActual = productosActuales.get(productId)
    const locActual = String(metaActual?.localizacion ?? "")

    if (locActual !== nuevaLoc) {
      cambios.push({ productId, localizacion: nuevaLoc })
    }
  }

  logger.info(`Productos con localización nueva o distinta: ${cambios.length}`)

  if (cambios.length === 0) {
    logger.info("Todas las localizaciones ya estaban actualizadas. Nada que hacer.")
    return
  }

  // -------------------------------------------------------------------------
  // 5. Actualizar en lotes de 100
  // -------------------------------------------------------------------------

  logger.info(`Actualizando ${cambios.length} productos en lotes de 100...`)

  const lotes = chunked(cambios, 100)
  let actualizados = 0
  let errores = 0

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i]

    // Actualizar cada uno individualmente (updateProducts(id, data) — no la forma array)
    await Promise.all(
      lote.map(async ({ productId, localizacion }) => {
        try {
          await productModule.updateProducts(productId, {
            metadata: { localizacion },
          })
          actualizados++
        } catch (err: unknown) {
          errores++
          logger.error(
            `Error actualizando producto ${productId}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })
    )

    if ((i + 1) % 5 === 0 || i === lotes.length - 1) {
      logger.info(`Progreso: ${actualizados + errores}/${cambios.length} procesados`)
    }
  }

  // -------------------------------------------------------------------------
  // Resumen
  // -------------------------------------------------------------------------

  logger.info("=== Actualización de localización completada ===")
  logger.info(`  SKUs en Excel con localización : ${locPorSku.size}`)
  logger.info(`  Coincidencias en catálogo      : ${skusAActualizar.length}`)
  logger.info(`  Productos actualizados         : ${actualizados}`)
  logger.info(`  Errores                        : ${errores}`)
}
