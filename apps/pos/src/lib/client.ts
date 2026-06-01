// Todas las llamadas van al mismo origen en producción.
// En dev, Vite proxea /caja → localhost:9000.

// ── Productos ────────────────────────────────────────────────────────────────

export interface ProductoPOS {
  sku: string
  descripcion: string
  precio: number
  precio2?: number
  existencia: number
  thumbnail: string | null
  marca?: string
  especificaciones?: { clave: string; valor: string }[]
  mayoreoActivo?: boolean
  mayoreoMin?: number
}

export interface FiltrosBusqueda {
  q?: string
  category_id?: string
  departamento?: string
  marca?: string
}

export interface CategoriasPOS {
  categorias: { id: string; nombre: string }[]
  departamentos: string[]
}

// ── Ventas ───────────────────────────────────────────────────────────────────

export interface VentaRequest {
  cajero: string
  turno_id: string
  // paquete_id/paquete_nombre marcan que el item forma parte de un paquete
  // vendido (el precio_unitario ya viene prorrateado). Opcionales y
  // retrocompatibles: una venta normal no los envía.
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number; paquete_id?: string; paquete_nombre?: string }[]
  pago_efectivo: number
  pago_transferencia?: number
  pago_credito?: number
  // Venta a crédito: el backend registra el cargo en la cartera del cliente de
  // forma transaccional (dentro del lock de la venta). cliente_id = Customer id.
  cliente_id?: string
  cliente_nombre?: string
  plazo?: number
}

export interface VentaResponse {
  folio: string
  fecha: string
  cajero: string
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  total: number
  pago_efectivo: number
  pago_transferencia: number
  pago_credito: number
  cambio: number
}

export interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
}

// ── Movimientos de caja (manuales: entradas / salidas / fondo inicial) ─────────

export type MovimientoOrigin = "MOVIM_E" | "MOVIM_S" | "FONDO"

export interface MovimientoCaja {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:MM
  fecha: string // ISO
  origin: MovimientoOrigin
  desc: string
  method: string
  amount: number // con signo: salidas negativas
  category?: string
  cajaId?: string | null
  cajaName?: string | null
  cajeroId?: string
  cajeroName?: string
  turnoId?: string | null
  supplier?: string
  notes?: string
  auto?: boolean
}

// El POST no necesita id/fecha/time (los pone el servidor).
export type MovimientoCajaInput = Omit<MovimientoCaja, "id" | "fecha"> & {
  date?: string
  time?: string
}

// ── Corte de caja / arqueo ─────────────────────────────────────────────────────

export interface CorteVentaItem {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
  pago_efectivo: number
  pago_transferencia: number
  pago_credito: number
}

export interface CorteMovItem {
  id: string
  origin: MovimientoOrigin
  desc: string
  amount: number
  time: string
  category?: string
}

/** Snapshot persistido de un corte ya cerrado. */
export interface CorteCerrado {
  cajero: string
  turno_id: string
  cerrado_en: string
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_credito: number
  fondo_inicial: number
  entradas_manuales: number
  salidas_manuales: number
  efectivo_esperado: number
  efectivo_contado: number
  diferencia: number
  fondo_dejado: number
  motivo?: string
  denominaciones?: Record<string, number> | null
}

export interface CorteResponse {
  cajero: string
  turno_id: string
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_credito: number
  fondo_inicial: number
  entradas_manuales: number
  salidas_manuales: number
  efectivo_esperado: number
  ventas: CorteVentaItem[]
  movimientos: CorteMovItem[]
  /** Si el turno ya fue cerrado, el snapshot del arqueo; null si sigue abierto. */
  cerrado: CorteCerrado | null
}

export interface CerrarCorteInput {
  cajero: string
  turno_id: string
  efectivo_contado: number
  fondo_dejado?: number
  motivo?: string
  denominaciones?: Record<string, number> | null
  siguiente_turno_id?: string | null
  cajero_id?: string
  caja_id?: string | null
  caja_name?: string | null
}

