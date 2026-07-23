// Todas las llamadas van al mismo origen en producción.
// En dev, Vite proxea /caja → localhost:9000.

import type { NivelUnidad } from "./niveles"
export type { NivelUnidad } from "./niveles"

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
  // Proveedor del producto (para venta por encargo → pedido automático). El
  // backend de /caja/productos los proyecta desde metadata. Vacío = sin proveedor.
  proveedor?: string
  proveedor_id?: string
  especificaciones?: { clave: string; valor: string }[]
  mayoreoActivo?: boolean
  mayoreoMin?: number
  // Venta fraccionada (granel): si true, el carrito permite capturar cantidad o
  // monto ($) con decimales y recalcular el otro automáticamente. `unidadVenta`
  // es el código SAT de la unidad (ej. "KGM", "MTR"); se muestra abreviada.
  granel?: boolean
  unidadVenta?: string
  // Unidad de COMPRA + factor (ej. Rollo = 50 Metros de unidadVenta). Cuando
  // difieren de la unidad de venta, `presentaCompraVenta` (derivado por el
  // backend) indica que el POS debe ofrecer vender también por la presentación
  // de compra completa. Inventario REAL: se descuenta siempre en unidad de
  // venta y SÍ bloquea si no alcanza (a diferencia del granel, informativo).
  // Ver PresentacionSelectorModal.
  unidadCompra?: string
  factor?: number
  presentaCompraVenta?: boolean
  // Precios de la UNIDAD DE VENTA (ej. Metro) — independientes de precio1-4
  // (unidad de COMPRA, ej. Rollo). Solo tienen sentido si unidadVenta !=
  // unidadCompra; se capturan a mano en ArticleDrawer, sin relación matemática
  // automática con precio1-4. El selector de "vender por unidad suelta" usa
  // estos; el de "unidad de compra completa" usa precio1-4.
  precioVenta1?: number
  precioVenta2?: number
  precioVenta3?: number
  precioVenta4?: number
  // Cadena de N niveles de unidad (Pieza→Bolsa→Caja…), generalización de
  // unidadCompra/unidadVenta/factor a más de 2 niveles con auto-consolidación
  // en el carrito. Ver lib/niveles.ts. Ausente/vacío = artículo sin cadena
  // configurada (usa unidadVenta/precio a secas, como siempre). Cuando el
  // artículo SÍ tiene unidadCompra+factor, el backend siempre la proyecta
  // (derivada si no está en metadata) — nunca queda sin cadena equivalente.
  nivelesUnidad?: NivelUnidad[]
  // Inventario INFORMATIVO (antes "artículo especial/granel"): el nivel base
  // de la cadena NO bloquea la venta por stock (permite negativo — es un
  // estimado, ej. Arena en m³), y cada nivel gana su propio `agotado` manual
  // (ver NivelUnidad). Cuando es false/ausente (caso normal), el nivel base
  // SÍ valida/bloquea contra stock real, sin disponibilidad manual por nivel.
  inventarioInformativo?: boolean
  // Switch manual "se acabó todo" a nivel de artículo completo, independiente
  // del `agotado` de cada nivel — apaga la venta del artículo entero de un
  // jalón sin tener que marcar cada nivel uno por uno. Solo tiene efecto
  // cuando `inventarioInformativo` está activo.
  agotadoGlobal?: boolean
}

// Opción de presentación en PresentacionSelectorModal (una por nivel de la
// cadena): nombre, precio (CON IVA, listo para mostrar), factor a la base
// (informativo, para mostrar "≈ N unidad"), y si está disponible.
export interface OpcionPresentacion {
  id: string
  nombre: string
  precio: number
  /** Factor hacia la BASE DE INVENTARIO real de la cadena (puede ser Bolsa,
   *  Caja, etc. — la que factura el proveedor). Es el que se envía al backend
   *  como `unidad_compra_factor` para descontar/validar stock: NO usar para
   *  texto mostrado, solo para lógica de inventario. */
  factor: number | null
  agotado: boolean
  /** Nombre del nivel BASE de inventario (ver `factor` arriba) — no usado hoy
   *  en el selector, se conserva por si algún consumidor futuro necesita el
   *  factor de inventario. */
  unidadBase?: string
  /** Factor hacia el nivel INMEDIATO ANTERIOR en la cadena (ej. Caja ≈ 5
   *  Bolsa, Bolsa ≈ 10 Pieza) — el mismo valor que `factorDesdeAnterior` del
   *  nivel, para el texto "≈ N <unidadMenor>" del selector. undefined en el
   *  nivel más pequeño de la cadena (no tiene anterior). */
  factorMenor?: number
  /** Nombre del nivel inmediato anterior (ver `factorMenor`). */
  unidadMenor?: string
}

export interface FiltrosBusqueda {
  q?: string
  category_id?: string
  departamento?: string
  /** Marca única (legacy). Se conserva por retrocompatibilidad. */
  marca?: string
  /** Marcas seleccionadas (selección múltiple en el filtro de Venta). Si trae
   *  ≥1, el resultado se acota a esas marcas; vacío/ausente = todas las marcas. */
  marcas?: string[]
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
  // `encargo`: la línea se vende SIN stock (venta sobre pedido). El backend salta
  // la validación de stock para ella, descuenta en negativo, y la agrega al pedido
  // abierto de su proveedor. `proveedor_id`/`proveedor` viajan para ese pedido.
  // `unidad_compra_factor`: la línea se vende por un nivel de la cadena de
  // unidades (ver lib/niveles.ts) — el backend descuenta/valida
  // `cantidad × unidad_compra_factor` PIEZAS/unidades reales del inventario.
  // `inventario_informativo` decide si esa validación BLOQUEA (false, caso
  // normal) o solo descuenta sin bloquear, permitiendo negativo (true, ej.
  // Arena). `presentacion` = nombre del nivel vendido (para ticket/historial).
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number; paquete_id?: string; paquete_nombre?: string; encargo?: boolean; no_descontar?: boolean; existencia?: number; proveedor_id?: string; proveedor?: string; unidad_compra_factor?: number; inventario_informativo?: boolean; presentacion?: string }[]
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
  // Comisión (MXN) que ganará el vendedor de esta venta. La calcula el motor
  // del frontend (lib/comisiones.ts) con la taxonomía real del carrito y las
  // reglas del vendedor; el backend solo la persiste (mismo patrón que puntos).
  comision_venta?: number
  // Saldo a favor por cambio (módulo ferremex_saldo_cambio, en MXN, 1:1 con
  // pesos — sin tasa de conversión). El backend valida saldo y registra el
  // consumo transaccionalmente. Requiere cliente_id. Concepto de negocio
  // DISTINTO al Monedero de lealtad (ferremex_monedero) — no se mezclan.
  pago_saldo_cambio?: number
  // Venta a crédito: el backend registra el cargo en la cartera del cliente de
  // forma transaccional (dentro del lock de la venta). cliente_id = Customer id.
  cliente_id?: string
  cliente_nombre?: string
  plazo?: number
  // Venta por encargo (Fase 3): ficha del cliente que se llena al cobrar. Solo se
  // envía si hay ≥1 línea con `encargo`. El backend la persiste como EncargoFicha
  // (ver /caja/encargos). El `anticipo` define lo cobrado hoy; `resta_a_cartera`
  // manda el resto a la cartera del cliente (con crédito) en vez de la ficha.
  encargo_ficha?: {
    cliente_nombre: string
    telefono: string
    motivo?: string
    tiempo_entrega?: string
    correo?: string | null
    notas?: string | null
    anticipo?: number
    resta_a_cartera?: boolean
  }
  // Entrega A DOMICILIO. Dos naturalezas según `pagada`:
  //  - omitido/false = CONTRA ENTREGA (pago diferido): descuenta inventario pero
  //    NO se cobra hoy (queda por_cobrar). Requiere `paga`.
  //  - true = YA PAGADA en tienda: se cobra HOY normal, la ficha es solo logística.
  entrega_ficha?: {
    pagada?: boolean
    direccion: string
    recibe: { nombre: string; telefono: string }
    paga?: { nombre: string; telefono: string }
    comentarios?: string
    // Con cuánto pagará el cliente al recibir (contra entrega) → cambio del repartidor.
    paga_con?: number
    // Servicio de flete (opcional, separado del total de la venta). Si
    // `cobrar_al_entregar` es false, se cobra ahora con `metodo_tienda`.
    flete?: { precio: number; cobrar_al_entregar: boolean; metodo_tienda?: string }
  }
}

