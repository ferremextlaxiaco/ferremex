/** Formateo compartido del POS. */

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Formatea un número como moneda MXN: $1,234.56.
 * Unifica las cuatro variantes que existían (formatMXN / fmt / fmtPeso) en
 * CashMovementsModule, SalesHistory, CarteraCredito y ModalCobro.
 */
export function formatMXN(n: number): string {
  return MXN.format(Number(n) || 0)
}

/** Formatea el valor absoluto como MXN (útil para mostrar montos sin signo). */
export function formatMXNAbs(n: number): string {
  return MXN.format(Math.abs(Number(n) || 0))
}
