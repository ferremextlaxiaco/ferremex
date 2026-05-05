// Manejo del cajón de dinero y tickets via Web Serial API (Chrome).
// El cajón está conectado a la impresora térmica por cable RJ11.
// Para abrirlo se envía el comando ESC/POS: ESC p 0 25 25
// Bytes: [0x1B, 0x70, 0x00, 0x19, 0x19]

const CAJON_COMMAND = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0x19])

let puertoActivo: SerialPort | null = null

export function serialDisponible(): boolean {
  return "serial" in navigator
}

export async function conectarImpresora(): Promise<void> {
  if (!serialDisponible()) {
    throw new Error("Este navegador no soporta Web Serial API. Usa Chrome.")
  }
  // Abre el selector de puertos de Chrome
  const puerto = await navigator.serial.requestPort()
  await puerto.open({ baudRate: 9600 })
  puertoActivo = puerto
}

export function impresoraConectada(): boolean {
  return puertoActivo !== null
}

export async function abrirCajon(): Promise<void> {
  if (!serialDisponible()) {
    console.warn("Web Serial no disponible (requiere HTTPS o localhost)")
    return
  }
  if (!puertoActivo) {
    // Intento silencioso de reconexión con permisos previos
    const puertos = await navigator.serial.getPorts()
    if (puertos.length > 0 && puertos[0]) {
      const p = puertos[0]
      if (!p.readable) await p.open({ baudRate: 9600 })
      puertoActivo = p
    } else {
      console.warn("Cajón no conectado — la venta se procesa igualmente")
      return
    }
  }

  try {
    const writer = puertoActivo.writable?.getWriter()
    if (!writer) return
    await writer.write(CAJON_COMMAND)
    writer.releaseLock()
  } catch (err) {
    console.error("Error al abrir cajón:", err)
    // No bloqueamos la venta si el cajón falla
  }
}

/* ══════════════════════════════════════════════════════════════════
   IMPRESIÓN DIRECTA ESC/POS — sin diálogo de impresión del navegador
   ══════════════════════════════════════════════════════════════════ */

// Constantes ESC/POS
const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

// Número de columnas a 80mm con fuente estándar (Font A)
const COLS = 42

/** Datos del ticket a imprimir */
export interface TicketPrintData {
  company: {
    logo: string | null
    logoSize: number
    name: string
    rfc: string
    address: string
    phone: string
    email: string
  }
  titulo: string
  folio: string
  fecha: string
  cajero: string
  cliente?: { name: string; rfc: string } | null
  lines: Array<{
    description: string
    qty: number
    unitPrice: number
    total: number
    savings: number
    discount: number
    pkgItems: Array<{ name: string; qty: number }>
  }>
  subtotal: number
  globalDiscAmt: number
  globalDiscLabel: string
  iva: number
  pointsDisc: number
  pointsRedeemed: number
  cnAmt: number
  cnFolio: string
  total: number
  payment: { method: string; label: string; received: number; change: number }
  footer: string[]
}

/** Codifica texto como Latin-1 (U+0000–U+00FF). Los caracteres fuera de rango
 *  se reemplazan por '?'. Esto cubre todo el español sin tablas de conversión. */
function encodeLatinOne(text: string): number[] {
  const bytes: number[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    bytes.push(code < 256 ? code : 0x3f)
  }
  return bytes
}

/** Recorta o rellena con espacios a la derecha hasta n chars */
function padR(s: string, n: number): string {
  return s.slice(0, n).padEnd(n, " ")
}
/** Recorta o rellena con espacios a la izquierda hasta n chars */
function padL(s: string, n: number): string {
  return s.slice(-n).padStart(n, " ")
}

/** Centra texto en COLS */
function centered(text: string): string {
  const t = text.slice(0, COLS)
  const pad = Math.max(0, Math.floor((COLS - t.length) / 2))
  return " ".repeat(pad) + t
}

