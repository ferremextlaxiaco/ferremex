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

/**
 * Sanea la entrada de un teléfono: deja SOLO dígitos y trunca a 10 (formato de
 * número mexicano a 10 dígitos). Se usa en el onChange de todos los inputs de
 * teléfono del POS para que solo se puedan capturar 10 números.
 * Uso: onChange={(e) => setTel(soloTelefono(e.target.value))}
 */
export function soloTelefono(valor: string): string {
  return (valor || "").replace(/\D/g, "").slice(0, 10)
}
