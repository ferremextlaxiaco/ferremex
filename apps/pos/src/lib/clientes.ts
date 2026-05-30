// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Cliente {
  id: string
  // Datos generales
  num_cliente: string
  nombre: string
  telefono: string
  num_precio: number   // 1 – 4
  dias_credito: number
  limite_credito: number
  grupo: string
  monedero: boolean
  // Datos de facturación
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cfdi: string
  calle: string
  numero: string
  colonia: string
  ciudad: string
  estado: string
  cp: string
}

// ---------------------------------------------------------------------------
// Claves de localStorage
// ---------------------------------------------------------------------------

export const STORAGE_KEY_CLIENTES = "pos_clientes"
export const STORAGE_KEY_GRUPOS   = "pos_grupos"

const GRUPOS_DEFAULT = ["Familia", "Empresa", "Gobierno", "Constructor", "Distribuidor"]

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

export function loadGrupos(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRUPOS)
    return raw ? JSON.parse(raw) : GRUPOS_DEFAULT
  } catch {
    return GRUPOS_DEFAULT
  }
}

export function saveGrupos(grupos: string[]): void {
  localStorage.setItem(STORAGE_KEY_GRUPOS, JSON.stringify(grupos))
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export function loadClientes(): Cliente[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLIENTES)
    if (!raw) return CLIENTES_DEMO
    const lista: unknown[] = JSON.parse(raw)
    return lista.map((c: any) => ({
      ...c,
      // migración: campo monedero era number, ahora es boolean
      monedero:
        typeof c.monedero === "boolean"
          ? c.monedero
          : Number(c.monedero) > 0,
      // migración: num_precio máx 4
      num_precio: Math.min(4, Math.max(1, Number(c.num_precio) || 1)),
    })) as Cliente[]
  } catch {
    return CLIENTES_DEMO
  }
}

export function saveClientes(lista: Cliente[]): void {
  localStorage.setItem(STORAGE_KEY_CLIENTES, JSON.stringify(lista))
}

// ---------------------------------------------------------------------------
// Autoincremento: devuelve el siguiente num_cliente disponible en formato 3 dígitos
// Si hay huecos (se borró el 002), rellena el hueco más bajo.
// ---------------------------------------------------------------------------

export function siguienteNumCliente(clientes: Cliente[]): string {
  const usados = new Set(
    clientes
      .map((c) => parseInt(c.num_cliente, 10))
      .filter((n) => !isNaN(n) && n > 0)
  )
  let siguiente = 1
  while (usados.has(siguiente)) siguiente++
  return String(siguiente).padStart(3, "0")
}

// ---------------------------------------------------------------------------
// Datos de simulación — se usan cuando localStorage no tiene clientes aún
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cartera de crédito — tipos y persistencia en localStorage
// ---------------------------------------------------------------------------

export interface Movimiento {
  id: string
  tipo: "compra" | "pago"
  monto: number
  fecha: string         // YYYY-MM-DD
  folio?: string
  plazo?: number
  descripcion: string
  nota?: string
}

export interface NotaCartera {
  id: string
  fecha: string
  hora: string
  autor: string
  texto: string
}

export interface HistorialLimite {
  id: string
  fecha: string
  usuario: string
  anterior: number
  nuevo: number
  nota: string
}

export interface CartEntrada {
  movimientos: Movimiento[]
  notas: NotaCartera[]
  historialLimite: HistorialLimite[]
}

export const STORAGE_KEY_CARTERA = "pos_cartera"

export function loadCartera(): Record<string, CartEntrada> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CARTERA)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveCartera(cartera: Record<string, CartEntrada>): void {
  localStorage.setItem(STORAGE_KEY_CARTERA, JSON.stringify(cartera))
}

function genId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function agregarMovimientoCredito(
  clienteId: string,
  mov: Omit<Movimiento, "id">
): void {
  const cartera = loadCartera()
  const entrada = cartera[clienteId] ?? { movimientos: [], notas: [], historialLimite: [] }
  entrada.movimientos = [...entrada.movimientos, { id: genId(), ...mov }]
  cartera[clienteId] = entrada
  saveCartera(cartera)
}

// ---------------------------------------------------------------------------
// Datos de simulación — se usan cuando localStorage no tiene clientes aún
// ---------------------------------------------------------------------------

export const CLIENTES_DEMO: Cliente[] = [
  {
    id: "demo-001",
    num_cliente: "001",
    nombre: "Constructora Martínez S.A.",
    telefono: "953 104 2231",
    num_precio: 2,
    dias_credito: 30,
    limite_credito: 15000,
    grupo: "Empresa",
    monedero: false,
    rfc: "CMR850312KJ4",
    razon_social: "Constructora Martínez S.A. de C.V.",
    regimen_fiscal: "601",
    cfdi: "G01",
    calle: "Av. Independencia",
    numero: "45",
    colonia: "Centro",
    ciudad: "Tlaxiaco",
    estado: "Oaxaca",
    cp: "69800",
  },
  {
    id: "demo-002",
    num_cliente: "002",
    nombre: "Familia García Ruiz",
    telefono: "953 100 8873",
    num_precio: 1,
    dias_credito: 0,
    limite_credito: 0,
    grupo: "Familia",
    monedero: true,
    rfc: "",
    razon_social: "",
    regimen_fiscal: "",
    cfdi: "",
    calle: "Calle Hidalgo",
    numero: "12",
    colonia: "Col. Reforma",
    ciudad: "Tlaxiaco",
    estado: "Oaxaca",
    cp: "69800",
  },
  {
    id: "demo-003",
    num_cliente: "003",
    nombre: "Distribuidora Tlaxiaco",
    telefono: "953 108 5512",
    num_precio: 3,
    dias_credito: 15,
    limite_credito: 8000,
    grupo: "Distribuidor",
    monedero: false,
    rfc: "DTL920703AAA",
    razon_social: "Distribuidora Tlaxiaco S. de R.L.",
    regimen_fiscal: "612",
    cfdi: "G03",
    calle: "Blvd. Reforma",
    numero: "201",
    colonia: "Col. Niños Héroes",
    ciudad: "Tlaxiaco",
    estado: "Oaxaca",
    cp: "69800",
  },
  {
    id: "demo-004",
    num_cliente: "004",
    nombre: "Ayuntamiento de Tlaxiaco",
    telefono: "953 100 0100",
    num_precio: 2,
    dias_credito: 45,
    limite_credito: 50000,
    grupo: "Gobierno",
    monedero: false,
    rfc: "ATX570401GH9",
    razon_social: "H. Ayuntamiento de Heroica Ciudad de Tlaxiaco",
    regimen_fiscal: "603",
    cfdi: "G03",
    calle: "Portal Municipal",
    numero: "S/N",
    colonia: "Centro",
    ciudad: "Tlaxiaco",
    estado: "Oaxaca",
    cp: "69800",
  },
  {
    id: "demo-005",
    num_cliente: "005",
    nombre: "Ing. Roberto Pérez",
    telefono: "953 107 3344",
    num_precio: 1,
    dias_credito: 0,
    limite_credito: 0,
    grupo: "Constructor",
    monedero: true,
    rfc: "PERR780611HZ2",
    razon_social: "Roberto Pérez Ramos",
    regimen_fiscal: "612",
    cfdi: "I01",
    calle: "Calle Morelos",
    numero: "78",
    colonia: "Col. La Paz",
    ciudad: "Tlaxiaco",
    estado: "Oaxaca",
    cp: "69801",
  },
]
