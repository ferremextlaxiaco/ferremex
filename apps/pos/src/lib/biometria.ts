// ============================================================================
// Ferremex — Cliente del servicio LOCAL de huella (FerremexBiometriaService).
//
// Análogo a serial.ts: encapsula la conversación con el hardware. Aquí el
// "hardware" es el servicio local que corre en cada caja en http://127.0.0.1:52700
// y envuelve el lector DigitalPersona 4500 (motor nativo dpfj).
//
// IMPORTANTE: este helper NO pasa por client.ts/apiFetch — habla con OTRO host
// (127.0.0.1, la propia caja), no con el backend Medusa. La huella nunca sale de
// la caja: el servicio captura+extrae+compara localmente y solo devuelve el
// resultado (match/plantilla). Las plantillas se persisten aparte vía client.ts
// (registrarHuellaAPI) → BD Medusa.
//
// Contrato del servicio (ver caja-biometria/LEEME.md):
//   GET  /health            → { ok, lector: { conectado, nombre, modelo } }
//   POST /capturar          → { plantilla_b64, calidad, ... }
//   POST /capturar-enroll   → SSE: event progreso {fase,muestra,total} / resultado / error
//   POST /verificar-1a1     → { match, score, umbral, calidad_captura }
//   POST /identificar-1aN   → { match, sujeto_ref, score, ... }
//   POST /cancelar          → { ok }
// ============================================================================

const BASE = "http://127.0.0.1:52700"

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface HealthBiometria {
  ok: boolean
  servicio?: string
  version?: string
  lector: { conectado: boolean; nombre: string | null; modelo: string | null }
}

export interface ResultadoCaptura {
  plantilla_b64: string
  calidad: number
  formato: string
}

export interface ResultadoVerify {
  match: boolean
  score: number
  umbral: number
  calidad_captura: number
}

export interface ResultadoIdentify {
  match: boolean
  sujeto_ref: string | null
  score?: number
  candidatos_evaluados: number
}

/** Progreso del enroll multi-captura (para animar 1/4…4/4). */
export interface ProgresoEnroll {
  fase: "esperando_dedo" | "muestra_ok"
  muestra: number
  total: number
  calidad?: number
}

/** Error con código para que la UI distinga timeout/calidad/servicio caído. */
export class BiometriaError extends Error {
  codigo: string
  constructor(codigo: string, mensaje: string) {
    super(mensaje)
    this.codigo = codigo
    this.name = "BiometriaError"
  }
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function uuid(): string {
  // suficiente para captura_id (correlación/cancelación); no cripto.
  return "cap-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36)
}

async function postJson<T>(path: string, body: any, timeoutMs = 30000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    })
  } catch (e: any) {
    clearTimeout(t)
    // fetch falla en red = servicio no está corriendo.
    throw new BiometriaError("SERVICIO_CAIDO", "El servicio de huella no responde")
  }
  clearTimeout(t)
  const texto = await res.text()
  let data: any = {}
  try { data = texto ? JSON.parse(texto) : {} } catch { /* no-JSON */ }
  if (!res.ok || data?.ok === false) {
    const codigo = data?.error?.codigo ?? "ERROR"
    const mensaje = data?.error?.mensaje ?? `Error ${res.status}`
    throw new BiometriaError(codigo, mensaje)
  }
  return data as T
}

// ── API ──────────────────────────────────────────────────────────────────────

/**
 * ¿Está el servicio local vivo y con lector conectado?
 * Devuelve null si el servicio no responde (caído) — la UI cae a modo degradado.
 */
export async function healthBiometria(): Promise<HealthBiometria | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500) // health debe ser rápido
    const res = await fetch(BASE + "/health", { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return null
    return (await res.json()) as HealthBiometria
  } catch {
    return null // servicio caído o no instalado
  }
}

/** ¿El servicio está disponible Y con lector conectado? */
export async function biometriaLista(): Promise<boolean> {
  const h = await healthBiometria()
  return !!h?.ok && !!h.lector?.conectado
}

/** Una captura simple → plantilla. (Poco usado directamente; enroll consolida.) */
export async function capturar(timeoutMs = 15000): Promise<ResultadoCaptura> {
  return postJson<ResultadoCaptura>("/capturar", { timeout_ms: timeoutMs, captura_id: uuid() })
}

