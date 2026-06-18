/**
 * Mapeo de una venta del POS al body de POST /3/cfdis (CFDI 4.0).
 *
 * Lógica fiscal delicada (leer con cuidado):
 *
 * 1. PRECIOS CON IVA INCLUIDO. En el POS, cuando un artículo tiene
 *    `aplicarIva=true`, su precio de venta YA incluye el 16%. El CFDI, en cambio,
 *    exige el desglose: Subtotal (sin IVA) + IVA por separado, con Total =
 *    Subtotal + IVA. Por eso este mapper hace el "desglose inverso": dado un
 *    precio con IVA, calcula base = precio / 1.16 e iva = precio − base.
 *    Artículos sin IVA (`aplicarIva=false`) van con TaxObject "01" (no objeto)
 *    y sin nodo de impuestos.
 *
 * 2. REDONDEO. El SAT valida que ImporteImpuesto == Base * Tasa con tolerancia de
 *    1 centavo, y que la suma de los conceptos cuadre con el total del comprobante.
 *    Redondeamos cada línea a 2 decimales y dejamos que Facturama valide el total.
 *
 * El mapper es PURO: no toca la BD. Recibe la venta y los datos fiscales de cada
 * artículo ya resueltos (clave SAT, clave de unidad, si lleva IVA) en un mapa por
 * SKU. La ruta es quien hidrata ese mapa consultando el catálogo.
 *
 * Doc: https://apisandbox.facturama.mx/guias/api-web/cfdi/factura
 *      https://apisandbox.facturama.mx/guias/cfdi40/publico-general
 */

import type {
  CrearCfdiInput,
  CfdiItem,
  CfdiReceiver,
  CfdiGlobalInformation,
  FacturamaEmisor,
} from "./facturama"

const IVA_RATE = 0.16

/** Receptor genérico para factura global / público en general. */
export const RECEPTOR_PUBLICO = {
  Rfc: "XAXX010101000",
  Name: "PUBLICO EN GENERAL",
  CfdiUse: "S01",       // sin efectos fiscales
  FiscalRegime: "616",  // sin obligaciones fiscales
} as const

/** Redondeo a 2 decimales (centavos) evitando errores de coma flotante. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ─── Tipos de entrada ───────────────────────────────────────────────────────

/** Un item de venta tal como se persiste en ventas-pos.json. */
export interface ItemVentaCFDI {
  sku: string
  descripcion: string
  cantidad: number
  /** Precio unitario tal como se cobró (CON IVA si el artículo lo aplica). */
  precio_unitario: number
}

/** Datos fiscales de un artículo, resueltos del catálogo por la ruta. */
export interface DatosFiscalesArticulo {
  claveSat: string       // ClaveProdServ
  claveUnidad: string    // ClaveUnidad (catálogo SAT). Default H87 (pieza).
  unidadNombre?: string  // p.ej. "Pieza" (informativo)
  aplicaIva: boolean     // si el precio del artículo incluye 16%
}

/** Resolvedor de datos fiscales por SKU. Si no hay datos, usa fallbacks seguros. */
export type ResolverFiscal = (sku: string) => DatosFiscalesArticulo | undefined

/** Datos del receptor nominativo (cliente con RFC). */
export interface ReceptorNominativo {
  rfc: string
  nombre: string        // razón social EXACTA (mayúsculas, sin "S.A. de C.V.")
  regimenFiscal: string // c_RegimenFiscal del receptor
  usoCfdi: string       // c_UsoCFDI compatible con su régimen
  cp: string            // DomicilioFiscalReceptor (CP 5 dígitos)
}

// Fallbacks cuando un artículo no tiene clave SAT registrada. Mantienen el
// timbrado posible (clave genérica "Venta") en vez de romperlo, pero la ruta
// debería advertir/bloquear según la política (la factura global desglosada
// exige claves reales).
const CLAVE_SAT_GENERICA = "01010101" // "No existe en el catálogo" / venta genérica
const CLAVE_UNIDAD_DEFAULT = "H87"    // Pieza

// ─── Construcción de conceptos (Items) ──────────────────────────────────────

