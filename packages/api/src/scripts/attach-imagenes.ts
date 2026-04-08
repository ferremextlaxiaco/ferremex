import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Script: attach-imagenes.ts
//
// Copia las imágenes de "Imagenes de productos/" a packages/api/static/
// y asigna el thumbnail correspondiente a cada producto por SKU.
//
// Patrón de nombre de archivo: {SKU}s_s_selected{N}.{ext}
// Destino: packages/api/static/{archivo}  → servido en /static/{archivo}
// ---------------------------------------------------------------------------

export default async function attachImagenes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)

  // -------------------------------------------------------------------------
  // 1. Preparar directorios
  // -------------------------------------------------------------------------

  // cwd() cuando se ejecuta con `medusa exec` es packages/api
  const staticDir = path.join(process.cwd(), "static")
  const imagenesDir = path.join(process.cwd(), "../../Imagenes de productos")

  if (!fs.existsSync(imagenesDir)) {
    throw new Error(
      `No se encontró la carpeta: ${imagenesDir}\nColoca "Imagenes de productos" en C:\\ferremex\\`
    )
  }

  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true })
    logger.info(`Carpeta static creada: ${staticDir}`)
  }

  // -------------------------------------------------------------------------
  // 2. Leer imágenes y extraer SKUs
  // -------------------------------------------------------------------------

  const archivos = fs
    .readdirSync(imagenesDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))

  logger.info(`Imágenes encontradas: ${archivos.length}`)

  // Patrón: {SKU}s_s_selected{N}.{ext}  → SKU es todo antes de "s_s_selected"
  const imagenesPorSkuUpper = new Map<string, string>() // SKU_UPPER → filename

  for (const archivo of archivos) {
    const match = archivo.match(/^(.+?)s_s_selected/)
    if (match) {
      const skuUpper = match[1].toUpperCase()
      if (!imagenesPorSkuUpper.has(skuUpper)) {
        imagenesPorSkuUpper.set(skuUpper, archivo)
      }
    }
  }

  logger.info(`SKUs únicos en imágenes: ${imagenesPorSkuUpper.size}`)

  // -------------------------------------------------------------------------
  // 3. Cargar variantes del catálogo (SKU → product_id)
  // -------------------------------------------------------------------------

  logger.info("Cargando variantes del catálogo...")

  const variants = await productModule.listProductVariants(
    {},
    { select: ["id", "sku", "product_id"], take: 999999 }
  )

  const productPorSkuUpper = new Map<string, string>()
  for (const v of variants) {
    if (v.sku) {
      productPorSkuUpper.set(v.sku.toUpperCase(), v.product_id)
    }
  }

  logger.info(`Variantes en catálogo: ${variants.length}`)

  // -------------------------------------------------------------------------
  // 4. Calcular matches y filtrar los ya procesados
  // -------------------------------------------------------------------------

  const matches: Array<{ productId: string; filename: string }> = []
  let sinMatch = 0

  for (const [skuUpper, filename] of imagenesPorSkuUpper.entries()) {
    const productId = productPorSkuUpper.get(skuUpper)
    if (productId) {
      matches.push({ productId, filename })
    } else {
      sinMatch++
    }
  }

  logger.info(`Imágenes con match en catálogo: ${matches.length}`)
  logger.info(`Imágenes sin match (SKU no existe): ${sinMatch}`)

  if (matches.length === 0) {
    logger.info("No hay imágenes para asignar.")
    return
  }

  // Verificar cuáles productos ya tienen thumbnail
  const productIds = [...new Set(matches.map((m) => m.productId))]
  const productos = await productModule.listProducts(
    { id: productIds },
    { select: ["id", "thumbnail"], take: productIds.length }
  )
  const yaConImagen = new Set(productos.filter((p) => p.thumbnail).map((p) => p.id))

  const pendientes = matches.filter((m) => !yaConImagen.has(m.productId))

  logger.info(`Productos ya con imagen: ${yaConImagen.size}`)
  logger.info(`Productos pendientes: ${pendientes.length}`)

  if (pendientes.length === 0) {
    logger.info("Todos los productos ya tienen imagen.")
    return
  }

  // -------------------------------------------------------------------------
  // 5. Copiar imágenes al directorio static y actualizar productos
  // -------------------------------------------------------------------------

  logger.info("Copiando imágenes y actualizando productos...")

  const BASE_URL = "http://localhost:9000/static"

  let procesados = 0
  let errores = 0

  for (const { productId, filename } of pendientes) {
    try {
      const src = path.join(imagenesDir, filename)
      const dest = path.join(staticDir, filename)

      // Copiar solo si no existe ya en static
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest)
      }

      const thumbnailUrl = `${BASE_URL}/${filename}`

      await (productModule as any).updateProducts(productId, { thumbnail: thumbnailUrl })

      procesados++
      if (procesados % 100 === 0 || procesados === pendientes.length) {
        logger.info(`Progreso: ${procesados}/${pendientes.length}`)
      }
    } catch (err: unknown) {
      errores++
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Error con ${filename}: ${msg}`)
    }
  }

  logger.info("=== Asignación de imágenes completada ===")
  logger.info(`  Procesados exitosamente : ${procesados}`)
  logger.info(`  Con error               : ${errores}`)
  logger.info(`  Ya tenían imagen        : ${yaConImagen.size}`)
}