/** Formatea número como moneda MX (recortado a 9 chars para columnas) */
function fmtCol(n: number): string {
  const s = "$" + (Number.isFinite(n) ? n : 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return s.slice(0, 12) // columna de totales, 12 chars max
}

/** Convierte un logo base64 a bytes ESC/POS de imagen raster (GS v 0) */
async function rasterizarLogo(base64: string, anchoDotsTarget: number): Promise<number[]> {
  const img = new Image()
  img.src = base64
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("No se pudo cargar la imagen del logo"))
  })

  // Escalar manteniendo proporción, máximo 384 dots (80mm a 203 DPI)
  const anchoMax = Math.min(anchoDotsTarget, 384)
  const scale = anchoMax / img.naturalWidth
  const ancho = anchoMax
  const alto = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No se pudo obtener contexto de canvas")

  // Fondo blanco (para imágenes con transparencia)
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, ancho, alto)
  ctx.filter = "grayscale(1) contrast(2)"
  ctx.drawImage(img, 0, 0, ancho, alto)

  const imageData = ctx.getImageData(0, 0, ancho, alto)
  const bytesPerRow = Math.ceil(ancho / 8)
  const rasterData: number[] = []

  for (let y = 0; y < alto; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit
        if (x < ancho) {
          const idx = (y * ancho + x) * 4
          const r = imageData.data[idx] ?? 255
          const g = imageData.data[idx + 1] ?? 255
          const b = imageData.data[idx + 2] ?? 255
          const gray = 0.299 * r + 0.587 * g + 0.114 * b
          if (gray < 128) byte |= 1 << (7 - bit) // pixel oscuro = imprimir
        }
      }
      rasterData.push(byte)
    }
  }

  const xL = bytesPerRow & 0xff
  const xH = (bytesPerRow >> 8) & 0xff
  const yL = alto & 0xff
  const yH = (alto >> 8) & 0xff

  // GS v 0 (deprecated pero compatible con la mayoría de impresoras ESC/POS)
  return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...rasterData]
}

/** Reconecta usando permisos ya otorgados (sin selector de puertos) */
async function reconectarSilencioso(): Promise<boolean> {
  try {
    const puertos = await navigator.serial.getPorts()
    if (puertos.length > 0 && puertos[0]) {
      const p = puertos[0]
      if (!p.readable) await p.open({ baudRate: 9600 })
      puertoActivo = p
      return true
    }
  } catch {
    // Silencioso
  }
  return false
}

/**
 * Envía el ticket directamente a la impresora térmica via ESC/POS.
 * No abre ningún diálogo del navegador.
 * Lanza un Error si la impresora no está conectada.
 */
