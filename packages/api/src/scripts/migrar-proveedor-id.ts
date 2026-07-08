import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { FERREMEX_PROVEEDORES } from "../modules/ferremex-proveedores"
import type FerremexProveedoresService from "../modules/ferremex-proveedores/service"

/**
 * MIGRACIÓN ONE-SHOT (Fase 1 — venta por encargo): vincula el proveedor de cada
 * producto al catálogo real (ferremex_proveedores) escribiendo `metadata.proveedor_id`.
 *
 * Contexto: hasta ahora el producto solo guardaba `metadata.proveedor` (el NOMBRE,
 * texto libre). Para que el pedido automático de un encargo sepa con certeza a qué
 * proveedor comprar, se necesita el ID del catálogo. Este script empareja por
 * NOMBRE EXACTO y escribe el id en los que coinciden.
 *
 * Emparejamiento: exacto (case-sensitive, tal cual está escrito). Los que NO
 * coincidan se DEJAN como están (nombre en texto, sin proveedor_id) y se listan
 * al final para corregirlos a mano desde el drawer de artículos. Nada se adivina.
 *
 * Control por VARIABLE DE ENTORNO (el `exec` de Medusa no pasa flags CLI):
 *   (sin nada)          → DRY-RUN: solo reporta qué haría, NO escribe.
 *   MIGRAR_APLICAR=1    → aplica los cambios.
 *
 * Idempotente: un producto que ya tiene `proveedor_id` se salta. Correrlo dos
 * veces no duplica ni rompe nada.
 *
 * Ejecutar (desde packages/api, con el PATH de PostgreSQL resuelto por launch-api):
 *   node "../../node_modules/.bun/@medusajs+cli@<ver>/.../cli.js" exec ./src/scripts/migrar-proveedor-id.ts
 * SIEMPRE respaldar la BD antes (pg_dump).
 */
export default async function migrarProveedorId({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const proveedoresService: FerremexProveedoresService = container.resolve(FERREMEX_PROVEEDORES)

  const dryRun = process.env.MIGRAR_APLICAR !== "1"
  logger.info(`[migrar-proveedor-id] Iniciando ${dryRun ? "(DRY-RUN)" : "(APLICANDO)"}…`)

  // 1) Catálogo real de proveedores → mapa nombre → id (match exacto).
  const proveedores = await proveedoresService.listProveedors({})
  const porNombre = new Map<string, string>()
  for (const p of proveedores as { id: string; nombre: string }[]) {
    if (p.nombre) porNombre.set(p.nombre, p.id)
  }
  logger.info(`[migrar-proveedor-id] Proveedores en catálogo: ${porNombre.size}`)

  // 2) Todos los productos con su metadata.
  const productos = await productModule.listProducts(
    {},
    { select: ["id", "title", "metadata"], take: 100000 }
  )
  logger.info(`[migrar-proveedor-id] Productos totales: ${productos.length}`)

  let yaVinculados = 0
  let sinProveedor = 0
  const aVincular: { id: string; title: string; nombre: string; provId: string; meta: Record<string, unknown> }[] = []
  const sinMatch = new Map<string, number>() // nombre → cuántos productos lo usan

  for (const prod of productos) {
    const meta = (prod.metadata ?? {}) as Record<string, unknown>
    const nombre = typeof meta.proveedor === "string" ? meta.proveedor.trim() : ""
    const yaId = typeof meta.proveedor_id === "string" ? meta.proveedor_id.trim() : ""

    if (yaId) { yaVinculados++; continue }        // idempotencia: ya tiene id
    if (!nombre) { sinProveedor++; continue }      // sin proveedor: nada que vincular

    const provId = porNombre.get(nombre)
    if (provId) {
      aVincular.push({ id: prod.id, title: prod.title ?? "", nombre, provId, meta })
    } else {
      sinMatch.set(nombre, (sinMatch.get(nombre) ?? 0) + 1)
    }
  }

  logger.info(
    `[migrar-proveedor-id] Ya vinculados: ${yaVinculados} · Sin proveedor: ${sinProveedor} · ` +
    `A vincular (match exacto): ${aVincular.length} · Nombres sin coincidencia: ${sinMatch.size}`
  )

  // 3) Reporte de los que NO coinciden (para corregir a mano).
  if (sinMatch.size > 0) {
    logger.warn(`[migrar-proveedor-id] PROVEEDORES SIN COINCIDENCIA en el catálogo (revisar/crear en el catálogo o corregir el nombre del producto):`)
    for (const [nombre, cuantos] of [...sinMatch.entries()].sort((a, b) => b[1] - a[1])) {
      logger.warn(`   · "${nombre}" — ${cuantos} producto(s)`)
    }
  }

  if (dryRun) {
    logger.info(`[migrar-proveedor-id] DRY-RUN: no se escribió nada. Muestra de vínculos (primeros 5):`)
    aVincular.slice(0, 5).forEach((a) => logger.info(`   "${a.title}" → proveedor "${a.nombre}" (id ${a.provId})`))
    logger.info(`[migrar-proveedor-id] Para aplicar: MIGRAR_APLICAR=1 <mismo comando>`)
    return
  }

  // 4) Aplicar: merge de metadata (preservar TODO lo existente) + proveedor_id.
  //    Forma de UN item por llamada (updateProducts([{id,...}]) lanza "Product.0").
  let escritos = 0
  for (const a of aVincular) {
    try {
      await productModule.updateProducts(a.id, {
        metadata: { ...a.meta, proveedor_id: a.provId },
      })
      escritos++
    } catch (e) {
      logger.error(`[migrar-proveedor-id] Falló "${a.title}" (${a.id}): ${(e as Error)?.message ?? e}`)
    }
  }

  logger.info(`[migrar-proveedor-id] LISTO. Vinculados ${escritos}/${aVincular.length} productos a su proveedor_id.`)
  if (sinMatch.size > 0) {
    logger.warn(`[migrar-proveedor-id] Quedan ${sinMatch.size} nombre(s) sin vincular (ver lista arriba). Corrígelos en el drawer de artículos.`)
  }
}