/**
 * Convierte una línea de venta en un concepto CFDI, desglosando el IVA hacia
 * atrás si el artículo lo incluye. Devuelve también el subtotal/iva calculados
 * para poder advertir o sumar.
 */
function lineaACfdiItem(item: ItemVentaCFDI, fiscal: DatosFiscalesArticulo | undefined): CfdiItem {
  const claveSat = fiscal?.claveSat?.trim() || CLAVE_SAT_GENERICA
  const claveUnidad = fiscal?.claveUnidad?.trim() || CLAVE_UNIDAD_DEFAULT
  const aplicaIva = fiscal?.aplicaIva ?? false

  const cantidad = item.cantidad
  const importeCobrado = r2(item.precio_unitario * cantidad) // total de la línea (con IVA si aplica)

  if (!aplicaIva) {
    // Sin IVA: Subtotal == Total, no es objeto de impuesto.
    const subtotal = importeCobrado
    return {
      ProductCode: claveSat,
      UnitCode: claveUnidad,
      Unit: fiscal?.unidadNombre,
      Description: item.descripcion,
      IdentificationNumber: item.sku,
      Quantity: cantidad,
      UnitPrice: r2(item.precio_unitario),
      Subtotal: subtotal,
      TaxObject: "01", // no objeto de impuesto
      Total: subtotal,
    }
  }

  // Con IVA incluido → desglose inverso por LÍNEA (no por unidad) para que el
  // redondeo cuadre con lo realmente cobrado.
  const base = r2(importeCobrado / (1 + IVA_RATE))
  const iva = r2(importeCobrado - base)
  const precioUnitarioSinIva = r2(base / cantidad)

  return {
    ProductCode: claveSat,
    UnitCode: claveUnidad,
    Unit: fiscal?.unidadNombre,
    Description: item.descripcion,
    IdentificationNumber: item.sku,
    Quantity: cantidad,
    UnitPrice: precioUnitarioSinIva,
    Subtotal: base,
    TaxObject: "02", // sí objeto de impuesto
    Taxes: [
      {
        Name: "IVA",
        Rate: IVA_RATE,
        Base: base,
        Total: iva,
        IsRetention: false,
        IsFederalTax: true,
      },
    ],
    Total: r2(base + iva),
  }
}

/** Construye los conceptos de una lista de items + reporta SKUs sin clave SAT. */
export function construirConceptos(
  items: ItemVentaCFDI[],
  resolver: ResolverFiscal
): { conceptos: CfdiItem[]; skusSinClave: string[] } {
  const skusSinClave: string[] = []
  const conceptos = items.map((it) => {
    const fiscal = resolver(it.sku)
    if (!fiscal?.claveSat?.trim()) skusSinClave.push(it.sku)
    return lineaACfdiItem(it, fiscal)
  })
  return { conceptos, skusSinClave }
}

// ─── Forma de pago → c_FormaPago ────────────────────────────────────────────

/**
 * Determina la FormaPago SAT del comprobante a partir de los montos de la venta.
 * Si hay varios métodos, predomina el de mayor importe (un CFDI lleva una sola
 * FormaPago a nivel comprobante). 99 = "Por definir" como último recurso.
 */
export function formaPagoDeVenta(v: {
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_credito?: number
  pago_puntos?: number
}): string {
  const candidatos: [string, number][] = [
    ["01", Number(v.pago_efectivo ?? 0)],       // efectivo
    ["03", Number(v.pago_transferencia ?? 0)],  // transferencia electrónica
    ["04", Number(v.pago_tarjeta ?? 0)],        // tarjeta de crédito
    ["05", Number(v.pago_puntos ?? 0)],         // monedero electrónico
    ["99", Number(v.pago_credito ?? 0)],        // crédito tienda → por definir
  ]
  candidatos.sort((a, b) => b[1] - a[1])
  return candidatos[0][1] > 0 ? candidatos[0][0] : "01"
}

// ─── Mapeos de alto nivel ───────────────────────────────────────────────────

