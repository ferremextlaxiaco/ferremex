// ============================================================================
// Ferremex — Preferencias de periféricos + diagnóstico del sistema.
//
// La config de periféricos es POR CAJA (cada terminal tiene su propia impresora,
// escáner y lector). Se guarda en localStorage con prefijo por caja_id, NO en el
// servidor: la preferencia "auto-imprimir" de la Caja 1 no debe afectar a la 2.
// Mismo criterio que CashMovementsModule (localStorage por caja/día).
//
// Este módulo NO toca serial.ts ni biometria.ts — solo guarda preferencias y
// expone helpers de diagnóstico del navegador. La conexión real de impresora/
// cajón vive en serial.ts; la del lector en biometria.ts.
// ============================================================================

export interface PerifPrefs {
  copias: number            // copias por ticket (1-5)
  imprimirLogo: boolean     // incluir logo en el ticket ESC/POS
  autoImprimir: boolean     // imprimir automáticamente al cobrar (preferencia; el
                            // cableado en ModalCobro es un paso aparte)
  sonidoEscaner: boolean    // bip al escanear un código
}

export const PERIF_PREFS_DEFAULT: PerifPrefs = {
  copias: 1,
  imprimirLogo: true,
  autoImprimir: false,
  sonidoEscaner: true,
}

function claveDe(cajaId: string | null | undefined): string {
  return `pos_perifericos_${cajaId ?? "sin-caja"}`
}

/** Lee las preferencias de periféricos de ESTA caja (o los defaults). */
export function leerPerifPrefs(cajaId: string | null | undefined): PerifPrefs {
  try {
    const raw = localStorage.getItem(claveDe(cajaId))
    if (!raw) return { ...PERIF_PREFS_DEFAULT }
    const parsed = JSON.parse(raw)
    // Merge con defaults para tolerar claves nuevas en versiones futuras.
    return { ...PERIF_PREFS_DEFAULT, ...parsed }
  } catch {
    return { ...PERIF_PREFS_DEFAULT }
  }
}

/** Guarda las preferencias de periféricos de ESTA caja. */
export function guardarPerifPrefs(cajaId: string | null | undefined, prefs: PerifPrefs): void {
  try {
    localStorage.setItem(claveDe(cajaId), JSON.stringify(prefs))
  } catch {
    /* localStorage lleno o bloqueado; no es crítico */
  }
}

// ── Diagnóstico del navegador / contexto ─────────────────────────────────────

export interface DiagnosticoSistema {
  navegador: string          // "Chrome 131", "Edge 130", "Firefox 128", "Otro"
  esChromium: boolean        // Chrome/Edge/Chromium → Web Serial disponible
  contextoSeguro: boolean    // isSecureContext (localhost o https)
  webSerial: boolean         // "serial" in navigator
  url: string                // origen actual (para diagnosticar :8080 vs :9000)
}

/** Detecta navegador + capacidades relevantes para los periféricos. */
export function diagnosticarSistema(): DiagnosticoSistema {
  const ua = navigator.userAgent
  let navegador = "Otro"
  let esChromium = false

  // Orden importa: Edge y Chrome ambos contienen "Chrome" en el UA.
  const mEdge = ua.match(/Edg\/(\d+)/)
  const mChrome = ua.match(/Chrome\/(\d+)/)
  const mFirefox = ua.match(/Firefox\/(\d+)/)
  const mSafari = ua.match(/Version\/(\d+).*Safari/)

  if (mEdge) { navegador = `Edge ${mEdge[1]}`; esChromium = true }
  else if (mChrome) { navegador = `Chrome ${mChrome[1]}`; esChromium = true }
  else if (mFirefox) { navegador = `Firefox ${mFirefox[1]}` }
  else if (mSafari) { navegador = `Safari ${mSafari[1]}` }

  return {
    navegador,
    esChromium,
    contextoSeguro: window.isSecureContext,
    webSerial: "serial" in navigator,
    url: window.location.origin,
  }
}

// ── Detección de escáner HID (por velocidad de tecleo) ───────────────────────
//
// Un escáner de código de barras HID "teclea" el código muy rápido y termina con
// Enter. Distinguimos un escaneo real de un tecleo manual midiendo el tiempo
// promedio entre teclas: una ráfaga <50ms/tecla + varios caracteres = escáner.

export interface ResultadoEscaneo {
  codigo: string
  msPromedioPorTecla: number
  esEscaner: boolean         // heurística: ráfaga rápida y ≥4 caracteres
  totalCaracteres: number
}

/**
 * Crea un detector de escaneo sobre un <input>. Devuelve handlers para
 * onKeyDown/onChange y una función para leer/resetear el resultado al Enter.
 * Uso: en el componente, mantén refs a los timestamps y llama a estos helpers.
 * (La lógica de tiempos se hace aquí para no ensuciar el componente.)
 */
export function evaluarEscaneo(timestamps: number[], codigo: string): ResultadoEscaneo {
  const n = timestamps.length
  let msPromedio = 0
  if (n >= 2) {
    let suma = 0
    for (let i = 1; i < n; i++) suma += timestamps[i]! - timestamps[i - 1]!
    msPromedio = suma / (n - 1)
  }
  const esEscaner = codigo.length >= 4 && n >= 4 && msPromedio > 0 && msPromedio < 50
  return {
    codigo,
    msPromedioPorTecla: Math.round(msPromedio),
    esEscaner,
    totalCaracteres: codigo.length,
  }
}

/** Bip corto vía WebAudio (para el "sonido al escanear"), sin archivos. */
export function bipEscaner(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "square"
    osc.frequency.value = 2000
    gain.gain.value = 0.05
    osc.start()
    osc.stop(ctx.currentTime + 0.08)
    osc.onended = () => { try { ctx.close() } catch { /* noop */ } }
  } catch {
    /* audio bloqueado; no es crítico */
  }
}