export interface CerrarCorteResult {
  ok: boolean
  yaCerrado?: boolean
  corte: CorteCerrado
}

// ── Artículos (admin CRUD) ────────────────────────────────────────────────────

export interface ArticuloPOS {
  id: string
  clave: string
  claveAlterna: string
  descripcion: string
  marca: string
  categoria: string
  departamento: string
  unidadCompra: string
  unidadVenta: string
  factor: number
  aplicarIva: boolean
  precioCompra: number
  precioNeto: boolean
  precio1: number
  precio2: number
  precio3: number
  precio4: number
  claveSat: string
  proveedor?: string
  inventarioMin: number
  inventarioMax: number
  localizacion: string
  peso: number
  ventaGranel: boolean
  mayoreoActivo: boolean
  mayoreoMin: number
  thumbnail: string | null
  imagenes: string[]
  especificaciones: { clave: string; valor: string }[]
  existencia: number
}

export async function listarArticulos(q?: string): Promise<ArticuloPOS[]> {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  return apiFetch<ArticuloPOS[]>(`/caja/articulos?${params}`)
}

export async function listarFaltantes(): Promise<ArticuloPOS[]> {
  return apiFetch<ArticuloPOS[]>("/caja/articulos?faltantes=1")
}

export async function listarArticulosDeCatalogo(
  departamento: string,
  categoria: string
): Promise<ArticuloPOS[]> {
  const params = new URLSearchParams()
  if (departamento) params.set("departamento", departamento)
  if (categoria)    params.set("categoria", categoria)
  return apiFetch<ArticuloPOS[]>(`/caja/articulos?${params}`)
}

export async function subirImagenArticulo(dataUrl: string): Promise<string> {
  const result = await apiFetch<{ url: string }>("/caja/imagen", {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  })
  return result.url
}

