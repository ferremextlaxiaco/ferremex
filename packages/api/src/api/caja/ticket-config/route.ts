import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import * as fs from "fs"
import * as path from "path"

const CONFIG_FILE = path.join(__dirname, "../../../../data/ticket-config.json")

export interface TicketConfig {
  encabezado: {
    nombre: string
    linea2: string
    linea3: string
    rfc: string
  }
  pie: string[]
  opciones: {
    mostrar_sku: boolean
    mostrar_cajero: boolean
    mostrar_turno: boolean
  }
  tipos: {
    venta: { titulo: string; activo: boolean }
    cotizacion: { titulo: string; activo: boolean }
    cancelacion: { titulo: string; activo: boolean }
    nota_credito: { titulo: string; activo: boolean }
  }
  formato_folio?: {
    modo: "secuencial" | "fecha"
    prefijo: string
    digitos: number
  }
  // Configuración de documentos adicionales (Nota de venta / Factura / Cupón).
  // Cada uno reutiliza la estructura encabezado/pie/opciones del ticket.
  formatos?: {
    nota_venta: FormatoDoc
    factura: FormatoDoc
    cupon: FormatoDoc
  }
}

export interface FormatoDoc {
  activo: boolean
  titulo: string
  encabezado: string[]   // líneas de encabezado libres
  pie: string[]          // líneas de pie
  // opciones específicas por documento (no todas aplican a todos)
  mostrar_precios: boolean
  mostrar_vigencia: boolean
  vigencia_dias: number
}

const DEFAULT_CONFIG: TicketConfig = {
  encabezado: {
    nombre: "FERREMEX",
    linea2: "Tlaxiaco, Oaxaca",
    linea3: "Tel: (953) 555-0000",
    rfc: "",
  },
  pie: ["¡Gracias por su compra!", "Conserve su ticket"],
  opciones: {
    mostrar_sku: false,
    mostrar_cajero: true,
    mostrar_turno: false,
  },
  tipos: {
    venta: { titulo: "COMPROBANTE DE VENTA", activo: true },
    cotizacion: { titulo: "COTIZACIÓN", activo: true },
    cancelacion: { titulo: "CANCELACIÓN", activo: true },
    nota_credito: { titulo: "NOTA DE CRÉDITO", activo: true },
  },
  formato_folio: { modo: "fecha", prefijo: "", digitos: 4 },
  formatos: {
    nota_venta: {
      activo: true,
      titulo: "NOTA DE VENTA",
      encabezado: ["FERREMEX", "Tlaxiaco, Oaxaca"],
      pie: ["Este documento no es un comprobante fiscal", "¡Gracias por su compra!"],
      mostrar_precios: true,
      mostrar_vigencia: false,
      vigencia_dias: 0,
    },
    factura: {
      activo: false,
      titulo: "FACTURA",
      encabezado: ["FERREMEX S.A. DE C.V.", "RFC: XAXX010101000", "Tlaxiaco, Oaxaca"],
      pie: ["Este documento es una representación impresa de un CFDI"],
      mostrar_precios: true,
      mostrar_vigencia: false,
      vigencia_dias: 0,
    },
    cupon: {
      activo: false,
      titulo: "CUPÓN DE DESCUENTO",
      encabezado: ["FERREMEX", "¡Promoción especial!"],
      pie: ["Presenta este cupón en tu próxima compra"],
      mostrar_precios: false,
      mostrar_vigencia: true,
      vigencia_dias: 30,
    },
  },
}

function cargarConfig(): TicketConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    guardarConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as TicketConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

function guardarConfig(config: TicketConfig) {
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
}

/** GET /caja/ticket-config */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(cargarConfig())
}

/** PUT /caja/ticket-config */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as TicketConfig
  if (!body?.encabezado?.nombre) {
    res.status(400).json({ error: "Configuración inválida" })
    return
  }
  // Merge con el default para no perder campos nuevos
  const config: TicketConfig = {
    ...DEFAULT_CONFIG,
    ...body,
    encabezado: { ...DEFAULT_CONFIG.encabezado, ...body.encabezado },
    opciones: { ...DEFAULT_CONFIG.opciones, ...body.opciones },
    tipos: { ...DEFAULT_CONFIG.tipos, ...body.tipos },
    pie: body.pie ?? DEFAULT_CONFIG.pie,
    formato_folio: body.formato_folio
      ? { ...DEFAULT_CONFIG.formato_folio!, ...body.formato_folio }
      : DEFAULT_CONFIG.formato_folio,
    formatos: body.formatos
      ? {
          nota_venta: { ...DEFAULT_CONFIG.formatos!.nota_venta, ...body.formatos.nota_venta },
          factura: { ...DEFAULT_CONFIG.formatos!.factura, ...body.formatos.factura },
          cupon: { ...DEFAULT_CONFIG.formatos!.cupon, ...body.formatos.cupon },
        }
      : DEFAULT_CONFIG.formatos,
  }
  guardarConfig(config)
  res.json(config)
}