export interface VentaResponse {
  folio: string
  fecha: string
  cajero: string
  // Vendedor atribuido a la venta (quién la hizo). Default = cajero. Solo
  // atribución; lo usa la nota de venta para mostrar "Vendedor" opcionalmente.
  vendedor?: string | null
  // `encargo` marca líneas vendidas sobre pedido (sin stock). El ticket lo rotula.
  // `sku` se persiste siempre (necesario para reintegrar inventario al cancelar o
  // al procesar un cambio de artículo); opcional en el tipo por compatibilidad
  // con lecturas antiguas que no lo declaraban.
  items: { sku?: string; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number; encargo?: boolean }[]
  // Folios de cambios de artículo procesados sobre esta venta (traza). Ver
  // módulo ferremex_cambios / POST /caja/cambios.
  cambios?: string[]
  total: number
  pago_efectivo: number
  pago_transferencia: number
  pago_tarjeta?: number
  pago_credito: number
  // Monedero (presentes solo si la venta tocó puntos).
  pago_puntos?: number
  puntos_canjeados?: number
  puntos_ganados?: number
  // Comisión (MXN) del vendedor de esta venta (presente solo si generó algo).
  comision_venta?: number
  // Saldo a favor por cambio consumido en esta venta (presente solo si aplicó).
  pago_saldo_cambio?: number
  cambio: number
  // Venta contra entrega (a domicilio, pago diferido). `estado: "por_cobrar"`,
  // `metodo_pago: "contra_entrega"`, y `entrega_total` = monto real a cobrar al
  // entregar (el `total` de la venta es 0 hoy, para que el corte cuadre).
  estado?: string
  metodo_pago?: string
  entrega_total?: number
  // Entrega a domicilio YA PAGADA (solo enviar): la venta se cobró normal, pero
  // tiene una entrega asociada. `"pagada"` la distingue en el historial para poder
  // reimprimir sus comprobantes. (La contra entrega se detecta por metodo_pago.)
  entrega_domicilio?: string
  // Cliente al que se hizo la venta (si lo hubo). Lo devuelve el backend desde
  // el registro; es la fuente de verdad para facturar (no el clienteActivo del
  // estado, que se resetea al terminar la venta).
  cliente_id?: string | null
  cliente_nombre?: string | null
  // CFDI nominativo timbrado de esta venta (si ya se facturó). Lo persiste el
  // backend al timbrar y lo devuelve tanto en el registro como en el listado.
  // Presencia de `factura.cfdi_id` ⇒ venta ya facturada (permite mostrar
  // "Ver factura" en vez de "Facturar" sin una consulta extra por fila).
  factura?: FacturaVenta | null
  // Servicio de flete ligado a esta venta (vive en la ficha de entrega; el GET
  // /caja/ventas lo adjunta como resumen). Presente solo si hay flete no cancelado.
  // La Consulta de ventas lo muestra como tarjeta ligada bajo la venta.
  flete?: {
    precio: number
    cobrado: boolean
    al_entregar: boolean
    // "cobrado" | "al_entregar" | "por_cobrar"
    estado: string
  } | null
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

/** Comisión total generada por un vendedor en el período de un corte. */
export interface ComisionVendedor {
  vendedor: string
  total: number
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
  /** Comisión por vendedor congelada al momento del cierre. */
  comisiones_por_vendedor?: ComisionVendedor[]
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
  /** Comisión total generada por cada vendedor en el período (informativo). */
  comisiones_por_vendedor?: ComisionVendedor[]
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
  // Precios de la UNIDAD DE VENTA (ej. Metro) — ver ProductoPOS. `margenVenta`
  // = % que precioVenta1 representaba de precio1 al capturarse (informativo hoy;
  // servirá para recalcular automático cuando exista la precarga de facturas).
  precioVenta1?: number
  precioVenta2?: number
  precioVenta3?: number
  precioVenta4?: number
  margenVenta?: number
  claveSat: string
  proveedor?: string
  /** ID del proveedor en el catálogo (ferremex_proveedores). Vacío = sin vincular
   *  (artículo viejo con proveedor solo en texto, o sin proveedor asignado). */
  proveedor_id?: string
  inventarioMin: number
  inventarioMax: number
  localizacion: string
  peso: number
  ventaGranel: boolean
  // Cadena de N niveles de unidad — ver ProductoPOS y lib/niveles.ts.
  nivelesUnidad?: NivelUnidad[]
  // Inventario informativo + switch global — ver ProductoPOS.
  inventarioInformativo?: boolean
  agotadoGlobal?: boolean
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

export interface ArticuloPreview {
  id: string
  clave: string
  descripcion: string
  marca: string
  thumbnail: string | null
  existencia: number
}

export interface ArticulosPreviewPagina {
  items: ArticuloPreview[]
  total: number
}

/** Previsualización paginada de artículos de un nivel de catálogo (modal "Ver
 *  artículos"). A diferencia de listarArticulosDeCatalogo, solo trae la página
 *  pedida (evita procesar miles de artículos de golpe en deptos grandes). */
export async function listarArticulosPreview(
  filtro: { departamento?: string; categoria?: string; marca?: string },
  opciones: { q?: string; limit?: number; offset?: number } = {}
): Promise<ArticulosPreviewPagina> {
  const params = new URLSearchParams()
  if (filtro.departamento) params.set("departamento", filtro.departamento)
  if (filtro.categoria)    params.set("categoria", filtro.categoria)
  if (filtro.marca)        params.set("marca", filtro.marca)
  if (opciones.q)          params.set("q", opciones.q)
  params.set("limit",  String(opciones.limit  ?? 50))
  params.set("offset", String(opciones.offset ?? 0))
  return apiFetch<ArticulosPreviewPagina>(`/caja/catalogos/articulos?${params}`)
}

export interface ProveedoresDeNivel {
  lista: { nombre: string; n: number }[]
  sinAsignar: number
  total: number
}

/** Resumen de proveedores presentes en los productos de un nivel de catálogo
 *  (agregado en backend — nunca trae artículos completos al frontend). */
export async function listarProveedoresDeNivel(
  filtro: { departamento?: string; categoria?: string; marca?: string }
): Promise<ProveedoresDeNivel> {
  const params = new URLSearchParams()
  if (filtro.departamento) params.set("departamento", filtro.departamento)
  if (filtro.categoria)    params.set("categoria", filtro.categoria)
  if (filtro.marca)        params.set("marca", filtro.marca)
  return apiFetch<ProveedoresDeNivel>(`/caja/catalogos/proveedores?${params}`)
}

/** Lista artículos que NO tienen asignado un campo (para poder clasificarlos).
 *  Limitado server-side a 500. */
export async function listarArticulosSinClasificar(
  campo: "departamento" | "categoria" | "marca" | "proveedor"
): Promise<ArticuloPOS[]> {
  return apiFetch<ArticuloPOS[]>(`/caja/articulos?sin=${encodeURIComponent(campo)}`)
}

/** Busca artículos por texto (nombre / SKU / código de barras). Encuentra el
 *  producto AUNQUE no tenga departamento/proveedor asignado. */
export async function buscarArticulosTexto(q: string): Promise<ArticuloPOS[]> {
  if (!q.trim()) return []
  return apiFetch<ArticuloPOS[]>(`/caja/articulos?q=${encodeURIComponent(q.trim())}`)
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

/** Opciones de personalización de la Nota de Venta (toggles del modal). */
export interface NotaVentaOpts {
  imagen: boolean
  sku: boolean
  precio: boolean
  cliente: boolean
  vendedor: boolean
  notas: boolean
  notasTexto?: string
}

/**
 * Genera la NOTA DE VENTA (PDF tamaño carta) de una venta por folio, con la
 * estética de la factura pero sin sellos fiscales. El backend resuelve las
 * imágenes por SKU y el desglose de IVA. Devuelve un object URL del PDF blob
 * (revócalo con URL.revokeObjectURL al cerrar el visor).
 */
export async function generarNotaVentaPdf(folio: string, opts: NotaVentaOpts): Promise<string> {
  const res = await fetch("/caja/nota-venta", {
    method: "POST",
    headers: posHeaders(),
    body: JSON.stringify({ folio, opts }),
  })
  if (!res.ok) {
    const body = await res.text()
    let msg = `Error ${res.status}: ${body}`
    try { const j = JSON.parse(body); if (j?.error) msg = j.error } catch { /* no-JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function ajustarInventario(
  ajustes: { sku: string; nueva_cantidad: number }[]
): Promise<{ ok: boolean; actualizados: number; reparados?: number; errores: string[] }> {
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
    puede_ver_reportes: boolean
    puede_autorizar_sobregiro: boolean
    puede_gestionar_empleados: boolean
    puede_cerrar_otra_caja: boolean
    puede_ajustar_inventario: boolean
    puede_editar_articulos: boolean
    puede_ver_formatos: boolean
    puede_ver_perifericos: boolean
    puede_eliminar_cartera: boolean
    puede_ver_reglas_monedero: boolean
    puede_ver_niveles_monedero: boolean
    puede_ver_config_monedero: boolean
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
    // Venta contra entrega: ticket del cliente + hoja del repartidor. Editables
    // desde el módulo de Formatos como los demás.
    entrega_cliente: FormatoDoc
    entrega_repartidor: FormatoDoc
    // Comprobante de devolución/cambio de artículo (CambioWizard + CambiosModule).
    cambio_devolucion: FormatoDoc
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
  // Solo para la hoja del repartidor: casillas ☐ por artículo y bloque de ficha
  // de entrega (dirección/recibe/paga/comentarios). Opcionales/retrocompatibles.
  mostrar_casillas?: boolean
  mostrar_ficha?: boolean
}

export type FormatoKey = "nota_venta" | "factura" | "cupon" | "entrega_cliente" | "entrega_repartidor" | "cambio_devolucion"

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
  entrega_cliente: {
    activo: true, titulo: "PAGO CONTRA ENTREGA",
    encabezado: ["FERREMEX", "Tlaxiaco, Oaxaca"],
    pie: ["Conserve este comprobante", "El pago se realiza al recibir el material"],
    mostrar_precios: true, mostrar_vigencia: false, vigencia_dias: 0,
  },
  entrega_repartidor: {
    activo: true, titulo: "HOJA DE ENTREGA",
    encabezado: ["FERREMEX", "Copia del repartidor"],
    pie: ["Marque cada artículo entregado", "Recabe firma y cobre el total"],
    mostrar_precios: false, mostrar_vigencia: false, vigencia_dias: 0,
    mostrar_casillas: true, mostrar_ficha: true,
  },
  cambio_devolucion: {
    activo: true, titulo: "DEVOLUCIÓN O CAMBIO",
    encabezado: ["FERREMEX", "Tlaxiaco, Oaxaca"],
    pie: ["Conserve este comprobante", "Gracias por su preferencia"],
    mostrar_precios: true, mostrar_vigencia: false, vigencia_dias: 0,
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
      entrega_cliente: { ...FORMATOS_DEFAULT.entrega_cliente, ...raw.formatos?.entrega_cliente },
      entrega_repartidor: { ...FORMATOS_DEFAULT.entrega_repartidor, ...raw.formatos?.entrega_repartidor },
      cambio_devolucion: { ...FORMATOS_DEFAULT.cambio_devolucion, ...raw.formatos?.cambio_devolucion },
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
    // Si el backend respondió JSON con { error }, usar ESE mensaje (limpio, como
    // "Sin conexión con Facturama…"). Solo caer al crudo si no es JSON.
    let msg = `Error ${res.status}: ${body}`
    try {
      const j = JSON.parse(body)
      if (j?.error) msg = j.error
    } catch { /* body no-JSON: queda el genérico */ }
    throw new Error(msg)
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
  caja_id?: string | null
  caja_name?: string | null
  vendedor?: string | null
  cliente_id?: string | null
  cliente_nombre?: string | null
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  total: number
  pago_efectivo: number
  pago_transferencia: number
  pago_tarjeta?: number
  pago_credito: number
  pago_puntos?: number
  puntos_ganados?: number
  puntos_canjeados?: number
  pago_saldo_cambio?: number
  cambio: number
  estado?: string
  motivo_cancelacion?: string
  fecha_cancelacion?: string
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

/**
 * Valida un PIN de administrador/supervisor SIN exponer PINs al cliente (el
 * backend compara contra usuarios-pos.json). Usado por confirmaciones sensibles
 * (p. ej. eliminar cuenta de crédito) que necesitan autorización de rol elevado
 * sin depender de VITE_POS_ADMIN_TOKEN para leer PINs en el navegador.
 */
export async function validarPinAutorizacionAPI(
  pin: string,
  roles?: Array<"admin" | "supervisor">
): Promise<{ valido: boolean; nombre?: string; rol?: string }> {
  return apiFetch("/caja/usuarios/validar-pin", {
    method: "POST",
    body: JSON.stringify({ pin, ...(roles ? { roles } : {}) }),
  })
}

// ── Roles y permisos (plantilla por rol) ────────────────────────────────────
// Matriz editable en Empleados → Roles y permisos. Cambiar un permiso de un rol
// aquí afecta a todos los empleados de ese rol sin override individual guardado
// en su propio PosUsuario.permisos.

export type Rol = "admin" | "supervisor" | "cajero"
export type PermisosRol = PosUsuario["permisos"]
export type RolesPermisos = Record<Rol, PermisosRol>

export async function obtenerRolesPermisosAPI(): Promise<RolesPermisos> {
  return apiFetch<RolesPermisos>("/caja/roles-permisos")
}

export async function actualizarRolPermisoAPI(rol: Rol, permisos: Partial<PermisosRol>): Promise<RolesPermisos> {
  return apiFetch<RolesPermisos>("/caja/roles-permisos", {
    method: "PUT",
    body: JSON.stringify({ rol, permisos }),
  })
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

// ── Flete (servicio facturable) ───────────────────────────────────────────────
// El flete es un SERVICIO que entra a la venta como una línea más (aparece en el
// ticket y es facturable). Su config (nombre, clave SAT, unidad SAT, precio base,
// IVA) vive en el tab "Fletes" del módulo Entregas. Al guardar, el backend crea/
// actualiza un producto Medusa oculto con SKU `SERVICIO-FLETE` que lleva la clave
// SAT — así el resolver fiscal lo mapea sin tocar el pipeline de facturación.

/** SKU fijo del producto-servicio de flete (espejo del backend). */
export const SKU_FLETE = "SERVICIO-FLETE"

export interface FleteConfig {
  nombre: string
  claveSat: string
  unidadSat: string
  precioBase: number   // SIN IVA (el vendedor puede ajustarlo al cobrar)
  aplicaIva: boolean
  sku: string
  /** Presente si el backend guardó la config pero no pudo sincronizar el producto. */
  _warning?: string
}

export async function obtenerFleteConfig(): Promise<FleteConfig> {
  return apiFetch<FleteConfig>("/caja/flete-config")
}

export async function guardarFleteConfig(config: Omit<FleteConfig, "sku" | "_warning">): Promise<FleteConfig> {
  return apiFetch<FleteConfig>("/caja/flete-config", {
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

export interface PedidoArticulo {
  clave?: string
  descripcion?: string
  cantidad: number
  // SKU real + folio de la venta que originó este renglón (venta por encargo).
  // Presentes solo en líneas generadas automáticamente por un encargo.
  sku?: string
  origen_venta?: string
}

export interface Pedido {
  id: string
  folio: string
  fecha: string
  proveedor?: string | null
  proveedorId?: string | null
  // "borrador" | "enviado" | "confirmado" | "recibido" | "encargo" (abierto por
  // encargos de clientes, se sigue alimentando hasta enviarse al proveedor).
  status: string
  // true si el pedido nació/creció de ventas por encargo (base del rastreo).
  esEncargo?: boolean
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

// ── Encargos (venta por encargo — Fase 3) ─────────────────────────────────────
// Fichas de atención al cliente para ventas sobre pedido. Distintas de los
// pedidos a proveedor: aquí vive nombre/teléfono/motivo/tiempo de entrega/montos
// y el status (pendiente → recibido → entregado). El módulo "Encargos" consulta
// estas fichas. Normalmente las crea el backend al cobrar una venta por encargo.

export type EncargoStatus = "pendiente" | "recibido" | "entregado" | "cancelado"

export interface EncargoAbono {
  id: string
  monto: number
  fecha: string
  metodo?: string
  nota?: string
}

export interface EncargoArticulo {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  proveedor?: string | null
  proveedor_id?: string | null
}

export interface EncargoFicha {
  id: string
  folio: string
  fecha: string
  cliente_nombre: string
  telefono: string
  motivo: string
  tiempo_entrega: string
  correo?: string | null
  notas?: string | null
  cliente_id?: string | null
  total: number
  anticipo: number
  // Si true, la resta se cargó a la cartera de crédito del cliente (se liquida en
  // su cuenta, no en la ficha). Si false, la resta vive en la ficha (esporádico).
  resta_en_cartera?: boolean
  abonos: EncargoAbono[]
  status: EncargoStatus
  articulos: EncargoArticulo[]
  historial: { fecha: string; de: EncargoStatus; a: EncargoStatus; nota?: string }[]
  // Derivados que agrega el backend en las respuestas.
  resta?: number
  abonado?: number
}

/** Lista todas las fichas de encargo (más reciente primero). */
export async function listarEncargos(status?: EncargoStatus): Promise<EncargoFicha[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ""
  return apiFetch<EncargoFicha[]>(`/caja/encargos${qs}`)
}

/** Detalle de una ficha de encargo por id. */
export async function obtenerEncargo(id: string): Promise<EncargoFicha> {
  return apiFetch<EncargoFicha>(`/caja/encargos/${encodeURIComponent(id)}`)
}

/**
 * Busca la ficha de encargo asociada a un folio de venta. Útil justo después de
 * cobrar una venta por encargo para imprimir el comprobante. Devuelve null si no
 * existe (venta sin ficha). Reusa la lista (la crea el backend al cobrar).
 */
export async function obtenerEncargoPorFolio(folio: string): Promise<EncargoFicha | null> {
  const todos = await listarEncargos()
  return todos.find((f) => f.folio === folio) ?? null
}

/** Cambia el status de una ficha (pendiente → recibido → entregado → cancelado). */
export async function actualizarStatusEncargo(
  id: string,
  status: EncargoStatus,
  nota?: string
): Promise<EncargoFicha> {
  return apiFetch<EncargoFicha>(`/caja/encargos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...(nota ? { nota } : {}) }),
  })
}

/** Registra un abono (pago parcial / liquidación) sobre una ficha de encargo. */
export async function agregarAbonoEncargo(
  id: string,
  abono: { monto: number; metodo?: string; nota?: string }
): Promise<EncargoFicha> {
  return apiFetch<EncargoFicha>(`/caja/encargos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ abono }),
  })
}

/**
 * Liquida y entrega un encargo en una sola operación: abona la resta en la ficha,
 * crea el movimiento de caja de entrada ("Abono de cliente") del día de HOY (para
 * que entre al corte), y marca el encargo entregado. Si la resta está en cartera,
 * solo marca entregado (la resta se cobra por la cuenta de crédito).
 */
export async function liquidarEncargo(
  id: string,
  ctx: { caja_id?: string | null; caja_name?: string | null; cajero_id?: string; cajero_name?: string; turno_id?: string; metodo?: string }
): Promise<EncargoFicha> {
  return apiFetch<EncargoFicha>(`/caja/encargos/${encodeURIComponent(id)}/liquidar`, {
    method: "POST",
    body: JSON.stringify(ctx),
  })
}

// ── Entregas (venta contra entrega — a domicilio, pago diferido) ──────────────
// Fichas de las ventas por_cobrar: a dónde va el material, quién recibe, quién
// paga (a veces un tercero) y el monto a cobrar al entregar. El módulo "Por
// cobrar" las consulta y liquida (registra el pago en el corte del día que se
// cobra). El backend las crea al registrar una venta contra entrega.

export type EntregaStatus = "por_entregar" | "entregada" | "cancelada"

export interface EntregaContacto {
  nombre: string
  telefono: string
}

export interface EntregaArticulo {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
}

export interface EntregaPago {
  monto: number
  metodo: string
  fecha: string
  nota?: string
}

/** Servicio de flete cargado al cliente (opcional, separado del total de la venta). */
export interface EntregaFlete {
  precio: number
  cobrar_al_entregar: boolean
  metodo_tienda?: string
  cobrado: boolean
  fecha_cobro?: string
  cancelado?: boolean
  motivo_cancelacion?: string
  fecha_cancelacion?: string
}

export interface EntregaFicha {
  id: string
  folio: string
  fecha: string
  // `true` = ya pagada en tienda (solo enviar). false/omitido = contra entrega.
  pagada?: boolean
  direccion: string
  recibe: EntregaContacto
  // Vacío en una entrega ya pagada (pagó el cliente en caja).
  paga: EntregaContacto
  comentarios: string
  total: number
  // Abono pagado en tienda hoy (solo pagada). 0 = no abonó / no aplica.
  abonado?: number
  // Lo que cobra el repartidor al entregar (total − abono; contra entrega = total).
  resta?: number
  // Desglose de métodos del abono en tienda (para el ticket del repartidor).
  pagos_tienda?: { efectivo?: number; transferencia?: number; tarjeta?: number }
  // Con cuánto pagará el resto al recibir → cambio del repartidor.
  paga_con?: number
  // Servicio de flete (opcional).
  flete?: EntregaFlete
  status: EntregaStatus
  pago: EntregaPago | null
  articulos: EntregaArticulo[]
  cliente_id?: string | null
  historial: { fecha: string; de: EntregaStatus; a: EntregaStatus; nota?: string }[]
}

/** Lista las fichas de entrega (venta contra entrega). */
export async function listarEntregas(status?: EntregaStatus): Promise<EntregaFicha[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ""
  return apiFetch<EntregaFicha[]>(`/caja/entregas${qs}`)
}

/** Detalle de una ficha de entrega por id. */
export async function obtenerEntrega(id: string): Promise<EntregaFicha> {
  return apiFetch<EntregaFicha>(`/caja/entregas/${encodeURIComponent(id)}`)
}

/** Busca la ficha de entrega de un folio de venta (para imprimir tras cobrar). */
export async function obtenerEntregaPorFolio(folio: string): Promise<EntregaFicha | null> {
  const todas = await listarEntregas()
  return todas.find((f) => f.folio === folio) ?? null
}

/**
 * Liquida y entrega: registra el pago (que entra al corte del día que se cobra),
 * marca la venta pagada y la entrega como entregada. Reutiliza el patrón de
 * liquidación de encargos (movimiento de caja "Cobro de entrega" el día de hoy).
 */
export async function liquidarEntrega(
  id: string,
  ctx: { caja_id?: string | null; caja_name?: string | null; cajero_id?: string; cajero_name?: string; turno_id?: string; metodo?: string }
): Promise<EntregaFicha> {
  return apiFetch<EntregaFicha>(`/caja/entregas/${encodeURIComponent(id)}/liquidar`, {
    method: "POST",
    body: JSON.stringify(ctx),
  })
}

/**
 * Marca como ENTREGADA una entrega YA PAGADA (solo enviar): no cobra nada ni toca
 * caja (el dinero entró en la venta), solo confirma que el material llegó. El
 * backend lo detecta por `ficha.pagada` en el mismo endpoint de liquidación.
 */
export async function marcarEntregada(id: string): Promise<EntregaFicha> {
  return apiFetch<EntregaFicha>(`/caja/entregas/${encodeURIComponent(id)}/liquidar`, {
    method: "POST",
    body: JSON.stringify({}),
  })
}

/** Cancela una entrega (solo cierra la ficha; no reintegra inventario ni cancela la venta). */
export async function cancelarEntrega(id: string, nota?: string): Promise<EntregaFicha> {
  return apiFetch<EntregaFicha>(`/caja/entregas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelada", ...(nota ? { nota } : {}) }),
  })
}

/**
 * Cancela (soft) el flete de una entrega. Si ya se había cobrado en tienda en
 * efectivo, el backend genera un movimiento de reversa. Requiere motivo.
 */
export async function cancelarFleteEntrega(
  id: string,
  motivo: string,
  ctx?: { caja_id?: string | null; caja_name?: string | null; cajero_id?: string; cajero_name?: string; turno_id?: string }
): Promise<EntregaFicha> {
  return apiFetch<EntregaFicha>(`/caja/entregas/${encodeURIComponent(id)}/flete`, {
    method: "DELETE",
    body: JSON.stringify({ motivo, ...(ctx ?? {}) }),
  })
}

export type CatalogosOp =
  | { op: "create_dept"; nombre: string }
  | { op: "create_cat"; nombre: string; dep_nombre: string }
  | { op: "create_marca"; nombre: string; cat_nombre: string; dep_nombre: string }
  | { op: "rename_dept";  nombre_actual: string; nombre_nuevo: string }
  | { op: "rename_cat";   nombre_actual: string; nombre_nuevo: string }
  | { op: "rename_marca"; nombre_actual: string; nombre_nuevo: string }
  | { op: "move_cat"; cat_nombre: string; dept_nombre_actual: string; dept_nombre_nuevo: string }
  | { op: "assign_marca"; marca: string; product_ids: string[] }
  | {
      op: "reasignar"
      product_ids: string[]
      // Los 4 campos, todos opcionales. Solo se aplica lo que venga.
      departamento?: string
      categoria?: string
      marca?: string
      proveedor?: string
      proveedor_id?: string
    }
  | { op: "assign_proveedor"; product_ids: string[]; proveedor_id: string; proveedor?: string }

export async function actualizarCatalogo(
  payload: CatalogosOp
): Promise<{ ok: boolean; actualizados?: number }> {
  const r = await apiFetch<{ ok: boolean; actualizados?: number }>("/caja/catalogos", {
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

/** Obtiene un cliente completo por id (incluye datos fiscales). */
export async function obtenerClienteAPI(id: string): Promise<Cliente> {
  return apiFetch<Cliente>(`/caja/clientes/${encodeURIComponent(id)}`)
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

// ── Saldo facturable (módulo ferremex_facturable) ─────────────────────────────
// Doble inventario fiscal: cada artículo lleva un contador de piezas con respaldo
// de factura de compra + clave SAT, independiente del stock físico. Sube al
// recibir compras "Con Factura" (automático en /caja/compras), baja solo al
// FACTURAR. La factura global del día excluye artículos sin respaldo. El depto
// define si es facturable; el artículo limita la cantidad. Consumido por el tab
// "Facturable" de ArticlesModule.

/** Saldo facturable de un artículo (piezas con respaldo fiscal). */
export interface SaldoFacturableAPI {
  sku: string
  saldo: number
  clave_sat: string | null
  descripcion: string | null
  departamento: string | null
  actualizado_el: string | null
}

/** Respuesta de GET /caja/facturable: saldos + mapa de departamentos facturables. */
export interface FacturableData {
  saldos: SaldoFacturableAPI[]
  /** { nombreDepto: facturable }. Depto ausente = no facturable. */
  deptos: Record<string, boolean>
}

/** Carga todos los saldos facturables + el mapa de departamentos facturables. */
export async function listarFacturableAPI(): Promise<FacturableData> {
  return apiFetch<FacturableData>("/caja/facturable")
}

/**
 * Ajuste MANUAL del saldo facturable de un artículo (fija el saldo a `nuevoSaldo`,
 * el backend registra el delta como movimiento auditable). Requiere clave SAT si
 * el nuevo saldo es > 0. Devuelve el saldo resultante.
 */
export async function ajustarSaldoFacturableAPI(input: {
  sku: string
  nuevo_saldo: number
  motivo?: string
  clave_sat?: string | null
  descripcion?: string | null
  departamento?: string | null
}): Promise<{ sku: string; saldo: number }> {
  return apiFetch<{ sku: string; saldo: number }>("/caja/facturable", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** Marca/desmarca un departamento como facturable (upsert). */
export async function marcarDeptoFacturableAPI(
  departamento: string,
  facturable: boolean
): Promise<{ departamento: string; facturable: boolean }> {
  return apiFetch<{ departamento: string; facturable: boolean }>("/caja/facturable/deptos", {
    method: "POST",
    body: JSON.stringify({ departamento, facturable }),
  })
}

// ── Facturación CFDI 4.0 (Facturama, módulo backend lib/facturama) ────────────
// El timbrado vive 100% en el backend (credenciales/CSD nunca tocan el navegador).
// El POS solo conoce el FOLIO de la venta; el backend resuelve el cliente, las
// claves SAT por SKU y el cfdi_id de Facturama. Consumido por FacturarBoton
// (Ticket + SalesHistory).

/** Datos de la factura de una venta, una vez timbrada. */
export interface FacturaVenta {
  cfdi_id: string
  uuid: string | null
  fecha: string
  receptor_rfc: string
  receptor_nombre: string
  total: number | null
  cancelada?: boolean
}

/** Estado de facturación de una venta. */
export interface EstadoFactura {
  folio: string
  facturada: boolean
  factura: FacturaVenta | null
}

/**
 * Timbra una venta NOMINATIVA (cliente con RFC). El backend toma el cliente de la
 * venta (o el cliente_id explícito). Devuelve la factura timbrada. Idempotente:
 * si ya estaba facturada, devuelve `{ ya_facturada: true, factura }`.
 */
export async function facturarVentaAPI(
  folio: string,
  clienteId?: string
): Promise<{ factura: FacturaVenta; ya_facturada?: boolean; skus_sin_clave?: string[] }> {
  return apiFetch("/caja/facturama/factura", {
    method: "POST",
    body: JSON.stringify({ folio, cliente_id: clienteId }),
  })
}

/** Estado de facturación de una venta (sin timbrar nada). */
export async function estadoFacturaAPI(folio: string): Promise<EstadoFactura> {
  return apiFetch<EstadoFactura>(`/caja/facturama/factura/${encodeURIComponent(folio)}`)
}

/**
 * Descarga el PDF o XML del CFDI de una venta. La respuesta es binaria (no JSON),
 * así que va por fetch directo + blob.
 *
 * Usa un <a download> programático en vez de window.open: abrir una pestaña tras
 * un `await` lo bloquea el navegador (no es un gesto directo del usuario), lo que
 * causaba que "a veces" no respondiera. El PDF se abre en pestaña (target _blank)
 * y el XML se descarga como archivo. El descargado dispara el visor del navegador
 * de forma confiable.
 */
export async function abrirArchivoFacturaAPI(folio: string, formato: "pdf" | "xml"): Promise<void> {
  const res = await fetch(`/caja/facturama/factura/${encodeURIComponent(folio)}?formato=${formato}`, {
    headers: posHeaders(),
  })
  if (!res.ok) {
    let msg = `No se pudo descargar el ${formato.toUpperCase()}`
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* respuesta no-JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  if (formato === "pdf") {
    a.target = "_blank"             // PDF: lo abre el visor del navegador
    a.rel = "noopener"
  } else {
    a.download = `${folio}.xml`     // XML: descarga directa como archivo
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── Factura GLOBAL del día (público en general, desglose por artículo) ─────────
// Agrupa las ventas de público sin factura nominativa del día, respetando el
// SALDO FACTURABLE (doble inventario fiscal): solo entran artículos de depto
// facturable con saldo suficiente; al timbrar se CONSUME el saldo (el "switch").
// Consumido por FacturacionModule (Tab Global).

/** Una línea agregada por SKU en el preview de la global. */
export interface LineaGlobal {
  sku: string
  descripcion: string
  cantidad: number
  importe: number
  claveSat: string
  departamento: string
  deptoFacturable: boolean
  /** Saldo facturable disponible; null = ilimitado (el SKU no maneja saldo). */
  saldoDisponible: number | null
  motivoExclusion?: "depto_no_facturable" | "saldo_insuficiente" | "sin_clave_sat"
}

/** Preview de la factura global de un período. */
export interface PreviewGlobalData {
  fecha: string
  caja_id: string | null
  forzar: boolean
  configurado: boolean
  foliosCandidatos: string[]
  entran: LineaGlobal[]
  excluidas: LineaGlobal[]
  sinClaveSat: LineaGlobal[]
  totales: {
    ventasCandidatas: number
    importeTotal: number
    importeEntran: number
    importeExcluido: number
    hayBloqueante: boolean
  }
}

/** Registro de una factura global ya timbrada. */
export interface GlobalRegistro {
  id: string
  cfdi_id: string
  uuid: string | null
  fecha_periodo: string
  caja_id: string | null
  fecha_timbrado: string
  total: number | null
  folios_incluidos: string[]
  cancelada?: boolean
}

/** Calcula el preview de la global del día (no timbra). `forzar` incluye las excluidas solo por saldo. */
export async function previewGlobalAPI(
  fecha: string,
  opts: { caja_id?: string; forzar?: boolean } = {}
): Promise<PreviewGlobalData> {
  const qs = new URLSearchParams({ fecha })
  if (opts.caja_id) qs.set("caja_id", opts.caja_id)
  if (opts.forzar) qs.set("forzar", "1")
  return apiFetch<PreviewGlobalData>(`/caja/facturama/global/preview?${qs.toString()}`)
}

/** Timbra la factura global del día. Consume saldo facturable y marca las ventas. */
export async function emitirGlobalAPI(
  fecha: string,
  opts: { caja_id?: string; forzar?: boolean } = {}
): Promise<{
  global: GlobalRegistro
  consumos: { sku: string; cantidad: number }[]
  /** SKUs cuyo descuento de saldo falló (el CFDI ya está timbrado): ajustar manual. */
  consumos_fallidos?: { sku: string; cantidad: number; error: string }[]
  /** Se detectó otra global vigente del mismo período (carrera): conciliar. */
  duplicado_detectado?: boolean
}> {
  return apiFetch("/caja/facturama/global", {
    method: "POST",
    body: JSON.stringify({ fecha, caja_id: opts.caja_id, forzar: !!opts.forzar }),
  })
}

// ── Comprobantes (historial CFDI: Facturama + cruce con ventas) ────────────────
// Lee los CFDIs reales emitidos en Facturama (estado vigente/cancelada en vivo) y
// los cruza con las ventas/globales del POS para mostrar el folio ligado.
// Consumido por FacturacionModule (Tab Comprobantes).

/** Un comprobante (CFDI) en el historial. */
export interface ComprobanteCFDI {
  /** Id de Facturama (necesario para descargar/cancelar/reenviar). */
  cfdi_id: string
  uuid: string | null
  serie: string | null
  folio_cfdi: string | null
  fecha: string
  tipo: "nominativa" | "global"
  receptor_rfc: string
  receptor_nombre: string
  total: number | null
  /** "Vigente" | "Cancelado" según Facturama. */
  estado: string
  /** Folio de la venta POS ligada (si es nominativa y se pudo cruzar). */
  folio_venta: string | null
  email?: string | null
}

export interface ComprobantesData {
  comprobantes: ComprobanteCFDI[]
  total: number
}

/** Lista comprobantes por rango de fecha + filtros. */
export async function listarComprobantesAPI(params: {
  desde?: string
  hasta?: string
  tipo?: "nominativa" | "global" | ""
  estado?: string
  q?: string
} = {}): Promise<ComprobantesData> {
  const qs = new URLSearchParams()
  if (params.desde) qs.set("desde", params.desde)
  if (params.hasta) qs.set("hasta", params.hasta)
  if (params.tipo) qs.set("tipo", params.tipo)
  if (params.estado) qs.set("estado", params.estado)
  if (params.q) qs.set("q", params.q)
  const s = qs.toString()
  return apiFetch<ComprobantesData>(`/caja/facturama/comprobantes${s ? "?" + s : ""}`)
}

/** Cancela un CFDI (por cfdi_id de Facturama). motivo 01–04 (02 default). 01 requiere uuid sustituto. */
export async function cancelarComprobanteAPI(
  cfdiId: string,
  motivo: "01" | "02" | "03" | "04",
  uuidReplacement?: string
): Promise<{ ok: true }> {
  return apiFetch("/caja/facturama/comprobantes/cancelar", {
    method: "POST",
    body: JSON.stringify({ cfdi_id: cfdiId, motivo, uuid_replacement: uuidReplacement }),
  })
}

/** Reenvía un CFDI por correo. */
export async function reenviarComprobanteAPI(cfdiId: string, email: string): Promise<{ ok: true }> {
  return apiFetch("/caja/facturama/comprobantes/reenviar", {
    method: "POST",
    body: JSON.stringify({ cfdi_id: cfdiId, email }),
  })
}

/**
 * Descarga el blob (PDF/XML) de un comprobante por cfdi_id. Devuelve el Blob para
 * que el llamador decida qué hacer (guardar en carpeta vía File System Access API,
 * abrir en pestaña, etc.). NO dispara la descarga por sí mismo.
 */
export async function obtenerArchivoComprobanteAPI(cfdiId: string, formato: "pdf" | "xml"): Promise<Blob> {
  const res = await fetch(
    `/caja/facturama/comprobantes/${encodeURIComponent(cfdiId)}/archivo?formato=${formato}`,
    { headers: posHeaders() }
  )
  if (!res.ok) {
    let msg = `No se pudo descargar el ${formato.toUpperCase()}`
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* no-JSON */ }
    throw new Error(msg)
  }
  return res.blob()
}

/** Abre/descarga un comprobante (PDF en pestaña, XML como archivo). Para acciones sueltas. */
export async function abrirArchivoComprobanteAPI(cfdiId: string, formato: "pdf" | "xml", nombre?: string): Promise<void> {
  const blob = await obtenerArchivoComprobanteAPI(cfdiId, formato)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  if (formato === "pdf") { a.target = "_blank"; a.rel = "noopener" }
  else { a.download = `${nombre ?? cfdiId}.xml` }
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── Configuración de facturación (serie/folio, correo contador, periodicidad) ──
// NO incluye credenciales (esas viven en .env del backend). Consumido por
// FacturacionModule (Tab Config).

export interface ConfigFacturacion {
  serie_nominativa: string
  serie_global: string
  periodicidad_global: "01" | "02" | "03" | "04" | "05"
  correo_contador: string
}

export async function obtenerConfigFacturacionAPI(): Promise<ConfigFacturacion> {
  return apiFetch<ConfigFacturacion>("/caja/facturama/config")
}

export async function guardarConfigFacturacionAPI(cfg: Partial<ConfigFacturacion>): Promise<ConfigFacturacion> {
  return apiFetch<ConfigFacturacion>("/caja/facturama/config", {
    method: "PUT",
    body: JSON.stringify(cfg),
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

// ── Saldo a favor por cambio (módulo ferremex_saldo_cambio) ─────────────────
// Concepto de negocio DISTINTO al Monedero de lealtad (ferremex_monedero): se
// acredita cuando un cliente cambia un artículo por otro de menor valor, y se
// consume 1:1 en pesos como método de pago en una compra futura (sin tasa de
// conversión). No usa cache: el saldo debe leerse fresco al abrir el cobro.

export interface MovimientoSaldoCambioAPI {
  id: string
  customer_id: string
  tipo: "generado" | "consumido" | "ajuste"
  monto: number
  fecha: string
  origen_cambio_folio?: string | null
  venta_consumo_folio?: string | null
  descripcion: string
  cancelado?: boolean
  motivo_cancelacion?: string | null
  fecha_cancelacion?: string | null
}

export interface DetalleSaldoCambio {
  customer_id: string
  saldo: number
  movimientos: MovimientoSaldoCambioAPI[]
}

export async function obtenerSaldoCambioAPI(customerId: string): Promise<DetalleSaldoCambio> {
  return apiFetch<DetalleSaldoCambio>(`/caja/saldo-cambio/${encodeURIComponent(customerId)}`)
}

// ── Biometría (huella) — capa de BD (/caja/biometria/*) ──────────────────────
// Persistencia de plantillas + log de auditoría. La CAPTURA/COMPARACIÓN real
// vive en lib/biometria.ts (habla con el servicio local 127.0.0.1:52700).

export type SujetoBiometrico = "empleado" | "cliente"

export interface HuellaAPI {
  id: string
  sujeto_tipo: SujetoBiometrico
  sujeto_ref: string
  dedo: string
  plantilla_b64: string
  calidad: number
  motor: string
  formato: string
  activa: boolean
  creado_en: string
}

export interface CandidatoBiometrico {
  sujeto_ref: string
  plantilla_b64: string
}

/** Plantillas activas de un sujeto (para verify 1:1: el cliente de la venta). */
export async function listarHuellasAPI(
  sujeto_tipo: SujetoBiometrico,
  sujeto_ref: string
): Promise<HuellaAPI[]> {
  const params = new URLSearchParams({ sujeto_tipo, sujeto_ref })
  return apiFetch<HuellaAPI[]>(`/caja/biometria/huellas?${params}`)
}

/** ¿El sujeto tiene al menos una huella activa? (para UI). */
export async function tieneHuellaAPI(
  sujeto_tipo: SujetoBiometrico,
  sujeto_ref: string
): Promise<boolean> {
  const filas = await listarHuellasAPI(sujeto_tipo, sujeto_ref)
  return filas.length > 0
}

/** Registra una plantilla nueva (tras un enroll en el servicio local). */
export async function registrarHuellaAPI(data: {
  sujeto_tipo: SujetoBiometrico
  sujeto_ref: string
  dedo?: string
  plantilla_b64: string
  calidad?: number
  motor?: string
  formato?: string
}): Promise<HuellaAPI> {
  return apiFetch<HuellaAPI>("/caja/biometria/huellas", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

/** Baja (soft) de una plantilla. */
export async function eliminarHuellaAPI(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/caja/biometria/huellas/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

/** Candidatos (empleados con huella + permiso) para identify 1:N de una acción. */
export async function listarCandidatosBiometricosAPI(accion: string): Promise<CandidatoBiometrico[]> {
  return apiFetch<CandidatoBiometrico[]>(`/caja/biometria/candidatos?accion=${encodeURIComponent(accion)}`)
}

/** Registra un intento de autorización en el log de auditoría (append-only). */
export async function registrarVerificacionAPI(data: {
  accion: string
  contexto_ref?: string | null
  resultado: string
  sujeto_tipo?: SujetoBiometrico | null
  sujeto_ref?: string | null
  score?: number | null
  umbral?: number | null
  caja_id?: string | null
  cajero_id?: string | null
  detalle?: string | null
}): Promise<{ ok: boolean; id: string }> {
  return apiFetch<{ ok: boolean; id: string }>("/caja/biometria/verificaciones", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// ── Cambio de artículo (módulos ferremex_cambios + ferremex_saldo_cambio) ────
//
// Devolución con cambio, NUNCA reembolso. El cliente regresa artículo(s) de una
// venta previa y se lleva otro(s) del catálogo. Si el nuevo vale igual o más,
// se cobra la diferencia (venta normal enlazada); si vale menos, se acredita
// "saldo a favor" (módulo separado del Monedero de lealtad).

export interface LineaCambioDevuelta {
  id: string
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface LineaCambioNueva {
  id: string
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface Cambio {
  id: string
  folio_cambio: string
  venta_origen_folio: string
  fecha: string
  cajero: string
  caja_id: string | null
  caja_name: string | null
  vendedor: string | null
  customer_id: string | null
  cliente_nombre: string | null
  valor_devuelto: number
  valor_nuevo: number
  diferencia: number
  diferencia_cobrada: number
  saldo_generado: number
  // El desglose de CÓMO se cubrió diferencia_cobrada (efectivo/transferencia/
  // tarjeta/puntos/saldo a favor) vive en la venta enlazada, no en el modelo de
  // Cambio — consultar GET /caja/ventas/:folio con venta_diferencia_folio.
  venta_diferencia_folio: string | null
  estado: "completado" | "cancelado"
  motivo_cancelacion: string | null
  fecha_cancelacion: string | null
  lineasDevueltas: LineaCambioDevuelta[]
  lineasNuevas: LineaCambioNueva[]
}

export interface ProcesarCambioPayload {
  venta_origen_folio: string
  cajero: string
  turno_id: string
  caja_id?: string | null
  caja_name?: string | null
  vendedor?: string | null
  customer_id?: string | null
  cliente_nombre?: string | null
  lineas_devueltas: { sku: string; cantidad: number }[]
  // Opcional: vacío/omitido = "solo devolución" (el cliente no se lleva nada
  // ahora). El 100% del valor devuelto se acredita como saldo a favor.
  lineas_nuevas?: { sku: string; descripcion: string; cantidad: number; precio_unitario: number }[]
  pago_efectivo?: number
  pago_transferencia?: number
  pago_tarjeta?: number
  // Puntos del monedero y/o saldo a favor (de un cambio anterior) del cliente,
  // aplicados a cubrir la diferencia. Requieren customer_id (es su saldo).
  pago_puntos?: number
  pago_saldo_cambio?: number
}

/** Procesa un cambio de artículo. Reintegra/descuenta inventario y liquida la diferencia. */
export async function procesarCambioAPI(payload: ProcesarCambioPayload): Promise<Cambio> {
  return apiFetch<Cambio>("/caja/cambios", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

/** Lista el histórico de cambios, opcionalmente filtrado por fecha. */
export async function listarCambiosAPI(filtros?: { desde?: string; hasta?: string }): Promise<Cambio[]> {
  const qs = new URLSearchParams()
  if (filtros?.desde) qs.set("desde", filtros.desde)
  if (filtros?.hasta) qs.set("hasta", filtros.hasta)
  const query = qs.toString()
  return apiFetch<Cambio[]>(`/caja/cambios${query ? `?${query}` : ""}`)
}

/** Detalle completo de un cambio (con sus líneas). */
export async function obtenerCambioAPI(id: string): Promise<Cambio> {
  return apiFetch<Cambio>(`/caja/cambios/${encodeURIComponent(id)}`)
}

/** Cancela (soft-cancel) un cambio: revierte inventario y anula el saldo generado. */
export async function cancelarCambioAPI(id: string, motivo: string): Promise<Cambio> {
  return apiFetch<Cambio>(`/caja/cambios/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ motivo }),
  })
}

// Tipos y `obtenerSaldoCambioAPI` del saldo a favor viven en la sección
// "Saldo a favor por cambio" (DetalleSaldoCambio / MovimientoSaldoCambioAPI),
// consumida también por ModalCobro.

// ── Comisiones de venta por empleado (módulo ferremex_comisiones) ─────────────
//
// Dos entidades: ComisionEjeAPI (toggle GLOBAL — qué ámbitos de la taxonomía
// admiten comisión, editado desde Catálogos) y ComisionReglaAPI (% que un
// EMPLEADO recibe de un ámbito ya habilitado, editado desde Empleados). El
// motor de resolución (marca → categoría → departamento → 0%) vive en
// lib/comisiones.ts, compartido por el preview de UI y (a futuro) el reporte
// de comisión generada.

export type ComisionAmbito = "marca" | "categoria" | "departamento"

export interface ComisionEjeAPI {
  id: string
  ambito: ComisionAmbito
  ref: string
  habilitado: boolean
}

export interface ComisionReglaAPI {
  id: string
  empleado_id: string
  ambito: ComisionAmbito
  ref: string
  tasa: number
  activa: boolean
}

/** Lista todos los ejes de comisión registrados (habilitados o no). */
export async function listarEjesComisionAPI(): Promise<ComisionEjeAPI[]> {
  return apiFetch<ComisionEjeAPI[]>("/caja/comisiones/ejes")
}

/** Crea o alterna el toggle "admite comisión" de un ámbito (upsert por ambito+ref). */
export async function guardarEjeComisionAPI(
  ambito: ComisionAmbito,
  ref: string,
  habilitado: boolean
): Promise<ComisionEjeAPI> {
  return apiFetch<ComisionEjeAPI>("/caja/comisiones/ejes", {
    method: "PATCH",
    body: JSON.stringify({ ambito, ref, habilitado }),
  })
}

/** Reglas de comisión de un empleado (o todas si se omite empleado_id). */
export async function listarReglasComisionAPI(empleadoId?: string): Promise<ComisionReglaAPI[]> {
  const qs = empleadoId ? `?empleado_id=${encodeURIComponent(empleadoId)}` : ""
  return apiFetch<ComisionReglaAPI[]>(`/caja/comisiones/reglas${qs}`)
}

export async function crearReglaComisionAPI(r: Omit<ComisionReglaAPI, "id">): Promise<ComisionReglaAPI> {
  return apiFetch<ComisionReglaAPI>("/caja/comisiones/reglas", { method: "POST", body: JSON.stringify(r) })
}

export async function actualizarReglaComisionAPI(id: string, r: Partial<ComisionReglaAPI>): Promise<ComisionReglaAPI> {
  return apiFetch<ComisionReglaAPI>(`/caja/comisiones/reglas/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(r),
  })
}

export async function eliminarReglaComisionAPI(id: string): Promise<void> {
  await apiFetch(`/caja/comisiones/reglas/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ── Reportes — Comisiones (módulo Reportes) ─────────────────────────────────
// Agrega comisión_venta por vendedor en un rango de fechas libre, cruzando
// todas las cajas (a diferencia de /caja/corte, que agrega por período de
// arqueo de UNA caja). Mismo criterio de "vigente" que el corte.

export interface ReporteComisionVendedor {
  vendedor: string
  comision_total: number
  num_ventas: number
  comision_promedio: number
}

export async function obtenerReporteComisionesAPI(
  desde: string,
  hasta: string,
  vendedor?: string
): Promise<ReporteComisionVendedor[]> {
  const params = new URLSearchParams({ desde, hasta, ...(vendedor ? { vendedor } : {}) })
  return apiFetch<ReporteComisionVendedor[]>(`/caja/reportes/comisiones?${params}`)
}
