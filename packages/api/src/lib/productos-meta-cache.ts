// ---------------------------------------------------------------------------
// Cache en memoria (por proceso) de productos publicados con su metadata.
//
// Varios bloques de /caja/articulos y /caja/catalogos/articulos cargan TODO
// el catálogo publicado (select id/title/thumbnail/weight/metadata, sin
// relaciones) para filtrar en JS por departamento/marca/etc. Con ~46k
// productos esa consulta tarda varios segundos — aceptable UNA vez, pero
// notorio si se repite cada vez que expira un TTL corto (el modal "Ver
// artículos" de Catálogos quedaba lento justo cuando el cache expiraba a
// mitad de sesión). Como el catálogo cambia con MUY poca frecuencia frente a
// la tasa de lecturas, usamos un TTL largo (la caché se refresca sola cada
// tanto) MÁS invalidación activa (invalidarProductosMetaCache) en cada
// create/update/delete de producto o reasignación masiva de catálogos — así
// nunca sirve datos obsoletos sin depender de que expire un TTL corto.
// ---------------------------------------------------------------------------

const TTL_MS = 30 * 60_000

let cache: { data: any[]; expira: number } | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
let enVuelo: Promise<any[]> | null = null // eslint-disable-line @typescript-eslint/no-explicit-any

/** Productos PUBLISHED con id/title/thumbnail/weight/metadata (sin relaciones). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function productosPublicadosMeta(productModule: any): Promise<any[]> {
  const ahora = Date.now()
  if (cache && cache.expira > ahora) return cache.data
  if (enVuelo) return enVuelo

  const promesa: Promise<any[]> = productModule // eslint-disable-line @typescript-eslint/no-explicit-any
    .listProducts(
      { status: "published" },
      { select: ["id", "title", "thumbnail", "weight", "metadata"], take: 99999 }
    )
    .then((data: any[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      cache = { data, expira: Date.now() + TTL_MS }
      enVuelo = null
      return data
    })
    .catch((err: unknown) => {
      enVuelo = null
      throw err
    })

  enVuelo = promesa
  return promesa
}

/** Invalida el cache (llamar tras crear/editar/eliminar un producto o su metadata). */
export function invalidarProductosMetaCache(): void {
  cache = null
}