export async function imprimirTicketESCPOS(data: TicketPrintData): Promise<void> {
  if (!serialDisponible()) {
    throw new Error("Este navegador no soporta Web Serial. Usa Chrome.")
  }
  if (!puertoActivo) {
    const ok = await reconectarSilencioso()
    if (!ok) throw new Error("Impresora no conectada. Usa el botón 'Conectar impresora' primero.")
  }

  const bytes: number[] = []

  // Helpers locales
  const cmd = (...arr: number[]) => bytes.push(...arr)
  const txt = (s: string) => bytes.push(...encodeLatinOne(s))
  const nl = () => bytes.push(LF)
  const linea = (char = "-") => { txt(char.repeat(COLS)); nl() }
  const totRow = (label: string, valor: string) => {
    const maxLabel = COLS - 13
    txt(padR(label, maxLabel) + padL(valor, 13))
    nl()
  }

  // ── Inicializar impresora ───────────────────────────────────────
  cmd(ESC, 0x40)       // ESC @ — init (borra buffer y resetea)
  cmd(ESC, 0x74, 16)   // ESC t 16 — code page Windows-1252 (cubre español completo)

  // ── Logo ───────────────────────────────────────────────────────
  if (data.company.logo) {
    try {
      const logoBytes = await rasterizarLogo(data.company.logo, data.company.logoSize)
      cmd(ESC, 0x61, 0x01) // centrar
      bytes.push(...logoBytes)
      nl()
    } catch {
      // Si falla la rasterización, continúa sin logo
    }
  }

  // ── Encabezado ─────────────────────────────────────────────────
  cmd(ESC, 0x61, 0x01) // centrar
  cmd(ESC, 0x45, 0x01) // negrita on
  cmd(GS,  0x21, 0x10) // doble altura
  txt(centered(data.company.name || "NEGOCIO")); nl()
  cmd(GS,  0x21, 0x00) // tamaño normal
  cmd(ESC, 0x45, 0x00) // negrita off
  if (data.company.address) { txt(data.company.address); nl() }
  if (data.company.phone)   { txt("Tel: " + data.company.phone); nl() }
  if (data.company.email)   { txt(data.company.email); nl() }
  if (data.company.rfc)     { txt("RFC: " + data.company.rfc); nl() }

  // ── Título del comprobante ─────────────────────────────────────
  linea("=")
  cmd(ESC, 0x45, 0x01) // negrita
  txt(centered(data.titulo)); nl()
  cmd(ESC, 0x45, 0x00)
  linea("=")

  // ── Folio / fecha / cajero ─────────────────────────────────────
  cmd(ESC, 0x61, 0x00) // izquierda
  txt("Folio: " + data.folio); nl()
  txt("Fecha: " + data.fecha); nl()
  txt("Cajero: " + data.cajero); nl()

  // ── Cliente ────────────────────────────────────────────────────
  if (data.cliente?.name || data.cliente?.rfc) {
    if (data.cliente.name) { txt("Cliente: " + data.cliente.name); nl() }
    if (data.cliente.rfc)  { txt("RFC: " + data.cliente.rfc); nl() }
  }
  linea()

  // ── Cabecera de productos ──────────────────────────────────────
  const descW = 20, qtyW = 4, puW = 9, totW = 9
  cmd(ESC, 0x45, 0x01)
  txt(padR("Artículo", descW) + padL("Cant", qtyW) + padL("P.U.", puW) + padL("Total", totW))
  nl()
  cmd(ESC, 0x45, 0x00)
  linea()

  // ── Líneas de productos ────────────────────────────────────────
  for (const l of data.lines) {
    const pu  = "$" + l.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const tot = "$" + l.total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    txt(padR(l.description || "—", descW) + padL(String(l.qty), qtyW) + padL(pu.slice(0, puW), puW) + padL(tot.slice(0, totW), totW))
    nl()
    if (l.discount > 0) {
      const sav = "$" + l.savings.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      txt("  Desc. " + l.discount + "%: -" + sav); nl()
    }
    for (const p of l.pkgItems) {
      if (p.name) { txt("  · " + p.name + " ×" + p.qty); nl() }
    }
  }
  linea()

  // ── Resumen de totales ─────────────────────────────────────────
  totRow("Subtotal:", fmtCol(data.subtotal))
  if (data.globalDiscAmt > 0) {
    totRow("Desc. " + data.globalDiscLabel + ":", "-" + fmtCol(data.globalDiscAmt))
  }
  totRow("IVA 16%:", fmtCol(data.iva))
  if (data.pointsDisc > 0) {
    totRow("Desc. puntos (" + data.pointsRedeemed + " pts):", "-" + fmtCol(data.pointsDisc))
  }
  if (data.cnAmt > 0) {
    const cnLabel = "N. credito" + (data.cnFolio ? " #" + data.cnFolio : "") + ":"
    totRow(cnLabel, "-" + fmtCol(data.cnAmt))
  }
  cmd(ESC, 0x45, 0x01) // negrita
  totRow("TOTAL:", fmtCol(data.total))
  cmd(ESC, 0x45, 0x00)

  linea("=")

  // ── Método de pago ─────────────────────────────────────────────
  cmd(ESC, 0x61, 0x01) // centrar
  txt(centered("[ " + data.payment.label + " ]")); nl()
  if (data.payment.method === "efectivo") {
    cmd(ESC, 0x61, 0x00)
    totRow("Recibido:", fmtCol(data.payment.received))
    totRow("Cambio:", fmtCol(data.payment.change))
  }
  linea()

  // ── Pie de página ──────────────────────────────────────────────
  cmd(ESC, 0x61, 0x01) // centrar
  for (const linePie of data.footer) {
    if (linePie) { txt(linePie); nl() }
  }

  // ── Avance + corte ─────────────────────────────────────────────
  nl(); nl(); nl()
  cmd(GS, 0x56, 0x41, 0x00) // GS V 65 0 — corte parcial

  // ── Enviar a la impresora ──────────────────────────────────────
  const writer = puertoActivo!.writable?.getWriter()
  if (!writer) throw new Error("No se puede escribir en la impresora (puerto no escribible)")
  try {
    await writer.write(new Uint8Array(bytes))
  } finally {
    writer.releaseLock()
  }
}
