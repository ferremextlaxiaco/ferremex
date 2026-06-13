// Todas las llamadas van al mismo origen en producción.
// En dev, Vite proxea /caja → localhost:9000.

// ── Productos ────────────────────────────────────────────────────────────────

export interface ProductoPOS {
  sku: string
  descripcion: string
  precio: number
  precio2?: number
  // Niveles 3 y 4 (Distribuidor / Especial). Se exponen para que las promos de
  // tipo "nivel_precio" puedan forzar ese precio. Opcionales/retrocompatibles.
  precio3?: number
  precio4?: number
  /** Si true, `precio`/`precio2` ya incluyen IVA (16%). Para desglose fiscal. */
  impuesto?: boolean
  existencia: number
  thumbnail: string | null
  marca?: string
  // Departamento y categoría reales del producto (de su metadata). Los usa el
  // motor del Monedero (lib/monedero.ts) para resolver la tasa de puntos por
  // taxonomía sin depender de que el producto tenga marca registrada.
  departamento?: string
  categoria?: string
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
  // Caja física de la venta (id del catálogo ferremex_cajas, heredada del cajero
  // logueado). El corte agrupa por este campo. Opcional/retrocompatible.
  caja_id?: string | null
  caja_name?: string | null
  // Vendedor de esta venta (quién la hizo). Default = cajero logueado; editable
  // en el panel de venta. Solo atribución, no afecta el corte.
  vendedor?: string | null
  // paquete_id/paquete_nombre marcan que el item forma parte de un paquete
  // vendido (el precio_unitario ya viene prorrateado). Opcionales y
  // retrocompatibles: una venta normal no los envía.
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number; paquete_id?: string; paquete_nombre?: string }[]
  pago_efectivo: number
  pago_transferencia?: number
  // Pago con tarjeta bancaria (crédito/débito vía TPV). No es efectivo (no abre
  // cajón ni cuenta al efectivo esperado del corte), pero sí entra a los totales.
  pago_tarjeta?: number
  pago_credito?: number
  // Monedero: pago con puntos (en MXN) y puntos ganados por la compra. El motor
  // del frontend (lib/monedero.ts) calcula puntos_ganados; el backend valida el
  // saldo del canje y registra ambos movimientos transaccionalmente.
  pago_puntos?: number
  puntos_ganados?: number
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
  pago_tarjeta?: number
  pago_credito: number
  // Monedero (presentes solo si la venta tocó puntos).
  pago_puntos?: number
  puntos_canjeados?: number
  puntos_ganados?: number
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
  pago_tarjeta?: number
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
  /** Caja física del corte (heredada del empleado). null si no tenía asignada. */
  caja_id?: string | null
  caja_name?: string | null
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_tarjeta: number
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
  /** Caja física arqueada (null = grupo "sin caja", ventas/movs históricos). */
  caja_id?: string | null
  /** Inicio del período del corte (cerrado_en del corte anterior de la caja, o null). */
  periodo_desde?: string | null
  /** Modo de turnos global y franjas (para que el corte ofrezca selector de franja). */
  modo?: "dia" | "turnos"
  franjas?: FranjaTurno[]
  /** Franja del corte (modo turnos) o null (modo día). */
  franja_id?: string | null
  num_ventas: number
  total_ventas: number
  ventas_efectivo: number
  ventas_transferencia: number
  ventas_tarjeta: number
  ventas_credito: number
  fondo_inicial: number
  entradas_manuales: number
  salidas_manuales: number
  efectivo_esperado: number
  ventas: CorteVentaItem[]
  movimientos: CorteMovItem[]
  /** Snapshot si este período ya fue cerrado; null si sigue abierto. */
  cerrado: CorteCerrado | null
}

