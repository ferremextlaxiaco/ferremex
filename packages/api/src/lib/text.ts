/**
 * text — helpers de normalización de texto compartidos por las rutas /caja/*.
 *
 * Antes, `slugify` y `normalizarFonetico` estaban duplicadas en
 * articulos/route.ts, catalogos/route.ts y productos/route.ts, con regex de
 * diacríticos escritas distinto. Esto podía producir resultados de búsqueda
 * inconsistentes entre la pantalla de venta (usa productos) y el admin (usa
 * articulos). Aquí viven las versiones canónicas.
 */

/**
 * Convierte texto a slug: minúsculas, sin acentos, no-alfanuméricos → "-".
 *
 * `maxLen` se mantiene parametrizable porque los dos call-sites históricos
 * usaban longitudes distintas y cambiarlas alteraría IDs/handles ya generados:
 *   - catalogos/route.ts → 80  (IDs de Dept/Cat/Marca que el frontend usa en joins)
 *   - articulos/route.ts  → 100 (handles de producto Medusa)
 * Pasar el mismo valor que usaba cada ruta preserva su comportamiento exacto.
 */
export function slugify(text: string, maxLen = 100): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
}

/**
 * Normalización fonética para español, de modo que palabras que suenan igual
 * colapsen a la misma forma:
 *   - quita acentos (á→a, é→e…)
 *   - ll → y   (antes que otras reglas)
 *   - qu → k
 *   - c[ei] → s   (ce→se, ci→si)
 *   - z → s, v → b
 *   - h muda → ""
 *   - todo no-alfanumérico → espacio; colapsa espacios
 *
 * Así "cierra"/"sierra" y "pvc"/"pbc" quedan iguales.
 * Se conserva el orden de reglas de la versión original de productos/route.ts.
 */
export function normalizarFonetico(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ll/g, "y")
    .replace(/qu/g, "k")
    .replace(/c(?=[ei])/g, "s")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/h/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