/** Venta del POS (campos que el mapper necesita). */
export interface VentaParaCFDI {
  folio: string
  fecha: string
  items: ItemVentaCFDI[]
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  pago_credito?: number
  pago_puntos?: number
}

/** Valida que el emisor tenga los datos mínimos para timbrar. */
export function validarEmisor(emisor: FacturamaEmisor): string[] {
  const faltan: string[] = []
  if (!emisor.cpExpedicion?.trim()) faltan.push("CP de expedición (FACTURAMA_EXPEDITION_CP)")
  // RFC/nombre/régimen del emisor los toma Facturama del perfil de la cuenta en
  // API Web, pero el CP de expedición SÍ va en cada comprobante.
  return faltan
}

/**
 * CFDI NOMINATIVO: venta facturada a un cliente con RFC.
 */
export function ventaACfdiNominativo(
  venta: VentaParaCFDI,
  receptor: ReceptorNominativo,
  emisor: FacturamaEmisor,
  resolver: ResolverFiscal
): { cfdi: CrearCfdiInput; skusSinClave: string[] } {
  const { conceptos, skusSinClave } = construirConceptos(venta.items, resolver)

  const Receiver: CfdiReceiver = {
    Rfc: receptor.rfc.trim().toUpperCase(),
    Name: receptor.nombre.trim().toUpperCase(),
    CfdiUse: receptor.usoCfdi.trim(),
    FiscalRegime: receptor.regimenFiscal.trim(),
    TaxZipCode: receptor.cp.trim(),
  }

  const cfdi: CrearCfdiInput = {
    CfdiType: "I",
    PaymentForm: formaPagoDeVenta(venta),
    PaymentMethod: "PUE",
    ExpeditionPlace: emisor.cpExpedicion.trim(),
    Exportation: "01",
    Currency: "MXN",
    Receiver,
    Items: conceptos,
  }
  return { cfdi, skusSinClave }
}

/**
 * CFDI GLOBAL (público en general): agrupa los conceptos de varias ventas del
 * período en un solo comprobante con el nodo GlobalInformation. Desglosa cada
 * artículo (decisión del usuario).
 *
 * @param fechaPeriodo Fecha base del período (se usa para derivar mes/año).
 * @param periodicidad "01" Diario por defecto (factura del día).
 */
export function ventasACfdiGlobal(
  ventas: VentaParaCFDI[],
  emisor: FacturamaEmisor,
  resolver: ResolverFiscal,
  opts: { fechaPeriodo: string; periodicidad?: CfdiGlobalInformation["Periodicity"] }
): { cfdi: CrearCfdiInput; skusSinClave: string[] } {
  // Aplanar todos los items de todas las ventas en una sola lista de conceptos.
  const todosLosItems: ItemVentaCFDI[] = ventas.flatMap((v) => v.items)
  const { conceptos, skusSinClave } = construirConceptos(todosLosItems, resolver)

  const d = new Date(opts.fechaPeriodo)
  const year = String(d.getFullYear())
  const month = String(d.getMonth() + 1).padStart(2, "0")

  const GlobalInformation: CfdiGlobalInformation = {
    Periodicity: opts.periodicidad ?? "01", // Diario
    Months: month,
    Year: year,
  }

  // Receptor genérico. TaxZipCode del receptor == CP del emisor (regla SAT 4.0).
  const Receiver: CfdiReceiver = {
    Rfc: RECEPTOR_PUBLICO.Rfc,
    Name: RECEPTOR_PUBLICO.Name,
    CfdiUse: RECEPTOR_PUBLICO.CfdiUse,
    FiscalRegime: RECEPTOR_PUBLICO.FiscalRegime,
    TaxZipCode: emisor.cpExpedicion.trim(),
  }

  const cfdi: CrearCfdiInput = {
    CfdiType: "I",
    PaymentForm: "01", // efectivo (el grueso del público en general)
    PaymentMethod: "PUE",
    ExpeditionPlace: emisor.cpExpedicion.trim(),
    Exportation: "01",
    Currency: "MXN",
    GlobalInformation,
    Receiver,
    Items: conceptos,
  }
  return { cfdi, skusSinClave }
}
