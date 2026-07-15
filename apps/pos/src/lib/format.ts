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

/**
 * Sanea la entrada de un monto decimal escrito a mano: deja solo dígitos y UN
 * punto decimal (convierte comas a punto, descarta puntos/comas adicionales).
 * Usar SIEMPRE con `type="text" inputMode="decimal"`, nunca `type="number"`:
 * el input number en locale es-MX renderiza/acepta COMA como separador decimal
 * (aunque el `value` HTML interno use punto), lo que confunde al cajero — el
 * campo debe verse y capturarse siempre con punto, sin importar el locale del
 * navegador/OS. Uso: onChange={(e) => setMonto(saneaMontoDecimal(e.target.value))}
 */
export function saneaMontoDecimal(raw: string): string {
  const soloNumero = raw.replace(",", ".").replace(/[^0-9.]/g, "")
  const partes = soloNumero.split(".")
  if (partes.length <= 1) return soloNumero
  return `${partes[0]}.${partes.slice(1).join("")}`
}
