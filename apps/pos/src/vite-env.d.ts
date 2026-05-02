/// <reference types="vite/client" />

// Web Serial API (Chrome)
interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
}

interface Serial {
  requestPort(options?: object): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface Navigator {
  readonly serial: Serial
}
