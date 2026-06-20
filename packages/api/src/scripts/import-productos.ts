import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"
import { pesosAAmount } from "../lib/precio"

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface ArticuloSicar {
  clave: string
  claveAlterna: string | null
  descripcion: string
  servicio: boolean
  invMin: number
  invMax: number
  precioCompra: number
  precio1: number
  precio2: number
  mayoreo2: number
  precio3: number
  mayoreo3: number
  precio4: number
  mayoreo4: number
  existencia: number
  peso: number
  caracteristicas: string | null
  departamento: string | null
  categoria: string | null
  receta: boolean
  granel: boolean
  impuesto: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
}

function parseBool(val: unknown): boolean {
  if (typeof val === "boolean") return val
  if (typeof val === "string") return val.trim().toUpperCase() === "S" || val.trim().toLowerCase() === "true"
  return false
}

function parseNum(val: unknown): number {
  const n = parseFloat(String(val ?? "0"))
  return isNaN(n) ? 0 : n
}

function parseStr(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === "") return null
  return String(val).trim()
}

// Divide un array en lotes de tamaño n
function chunked<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// ---------------------------------------------------------------------------
// Script principal
// ---------------------------------------------------------------------------

export default async function importProductos({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)

  // -------------------------------------------------------------------------
  // 1. Leer y parsear el Excel
  // -------------------------------------------------------------------------

  const xlsxPath = path.join(__dirname, "../../../../articulosExportados.xlsx")

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`No se encontró el archivo: ${xlsxPath}\nColoca articulosExportados.xlsx en la raíz del proyecto (c:\\ferremex\\).`)
  }

  logger.info("Leyendo articulosExportados.xlsx...")

  // xlsx es un módulo CJS — usar require para evitar problemas de interop ESM
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  // La primera fila es el encabezado
  const articulosRaw = rawRows.slice(1).filter((r) => r[0] && String(r[0]).trim() !== "")

  const articulos: ArticuloSicar[] = articulosRaw.map((r) => ({
    clave: String(r[0]).trim(),
    claveAlterna: parseStr(r[1]),
    descripcion: String(r[2] ?? "").trim() || String(r[0]).trim(),
    servicio: parseBool(r[3]),
    invMin: parseNum(r[4]),
    invMax: parseNum(r[5]),
    precioCompra: parseNum(r[6]),
    precio1: parseNum(r[7]),
    precio2: parseNum(r[8]),
    mayoreo2: parseNum(r[9]),
    precio3: parseNum(r[10]),
    mayoreo3: parseNum(r[11]),
    precio4: parseNum(r[12]),
    mayoreo4: parseNum(r[13]),
    existencia: parseNum(r[14]),
    peso: parseNum(r[15]),
    caracteristicas: parseStr(r[16]),
    departamento: parseStr(r[17]),
    categoria: parseStr(r[18]),
    receta: parseBool(r[19]),
    granel: parseBool(r[20]),
    impuesto: parseBool(r[21]),
  }))

  logger.info(`Total artículos leídos del Excel: ${articulos.length}`)

  // -------------------------------------------------------------------------
  // 2. Crear categorías (campo CATEGORIA — 41 únicas)
  // -------------------------------------------------------------------------

  logger.info("Creando categorías de productos...")

  const nombresCategoria = [
    ...new Set(articulos.map((a) => a.categoria).filter(Boolean) as string[]),
  ].sort()

  // Obtener categorías que ya existen
  const categoriasExistentes = await productModule.listProductCategories(
    { name: nombresCategoria },
    { take: nombresCategoria.length + 50 }
  )
  const existentesPorNombre = new Map(categoriasExistentes.map((c) => [c.name, c.id]))

  // Crear las que faltan
  const faltantes = nombresCategoria.filter((n) => !existentesPorNombre.has(n))
  if (faltantes.length > 0) {
    const nuevas = await productModule.createProductCategories(
      faltantes.map((name) => ({ name, is_active: true }))
    )
    nuevas.forEach((c) => existentesPorNombre.set(c.name, c.id))
    logger.info(`Categorías creadas: ${nuevas.length}`)
  } else {
    logger.info("Todas las categorías ya existen.")
  }

  // Categoría de respaldo para artículos sin categoría
  let sinCategoriaId: string | null = null
  const sinCatName = "SIN CATEGORIA"
  if (!existentesPorNombre.has(sinCatName)) {
    const [sc] = await productModule.createProductCategories([
      { name: sinCatName, is_active: true },
    ])
    sinCategoriaId = sc.id
    existentesPorNombre.set(sinCatName, sc.id)
  } else {
    sinCategoriaId = existentesPorNombre.get(sinCatName)!
  }

  // -------------------------------------------------------------------------
  // 3. Detectar SKUs ya importados (idempotencia)
  // -------------------------------------------------------------------------

  logger.info("Verificando artículos ya importados...")

  // Medusa no permite filtrar variants directamente en listProducts con skus fácilmente,
  // así que consultamos los variants existentes en lotes
  const variantsExistentes = await productModule.listProductVariants(
    {},
    { select: ["sku"], take: 999999 }
  )
  const skusExistentes = new Set(variantsExistentes.map((v) => v.sku).filter(Boolean))

  logger.info(`SKUs ya en el sistema: ${skusExistentes.size}`)

  const articulosNuevos = articulos.filter((a) => !skusExistentes.has(a.clave))
  logger.info(`Artículos nuevos a importar: ${articulosNuevos.length}`)

  if (articulosNuevos.length === 0) {
    logger.info("No hay artículos nuevos. Importación completada.")
    return
  }

  // -------------------------------------------------------------------------
  // 4. Importar productos en lotes de 100
  // -------------------------------------------------------------------------

  // Para handles únicos necesitamos verificar duplicados dentro del lote
  const handlesUsados = new Set<string>()

  function buildHandle(articulo: ArticuloSicar): string {
    let base = slugify(articulo.clave)
    if (!base) base = "articulo"
    let handle = base
    let i = 1
    while (handlesUsados.has(handle)) {
      handle = `${base}-${i++}`
    }
    handlesUsados.add(handle)
    return handle
  }

  const lotes = chunked(articulosNuevos, 100)
  let totalImportados = 0
  let totalErrores = 0

  logger.info(`Importando en ${lotes.length} lotes de hasta 100 artículos...`)

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i]

    try {
      const productosData = lote.map((a) => {
        const categoriaId = a.categoria
          ? (existentesPorNombre.get(a.categoria) ?? sinCategoriaId!)
          : sinCategoriaId!

        const prices: { amount: number; currency_code: string }[] = []
        if (a.precio1 > 0) {
          prices.push({ amount: pesosAAmount(a.precio1), currency_code: "mxn" })
        }

        return {
          title: a.descripcion,
          handle: buildHandle(a),
          status: ProductStatus.PUBLISHED,
          category_ids: [categoriaId],
          weight: a.peso > 0 ? Math.round(a.peso * 1000) : undefined, // kg → gramos
          metadata: {
            departamento: a.departamento ?? "",
            granel: a.granel,
            impuesto: a.impuesto,
            precio_compra: a.precioCompra,
            precio2: a.precio2,
            mayoreo2: a.mayoreo2,
            precio3: a.precio3,
            mayoreo3: a.mayoreo3,
            precio4: a.precio4,
            mayoreo4: a.mayoreo4,
          },
          variants: [
            {
              title: a.descripcion,
              sku: a.clave,
              barcode: a.claveAlterna ?? undefined,
              manage_inventory: true,
              allow_backorder: false,
              prices,
            },
          ],
        }
      })

      await productModule.createProducts(productosData)
      totalImportados += lote.length
    } catch (err: unknown) {
      totalErrores += lote.length
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`Error en lote ${i + 1}: ${msg}`)
    }

    if ((i + 1) % 5 === 0 || i === lotes.length - 1) {
      logger.info(`Progreso: ${totalImportados + totalErrores}/${articulosNuevos.length} artículos procesados`)
    }
  }

  logger.info(`Importación de productos completada. Importados: ${totalImportados} | Errores: ${totalErrores}`)

  // -------------------------------------------------------------------------
  // 5. Crear niveles de inventario para artículos con existencia > 0
  // -------------------------------------------------------------------------

  const articulosConStock = articulosNuevos.filter((a) => a.existencia > 0)

  if (articulosConStock.length === 0) {
    logger.info("No hay artículos nuevos con existencia para registrar.")
    return
  }

  logger.info(`Configurando inventario para ${articulosConStock.length} artículos con existencia...`)

  // Obtener el stock location (creado por seed.ts)
  const [stockLocation] = await stockLocationModule.listStockLocations({}, { take: 1 })
  if (!stockLocation) {
    logger.warn("No se encontró ningún almacén. Ejecuta el seed primero. Saltando niveles de inventario.")
    return
  }

  logger.info(`Usando almacén: "${stockLocation.name}"`)

  // Obtener los inventory items recién creados para los SKUs con stock
  const skusConStock = new Set(articulosConStock.map((a) => a.clave))

  // Buscar los variants recién creados para esos SKUs
  const variantsConStock = await productModule.listProductVariants(
    { sku: [...skusConStock] },
    { select: ["id", "sku"], take: skusConStock.size + 100 }
  )

  // Obtener inventory items vinculados a esos variants
  const inventoryItems = await inventoryModule.listInventoryItems(
    { sku: [...skusConStock] },
    { select: ["id", "sku"], take: skusConStock.size + 100 }
  )

  // Verificar cuáles ya tienen nivel de inventario en este almacén
  const niveleExistentes = await inventoryModule.listInventoryLevels(
    { location_id: stockLocation.id },
    { select: ["inventory_item_id"], take: 999999 }
  )
  const itemsConNivel = new Set(niveleExistentes.map((n) => n.inventory_item_id))

  // Mapa SKU → existencia para asignar cantidades
  const existenciaPorSku = new Map(articulosConStock.map((a) => [a.clave, a.existencia]))

  const nivelesACrear = inventoryItems
    .filter((item) => item.sku && !itemsConNivel.has(item.id))
    .map((item) => ({
      inventory_item_id: item.id,
      location_id: stockLocation.id,
      stocked_quantity: Math.round(existenciaPorSku.get(item.sku!) ?? 0),
    }))

  if (nivelesACrear.length > 0) {
    const lotesInv = chunked(nivelesACrear, 200)
    for (const loteInv of lotesInv) {
      await inventoryModule.createInventoryLevels(loteInv)
    }
    logger.info(`Niveles de inventario creados: ${nivelesACrear.length}`)
  } else {
    logger.info("Todos los niveles de inventario ya existían.")
  }

  logger.info("=== Importación Fase 1 completada ===")
  logger.info(`  Productos importados : ${totalImportados}`)
  logger.info(`  Con stock asignado   : ${nivelesACrear.length}`)
  logger.info(`  Errores              : ${totalErrores}`)
}
