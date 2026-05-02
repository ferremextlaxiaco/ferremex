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
  }
  guardarConfig(config)
  res.json(config)
}
