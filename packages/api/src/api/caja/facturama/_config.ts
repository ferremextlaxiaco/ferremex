import * as path from "path"
import { readJson, writeJsonAtomic } from "../../../lib/json-store"
import type { CfdiGlobalInformation } from "../../../lib/facturama"

/**
 * Configuración de facturación del POS (NO credenciales — esas viven en .env).
 * Persistida en data/facturacion-config.json. La usan: la global (serie/folio/
 * periodicidad), la nominativa (serie), los reenvíos (correo del contador).
 *
 * Las credenciales y el emisor de Facturama NUNCA están aquí; se leen del .env
 * vía lib/facturama.ts.
 */

export interface ConfigFacturacion {
  /** Serie para facturas nominativas (opcional; Facturama numera si falta). */
  serie_nominativa: string
  /** Serie para facturas globales. */
  serie_global: string
  /** Periodicidad por defecto de la global (01 Diario … 05 Bimestral). */
  periodicidad_global: CfdiGlobalInformation["Periodicity"]
  /** Correo del contador (default para reenvíos por correo). */
  correo_contador: string
}

const CONFIG_FILE = path.join(__dirname, "../../../../data/facturacion-config.json")

const DEFAULTS: ConfigFacturacion = {
  serie_nominativa: "",
  serie_global: "",
  periodicidad_global: "01",
  correo_contador: "",
}

export function leerConfigFacturacion(): ConfigFacturacion {
  const guardado = readJson<Partial<ConfigFacturacion>>(CONFIG_FILE, {})
  return { ...DEFAULTS, ...guardado }
}

export function guardarConfigFacturacion(parcial: Partial<ConfigFacturacion>): ConfigFacturacion {
  const actual = leerConfigFacturacion()
  const periodicidades = ["01", "02", "03", "04", "05"]
  const nueva: ConfigFacturacion = {
    serie_nominativa: String(parcial.serie_nominativa ?? actual.serie_nominativa).trim(),
    serie_global: String(parcial.serie_global ?? actual.serie_global).trim(),
    periodicidad_global: periodicidades.includes(String(parcial.periodicidad_global))
      ? (parcial.periodicidad_global as ConfigFacturacion["periodicidad_global"])
      : actual.periodicidad_global,
    correo_contador: String(parcial.correo_contador ?? actual.correo_contador).trim(),
  }
  writeJsonAtomic(CONFIG_FILE, nueva)
  return nueva
}
