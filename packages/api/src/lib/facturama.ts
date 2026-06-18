/**
 * Cliente REST de Facturama (CFDI 4.0) — backend-only.
 *
 * Facturama es REST plano + HTTP Basic Auth; no hay SDK de Node oficial usable,
 * así que consumimos la API directamente con fetch. Este módulo NUNCA debe
 * importarse desde el frontend: las credenciales y (en producción) el CSD viven
 * solo aquí, leídos de variables de entorno.
 *
 * Producto: "API Web" (un solo emisor) → la creación de CFDI es POST /3/cfdis
 * (el "3" es la versión de la RUTA; emite CFDI 4.0, fijado por Facturama).
 *
 * Entornos (solo cambia el .env, no el código):
 *   Sandbox:    https://apisandbox.facturama.mx/   (facturas sin valor fiscal)
 *   Producción: https://api.facturama.mx/
 * La URL base DEBE terminar en "/".
 *
 * Doc: https://apisandbox.facturama.mx/guias/api-web/cfdi/factura
 */

// ─── Tipos del CFDI (body de POST /3/cfdis) ─────────────────────────────────

export interface CfdiReceiver {
  /** RFC del receptor. Genérico público: XAXX010101000. */
  Rfc: string
  /** Nombre EXACTO según la Constancia (mayúsculas, sin "S.A. de C.V."). */
  Name: string
  /** UsoCFDI (catálogo c_UsoCFDI). Público en general: S01. */
  CfdiUse: string
  /** RegimenFiscalReceptor (c_RegimenFiscal) — nuevo en 4.0. Público: 616. */
  FiscalRegime: string
  /** DomicilioFiscalReceptor: CP de 5 dígitos — nuevo en 4.0. */
  TaxZipCode: string
}

export interface CfdiTax {
  Name: "IVA" | "IEPS" | "ISR"
  Rate: number          // 0.16
  Total: number         // importe del impuesto
  Base: number          // base gravable
  IsRetention: boolean
  IsFederalTax?: boolean
}

export interface CfdiItem {
  /** ClaveProdServ (catálogo SAT). */
  ProductCode: string
  /** ClaveUnidad (catálogo SAT), p.ej. H87 = Pieza. */
  UnitCode: string
  Unit?: string
  Description: string
  IdentificationNumber?: string  // SKU / clave interna
  Quantity: number
  UnitPrice: number
  Subtotal: number
  Discount?: number
  /** ObjetoImp — nuevo en 4.0: "01" no objeto, "02" sí objeto de impuesto. */
  TaxObject: "01" | "02" | "03" | "04"
  Taxes?: CfdiTax[]
  Total: number
}

/** Información de factura global (obligatoria cuando RFC = genérico). */
export interface CfdiGlobalInformation {
  /** 01 Diario, 02 Semanal, 03 Quincenal, 04 Mensual, 05 Bimestral. */
  Periodicity: "01" | "02" | "03" | "04" | "05"
  /** 01–12 meses; 13–18 bimestres (solo con Periodicity 05). */
  Months: string
  Year: string
}

export interface CfdiRelations {
  /** Tipo de relación (c_TipoRelacion), p.ej. "04" sustitución. */
  Type: string
  Cfdis: { Uuid: string }[]
}

export interface CrearCfdiInput {
  CfdiType: "I" | "E" | "T" | "N" | "P"   // I = ingreso
  /** FormaPago (c_FormaPago): 01 efectivo, 03 transferencia, 04 tarjeta crédito… */
  PaymentForm: string
  /** MetodoPago: PUE (una exhibición) / PPD (parcialidades/diferido). */
  PaymentMethod?: "PUE" | "PPD"
  /** LugarExpedicion: CP de 5 dígitos del emisor. */
  ExpeditionPlace: string
  /** Exportacion: "01" no aplica (venta nacional). */
  Exportation?: string
  Currency?: string                        // MXN
  Serie?: string | null
  Folio?: string | null
  NameId?: string
  GlobalInformation?: CfdiGlobalInformation
  Relations?: CfdiRelations
  Receiver: CfdiReceiver
  Items: CfdiItem[]
}

/** Respuesta (parcial) de crear/consultar un CFDI. */
export interface CfdiResponse {
  Id: string
  CfdiType?: string
  Serie?: string | null
  Folio?: string | null
  Date?: string
  Total?: number
  Complement?: {
    TaxStamp?: {
      Uuid?: string
      Date?: string
      CfdiSign?: string
      SatSign?: string
      RfcProvCertif?: string
    }
  }
  [k: string]: unknown
}

