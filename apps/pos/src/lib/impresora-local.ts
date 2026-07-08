// ============================================================================
// Ferremex — Cliente de impresión por el SERVICIO LOCAL de la caja.
//
// Por qué existe: la térmica USB (Sicar WL88S, VID_20D1) NO expone puerto COM —
// Windows la reclama en exclusiva como cola de impresión. Web Serial y WebUSB no
// pueden verla. La única vía que conserva el cajón sin tocar el driver es que un
// servicio local escriba los bytes ESC/POS RAW a la cola de Windows.
//
// Reutilizamos el MISMO servicio local que ya corre para la huella
// (FerremexBiometriaService, 127.0.0.1:52700), que ahora también expone:
//   GET  /health       → incluye lista de impresoras de Windows
//   GET  /impresoras    → lista impresoras
//   POST /imprimir      → { impresora, datos_b64 }  escribe ESC/POS RAW
//   POST /abrir-cajon   → { impresora }  pulso de cajón por la impresora
//
// El armado del ticket ESC/POS sigue en serial.ts (construirBytesTicket); aquí
// solo se cambia el TRANSPORTE (de navigator.serial a fetch al servicio local).
// ============================================================================

const BASE = "http://127.0.0.1:52700"

// Preferencia de qué impresora usar (nombre de Windows), por caja.
const CLAVE_IMPRESORA = "pos_impresora_nombre"

/** Nombre de impresora elegido en esta caja (o null si no hay). */
export function impresoraElegida(): string | null {
  try { return localStorage.getItem(CLAVE_IMPRESORA) } catch { return null }
}
export function guardarImpresoraElegida(nombre: string | null): void {
  try {
    if (nombre) localStorage.setItem(CLAVE_IMPRESORA, nombre)
    else localStorage.removeItem(CLAVE_IMPRESORA)
  } catch { /* noop */ }
}

async function fetchLocal(path: string, opts?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(BASE + path, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** ¿El servicio local está vivo? Devuelve la lista de impresoras o null si caído. */
export async function listarImpresorasLocales(): Promise<string[] | null> {
  try {
    const res = await fetchLocal("/impresoras", {}, 3000)
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data?.impresoras) ? data.impresoras : []
  } catch {
    return null // servicio caído / no instalado
  }
}

/** ¿Hay servicio local Y una impresora elegida (o detectable)? */
export async function impresionLocalDisponible(): Promise<boolean> {
  const impresoras = await listarImpresorasLocales()
  return impresoras !== null && impresoras.length > 0
}

function bytesToBase64(bytes: number[]): string {
  // Convierte un array de bytes ESC/POS a base64 (chunked para no exceder el
  // límite de argumentos de String.fromCharCode).
  let binario = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binario += String.fromCharCode.apply(null, bytes.slice(i, i + chunk) as any)
  }
  return btoa(binario)
}

/**
 * Envía bytes ESC/POS ya armados a la impresora vía el servicio local.
 * `impresora` = nombre de Windows; si se omite, usa la elegida en esta caja.
 */
export async function imprimirBytesLocal(bytes: number[], impresora?: string | null): Promise<void> {
  const nombre = impresora ?? impresoraElegida()
  if (!nombre) throw new Error("No hay impresora seleccionada. Elige una en Periféricos.")

  let res: Response
  try {
    res = await fetchLocal("/imprimir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impresora: nombre, datos_b64: bytesToBase64(bytes) }),
    })
  } catch {
    throw new Error("El servicio de impresión no responde. Revisa que esté corriendo.")
  }
  if (!res.ok) {
    let msg = `Error ${res.status} al imprimir`
    try { const d = await res.json(); if (d?.error?.mensaje) msg = d.error.mensaje } catch { /* noop */ }
    throw new Error(msg)
  }
}

/** Abre el cajón enviando el pulso ESC/POS por la impresora (vía servicio local). */
export async function abrirCajonLocal(impresora?: string | null): Promise<void> {
  const nombre = impresora ?? impresoraElegida()
  if (!nombre) throw new Error("No hay impresora seleccionada para abrir el cajón.")

  let res: Response
  try {
    res = await fetchLocal("/abrir-cajon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impresora: nombre }),
    })
  } catch {
    throw new Error("El servicio de impresión no responde.")
  }
  if (!res.ok) {
    let msg = `Error ${res.status} al abrir el cajón`
    try { const d = await res.json(); if (d?.error?.mensaje) msg = d.error.mensaje } catch { /* noop */ }
    throw new Error(msg)
  }
}
