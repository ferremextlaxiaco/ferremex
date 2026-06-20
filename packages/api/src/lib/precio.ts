/**
 * Conversión entre PESOS (lo que maneja el POS) y el `amount` del price set de
 * Medusa, centralizada en un solo lugar para que nunca quede inconsistente.
 *
 * El price set guarda el precio como ENTERO en la subunidad. Históricamente eran
 * centavos (factor 100 = 2 decimales). Se subió a DIEZMILÉSIMAS (factor 10000 = 4
 * decimales) para que un precio CON IVA cerrado (ej. $65) se pueda reconstruir
 * exacto desde el precio SIN IVA guardado: 65/1.16 = 56.0345 → ×1.16 = 65.0000.
 * Con 2 decimales (56.03) daba 64.99 (perdía 1 centavo).
 *
 * IMPORTANTE: si se cambia PRECIO_FACTOR, hay que migrar los `amount` existentes
 * en la BD (multiplicar/dividir por el cambio de factor). Ver script
 * scripts/migrar-precios-decimales.ts.
 */

/** Subunidades por peso en el price set. 10000 = diezmilésimas (4 decimales). */
export const PRECIO_FACTOR = 10000

/** Pesos (con hasta 4 decimales) → amount entero del price set. */
export function pesosAAmount(pesos: number): number {
  return Math.round((Number(pesos) || 0) * PRECIO_FACTOR)
}

/** amount entero del price set → pesos (con hasta 4 decimales). */
export function amountAPesos(amount: number | undefined | null): number {
  if (amount === undefined || amount === null) return 0
  return (Number(amount) || 0) / PRECIO_FACTOR
}
