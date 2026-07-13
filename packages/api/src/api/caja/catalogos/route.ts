import fs   from "fs"
import path from "path"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ProductStatus } from "@medusajs/framework/utils"
import { slugify as slugifyText } from "../../../lib/text"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// slugify canónico de lib/text con la longitud histórica de esta ruta (80).
// Preserva los IDs de Dept/Cat/Marca ya generados (el frontend los usa en joins).
function slugify(text: string): string {
  return slugifyText(text, 80)
}

// Batch-update products in chunks to avoid overwhelming the DB connection pool.
async function batchUpdateProducts(
  productModule: any,
  products: any[],
  buildUpdate: (p: any) => Record<string, unknown>,
  batchSize = 100
): Promise<number> {
  let count = 0
  for (let i = 0; i < products.length; i += batchSize) {
    const chunk = products.slice(i, i + batchSize)
    await Promise.all(
      chunk.map((p) => productModule.updateProducts(p.id, buildUpdate(p)))
    )
    count += chunk.length
  }
  return count
}

// Brands that were created in the catalog but have no products yet.
// Stored in data/marcas-extra.json so they survive page reloads.
const MARCAS_EXTRA_PATH = path.join(process.cwd(), "data", "marcas-extra.json")

interface MarcaExtra { nombre: string; cat_nombre: string; dep_nombre: string }

function readMarcasExtra(): MarcaExtra[] {
  try { return JSON.parse(fs.readFileSync(MARCAS_EXTRA_PATH, "utf8")) }
  catch { return [] }
}