export async function crearArticulo(
  data: Omit<ArticuloPOS, "id" | "thumbnail">
): Promise<ArticuloPOS> {
  return apiFetch<ArticuloPOS>("/caja/articulos", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function actualizarArticulo(data: ArticuloPOS): Promise<ArticuloPOS> {
  return apiFetch<ArticuloPOS>("/caja/articulos", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function eliminarArticulo(id: string): Promise<void> {
  await apiFetch(`/caja/articulos?id=${id}`, { method: "DELETE" })
}

// ── Paquetes / Kits ────────────────────────────────────────────────────────────

export interface ComponentePaquete {
  sku: string
  descripcion: string
  cantidad: number
}

export interface Paquete {
  id: string
  nombre: string
  componentes: ComponentePaquete[]
  precio_paquete: number
  nivel_base: number // 1-4, nivel de precio usado como base de la sugerencia
  imagenes: string[] // galería; la primera es la principal. [] si no tiene
  creado_en: string
  actualizado_en?: string
}

// El POST/PUT no necesitan id/fechas (el servidor los pone).
export type PaqueteInput = {
  id?: string
  nombre: string
  componentes: ComponentePaquete[]
  precio_paquete: number
  nivel_base: number
  imagenes?: string[]
}

export async function listarPaquetes(): Promise<Paquete[]> {
  return apiFetch<Paquete[]>("/caja/paquetes")
}

export async function crearPaquete(data: PaqueteInput): Promise<Paquete> {
  return apiFetch<Paquete>("/caja/paquetes", { method: "POST", body: JSON.stringify(data) })
}

export async function actualizarPaquete(data: PaqueteInput & { id: string }): Promise<Paquete> {
  return apiFetch<Paquete>("/caja/paquetes", { method: "PUT", body: JSON.stringify(data) })
}

export async function eliminarPaquete(id: string): Promise<void> {
  await apiFetch(`/caja/paquetes?id=${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function generarOCPdf(data: {
  rows: any[]
  freeItems: any[]
  proveedor: any | null
  ocNumber: string
  fechaEmision: string
  mostrarPrecios: boolean
  mostrarImagenes: boolean
}): Promise<string> {
  const res = await fetch("/caja/generar-oc", {
    method: "POST",
    headers: posHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error ${res.status}: ${body}`)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function ajustarInventario(
  ajustes: { sku: string; nueva_cantidad: number }[]
): Promise<{ ok: boolean; actualizados: number; errores: string[] }> {
  return apiFetch("/caja/ajuste-inventario", {
    method: "POST",
    body: JSON.stringify({ ajustes }),
  })
}

export async function incrementarInventario(
  ajustes: { sku: string; delta: number }[]
): Promise<{ ok: boolean; actualizados: number; errores: string[] }> {
  return apiFetch("/caja/ajuste-inventario", {
    method: "POST",
    body: JSON.stringify({ ajustes }),
  })
}

// ── Usuarios POS ─────────────────────────────────────────────────────────────

export interface PosUsuario {
  id: string
  nombre: string
  alias?: string
  /** Solo presente al pedir el listado admin (?admin=1). El GET público lo omite. */
  pin?: string
  /** Presente en el listado público: indica si el usuario tiene PIN, sin exponerlo. */
  tiene_pin?: boolean
  rol: "admin" | "supervisor" | "cajero"
  activo: boolean
  permisos: {
    puede_vender: boolean
    puede_cotizar: boolean
    puede_anular: boolean
    puede_ver_corte: boolean
    puede_ver_admin: boolean
  }
}

// ── Ticket Config ─────────────────────────────────────────────────────────────

export interface TicketConfig {
  encabezado: {
    logo: string | null
    nombre: string
    direccion: string
    telefono: string
    email: string
    rfc: string
    // campos legacy del servidor (migración automática al cargar)
    linea2?: string
    linea3?: string
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
  formatos?: {
    nota_venta: FormatoDoc
    factura: FormatoDoc
    cupon: FormatoDoc
  }
}

export interface FormatoDoc {
  activo: boolean
  titulo: string
  encabezado: string[]
  pie: string[]
  mostrar_precios: boolean
  mostrar_vigencia: boolean
  vigencia_dias: number
}

export type FormatoKey = "nota_venta" | "factura" | "cupon"

const FORMATOS_DEFAULT: NonNullable<TicketConfig["formatos"]> = {
  nota_venta: {
    activo: true, titulo: "NOTA DE VENTA",
    encabezado: ["FERREMEX", "Tlaxiaco, Oaxaca"],
    pie: ["Este documento no es un comprobante fiscal", "¡Gracias por su compra!"],
    mostrar_precios: true, mostrar_vigencia: false, vigencia_dias: 0,
  },
  factura: {
    activo: false, titulo: "FACTURA",
    encabezado: ["FERREMEX S.A. DE C.V.", "RFC: XAXX010101000", "Tlaxiaco, Oaxaca"],
    pie: ["Este documento es una representación impresa de un CFDI"],
    mostrar_precios: true, mostrar_vigencia: false, vigencia_dias: 0,
  },
  cupon: {
    activo: false, titulo: "CUPÓN DE DESCUENTO",
    encabezado: ["FERREMEX", "¡Promoción especial!"],
    pie: ["Presenta este cupón en tu próxima compra"],
    mostrar_precios: false, mostrar_vigencia: true, vigencia_dias: 30,
  },
}

export function migrarTicketConfig(raw: TicketConfig): TicketConfig {
  const enc = raw.encabezado
  return {
    ...raw,
    encabezado: {
      logo: enc.logo ?? null,
      nombre: enc.nombre ?? "FERREMEX",
      direccion: enc.direccion ?? enc.linea2 ?? "Tlaxiaco, Oaxaca",
      telefono: enc.telefono ?? (enc.linea3?.startsWith("Tel") ? enc.linea3.replace(/^Tel:\s*/, "") : enc.linea3 ?? "(953) 555-0000"),
      email: enc.email ?? "",
      rfc: enc.rfc ?? "",
    },
    formato_folio: raw.formato_folio ?? { modo: "fecha", prefijo: "", digitos: 4 },
    formatos: {
      nota_venta: { ...FORMATOS_DEFAULT.nota_venta, ...raw.formatos?.nota_venta },
      factura: { ...FORMATOS_DEFAULT.factura, ...raw.formatos?.factura },
      cupon: { ...FORMATOS_DEFAULT.cupon, ...raw.formatos?.cupon },
    },
  }
}

// ── Fetch base ───────────────────────────────────────────────────────────────

// Token compartido del POS, validado por el middleware del backend en rutas
// mutantes (/caja/* POST/PUT/PATCH/DELETE). Configurable por terminal vía
// VITE_POS_TOKEN. Si el backend no tiene POS_TOKEN definido, el header se ignora.
const POS_TOKEN = import.meta.env.VITE_POS_TOKEN ?? ""
const POS_ADMIN_TOKEN = import.meta.env.VITE_POS_ADMIN_TOKEN ?? ""

/** Headers base para toda llamada a /caja/* (incluye el token POS si existe). */
export function posHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (POS_TOKEN) h["X-POS-Token"] = POS_TOKEN
  return { ...h, ...extra }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...posHeaders(), ...(options?.headers as Record<string, string>) },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ── Productos ────────────────────────────────────────────────────────────────

export async function buscarProductos(filtros: FiltrosBusqueda): Promise<ProductoPOS[]> {
  const params = new URLSearchParams()
  if (filtros.q) params.set("q", filtros.q)
  if (filtros.category_id) params.set("category_id", filtros.category_id)
  if (filtros.departamento) params.set("departamento", filtros.departamento)
  return apiFetch<ProductoPOS[]>(`/caja/productos?${params}`)
}

export async function buscarCategorias(): Promise<CategoriasPOS> {
  return apiFetch<CategoriasPOS>("/caja/categorias")
}

// ── Ventas ───────────────────────────────────────────────────────────────────

export interface VentaListItem {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  total: number
  pago_efectivo: number
  pago_transferencia: number
  pago_credito: number
  cambio: number
  estado?: string
  motivo_cancelacion?: string
}

export async function listarVentas(desde?: string, hasta?: string): Promise<VentaListItem[]> {
  const params = new URLSearchParams()
  if (desde) params.set("desde", desde)
  if (hasta) params.set("hasta", hasta)
  return apiFetch<VentaListItem[]>(`/caja/ventas?${params}`)
}

export async function registrarVenta(venta: VentaRequest): Promise<VentaResponse> {
  return apiFetch<VentaResponse>("/caja/ventas", {
    method: "POST",
    body: JSON.stringify(venta),
  })
}

export async function obtenerVenta(folio: string): Promise<VentaResponse | null> {
  try {
    return await apiFetch<VentaResponse>(`/caja/ventas/${encodeURIComponent(folio)}`)
  } catch {
    return null
  }
}

/** Cancela una venta en el servidor (persiste estado y reintegra inventario). */
export async function cancelarVenta(folio: string, motivo: string): Promise<VentaListItem> {
  return apiFetch<VentaListItem>(`/caja/ventas/${encodeURIComponent(folio)}`, {
    method: "PATCH",
    body: JSON.stringify({ estado: "cancelada", motivo }),
  })
}

export async function obtenerCorte(cajero: string, turno_id: string): Promise<CorteResponse> {
  const params = new URLSearchParams({ cajero, turno_id })
  return apiFetch<CorteResponse>(`/caja/corte?${params}`)
}

/** Cierra el turno con el arqueo completo. Devuelve el snapshot persistido. */
export async function cerrarCorte(input: CerrarCorteInput): Promise<CerrarCorteResult> {
  return apiFetch<CerrarCorteResult>("/caja/corte", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

// ── Movimientos de caja ────────────────────────────────────────────────────────

export interface MovimientosFiltro {
  desde?: string
  hasta?: string
  turno_id?: string
  caja_id?: string
  cajero_id?: string
}

export async function listarMovimientos(filtro: MovimientosFiltro = {}): Promise<MovimientoCaja[]> {
  const params = new URLSearchParams()
  if (filtro.desde) params.set("desde", filtro.desde)
  if (filtro.hasta) params.set("hasta", filtro.hasta)
  if (filtro.turno_id) params.set("turno_id", filtro.turno_id)
  if (filtro.caja_id) params.set("caja_id", filtro.caja_id)
  if (filtro.cajero_id) params.set("cajero_id", filtro.cajero_id)
  return apiFetch<MovimientoCaja[]>(`/caja/movimientos?${params}`)
}

export async function crearMovimiento(mov: MovimientoCajaInput): Promise<MovimientoCaja> {
  return apiFetch<MovimientoCaja>("/caja/movimientos", {
    method: "POST",
    body: JSON.stringify(mov),
  })
}

export async function eliminarMovimiento(id: string): Promise<void> {
  await apiFetch(`/caja/movimientos?id=${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

/**
 * Lista usuarios POS. Por defecto el backend omite el `pin`.
 * Con `incluirPin=true` pide la vista admin (?admin=1 + token admin), usada por
 * EmployeesModule para validar PINs duplicados. Requiere VITE_POS_ADMIN_TOKEN.
 */
export async function obtenerUsuarios(incluirPin = false): Promise<PosUsuario[]> {
  if (incluirPin) {
    return apiFetch<PosUsuario[]>("/caja/usuarios?admin=1", {
      headers: POS_ADMIN_TOKEN ? { "X-POS-Admin-Token": POS_ADMIN_TOKEN } : undefined,
    })
  }
  return apiFetch<PosUsuario[]>("/caja/usuarios")
}

/** Valida el PIN de un cajero en el servidor. Devuelve el usuario sin pin, o lanza. */
export async function login(usuario_id: string, pin: string): Promise<PosUsuario> {
  return apiFetch<PosUsuario>("/caja/login", {
    method: "POST",
    body: JSON.stringify({ usuario_id, pin }),
  })
}

export async function crearUsuario(usuario: Omit<PosUsuario, "id">): Promise<PosUsuario> {
  return apiFetch<PosUsuario>("/caja/usuarios", {
    method: "POST",
    body: JSON.stringify(usuario),
  })
}

export async function actualizarUsuario(usuario: PosUsuario): Promise<PosUsuario> {
  return apiFetch<PosUsuario>("/caja/usuarios", {
    method: "PUT",
    body: JSON.stringify(usuario),
  })
}

export async function eliminarUsuario(id: string): Promise<void> {
  await apiFetch(`/caja/usuarios?id=${id}`, { method: "DELETE" })
}

// ── Ticket Config ─────────────────────────────────────────────────────────────

export async function obtenerTicketConfig(): Promise<TicketConfig> {
  return apiFetch<TicketConfig>("/caja/ticket-config")
}

export async function obtenerFolioContador(): Promise<number> {
  const r = await apiFetch<{ contador: number }>("/caja/folio-contador")
  return r.contador
}

export async function reiniciarFolioContador(): Promise<void> {
  await apiFetch<{ ok: boolean }>("/caja/folio-contador", { method: "DELETE" })
}

export async function guardarTicketConfig(config: TicketConfig): Promise<TicketConfig> {
  return apiFetch<TicketConfig>("/caja/ticket-config", {
    method: "PUT",
    body: JSON.stringify(config),
  })
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

export interface CatalogosDept  { id: string; nombre: string; articulos: number }
export interface CatalogosCat   { id: string; nombre: string; depId: string; medusaId?: string; articulos: number }
export interface CatalogosMarca { id: string; nombre: string; catId: string; articulos: number }

export interface CatalogosData {
  depts:  CatalogosDept[]
  cats:   CatalogosCat[]
  marcas: CatalogosMarca[]
}

export async function listarCatalogos(): Promise<CatalogosData> {
  return apiFetch<CatalogosData>("/caja/catalogos")
}

// ── Pedidos a proveedor ───────────────────────────────────────────────────────

export interface PedidoArticulo { clave?: string; descripcion?: string; cantidad: number }

export interface Pedido {
  id: string
  folio: string
  fecha: string
  proveedor?: string | null
  proveedorId?: string | null
  status: string
  articulos: PedidoArticulo[]
}

export async function listarPedidos(): Promise<Pedido[]> {
  return apiFetch<Pedido[]>("/caja/pedidos")
}

/** Crea un pedido. El backend genera id y folio. */
export async function crearPedido(
  data: Omit<Pedido, "id" | "folio">
): Promise<Pedido> {
  return apiFetch<Pedido>("/caja/pedidos", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function actualizarPedido(data: Partial<Pedido> & { id: string }): Promise<Pedido> {
  return apiFetch<Pedido>("/caja/pedidos", {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function eliminarPedido(id: string): Promise<void> {
  await apiFetch(`/caja/pedidos?id=${encodeURIComponent(id)}`, { method: "DELETE" })
}

export type CatalogosOp =
  | { op: "create_marca"; nombre: string; cat_nombre: string; dep_nombre: string }
  | { op: "rename_dept";  nombre_actual: string; nombre_nuevo: string }
  | { op: "rename_cat";   nombre_actual: string; nombre_nuevo: string }
  | { op: "rename_marca"; nombre_actual: string; nombre_nuevo: string }
  | { op: "move_cat"; cat_nombre: string; dept_nombre_actual: string; dept_nombre_nuevo: string }
  | { op: "assign_marca"; marca: string; product_ids: string[] }
  | { op: "reasignar"; product_ids: string[]; departamento?: string; marca?: string }

export async function actualizarCatalogo(
  payload: CatalogosOp
): Promise<{ ok: boolean; actualizados: number }> {
  return apiFetch("/caja/catalogos", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

// ── Clientes (BD Medusa, Fase 3) ──────────────────────────────────────────────
// Reemplazan el viejo localStorage (pos_clientes/pos_grupos). El shape Cliente
// y los tipos de cartera viven en lib/clientes.ts (origen canónico de tipos).

import type {
  Cliente,
  Movimiento,
  NotaCartera,
  HistorialLimite,
  CartEntrada,
} from "./clientes"

export async function listarClientesAPI(): Promise<Cliente[]> {
  return apiFetch<Cliente[]>("/caja/clientes")
}

export async function siguienteNumClienteAPI(): Promise<string> {
  const r = await apiFetch<{ num_cliente: string }>("/caja/clientes?siguiente-num=1")
  return r.num_cliente
}

export async function crearClienteAPI(cliente: Omit<Cliente, "id">): Promise<Cliente> {
  return apiFetch<Cliente>("/caja/clientes", {
    method: "POST",
    body: JSON.stringify(cliente),
  })
}

export async function actualizarClienteAPI(id: string, cliente: Partial<Cliente>): Promise<Cliente> {
  return apiFetch<Cliente>(`/caja/clientes/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(cliente),
  })
}

export async function eliminarClienteAPI(id: string): Promise<void> {
  await apiFetch(`/caja/clientes/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ── Grupos de clientes (customer_group nativo) ────────────────────────────────

export async function listarGruposAPI(): Promise<string[]> {
  return apiFetch<string[]>("/caja/grupos")
}

/** Sincroniza la lista de grupos (crea los que falten). Devuelve la lista resultante. */
export async function guardarGruposAPI(grupos: string[]): Promise<string[]> {
  return apiFetch<string[]>("/caja/grupos", {
    method: "PUT",
    body: JSON.stringify({ grupos }),
  })
}

// ── Cartera de crédito (módulo ferremex_cartera) ──────────────────────────────

/** Todas las carteras como Record<customer_id, CartEntrada> (carga masiva). */
export async function listarCarteraGlobalAPI(): Promise<Record<string, CartEntrada>> {
  return apiFetch<Record<string, CartEntrada>>("/caja/cartera")
}

/** Cartera completa de un cliente. */
export async function obtenerCarteraClienteAPI(customerId: string): Promise<CartEntrada> {
  const d = await apiFetch<{ movimientos: Movimiento[]; notas: NotaCartera[]; historialLimite: HistorialLimite[] }>(
    `/caja/cartera/${encodeURIComponent(customerId)}`
  )
  return { movimientos: d.movimientos, notas: d.notas, historialLimite: d.historialLimite }
}

export async function agregarMovimientoCarteraAPI(
  customerId: string,
  mov: Omit<Movimiento, "id">
): Promise<Movimiento> {
  return apiFetch<Movimiento>(`/caja/cartera/${encodeURIComponent(customerId)}/movimientos`, {
    method: "POST",
    body: JSON.stringify(mov),
  })
}

/**
 * Anula (cancela) un movimiento de cartera —típicamente un abono registrado
 * por error—. No lo borra: lo marca cancelado para que el monto regrese a la
 * deuda y quede rastro auditable con `motivo`.
 */
export async function anularMovimientoCarteraAPI(
  customerId: string,
  movimientoId: string,
  motivo: string
): Promise<Movimiento> {
  return apiFetch<Movimiento>(
    `/caja/cartera/${encodeURIComponent(customerId)}/movimientos/${encodeURIComponent(movimientoId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ motivo }),
    }
  )
}

export async function agregarNotaCarteraAPI(
  customerId: string,
  nota: Omit<NotaCartera, "id">
): Promise<NotaCartera> {
  return apiFetch<NotaCartera>(`/caja/cartera/${encodeURIComponent(customerId)}/notas`, {
    method: "POST",
    body: JSON.stringify(nota),
  })
}

export async function registrarCambioLimiteAPI(
  customerId: string,
  cambio: Omit<HistorialLimite, "id">
): Promise<HistorialLimite> {
  return apiFetch<HistorialLimite>(`/caja/cartera/${encodeURIComponent(customerId)}/limite`, {
    method: "POST",
    body: JSON.stringify(cambio),
  })
}

// ── Migración one-shot localStorage → BD ──────────────────────────────────────

export interface MigracionDump {
  clientes: Cliente[]
  grupos: string[]
  cartera: Record<string, CartEntrada>
}

export interface MigracionResumen {
  clientes_creados: number
  clientes_omitidos: number
  grupos_creados: number
  carteras_migradas: number
  carteras_omitidas: number
  movimientos: number
  huerfanos: string[]
}

export async function migrarLocalStorageAPI(dump: MigracionDump): Promise<{ ok: boolean; resumen: MigracionResumen }> {
  return apiFetch("/caja/migrar-localstorage", {
    method: "POST",
    body: JSON.stringify(dump),
  })
}

// ── Cajas (módulo ferremex_cajas) ─────────────────────────────────────────────

import type { Proveedor, FacturaCredito } from "./proveedores"

export interface CajaAPI {
  id: string
  nombre: string
  descripcion: string | null
  activa: boolean
}

export async function listarCajasAPI(): Promise<CajaAPI[]> {
  return apiFetch<CajaAPI[]>("/caja/cajas")
}

export async function crearCajaAPI(
  caja: { nombre: string; descripcion?: string | null; activa?: boolean }
): Promise<CajaAPI> {
  return apiFetch<CajaAPI>("/caja/cajas", { method: "POST", body: JSON.stringify(caja) })
}

export async function actualizarCajaAPI(
  id: string,
  caja: Partial<{ nombre: string; descripcion: string | null; activa: boolean }>
): Promise<CajaAPI> {
  return apiFetch<CajaAPI>(`/caja/cajas/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(caja),
  })
}

export async function eliminarCajaAPI(id: string): Promise<void> {
  await apiFetch(`/caja/cajas/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ── Proveedores + facturas (módulo ferremex_proveedores) ──────────────────────

export async function listarProveedoresAPI(): Promise<Proveedor[]> {
  return apiFetch<Proveedor[]>("/caja/proveedores")
}

export async function siguienteNumProveedorAPI(): Promise<string> {
  const r = await apiFetch<{ num_proveedor: string }>("/caja/proveedores?siguiente-num=1")
  return r.num_proveedor
}

/** Crea un proveedor (sin sus facturas; éstas se agregan por separado). */
export async function crearProveedorAPI(
  prov: Omit<Proveedor, "id" | "facturas">
): Promise<Proveedor> {
  return apiFetch<Proveedor>("/caja/proveedores", { method: "POST", body: JSON.stringify(prov) })
}

export async function actualizarProveedorAPI(
  id: string,
  prov: Partial<Omit<Proveedor, "id" | "facturas">>
): Promise<Proveedor> {
  return apiFetch<Proveedor>(`/caja/proveedores/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(prov),
  })
}

export async function eliminarProveedorAPI(id: string): Promise<void> {
  await apiFetch(`/caja/proveedores/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function agregarFacturaAPI(
  proveedorId: string,
  factura: Omit<FacturaCredito, "id">
): Promise<FacturaCredito> {
  return apiFetch<FacturaCredito>(`/caja/proveedores/${encodeURIComponent(proveedorId)}/facturas`, {
    method: "POST",
    body: JSON.stringify(factura),
  })
}

export async function actualizarFacturaAPI(
  proveedorId: string,
  facturaId: string,
  factura: Partial<Omit<FacturaCredito, "id">>
): Promise<FacturaCredito> {
  return apiFetch<FacturaCredito>(
    `/caja/proveedores/${encodeURIComponent(proveedorId)}/facturas/${encodeURIComponent(facturaId)}`,
    { method: "PUT", body: JSON.stringify(factura) }
  )
}

export async function eliminarFacturaAPI(proveedorId: string, facturaId: string): Promise<void> {
  await apiFetch(
    `/caja/proveedores/${encodeURIComponent(proveedorId)}/facturas/${encodeURIComponent(facturaId)}`,
    { method: "DELETE" }
  )
}

// ── Migración one-shot proveedores + cajas → BD ───────────────────────────────

export interface MigracionProvCajasResumen {
  proveedores_creados: number
  proveedores_omitidos: number
  facturas: number
  cajas_creadas: number
  cajas_omitidas: number
  asignaciones_aplicadas: number
  compras_creadas: number
  compras_omitidas: number
  huerfanos: string[]
}

export async function migrarProveedoresCajasAPI(dump: {
  proveedores?: Proveedor[]
  cajas?: { id?: string | number; nombre: string; descripcion?: string | null; activa?: boolean }[]
  asignaciones?: Record<string, string>
  compras?: any[]
}): Promise<{ ok: boolean; resumen: MigracionProvCajasResumen }> {
  return apiFetch("/caja/migrar-proveedores-cajas", {
    method: "POST",
    body: JSON.stringify(dump),
  })
}

// ── Compras (módulo ferremex_compras) ─────────────────────────────────────────

export interface ArticuloCompraAPI {
  codigo: string
  nombre: string
  cantidad: number
  precioUnit: number
  categoria: string
  departamento: string
  marca: string
}

export interface CompraAPI {
  id: string
  folio: string
  proveedor: string
  proveedorId: string | null
  fecha: string
  tipo: string
  estado: string
  subtotal: number
  iva: number
  total: number
  canceladaEl: string | null
  motivoCancelacion: string | null
  articulos: ArticuloCompraAPI[]
}

/** Lista compras. `proveedorId` filtra por proveedor del catálogo. */
export async function listarComprasAPI(proveedorId?: string): Promise<CompraAPI[]> {
  const qs = proveedorId ? `?proveedor_id=${encodeURIComponent(proveedorId)}` : ""
  return apiFetch<CompraAPI[]>(`/caja/compras${qs}`)
}

/** Registra una compra con sus artículos. */
export async function crearCompraAPI(compra: Omit<CompraAPI, "id">): Promise<CompraAPI> {
  return apiFetch<CompraAPI>("/caja/compras", {
    method: "POST",
    body: JSON.stringify(compra),
  })
}

/** Cancela una compra (estado → Cancelada + motivo). El inventario lo ajusta el caller. */
export async function cancelarCompraAPI(id: string, motivo: string): Promise<CompraAPI> {
  return apiFetch<CompraAPI>(`/caja/compras/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ estado: "Cancelada", motivo }),
  })
}