/** Descarga de archivo (PDF/XML) — Facturama devuelve base64. */
export interface FacturamaFile {
  ContentEncoding: string  // "base64"
  ContentType: string
  ContentLength: number
  Content: string          // base64
}

export type FormatoArchivo = "pdf" | "xml" | "html"
export type TipoCfdi = "issued" | "received" | "payroll"

/** Motivo de cancelación SAT (CFDI 4.0). */
export type MotivoCancelacion =
  | "01"  // con errores con relación (requiere uuidReplacement)
  | "02"  // con errores sin relación (default)
  | "03"  // no se llevó a cabo la operación
  | "04"  // operación nominativa relacionada a una factura global

// ─── Configuración (env) ────────────────────────────────────────────────────

export interface FacturamaEmisor {
  rfc: string
  nombre: string
  regimen: string
  cpExpedicion: string
}

export interface FacturamaConfig {
  baseUrl: string
  user: string
  pass: string
  emisor: FacturamaEmisor
}

/**
 * Lee la configuración de Facturama del entorno. Lanza si faltan las credenciales
 * (no tiene sentido continuar sin ellas). Los datos del emisor pueden estar
 * vacíos en sandbox temprano; quien los necesite (mapper) debe validarlos.
 */
export function leerConfigFacturama(): FacturamaConfig {
  const baseUrl = (process.env.FACTURAMA_BASE_URL || "").trim()
  const user = (process.env.FACTURAMA_USER || "").trim()
  const pass = process.env.FACTURAMA_PASS || ""

  if (!baseUrl || !user || !pass) {
    throw new Error(
      "Facturama no está configurado: define FACTURAMA_BASE_URL, FACTURAMA_USER y FACTURAMA_PASS en el .env"
    )
  }
  // La base DEBE terminar en "/" o algunas rutas fallan.
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"

  return {
    baseUrl: base,
    user,
    pass,
    emisor: {
      rfc: (process.env.FACTURAMA_EMISOR_RFC || "").trim(),
      nombre: (process.env.FACTURAMA_EMISOR_NOMBRE || "").trim(),
      regimen: (process.env.FACTURAMA_EMISOR_REGIMEN || "").trim(),
      cpExpedicion: (process.env.FACTURAMA_EXPEDITION_CP || "").trim(),
    },
  }
}

/** ¿Está Facturama configurado? (para responder 503 amable en vez de crashear). */
export function facturamaConfigurado(): boolean {
  return !!(process.env.FACTURAMA_BASE_URL && process.env.FACTURAMA_USER && process.env.FACTURAMA_PASS)
}

// ─── Error tipado ───────────────────────────────────────────────────────────

export class FacturamaError extends Error {
  status: number
  /** Detalle crudo devuelto por Facturama (puede traer ModelState con códigos CFDI40xxx). */
  detalle: unknown
  constructor(message: string, status: number, detalle: unknown) {
    super(message)
    this.name = "FacturamaError"
    this.status = status
    this.detalle = detalle
  }
}

/**
 * Aplana los mensajes de error de Facturama. Su formato típico de validación es
 * { Message, ModelState: { "campo": ["msg1", "msg2"] } }. Devuelve un string
 * legible para mostrar al cajero.
 */
function extraerMensaje(detalle: unknown, fallback: string): string {
  if (!detalle || typeof detalle !== "object") return fallback
  const d = detalle as Record<string, unknown>
  const partes: string[] = []
  if (typeof d.Message === "string" && d.Message) partes.push(d.Message)
  const ms = d.ModelState
  if (ms && typeof ms === "object") {
    for (const arr of Object.values(ms as Record<string, unknown>)) {
      if (Array.isArray(arr)) partes.push(...arr.filter((x): x is string => typeof x === "string"))
    }
  }
  // Algunos errores vienen como { error } o string plano.
  if (typeof d.error === "string" && d.error) partes.push(d.error)
  return partes.length ? partes.join(" · ") : fallback
}

// ─── Cliente ────────────────────────────────────────────────────────────────

export class FacturamaClient {
  private cfg: FacturamaConfig
  private authHeader: string

