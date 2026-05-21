// Todas las llamadas van al mismo origen en producción.
// En dev, Vite proxea /caja → localhost:9000.

// ── Productos ────────────────────────────────────────────────────────────────

export interface ProductoPOS {
  sku: string
  descripcion: string
  precio: number
  existencia: number
  thumbnail: string | null
  marca?: string
  especificaciones?: { clave: string; valor: string }[]
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
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number }[]
  pago_efectivo: number
}

export interface VentaResponse {
  folio: string
  fecha: string
  cajero: string
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  total: number
  pago_efectivo: number
  cambio: number
}

export interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
}

export interface CorteResponse {
  cajero: string
  turno_id: string
  num_ventas: number
  total: number
  ventas: VentaRegistro[]
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
  pin: string
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
  }
}

// ── Fetch base ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

export async function registrarVenta(venta: VentaRequest): Promise<VentaResponse> {
  return apiFetch<VentaResponse>("/caja/ventas", {
    method: "POST",
    body: JSON.stringify(venta),
  })
}

export async function obtenerCorte(cajero: string, turno_id: string): Promise<CorteResponse> {
  const params = new URLSearchParams({ cajero, turno_id })
  return apiFetch<CorteResponse>(`/caja/corte?${params}`)
}

export async function cerrarCorte(cajero: string, turno_id: string): Promise<void> {
  await apiFetch("/caja/corte", {
    method: "POST",
    body: JSON.stringify({ cajero, turno_id }),
  })
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

export async function obtenerUsuarios(): Promise<PosUsuario[]> {
  return apiFetch<PosUsuario[]>("/caja/usuarios")
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