function writeMarcasExtra(marcas: MarcaExtra[]): void {
  const dir = path.dirname(MARCAS_EXTRA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(MARCAS_EXTRA_PATH, JSON.stringify(marcas, null, 2))
}

// Departments created in the catalog but with no products yet. Departamento
// is pure metadata (no native Medusa entity), so — same as marcas-extra —
// it needs a side file to "reserve" the name until a product references it.
const DEPTOS_EXTRA_PATH = path.join(process.cwd(), "data", "deptos-extra.json")

function readDeptosExtra(): string[] {
  try { return JSON.parse(fs.readFileSync(DEPTOS_EXTRA_PATH, "utf8")) }
  catch { return [] }
}

function writeDeptosExtra(deptos: string[]): void {
  const dir = path.dirname(DEPTOS_EXTRA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DEPTOS_EXTRA_PATH, JSON.stringify(deptos, null, 2))
}

// Categories created in the catalog but with no products yet. Categoría IS a
// native Medusa ProductCategory, but the GET below only surfaces categories
// that have ≥1 product (it walks products, not categories). A category
// created empty needs this side file so it appears (with 0 artículos) and
// nested under the right departamento (also pure metadata) until a product
// gets assigned to it.
const CATS_EXTRA_PATH = path.join(process.cwd(), "data", "cats-extra.json")

interface CatExtra { nombre: string; dep_nombre: string }

function readCatsExtra(): CatExtra[] {
  try { return JSON.parse(fs.readFileSync(CATS_EXTRA_PATH, "utf8")) }
  catch { return [] }
}

function writeCatsExtra(cats: CatExtra[]): void {
  const dir = path.dirname(CATS_EXTRA_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CATS_EXTRA_PATH, JSON.stringify(cats, null, 2))
}

// ---------------------------------------------------------------------------
// GET /caja/catalogos
// ---------------------------------------------------------------------------

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)

  const [products, categories] = await Promise.all([
    productModule.listProducts(
      { status: ProductStatus.PUBLISHED },
      { select: ["id", "metadata"], take: 99999 }
    ),
    productModule.listProductCategories(
      {},
      { select: ["id", "name"], relations: ["products"], take: 9999 }
    ),
  ])

  const productToCategory = new Map<string, string>()
  const catNameToMedusaId = new Map<string, string>()
  for (const cat of categories as any[]) {
    const catName = (cat.name as string)?.trim() ?? ""
    if (!catName) continue
    if (!catNameToMedusaId.has(catName)) catNameToMedusaId.set(catName, cat.id)
    for (const p of (cat.products ?? []) as any[]) {
      if (p.id && !productToCategory.has(p.id)) productToCategory.set(p.id, catName)
    }
  }

  const deptsCount  = new Map<string, number>()
  const depNames    = new Map<string, string>()
  const catsCount   = new Map<string, number>()
  const catNames    = new Map<string, string>()
  const catParent   = new Map<string, string>()
  const catMedusaId = new Map<string, string>()
  const marCount    = new Map<string, number>()
  const marNames    = new Map<string, string>()
  const marParent   = new Map<string, string>()

  for (const p of products as any[]) {
    const meta      = (p.metadata ?? {}) as Record<string, unknown>
    const depNombre = (meta.departamento as string | undefined)?.trim() ?? ""
    const catNombre = productToCategory.get(p.id) ?? ""
    const marNombre = (meta.marca as string | undefined)?.trim() ?? ""

    if (!depNombre) continue
    const depId = "dep-" + slugify(depNombre)
    deptsCount.set(depId, (deptsCount.get(depId) ?? 0) + 1)
    depNames.set(depId, depNombre)

    if (!catNombre) continue
    const catId = "cat-" + slugify(catNombre) + "--" + slugify(depNombre)
    catsCount.set(catId, (catsCount.get(catId) ?? 0) + 1)
    catNames.set(catId, catNombre)
    catParent.set(catId, depId)
    const medId = catNameToMedusaId.get(catNombre)
    if (medId && !catMedusaId.has(catId)) catMedusaId.set(catId, medId)

    if (!marNombre) continue
    const marId = "mar-" + slugify(marNombre) + "--" + catId
    marCount.set(marId, (marCount.get(marId) ?? 0) + 1)
    marNames.set(marId, marNombre)
    marParent.set(marId, catId)
  }

  // Merge departments created but not yet assigned to any product.
  for (const nombre of readDeptosExtra()) {
    const depId = "dep-" + slugify(nombre)
    if (!deptsCount.has(depId)) {
      deptsCount.set(depId, 0)
      depNames.set(depId, nombre)
    }
  }

  // Merge categories created but not yet assigned to any product. Requires
  // its departamento (real or extra) to already be in the merged map above.
  for (const extra of readCatsExtra()) {
    const depId = "dep-" + slugify(extra.dep_nombre)
    if (!depNames.has(depId)) continue   // department doesn't exist in taxonomy
    const catId = "cat-" + slugify(extra.nombre) + "--" + slugify(extra.dep_nombre)
    if (!catsCount.has(catId)) {
      catsCount.set(catId, 0)
      catNames.set(catId, extra.nombre)
      catParent.set(catId, depId)
    }
  }

  // Merge brands registered in catalog but not yet assigned to products
  for (const extra of readMarcasExtra()) {
    const catId = "cat-" + slugify(extra.cat_nombre) + "--" + slugify(extra.dep_nombre)
    if (!catNames.has(catId)) continue   // category doesn't exist in taxonomy
    const marId = "mar-" + slugify(extra.nombre) + "--" + catId
    if (!marCount.has(marId)) {          // only add if not already present from DB
      marCount.set(marId, 0)
      marNames.set(marId, extra.nombre)
      marParent.set(marId, catId)
    }
  }

  res.json({
    depts:  [...deptsCount.entries()].map(([id, articulos]) => ({ id, nombre: depNames.get(id)!,  articulos })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    cats:   [...catsCount.entries()].map(([id, articulos])  => ({ id, nombre: catNames.get(id)!, depId: catParent.get(id)!, medusaId: catMedusaId.get(id), articulos })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    marcas: [...marCount.entries()].map(([id, articulos])   => ({ id, nombre: marNames.get(id)!,  catId: marParent.get(id)!, articulos })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  })
}

// ---------------------------------------------------------------------------
// PATCH /caja/catalogos — taxonomy mutations
//
//   create_dept  { nombre }
//   create_cat   { nombre, dep_nombre }
//   create_marca { nombre, cat_nombre, dep_nombre }
//   rename_dept  { nombre_actual, nombre_nuevo }
//   rename_cat   { nombre_actual, nombre_nuevo }
//   rename_marca { nombre_actual, nombre_nuevo }
//   move_cat     { cat_nombre, dept_nombre_actual, dept_nombre_nuevo }
//   assign_marca { marca, product_ids[] }
//   reasignar    { product_ids[], departamento?, marca? }
// ---------------------------------------------------------------------------

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const productModule = req.scope.resolve(Modules.PRODUCT)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any
  const op: string = body?.op ?? ""

  // ── create_dept ─────────────────────────────────────────────────────────────
  // Reserva un departamento vacío (sin productos aún). Departamento es pura
  // metadata; se guarda en deptos-extra.json hasta que un producto lo use.
  if (op === "create_dept") {
    const { nombre } = body
    if (!nombre || !String(nombre).trim()) {
      res.status(400).json({ error: "nombre es requerido" }); return
    }
    const nombreTrim = String(nombre).trim()
    const extras = readDeptosExtra()
    if (!extras.includes(nombreTrim)) {
      extras.push(nombreTrim)
      writeDeptosExtra(extras)
    }
    res.json({ ok: true })
    return
  }

  // ── create_cat ──────────────────────────────────────────────────────────────
  // Crea (o reutiliza) la ProductCategory nativa de Medusa por nombre, y la
  // reserva en cats-extra.json anclada a su departamento (metadata) para que
  // el GET la muestre con 0 artículos hasta que un producto la use.
  if (op === "create_cat") {
    const { nombre, dep_nombre } = body
    if (!nombre || !String(nombre).trim() || !dep_nombre || !String(dep_nombre).trim()) {
      res.status(400).json({ error: "nombre y dep_nombre son requeridos" }); return
    }
    const nombreTrim = String(nombre).trim()
    const depNombreTrim = String(dep_nombre).trim()
    const found = await productModule.listProductCategories(
      { name: nombreTrim }, { select: ["id", "name"], take: 1 }
    )
    if (!(found as any[]).length) {
      await productModule.createProductCategories([{ name: nombreTrim, is_active: true }])
    }
    const extras = readCatsExtra()
    const exists = extras.some(c => c.nombre === nombreTrim && c.dep_nombre === depNombreTrim)
    if (!exists) {
      extras.push({ nombre: nombreTrim, dep_nombre: depNombreTrim })
      writeCatsExtra(extras)
    }
    res.json({ ok: true })
    return
  }

  // ── create_marca ────────────────────────────────────────────────────────────
  if (op === "create_marca") {
    const { nombre, cat_nombre, dep_nombre } = body
    if (!nombre || !cat_nombre) {
      res.status(400).json({ error: "nombre y cat_nombre son requeridos" }); return
    }
    const extras = readMarcasExtra()
    const exists = extras.some(m => m.nombre === nombre && m.cat_nombre === cat_nombre)
    if (!exists) {
      extras.push({ nombre, cat_nombre, dep_nombre: dep_nombre ?? "" })
      writeMarcasExtra(extras)
    }
    res.json({ ok: true })
    return
  }

  // ── rename_dept ─────────────────────────────────────────────────────────────
  if (op === "rename_dept") {
    const { nombre_actual, nombre_nuevo } = body
    if (!nombre_actual || !nombre_nuevo) {
      res.status(400).json({ error: "nombre_actual y nombre_nuevo son requeridos" }); return
    }
    const todos = await productModule.listProducts({}, { select: ["id", "metadata"], take: 99999 })
    const targets = (todos as any[]).filter(p => (p.metadata?.departamento as string | undefined)?.trim() === nombre_actual)
    const actualizados = await batchUpdateProducts(productModule, targets, p => ({
      metadata: { ...(p.metadata ?? {}), departamento: nombre_nuevo },
    }))
    // Also update extras file if any brands reference this dept
    const extras = readMarcasExtra()
    const updated = extras.map(m => m.dep_nombre === nombre_actual ? { ...m, dep_nombre: nombre_nuevo } : m)
    writeMarcasExtra(updated)
    res.json({ ok: true, actualizados })
    return
  }

  // ── rename_cat ──────────────────────────────────────────────────────────────
  if (op === "rename_cat") {
    const { nombre_actual, nombre_nuevo } = body
    if (!nombre_actual || !nombre_nuevo) {
      res.status(400).json({ error: "nombre_actual y nombre_nuevo son requeridos" }); return
    }
    const cats = await productModule.listProductCategories({ name: nombre_actual }, { select: ["id"], take: 20 })
    if (!(cats as any[]).length) { res.status(404).json({ error: "Categoría no encontrada" }); return }
    // Firma de un-item (id, data), no array — la forma array lanza en Medusa 2.x.
    await Promise.all((cats as any[]).map(c => productModule.updateProductCategories(c.id, { name: nombre_nuevo })))
    // Update extras file
    const extras = readMarcasExtra()
    writeMarcasExtra(extras.map(m => m.cat_nombre === nombre_actual ? { ...m, cat_nombre: nombre_nuevo } : m))
    res.json({ ok: true, actualizados: (cats as any[]).length })
    return
  }

  // ── rename_marca ────────────────────────────────────────────────────────────
  if (op === "rename_marca") {
    const { nombre_actual, nombre_nuevo } = body
    if (!nombre_actual || !nombre_nuevo) {
      res.status(400).json({ error: "nombre_actual y nombre_nuevo son requeridos" }); return
    }
    const todos = await productModule.listProducts({}, { select: ["id", "metadata"], take: 99999 })
    const targets = (todos as any[]).filter(p => (p.metadata?.marca as string | undefined)?.trim() === nombre_actual)
    const actualizados = await batchUpdateProducts(productModule, targets, p => ({
      metadata: { ...(p.metadata ?? {}), marca: nombre_nuevo },
    }))
    // Update extras
    const extras = readMarcasExtra()
    writeMarcasExtra(extras.map(m => m.nombre === nombre_actual ? { ...m, nombre: nombre_nuevo } : m))
    res.json({ ok: true, actualizados })
    return
  }

  // ── move_cat ────────────────────────────────────────────────────────────────
  if (op === "move_cat") {
    const { cat_nombre, dept_nombre_actual, dept_nombre_nuevo } = body
    if (!cat_nombre || !dept_nombre_nuevo) {
      res.status(400).json({ error: "cat_nombre y dept_nombre_nuevo son requeridos" }); return
    }
    const cats = await productModule.listProductCategories({ name: cat_nombre }, { select: ["id", "name"], relations: ["products"], take: 10 })
    if (!(cats as any[]).length) { res.status(404).json({ error: "Categoría no encontrada" }); return }
    const productIds = (cats as any[]).flatMap(c => ((c.products ?? []) as any[]).map((p: any) => p.id))
    if (!productIds.length) { res.json({ ok: true, actualizados: 0 }); return }
    const catProducts = await productModule.listProducts({ id: productIds }, { select: ["id", "metadata"], take: productIds.length + 10 })
    const targets = dept_nombre_actual
      ? (catProducts as any[]).filter(p => (p.metadata?.departamento as string | undefined)?.trim() === dept_nombre_actual)
      : (catProducts as any[])
    const actualizados = await batchUpdateProducts(productModule, targets, p => ({
      metadata: { ...(p.metadata ?? {}), departamento: dept_nombre_nuevo },
    }))
    res.json({ ok: true, actualizados })
    return
  }

  // ── assign_marca ────────────────────────────────────────────────────────────
  if (op === "assign_marca") {
    const { marca, product_ids } = body
    if (!marca || !Array.isArray(product_ids) || !product_ids.length) {
      res.status(400).json({ error: "marca y product_ids son requeridos" }); return
    }
    const products = await productModule.listProducts({ id: product_ids }, { select: ["id", "metadata"], take: product_ids.length + 10 })
    const actualizados = await batchUpdateProducts(productModule, products as any[], p => ({
      metadata: { ...(p.metadata ?? {}), marca },
    }))
    res.json({ ok: true, actualizados })
    return
  }

  // ── reasignar ───────────────────────────────────────────────────────────────
  // Bulk-assign de hasta 4 campos a una lista de productos: departamento, marca y
  // proveedor (metadata) + categoría (entidad nativa Medusa → category_ids).
  // Cada campo es OPCIONAL: solo se toca lo que venga en el body.
  if (op === "reasignar") {
    const { product_ids, departamento, categoria, marca, proveedor, proveedor_id } = body
    if (!Array.isArray(product_ids) || !product_ids.length) {
      res.status(400).json({ error: "product_ids requeridos" }); return
    }

    // Categoría: resolver (o crear) la categoría nativa por nombre → category_id.
    let categoryId: string | null = null
    if (categoria !== undefined && String(categoria).trim() !== "") {
      const nombreCat = String(categoria).trim()
      const found = await productModule.listProductCategories(
        { name: nombreCat }, { select: ["id", "name"], take: 1 }
      )
      categoryId = (found as any[])[0]?.id
        ?? (await productModule.createProductCategories([{ name: nombreCat, is_active: true }]))[0].id
    }

    const products = await productModule.listProducts({ id: product_ids }, { select: ["id", "metadata"], take: product_ids.length + 10 })
    const actualizados = await batchUpdateProducts(productModule, products as any[], (p) => {
      const meta = { ...(p.metadata ?? {}) } as Record<string, unknown>
      if (departamento) meta.departamento = departamento
      if (marca !== undefined && marca !== "") meta.marca = marca
      // Proveedor: dual-write id + nombre (igual que assign_proveedor / drawer).
      if (proveedor_id !== undefined && proveedor_id !== "") {
        meta.proveedor_id = proveedor_id
        meta.proveedor = proveedor ?? ""
      }
      const update: Record<string, unknown> = { metadata: meta }
      if (categoryId) update.category_ids = [categoryId]
      return update
    })
    // Remove from extras if the brand now has real products
    if (marca) {
      const extras = readMarcasExtra()
      const filtered = extras.filter(m => m.nombre !== marca)
      if (filtered.length !== extras.length) writeMarcasExtra(filtered)
    }
    res.json({ ok: true, actualizados })
    return
  }

  // ── assign_proveedor ──────────────────────────────────────────────────────
  // Bulk-assign a supplier (id + name) to a list of products. Escribe AMBOS:
  // metadata.proveedor_id (vínculo firme al catálogo ferremex_proveedores) y
  // metadata.proveedor (nombre, para mostrar sin consultar). Molde de "reasignar".
  if (op === "assign_proveedor") {
    const { product_ids, proveedor, proveedor_id } = body
    if (!Array.isArray(product_ids) || !product_ids.length) {
      res.status(400).json({ error: "product_ids requeridos" }); return
    }
    if (!proveedor_id) {
      res.status(400).json({ error: "proveedor_id es requerido" }); return
    }
    const products = await productModule.listProducts({ id: product_ids }, { select: ["id", "metadata"], take: product_ids.length + 10 })
    const actualizados = await batchUpdateProducts(productModule, products as any[], (p) => ({
      metadata: { ...(p.metadata ?? {}), proveedor_id, proveedor: proveedor ?? "" },
    }))
    res.json({ ok: true, actualizados })
    return
  }

  res.status(400).json({ error: `Operación desconocida: ${op}` })
}