export interface CerrarCorteInput {
  /** Quién realiza el corte (el que arquea; no necesariamente quien vendió). */
  cajero: string
  cajero_id?: string
  /** Caja a arquear. Su período va desde el último corte de la caja hasta ahora. */
  caja_id?: string | null
  caja_name?: string | null
  /** Modo turnos: franja+día a arquear (subdivide el corte). Omitidos = modo día. */
  franja_id?: string | null
  dia?: string | null
  efectivo_contado: number
  fondo_dejado?: number
  motivo?: string
  denominaciones?: Record<string, number> | null
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
  /** Caja física asignada (id del catálogo ferremex_cajas). 0..1 por empleado. */
  caja_id?: string | null
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

/**
 * Resuelve UN producto por su SKU exacto (≈10ms; cortocircuita la búsqueda).
 * Útil para hidratar info ligera (descripción/imagen) de SKUs conocidos sin
 * disparar la búsqueda fonética completa de `listarArticulos` (~1s por consulta).
 * Devuelve null si no existe.
 */
export async function buscarProductoPorSku(sku: string): Promise<ProductoPOS | null> {
  const res = await apiFetch<ProductoPOS[]>(`/caja/productos?sku=${encodeURIComponent(sku)}`)
  return res.find((p) => p.sku === sku) ?? res[0] ?? null
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
  pago_tarjeta?: number
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
  const r = await apiFetch<VentaResponse>("/caja/ventas", {
    method: "POST",
    body: JSON.stringify(venta),
  })
  // Si la venta tocó puntos (ganó/canjeó), el saldo del cliente cambió en BD →
  // invalida su detalle cacheado para que la próxima lectura sea fresca.
  if (venta.cliente_id && (venta.pago_puntos || venta.puntos_ganados)) {
    invalidarDetalleMonedero(venta.cliente_id)
  }
  return r
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

/**
 * Resumen del corte ABIERTO de una caja (período desde su último cierre). Pasa
 * `caja_id` vacío/null para el grupo "sin caja". En modo turnos, `franja` acota
 * a una franja+día: { franja_id, dia } (YYYY-MM-DD).
 */
export async function obtenerCorte(
  caja_id?: string | null,
  franja?: { franja_id: string; dia: string } | null
): Promise<CorteResponse> {
  const params = new URLSearchParams()
  if (caja_id) params.set("caja_id", caja_id)
  if (franja?.franja_id && franja?.dia) {
    params.set("franja_id", franja.franja_id)
    params.set("dia", franja.dia)
  }
  return apiFetch<CorteResponse>(`/caja/corte?${params}`)
}

/** Cierra el turno con el arqueo completo. Devuelve el snapshot persistido. */
export async function cerrarCorte(input: CerrarCorteInput): Promise<CerrarCorteResult> {
  return apiFetch<CerrarCorteResult>("/caja/corte", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** Una caja con ventas sin cortar (su corte está pendiente de realizarse). */
export interface CortePendiente {
  caja_id: string | null
  caja_name: string
  num_ventas: number
  total_ventas: number
  desde: string | null         // último cierre (null si nunca se cortó)
  primera_venta: string | null
  ultima_venta: string | null
  vendedores: string[]
}

/** Cajas con ventas pendientes de corte (tablero de avisos del POS). */
export async function listarCortesPendientes(): Promise<CortePendiente[]> {
  const r = await apiFetch<{ pendientes: CortePendiente[] }>("/caja/cortes-pendientes")
  return r.pendientes
}

// ── Config de turnos (modo día / turnos por franja) ────────────────────────────

export interface FranjaTurno {
  id: string
  nombre: string
  desde: string  // "HH:MM"
  hasta: string  // "HH:MM"
}

export interface TurnosConfig {
  /** "dia" = corte continuo por caja (default). "turnos" = subdivide por franja. */
  modo: "dia" | "turnos"
  franjas: FranjaTurno[]
}

export async function obtenerConfigTurnos(): Promise<TurnosConfig> {
  return apiFetch<TurnosConfig>("/caja/turnos-config")
}

export async function guardarConfigTurnos(cfg: Partial<TurnosConfig>): Promise<TurnosConfig> {
  return apiFetch<TurnosConfig>("/caja/turnos-config", { method: "PUT", body: JSON.stringify(cfg) })
}

// ── Cotizaciones ───────────────────────────────────────────────────────────────

export interface ItemCotizacion {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  impuesto?: boolean
  paquete_id?: string
  paquete_nombre?: string
}

export interface CotizacionRequest {
  cajero: string
  turno_id: string
  items: ItemCotizacion[]
  cliente_id?: string | null
  cliente_nombre?: string | null
  num_precio?: number | null
}

export interface Cotizacion {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  items: (ItemCotizacion & { subtotal: number })[]
  total: number
  cliente_id: string | null
  cliente_nombre: string | null
  num_precio: number | null
  estado: "vigente" | "convertida"
  folio_venta?: string | null
  convertida_en?: string | null
}

/** Lista cotizaciones. Filtros opcionales por fecha y estado. Reciente primero. */
export async function listarCotizaciones(opts: {
  desde?: string
  hasta?: string
  estado?: "vigente" | "convertida"
} = {}): Promise<Cotizacion[]> {
  const params = new URLSearchParams()
  if (opts.desde) params.set("desde", opts.desde)
  if (opts.hasta) params.set("hasta", opts.hasta)
  if (opts.estado) params.set("estado", opts.estado)
  return apiFetch<Cotizacion[]>(`/caja/cotizaciones?${params}`)
}

/** Una cotización por folio. null si no existe. */
export async function obtenerCotizacion(folio: string): Promise<Cotizacion | null> {
  try {
    return await apiFetch<Cotizacion>(`/caja/cotizaciones/${encodeURIComponent(folio)}`)
  } catch {
    return null
  }
}

/** Guarda una cotización (genera folio COT-). No descuenta inventario. */
export async function crearCotizacion(cot: CotizacionRequest): Promise<Cotizacion> {
  return apiFetch<Cotizacion>("/caja/cotizaciones", {
    method: "POST",
    body: JSON.stringify(cot),
  })
}

/** Actualiza una cotización existente (mismo folio). Para reimprimir tras editar. */
export async function actualizarCotizacion(
  folio: string,
  datos: Omit<CotizacionRequest, "cajero" | "turno_id">
): Promise<Cotizacion> {
  return apiFetch<Cotizacion>(`/caja/cotizaciones/${encodeURIComponent(folio)}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  })
}

/** Marca una cotización como convertida en venta y la enlaza al folio de venta. */
export async function marcarCotizacionConvertida(
  folio: string,
  folio_venta: string
): Promise<Cotizacion> {
  return apiFetch<Cotizacion>(`/caja/cotizaciones/${encodeURIComponent(folio)}`, {
    method: "PATCH",
    body: JSON.stringify({ estado: "convertida", folio_venta }),
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

// Cache en memoria de la taxonomía. El árbol Dept→Cat→Marca es global y estable
// dentro de una sesión de caja; bajarlo en cada apertura del cobro (es pesado)
// retrasaba el preview de puntos. Se cachea con TTL y se invalida al mutar la
// taxonomía (PATCH /caja/catalogos). `force` salta el cache (refresco explícito).
const CATALOGOS_TTL_MS = 5 * 60 * 1000
let _catalogosCache: { data: CatalogosData; ts: number } | null = null
let _catalogosInflight: Promise<CatalogosData> | null = null

export function invalidarCatalogosCache(): void {
  _catalogosCache = null
  _catalogosInflight = null
}

export async function listarCatalogos(force = false): Promise<CatalogosData> {
  const ahora = Date.now()
  if (!force && _catalogosCache && ahora - _catalogosCache.ts < CATALOGOS_TTL_MS) {
    return _catalogosCache.data
  }
  // Coalescer llamadas concurrentes: varios consumidores que piden a la vez
  // comparten un solo fetch en vuelo en lugar de disparar N peticiones.
  if (!force && _catalogosInflight) return _catalogosInflight
  const p = apiFetch<CatalogosData>("/caja/catalogos")
    .then((data) => { _catalogosCache = { data, ts: Date.now() }; return data })
    .finally(() => { _catalogosInflight = null })
  _catalogosInflight = p
  return p
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
  const r = await apiFetch<{ ok: boolean; actualizados: number }>("/caja/catalogos", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  // La taxonomía cambió → invalida el cache para que los consumidores la rebajen.
  invalidarCatalogosCache()
  return r
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

// ── Promociones (módulo ferremex_promociones) ─────────────────────────────────

export type TipoPromo = "porcentaje" | "nivel_precio" | "nxm" | "volumen" | "personalizado"
export type ModoArticulosPromo = "mismos" | "cruzada"
export type SegmentoPromo = "todos" | "cliente" | "grupo"
export type AlcanceVolumen = "todas" | "excedente"

/**
 * Descuento individual de un artículo. Se usa en tipo "personalizado"
 * (porcentaje/precio_fijo) y en "nivel_precio" + cruzada (nivel_precio: valor 2|3|4).
 */
export interface DescuentoArticulo {
  tipo: "porcentaje" | "precio_fijo" | "nivel_precio"
  valor: number // % si porcentaje; precio MXN si precio_fijo; nivel 2|3|4 si nivel_precio
}

/**
 * Una promoción del POS (regla de descuento aplicable en el carrito). Dato
 * maestro compartido (BD, módulo ferremex_promociones). La APLICACIÓN vive en el
 * motor lib/promociones.ts (`calcularLineaConPromo`); aquí solo es transporte.
 */
export interface Promocion {
  id: string
  nombre: string
  activa: boolean
  /** Vigencia opcional (YYYY-MM-DD). null = sin límite por ese extremo. */
  inicio: string | null
  fin: string | null
  /** Desempate cuando varias promos aplican a una misma línea: mayor gana. */
  prioridad: number
  tipo: TipoPromo
  porcentaje: number | null
  nivel_precio: number | null
  nxm_lleva: number | null
  nxm_paga: number | null
  volumen_min: number | null
  volumen_desc: number | null
  volumen_alcance: AlcanceVolumen | null
  modo_articulos: ModoArticulosPromo
  /** SKUs que activan la promo (y que reciben el descuento si modo="mismos"). */
  skus_requeridos: string[]
  /** SKUs que reciben el descuento (= requeridos cuando modo="mismos"). */
  skus_beneficiados: string[]
  /** Solo tipo "personalizado": descuento por SKU. {} para los demás tipos. */
  descuentos_articulo: Record<string, DescuentoArticulo>
  segmento: SegmentoPromo
  cliente_id: string | null
  grupo: string | null
  cantidad_minima: number | null
  max_unidades: number | null
  etiqueta: string | null
}

/** Cuerpo para crear/editar (el servidor pone id y revalida todo). */
export type PromocionInput = Omit<Promocion, "id">

export async function listarPromociones(): Promise<Promocion[]> {
  return apiFetch<Promocion[]>("/caja/promociones")
}

export async function crearPromocion(promo: PromocionInput): Promise<Promocion> {
  return apiFetch<Promocion>("/caja/promociones", {
    method: "POST",
    body: JSON.stringify(promo),
  })
}

export async function actualizarPromocion(id: string, promo: PromocionInput): Promise<Promocion> {
  return apiFetch<Promocion>(`/caja/promociones/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(promo),
  })
}

export async function eliminarPromocion(id: string): Promise<void> {
  await apiFetch(`/caja/promociones/${encodeURIComponent(id)}`, { method: "DELETE" })
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

// ── Monedero Electrónico (módulo ferremex_monedero) ───────────────────────────
// Programa de lealtad por puntos. Config global + reglas de generación por
// taxonomía + niveles/tiers + estado de cuenta de puntos por cliente. El motor
// de cálculo de puntos/nivel vive en lib/monedero.ts (compartido). Devengo y
// canje son transaccionales en /caja/ventas; estas funciones son para el módulo
// admin (tabla, reglas, niveles, config) y la lectura de saldo en venta.

export interface ConfigMonederoAPI {
  id: string
  valor_punto: number
  tasa_base: number
  max_canje_pct: number
  min_puntos_canje: number
  vencimiento_meses: number
  confirmar_huella: boolean
  confirmar_codigo: boolean
  redondeo: "abajo" | "normal" | "ninguno"
  periodo_nivel_meses: number
}

export interface ReglaPuntosAPI {
  id: string
  ambito: "marca" | "departamento" | "categoria"
  ref: string
  tasa: number
  activa: boolean
}

export interface NivelMonederoAPI {
  id: string
  nombre: string
  orden: number
  umbral_periodo: number
  multiplicador: number
  valor_punto_bonus: number | null
  nivel_precio: number | null
  color: string | null
  activo: boolean
}

export interface MovimientoMonederoAPI {
  id: string
  tipo: "ganado" | "canjeado" | "ajuste" | "vencido" | "reset"
  puntos: number
  folio: string | null
  descripcion: string
  fecha: string
  cancelado: boolean
  motivo_cancelacion: string | null
  fecha_cancelacion: string | null
}

export interface ClienteMonederoFila {
  id: string
  num_cliente: string
  nombre: string
  telefono: string
  puntos: number
  valor: number
  nivel_nombre: string | null
  nivel_color: string | null
  compras_periodo: number
}

export interface ClientesMonederoResp {
  clientes: ClienteMonederoFila[]
  kpis: { inscritos: number; puntos_circulacion: number; valor_circulacion: number }
}

export interface DetalleMonedero {
  customer_id: string
  saldo: number
  valor_saldo: number
  config: ConfigMonederoAPI
  compras_periodo: number
  periodo_meses: number
  nivel_actual: NivelMonederoAPI | null
  nivel_siguiente: NivelMonederoAPI | null
  movimientos: MovimientoMonederoAPI[]
}

// Cache en memoria de los datos GLOBALES del monedero (config + reglas). Son
// estables dentro de una sesión y los necesita el preview de puntos del cobro;
// cachearlos (y precargarlos al elegir cliente) elimina el retraso al abrir el
// modal. Se invalidan al mutar config/reglas/niveles desde administración.
const MONEDERO_TTL_MS = 5 * 60 * 1000
let _cfgMonederoCache: { data: ConfigMonederoAPI; ts: number } | null = null
let _cfgMonederoInflight: Promise<ConfigMonederoAPI> | null = null
let _reglasMonederoCache: { data: ReglaPuntosAPI[]; ts: number } | null = null
let _reglasMonederoInflight: Promise<ReglaPuntosAPI[]> | null = null

export function invalidarMonederoCache(): void {
  _cfgMonederoCache = null; _cfgMonederoInflight = null
  _reglasMonederoCache = null; _reglasMonederoInflight = null
}

/**
 * Precarga (warm-up) los datos globales del monedero (config + reglas) + la
 * taxonomía y, si se da un customerId, el detalle del cliente (saldo + nivel),
 * en paralelo y sin bloquear. Se llama al seleccionar un cliente inscrito para
 * que al abrir el cobro el preview de puntos esté listo al instante.
 * Fire-and-forget: los errores se ignoran (el monedero es opcional).
 */
export function precargarMonederoGlobal(customerId?: string): void {
  void Promise.all([
    obtenerConfigMonederoAPI().catch(() => null),
    listarReglasMonederoAPI().catch(() => null),
    listarCatalogos().catch(() => null),
    customerId ? obtenerDetalleMonederoAPI(customerId).catch(() => null) : null,
  ])
}

// Config
export async function obtenerConfigMonederoAPI(force = false): Promise<ConfigMonederoAPI> {
  const ahora = Date.now()
  if (!force && _cfgMonederoCache && ahora - _cfgMonederoCache.ts < MONEDERO_TTL_MS) return _cfgMonederoCache.data
  if (!force && _cfgMonederoInflight) return _cfgMonederoInflight
  const p = apiFetch<ConfigMonederoAPI>("/caja/monedero/config")
    .then((data) => { _cfgMonederoCache = { data, ts: Date.now() }; return data })
    .finally(() => { _cfgMonederoInflight = null })
  _cfgMonederoInflight = p
  return p
}
export async function guardarConfigMonederoAPI(cfg: Partial<ConfigMonederoAPI>): Promise<ConfigMonederoAPI> {
  const r = await apiFetch<ConfigMonederoAPI>("/caja/monedero/config", { method: "PUT", body: JSON.stringify(cfg) })
  invalidarMonederoCache()
  return r
}

// Reglas de puntos
export async function listarReglasMonederoAPI(force = false): Promise<ReglaPuntosAPI[]> {
  const ahora = Date.now()
  if (!force && _reglasMonederoCache && ahora - _reglasMonederoCache.ts < MONEDERO_TTL_MS) return _reglasMonederoCache.data
  if (!force && _reglasMonederoInflight) return _reglasMonederoInflight
  const p = apiFetch<ReglaPuntosAPI[]>("/caja/monedero/reglas")
    .then((data) => { _reglasMonederoCache = { data, ts: Date.now() }; return data })
    .finally(() => { _reglasMonederoInflight = null })
  _reglasMonederoInflight = p
  return p
}
export async function crearReglaMonederoAPI(r: Omit<ReglaPuntosAPI, "id">): Promise<ReglaPuntosAPI> {
  const res = await apiFetch<ReglaPuntosAPI>("/caja/monedero/reglas", { method: "POST", body: JSON.stringify(r) })
  invalidarMonederoCache()
  return res
}
export async function actualizarReglaMonederoAPI(id: string, r: Partial<ReglaPuntosAPI>): Promise<ReglaPuntosAPI> {
  const res = await apiFetch<ReglaPuntosAPI>(`/caja/monedero/reglas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(r) })
  invalidarMonederoCache()
  return res
}
export async function eliminarReglaMonederoAPI(id: string): Promise<void> {
  await apiFetch(`/caja/monedero/reglas/${encodeURIComponent(id)}`, { method: "DELETE" })
  invalidarMonederoCache()
}

// Niveles
export async function listarNivelesMonederoAPI(): Promise<NivelMonederoAPI[]> {
  return apiFetch<NivelMonederoAPI[]>("/caja/monedero/niveles")
}
export async function crearNivelMonederoAPI(n: Omit<NivelMonederoAPI, "id">): Promise<NivelMonederoAPI> {
  return apiFetch<NivelMonederoAPI>("/caja/monedero/niveles", { method: "POST", body: JSON.stringify(n) })
}
export async function actualizarNivelMonederoAPI(id: string, n: Partial<NivelMonederoAPI>): Promise<NivelMonederoAPI> {
  return apiFetch<NivelMonederoAPI>(`/caja/monedero/niveles/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(n) })
}
export async function eliminarNivelMonederoAPI(id: string): Promise<void> {
  await apiFetch(`/caja/monedero/niveles/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// Clientes / saldos / detalle
export async function listarClientesMonederoAPI(): Promise<ClientesMonederoResp> {
  return apiFetch<ClientesMonederoResp>("/caja/monedero/clientes")
}
// Cache por-cliente del detalle (saldo + nivel) con TTL corto: lo precargamos al
// seleccionar al cliente para que el preview de puntos del cobro sea instantáneo,
// pero con vida breve para que el saldo no quede rancio de cara al canje. Las
// mutaciones de puntos del cliente lo invalidan explícitamente.
const DETALLE_MON_TTL_MS = 60 * 1000
const _detalleMonCache = new Map<string, { data: DetalleMonedero; ts: number }>()
const _detalleMonInflight = new Map<string, Promise<DetalleMonedero>>()

function invalidarDetalleMonedero(customerId: string): void {
  _detalleMonCache.delete(customerId)
  _detalleMonInflight.delete(customerId)
}

export async function obtenerDetalleMonederoAPI(customerId: string, force = false): Promise<DetalleMonedero> {
  const ahora = Date.now()
  const hit = _detalleMonCache.get(customerId)
  if (!force && hit && ahora - hit.ts < DETALLE_MON_TTL_MS) return hit.data
  const inflight = _detalleMonInflight.get(customerId)
  if (!force && inflight) return inflight
  const p = apiFetch<DetalleMonedero>(`/caja/monedero/${encodeURIComponent(customerId)}`)
    .then((data) => { _detalleMonCache.set(customerId, { data, ts: Date.now() }); return data })
    .finally(() => { _detalleMonInflight.delete(customerId) })
  _detalleMonInflight.set(customerId, p)
  return p
}
export async function inscribirMonederoAPI(customerId: string): Promise<void> {
  await apiFetch(`/caja/monedero/${encodeURIComponent(customerId)}/inscribir`, { method: "POST" })
  invalidarDetalleMonedero(customerId)
}
export async function darDeBajaMonederoAPI(customerId: string): Promise<void> {
  await apiFetch(`/caja/monedero/${encodeURIComponent(customerId)}`, { method: "DELETE" })
  invalidarDetalleMonedero(customerId)
}
export async function ajustarPuntosMonederoAPI(
  customerId: string,
  puntos: number,
  descripcion: string
): Promise<{ saldo: number }> {
  const r = await apiFetch<{ saldo: number }>(`/caja/monedero/${encodeURIComponent(customerId)}/movimientos`, {
    method: "POST",
    body: JSON.stringify({ puntos, descripcion }),
  })
  invalidarDetalleMonedero(customerId)
  return r
}
export async function resetearPuntosMonederoAPI(customerId: string, motivo: string): Promise<{ puntos_restados: number }> {
  const r = await apiFetch<{ puntos_restados: number }>(`/caja/monedero/${encodeURIComponent(customerId)}/reset`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  })
  invalidarDetalleMonedero(customerId)
  return r
}
