import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Script: importar-claves-sat.ts
//
// Lee ArticulosClaveSat.xlsx de la raíz del repo y actualiza el campo
// metadata.claveSat de cada producto en Medusa por SKU.
//
// Idempotente: solo actualiza productos cuya claveSat sea diferente.
//
// Uso: bun run importar:claves-sat (desde packages/api)
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

// ArticulosClaveSat.xlsx:
//   Fila 1-4: encabezados del reporte y títulos de columna
//   Fila 5  : encabezados de columna (Clave, Descripción, Precio, Clave SAT)
//   Fila 6+ : datos
const COL_CLAVE    = 0   // Columna A → SKU del artículo
const COL_CLAVESAT = 10  // Columna K → Clave SAT del producto/servicio

export default async function importarClavesSat({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)

  // -------------------------------------------------------------------------
  // 1. Leer ArticulosClaveSat.xlsx
  // -------------------------------------------------------------------------

  const xlsxPath = path.join(process.cwd(), "../../ArticulosClaveSat.xlsx")

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(
      `No se encontró: ${xlsxPath}\n` +
      `Coloca ArticulosClaveSat.xlsx en la raíz del proyecto (c:\\ferremex\\).`
    )
  }

  logger.info("Leyendo ArticulosClaveSat.xlsx...")

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb   = XLSX.readFile(xlsxPath)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // Datos desde fila 6 (índice 5); filas 1-5 son encabezados del reporte
  const dataRows = rows.slice(5).filter((r) => parseStr(r[COL_CLAVE]) !== "")

  // Mapa SKU → claveSat (solo filas con clave SAT no vacía)
  const claveSatPorSku = new Map<string, string>()
  for (const r of dataRows) {
    const sku      = parseStr(r[COL_CLAVE])
    const claveSat = parseStr(r[COL_CLAVESAT])
    if (sku && claveSat) {
      claveSatPorSku.set(sku, claveSat)
    }
  }

  logger.info(`Filas leídas del Excel        : ${dataRows.length}`)
  logger.info(`SKUs con clave SAT asignada   : ${claveSatPorSku.size}`)

  if (claveSatPorSku.size === 0) {
    logger.warn("No se encontraron claves SAT en el archivo. Verifica las columnas (A=SKU, J=ClaveSAT).")
    return
  }

  // -------------------------------------------------------------------------
  // 2. Cargar variantes para obtener SKU → product_id
  // -------------------------------------------------------------------------

  logger.info("Cargando variantes del catálogo...")

  const allVariants = await productModule.listProductVariants(
    {},
    { select: ["id", "sku", "product_id"], take: 999999 }
  )

  logger.info(`Variantes cargadas: ${allVariants.length}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productIdPorSku = new Map<string, string>(
    allVariants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((v: any) => v.sku && v.product_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((v: any) => [v.sku as string, v.product_id as string])
  )

  // -------------------------------------------------------------------------
  // 3. Filtrar SKUs que existen en el catálogo
  // -------------------------------------------------------------------------

  const skusAActualizar = [...claveSatPorSku.keys()].filter((sku) => productIdPorSku.has(sku))

  logger.info(`SKUs con clave SAT que existen en el catálogo: ${skusAActualizar.length}`)

  if (skusAActualizar.length === 0) {
    logger.warn("Ningún SKU del Excel coincide con productos en Medusa.")
    return
  }

  const productIds = [...new Set(skusAActualizar.map((sku) => productIdPorSku.get(sku)!))]

  // Cargar metadata actual en lotes de 500
  logger.info(`Cargando metadata de ${productIds.length} productos...`)

  const metaActual = new Map<string, Record<string, unknown>>()
  for (const lote of chunked(productIds, 500)) {
    const prods = await productModule.listProducts(
      { id: lote },
      { select: ["id", "metadata"], take: lote.length + 10 }
    )
    for (const p of prods) {
      metaActual.set(p.id, (p.metadata ?? {}) as Record<string, unknown>)
    }
  }

  // -------------------------------------------------------------------------
  // 4. Detectar cambios reales (idempotencia)
  // -------------------------------------------------------------------------

  interface Cambio { productId: string; claveSat: string }
  const cambios: Cambio[] = []

  for (const sku of skusAActualizar) {
    const productId     = productIdPorSku.get(sku)!
    const nuevaClave    = claveSatPorSku.get(sku)!
    const claveActual   = String(metaActual.get(productId)?.claveSat ?? "")
    if (claveActual !== nuevaClave) {
      cambios.push({ productId, claveSat: nuevaClave })
    }
  }

  logger.info(`Productos con clave SAT nueva o diferente: ${cambios.length}`)

  if (cambios.length === 0) {
    logger.info("Todas las claves SAT ya estaban actualizadas. Nada que hacer.")
    return
  }

  // -------------------------------------------------------------------------
  // 5. Actualizar en lotes de 100
  // -------------------------------------------------------------------------

  logger.info(`Actualizando ${cambios.length} productos en lotes de 100...`)

  let actualizados = 0
  let errores      = 0

  for (let i = 0; i < Math.ceil(cambios.length / 100); i++) {
    const lote = cambios.slice(i * 100, (i + 1) * 100)

    await Promise.all(
      lote.map(async ({ productId, claveSat }) => {
        try {
          await productModule.updateProducts(productId, { metadata: { claveSat } })
          actualizados++
        } catch (err: unknown) {
          errores++
          logger.error(
            `Error en producto ${productId}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })
    )

    if ((i + 1) % 5 === 0 || i === Math.ceil(cambios.length / 100) - 1) {
      logger.info(`Progreso: ${actualizados + errores}/${cambios.length}`)
    }
  }

  // -------------------------------------------------------------------------
  // Resumen
  // -------------------------------------------------------------------------

  logger.info("=== Importación de claves SAT completada ===")
  logger.info(`  SKUs en Excel con clave SAT   : ${claveSatPorSku.size}`)
  logger.info(`  Coincidencias en catálogo     : ${skusAActualizar.length}`)
  logger.info(`  Productos actualizados        : ${actualizados}`)
  logger.info(`  Errores                       : ${errores}`)
}
