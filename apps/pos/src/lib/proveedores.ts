// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface FacturaCredito {
  id: string
  numero_factura: string
  fecha_emision: string   // "YYYY-MM-DD"
  dias_credito: number
  monto: number
  descripcion: string
  pagada: boolean
}

export interface Proveedor {
  id: string
  num_proveedor: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  dias_credito: number
  limite_credito: number
  rfc: string
  notas: string
  facturas: FacturaCredito[]
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export const STORAGE_KEY_PROVEEDORES = "pos_proveedores"

export function loadProveedores(): Proveedor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVEEDORES)
    if (!raw) return PROVEEDORES_DEMO
    return JSON.parse(raw) as Proveedor[]
  } catch {
    return PROVEEDORES_DEMO
  }
}

export function saveProveedores(lista: Proveedor[]): void {
  localStorage.setItem(STORAGE_KEY_PROVEEDORES, JSON.stringify(lista))
}

// ---------------------------------------------------------------------------
// Autoincremento
// ---------------------------------------------------------------------------

export function siguienteNumProveedor(proveedores: Proveedor[]): string {
  const usados = new Set(
    proveedores
      .map((p) => parseInt(p.num_proveedor, 10))
      .filter((n) => !isNaN(n) && n > 0)
  )
  let siguiente = 1
  while (usados.has(siguiente)) siguiente++
  return String(siguiente).padStart(3, "0")
}

// ---------------------------------------------------------------------------
// Helpers de fechas y estado
// ---------------------------------------------------------------------------

export function diasRestantes(factura: FacturaCredito): number {
  const emision = new Date(factura.fecha_emision + "T12:00:00")
  const vence = new Date(emision)
  vence.setDate(vence.getDate() + factura.dias_credito)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  vence.setHours(0, 0, 0, 0)
  return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export type EstadoFactura = "pagada" | "vencida" | "urgente" | "proxima" | "ok"

export function estadoFactura(f: FacturaCredito): EstadoFactura {
  if (f.pagada) return "pagada"
  const dias = diasRestantes(f)
  if (dias < 0) return "vencida"
  if (dias <= 7) return "urgente"
  if (dias <= 15) return "proxima"
  return "ok"
}

export function fechaVencimientoISO(f: FacturaCredito): string {
  const d = new Date(f.fecha_emision + "T12:00:00")
  d.setDate(d.getDate() + f.dias_credito)
  return d.toISOString().slice(0, 10)
}

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// Datos de demostración
// ---------------------------------------------------------------------------

function resta(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export const PROVEEDORES_DEMO: Proveedor[] = [
  {
    id: "prov-001",
    num_proveedor: "001",
    nombre: "Truper",
    contacto: "Lic. María González",
    telefono: "55 1234 5678",
    email: "ventas@truper.com",
    dias_credito: 30,
    limite_credito: 50000,
    rfc: "TRU850312KJ4",
    notas: "Línea de herramientas. Pedido mínimo $5,000.",
    facturas: [
      {
        id: "f-001",
        numero_factura: "TRP-2025-1123",
        fecha_emision: resta(25),
        dias_credito: 30,
        monto: 12500,
        descripcion: "Herramientas de mano surtidas",
        pagada: false,
      },
      {
        id: "f-002",
        numero_factura: "TRP-2025-0998",
        fecha_emision: resta(55),
        dias_credito: 30,
        monto: 8000,
        descripcion: "Sierras y serruchos",
        pagada: true,
      },
    ],
  },
  {
    id: "prov-002",
    num_proveedor: "002",
    nombre: "Urrea Herramientas",
    contacto: "Ing. Carlos Ramos",
    telefono: "33 8765 4321",
    email: "credito@urrea.net",
    dias_credito: 45,
    limite_credito: 30000,
    rfc: "URR920703BBB",
    notas: "Herramientas de precisión y profesionales.",
    facturas: [
      {
        id: "f-003",
        numero_factura: "URR-2025-0452",
        fecha_emision: resta(10),
        dias_credito: 45,
        monto: 7200,
        descripcion: "Llaves y desarmadores profesionales",
        pagada: false,
      },
    ],
  },
  {
    id: "prov-003",
    num_proveedor: "003",
    nombre: "Copperpipe S.A.",
    contacto: "Sr. Juan Pérez",
    telefono: "55 9900 1122",
    email: "ventas@copperpipe.mx",
    dias_credito: 15,
    limite_credito: 20000,
    rfc: "CPP011015CCC",
    notas: "Tubería de cobre y conexiones. Pago puntual requerido.",
    facturas: [
      {
        id: "f-004",
        numero_factura: "CPP-2025-0301",
        fecha_emision: resta(14),
        dias_credito: 15,
        monto: 4500,
        descripcion: 'Tubería 1/2" y 3/4"',
        pagada: false,
      },
      {
        id: "f-005",
        numero_factura: "CPP-2025-0278",
        fecha_emision: resta(18),
        dias_credito: 15,
        monto: 3200,
        descripcion: "Conexiones y codos de cobre",
        pagada: false,
      },
    ],
  },
  {
    id: "prov-004",
    num_proveedor: "004",
    nombre: "Pretul",
    contacto: "Sra. Laura Mendoza",
    telefono: "33 3000 4500",
    email: "distribuidores@pretul.com",
    dias_credito: 30,
    limite_credito: 25000,
    rfc: "PRE780601DDD",
    notas: "Ferretería en general, candados y seguridad.",
    facturas: [],
  },
]
