/** Utilidades pequeñas compartidas por el POS. */

/**
 * Genera un id pseudo-único para uso en el cliente (keys de React, ids locales
 * de borradores). NO usar como id de negocio: esos los asigna el backend.
 * Antes estaba duplicado como `uuid`/`uid` en varios módulos.
 */
export function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