/**
 * Enroll multi-captura con progreso en vivo (parser SSE).
 * onProgreso se llama por cada evento (esperando_dedo / muestra_ok) para animar.
 * Devuelve la plantilla consolidada. `captura_id` permite cancelar (ver cancelar()).
 */
export async function capturarEnroll(
  opts: {
    muestras?: number
    timeoutMsPorMuestra?: number
    onProgreso?: (p: ProgresoEnroll) => void
    capturaId?: string
  } = {}
): Promise<{ plantilla_b64: string; calidad: number; muestras_usadas: number; captura_id: string }> {
  const captura_id = opts.capturaId ?? uuid()
  const res = await fetch(BASE + "/capturar-enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      muestras: opts.muestras ?? 4,
      timeout_ms_por_muestra: opts.timeoutMsPorMuestra ?? 15000,
      captura_id,
    }),
  }).catch(() => {
    throw new BiometriaError("SERVICIO_CAIDO", "El servicio de huella no responde")
  })

  if (!res.ok || !res.body) {
    throw new BiometriaError("ERROR", `Error ${res.status} en el enroll`)
  }

  // Parser SSE incremental: acumula el stream y extrae bloques event/data.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let resultado: any = null
  let errorEvt: { codigo: string; mensaje: string } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Un evento SSE termina con línea en blanco (\n\n).
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const bloque = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const { evento, data } = parseSSE(bloque)
      if (!evento) continue
      if (evento === "progreso" && opts.onProgreso && data) {
        opts.onProgreso(data as ProgresoEnroll)
      } else if (evento === "resultado") {
        resultado = data
      } else if (evento === "error") {
        errorEvt = data?.error ?? { codigo: "ERROR", mensaje: "Error en el enroll" }
      }
    }
  }

  if (errorEvt) throw new BiometriaError(errorEvt.codigo, errorEvt.mensaje)
  if (!resultado?.plantilla_b64) throw new BiometriaError("ENROLL_FALLIDO", "No se obtuvo la plantilla")
  return {
    plantilla_b64: resultado.plantilla_b64,
    calidad: resultado.calidad ?? 0,
    muestras_usadas: resultado.muestras_usadas ?? 0,
    captura_id,
  }
}

function parseSSE(bloque: string): { evento: string | null; data: any } {
  let evento: string | null = null
  let dataStr = ""
  for (const linea of bloque.split("\n")) {
    if (linea.startsWith("event:")) evento = linea.slice(6).trim()
    else if (linea.startsWith("data:")) dataStr += linea.slice(5).trim()
  }
  let data: any = null
  if (dataStr) { try { data = JSON.parse(dataStr) } catch { /* ignore */ } }
  return { evento, data }
}

/**
 * Verifica 1:1: captura del lector y compara contra la plantilla dada (del cliente).
 * Devuelve { match, score }. `plantillaB64` = la plantilla guardada del cliente.
 */
export async function verificar1a1(
  plantillaB64: string,
  opts: { umbral?: number; timeoutMs?: number; capturaId?: string } = {}
): Promise<ResultadoVerify & { captura_id: string }> {
  const captura_id = opts.capturaId ?? uuid()
  const r = await postJson<ResultadoVerify>("/verificar-1a1", {
    plantilla_b64: plantillaB64,
    umbral: opts.umbral,
    timeout_ms: opts.timeoutMs ?? 15000,
    captura_id,
  })
  return { ...r, captura_id }
}

/**
 * Identifica 1:N: captura del lector e identifica entre los candidatos (empleados).
 * (Preparado para uso futuro en autorización de acciones sensibles.)
 */
export async function identificar1aN(
  candidatos: { sujeto_ref: string; plantilla_b64: string }[],
  opts: { umbral?: number; timeoutMs?: number; capturaId?: string } = {}
): Promise<ResultadoIdentify & { captura_id: string }> {
  const captura_id = opts.capturaId ?? uuid()
  const r = await postJson<ResultadoIdentify>("/identificar-1aN", {
    candidatos,
    umbral: opts.umbral,
    timeout_ms: opts.timeoutMs ?? 15000,
    captura_id,
  })
  return { ...r, captura_id }
}

/** Cancela una captura/enroll en curso por su captura_id (best-effort). */
export async function cancelar(capturaId: string): Promise<void> {
  try {
    await fetch(BASE + "/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captura_id: capturaId }),
    })
  } catch { /* best-effort */ }
}
