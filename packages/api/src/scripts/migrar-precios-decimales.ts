import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * MIGRACIÓN ONE-SHOT: sube la precisión de los precios del price set de CENTAVOS
 * (factor 100, 2 decimales) a DIEZMILÉSIMAS (factor 10000, 4 decimales).
 *
 * Por qué: con 2 decimales, un precio CON IVA cerrado (ej. $65) no se podía
 * reconstruir exacto desde el precio SIN IVA guardado (65/1.16=56.03 → ×1.16=64.99).
 * Con 4 decimales (56.0345) sí cuadra a 65.0000. Ver lib/precio.ts (PRECIO_FACTOR).
 *
 * Qué hace: multiplica cada `amount` de precio MXN por 100 (centavos → diezmilésimas).
 * El VALOR EN PESOS NO CAMBIA: 5603 centavos ($56.03) → 560300 diezmilésimas ($56.03).
 *
 * Idempotencia: NO es idempotente por sí solo (correrlo dos veces multiplicaría
 * ×100 de nuevo). Por eso escribe un flag en el price set... como no hay dónde,
 * usa una heurística: si el amount ya es "grande" para el rango esperado, ADVIERTE
 * y NO migra (a menos que se fuerce con args.force). Ejecutar UNA sola vez:
 *   node ...cli.js exec ./src/scripts/migrar-precios-decimales.ts
 *
 * SIEMPRE respaldar la BD antes (pg_dump) — toca todos los precios.
 */
export default async function migrarPreciosDecimales({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModule = container.resolve(Modules.PRICING)

  const FACTOR_CAMBIO = 100 // 100 (centavos) → 10000 (diezmilésimas) = ×100
  // Control por VARIABLE DE ENTORNO (el `exec` de Medusa no pasa flags CLI):
  //   (sin nada)             → DRY-RUN (solo reporta, NO escribe)
  //   MIGRAR_APLICAR=1       → aplica los cambios
  //   MIGRAR_FORCE=1         → migra también los "sospechosos" (amount grande)
  const force = process.env.MIGRAR_FORCE === "1"
  const dryRun = process.env.MIGRAR_APLICAR !== "1"

  logger.info(`[migrar-precios] Iniciando ${dryRun ? "(DRY-RUN)" : ""}${force ? " (FORCE)" : ""}…`)

  // Traer todos los precios MXN de los price sets de variantes.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "price_set.id", "price_set.prices.id", "price_set.prices.amount", "price_set.prices.currency_code"],
    pagination: { take: 100000 },
  })

  let total = 0
  let migrados = 0
  let sospechosos = 0
  const actualizaciones: { id: string; amount: number }[] = []

  for (const v of variants ?? []) {
    const prices: any[] = (v as any)?.price_set?.prices ?? []
    for (const p of prices) {
      if (p.currency_code !== "mxn" || p.amount == null) continue
      total++
      const actual = Number(p.amount) || 0
      const nuevo = actual * FACTOR_CAMBIO

      // Heurística anti-doble-migración: un precio en centavos rara vez supera
      // ~10,000,000 (=$100,000). Si ya es enorme, probablemente YA se migró.
      if (actual > 10_000_000 && !force) {
        sospechosos++
        continue
      }
      actualizaciones.push({ id: p.id, amount: nuevo })
    }
  }

  logger.info(`[migrar-precios] Precios MXN encontrados: ${total}. A migrar: ${actualizaciones.length}. Sospechosos (ya migrados?): ${sospechosos}`)

  if (sospechosos > 0 && !force) {
    logger.warn(`[migrar-precios] ${sospechosos} precios ya parecen migrados (amount muy grande). Si estás seguro, re-ejecuta con --force. ABORTANDO los sospechosos.`)
  }

  if (dryRun) {
    logger.info(`[migrar-precios] DRY-RUN: no se escribió nada. Muestra (primeros 5):`)
    actualizaciones.slice(0, 5).forEach((a) => logger.info(`   price ${a.id}: → ${a.amount} (= $${a.amount / 10000})`))
    return
  }

  // Aplicar con pricingModule.updatePrices([{ id, amount }]) — la misma API que
  // usa el PUT de /caja/articulos. En lotes para no saturar.
  let escritos = 0
  const LOTE = 200
  for (let i = 0; i < actualizaciones.length; i += LOTE) {
    const lote = actualizaciones.slice(i, i + LOTE)
    try {
      // updatePrices existe en runtime (lo usa el PUT de /caja/articulos) pero no
      // en los tipos de IPricingModuleService de esta versión → cast.
      await (pricingModule as any).updatePrices(lote.map((a) => ({ id: a.id, amount: a.amount })))
      escritos += lote.length
    } catch (e: any) {
      logger.error(`[migrar-precios] Falló lote ${i}-${i + lote.length}: ${e?.message ?? e}`)
    }
  }
  migrados = escritos

  logger.info(`[migrar-precios] LISTO. Migrados ${migrados}/${actualizaciones.length} precios a diezmilésimas (×${FACTOR_CAMBIO}).`)
}