  constructor(cfg?: FacturamaConfig) {
    this.cfg = cfg ?? leerConfigFacturama()
    this.authHeader = "Basic " + Buffer.from(`${this.cfg.user}:${this.cfg.pass}`).toString("base64")
  }

  get emisor(): FacturamaEmisor {
    return this.cfg.emisor
  }

  /** Construye una URL absoluta a partir de un path relativo (sin "/" inicial). */
  private url(pathRel: string): string {
    return this.cfg.baseUrl + pathRel.replace(/^\/+/, "")
  }

  private async req<T>(method: string, pathRel: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: this.authHeader }
    if (body !== undefined) headers["Content-Type"] = "application/json"

    let resp: Response
    try {
      resp = await fetch(this.url(pathRel), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e: any) {
      throw new FacturamaError(`No se pudo conectar con Facturama: ${e?.message ?? e}`, 0, null)
    }

    const text = await resp.text()
    let parsed: unknown = null
    if (text) {
      try { parsed = JSON.parse(text) } catch { parsed = text }
    }

    if (!resp.ok) {
      throw new FacturamaError(
        extraerMensaje(parsed, `Facturama respondió ${resp.status}`),
        resp.status,
        parsed
      )
    }
    return parsed as T
  }

  // ── Operaciones ──────────────────────────────────────────────────────────

  /** Crea (timbra) un CFDI 4.0. POST /3/cfdis */
  async crearCfdi(input: CrearCfdiInput): Promise<CfdiResponse> {
    return this.req<CfdiResponse>("POST", "3/cfdis", input)
  }

  /** Descarga PDF/XML/HTML de un CFDI emitido. Devuelve base64. */
  async descargarCfdi(id: string, formato: FormatoArchivo, tipo: TipoCfdi = "issued"): Promise<FacturamaFile> {
    return this.req<FacturamaFile>("GET", `api/Cfdi/${formato}/${tipo}/${encodeURIComponent(id)}`)
  }

  /**
   * Cancela un CFDI emitido. motivo 01–04 (02 = con errores sin relación, default).
   * uuidReplacement solo aplica a motivo 01 (sustitución).
   */
  async cancelarCfdi(id: string, motivo: MotivoCancelacion = "02", uuidReplacement?: string): Promise<unknown> {
    const qs = new URLSearchParams({ type: "issued", motive: motivo })
    if (motivo === "01" && uuidReplacement) qs.set("uuidReplacement", uuidReplacement)
    return this.req<unknown>("DELETE", `cfdi/${encodeURIComponent(id)}?${qs.toString()}`)
  }

  /** Reenvía un CFDI por correo. POST /Cfdi?CfdiType&CfdiId&Email */
  async enviarPorCorreo(id: string, email: string, subject?: string): Promise<unknown> {
    const qs = new URLSearchParams({ cfdiType: "issued", cfdiId: id, email })
    if (subject) qs.set("subject", subject)
    return this.req<unknown>("POST", `Cfdi?${qs.toString()}`)
  }

  /** Detalle de un CFDI por id. GET /cfdi/{id}?type=issued */
  async obtenerCfdi(id: string, tipo: TipoCfdi = "issued"): Promise<CfdiResponse> {
    return this.req<CfdiResponse>("GET", `cfdi/${encodeURIComponent(id)}?type=${tipo}`)
  }

  /** Lista/busca CFDIs emitidos. GET /cfdi?type=issued&keyword= */
  async listarCfdis(params?: { keyword?: string; tipo?: TipoCfdi }): Promise<CfdiResponse[]> {
    const qs = new URLSearchParams({ type: params?.tipo ?? "issued" })
    if (params?.keyword) qs.set("keyword", params.keyword)
    return this.req<CfdiResponse[]>("GET", `cfdi?${qs.toString()}`)
  }

  // ── Catálogos SAT (lectura, útiles para validar/poblar) ─────────────────────

  async catalogoFormasPago(): Promise<{ Name: string; Value: string }[]> {
    return this.req("GET", "api/Catalogs/PaymentForms")
  }

  async catalogoRegimenesFiscales(rfc?: string): Promise<{ Name: string; Value: string }[]> {
    const qs = rfc ? `?rfc=${encodeURIComponent(rfc)}` : ""
    return this.req("GET", `api/Catalogs/FiscalRegimens${qs}`)
  }

  async catalogoUsosCfdi(): Promise<{ Name: string; Value: string }[]> {
    return this.req("GET", "api/Catalogs/CfdiUses")
  }
}
