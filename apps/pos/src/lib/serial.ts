// Manejo del cajón de dinero via Web Serial API (Chrome).
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
