import { useEffect, useState } from "react"
import { Printer, X } from "lucide-react"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { formatMXN as fmt } from "../lib/format"

// ─────────────────────────────────────────────────────────────────────────────
// ComprobanteAbono — recibo imprimible de un ABONO a cartera de crédito.
//
// Es el papel que el cliente conserva como constancia de su pago: monto abonado,
// a qué compras se aplicó (FIFO), saldo anterior y saldo actual, deuda vencida y
// próximo vencimiento. NO es un CFDI — es un comprobante interno del negocio.
//
// Impresión: térmica ESC/POS vía el servicio local (misma vía que el ticket de
// venta y el comprobante de encargo), con fallback al diálogo del navegador si no
// hay servicio/impresora. Reutilizable: se abre al registrar el abono (recién
// creado) y desde la pestaña Movimientos / el detalle del abono (reimpresión).
// ─────────────────────────────────────────────────────────────────────────────

/** Encabezado del negocio (sacado del ticketConfig). */
export interface EncabezadoNegocio {
  nombre: string
  direccion: string
  telefono: string
  rfc: string
}

/** Una aplicación FIFO del abono: cuánto cubrió de una compra concreta. */
export interface AplicacionAbono {
  folio?: string
  descripcion: string
  fecha: string        // ISO YYYY-MM-DD de la compra
  aplicado: number     // monto que este abono aplicó a la compra
  montoCompra: number  // total de la compra
}

/** Datos completos para armar el recibo de abono. */
export interface AbonoRecibo {
  folio: string                 // folio del recibo (generado en cliente)
  fecha: string                 // ISO del abono (YYYY-MM-DD)
  cajero: string                // quién lo registró
  cliente: string
  telefono: string
  numCliente?: string | number
  monto: number                 // monto abonado
  metodo: string                // Efectivo / Transferencia / …
  referencia?: string           // nota / referencia del abono
  aplicaciones: AplicacionAbono[]
  excedente: number             // sobrante que no cubrió deuda
  saldoAnterior: number         // saldo antes del abono
  saldoActual: number           // saldo después del abono
  deudaVencida: number          // deuda vencida actual
  proximoVence: string | null   // fecha próximo vencimiento (texto corto) o null
}

interface ComprobanteAbonoProps {
  recibo: AbonoRecibo
  /** Encabezado del negocio para la cabecera del ticket. */
  negocio: EncabezadoNegocio
  onCerrar: () => void
}

function fmtFechaCorta(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

export function ComprobanteAbono({ recibo, negocio, onCerrar }: ComprobanteAbonoProps) {
  const [imprimiendo, setImprimiendo] = useState(false)

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  async function handleImprimir() {
    if (imprimiendo) return
    setImprimiendo(true)
    try {
      if (impresoraElegida()) {
        await imprimirBytesLocal(construirBytesAbono(recibo, negocio))
        onCerrar()
        return
      }
    } catch (err) {
      console.warn("Impresión térmica del recibo de abono falló, uso diálogo del navegador:", err)
    } finally {
      setImprimiendo(false)
    }
    window.print()
    window.addEventListener("afterprint", onCerrar, { once: true })
  }

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">Recibo de abono</p>

        {/* Vista imprimible (fallback del navegador). */}
        <div className="ticket">
          <div className="ticket-header">
            <p className="ticket-negocio">{negocio.nombre}</p>
            {negocio.direccion && <p className="ticket-sub">{negocio.direccion}</p>}
            {negocio.telefono && <p className="ticket-sub">Tel: {negocio.telefono}</p>}
            {negocio.rfc && <p className="ticket-sub">RFC: {negocio.rfc}</p>}
            <p className="ticket-tipo-doc">RECIBO DE ABONO</p>
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Folio: {recibo.folio}</p>
          <p className="ticket-meta">Fecha: {fmtFechaCorta(recibo.fecha)}</p>
          <p className="ticket-meta">Atendió: {recibo.cajero}</p>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">
            Cliente: {recibo.cliente}{recibo.numCliente ? ` (#${recibo.numCliente})` : ""}
          </p>
          {recibo.telefono && <p className="ticket-meta">Tel: {recibo.telefono}</p>}
          <p className="ticket-meta">Método: {recibo.metodo}</p>
          {recibo.referencia && <p className="ticket-meta">Ref: {recibo.referencia}</p>}

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen" style={{ fontWeight: 700 }}>
            <span>ABONO RECIBIDO</span>
            <span>{fmt(recibo.monto)}</span>
          </div>

          <div className="ticket-separador">————————————————</div>

          {recibo.aplicaciones.length > 0 && (
            <>
              <p className="ticket-meta" style={{ fontWeight: 700 }}>Aplicado a:</p>
              {recibo.aplicaciones.map((a, i) => {
                const cubrioTotal = Math.abs(a.aplicado - a.montoCompra) < 0.01
                return (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <div className="ticket-fila-resumen">
                      <span>{a.folio || a.descripcion || "Compra"}</span>
                      <span>{fmt(a.aplicado)}</span>
                    </div>
                    <p className="ticket-meta" style={{ fontSize: 11, opacity: 0.8 }}>
                      {fmtFechaCorta(a.fecha)}
                      {cubrioTotal
                        ? " · liquida"
                        : ` · parcial de ${fmt(a.montoCompra)}`}
                    </p>
                  </div>
                )
              })}
            </>
          )}
          {recibo.excedente > 0 && (
            <div className="ticket-fila-resumen">
              <span>Excedente a favor</span>
              <span>{fmt(recibo.excedente)}</span>
            </div>
          )}
          {(recibo.aplicaciones.length > 0 || recibo.excedente > 0) && (
            <div className="ticket-separador">————————————————</div>
          )}

          <div className="ticket-fila-resumen">
            <span>Saldo anterior</span>
            <span>{fmt(recibo.saldoAnterior)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Abono</span>
            <span>-{fmt(recibo.monto)}</span>
          </div>
          <div className="ticket-fila-resumen ticket-cambio" style={{ fontWeight: 700 }}>
            <span>SALDO ACTUAL</span>
            <span>{fmt(recibo.saldoActual)}</span>
          </div>

          {(recibo.deudaVencida > 0 || recibo.proximoVence) && (
            <>
              <div className="ticket-separador">————————————————</div>
              {recibo.deudaVencida > 0 && (
                <div className="ticket-fila-resumen">
                  <span>Deuda vencida</span>
                  <span>{fmt(recibo.deudaVencida)}</span>
                </div>
              )}
              {recibo.proximoVence && (
                <p className="ticket-meta">Próximo vence: {recibo.proximoVence}</p>
              )}
            </>
          )}

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-gracias">Gracias por su pago</p>
          <p className="ticket-gracias">Conserve este comprobante</p>
        </div>

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onCerrar}>
            <X size={16} /> Cerrar
          </button>
          <button className="btn-confirmar" onClick={handleImprimir} disabled={imprimiendo}>
            <Printer size={16} /> {imprimiendo ? "Imprimiendo…" : "Imprimir recibo"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Construcción de bytes ESC/POS del recibo de abono ────────────────────────
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const COLS = 42

function latin1(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    out.push(c < 256 ? c : 0x3f)
  }
  return out
}
function linea(txt: string): number[] { return [...latin1(txt), LF] }
/** Fila etiqueta/valor a lo ancho del ticket. */
function filaLR(izq: string, der: string): string {
  const espacio = Math.max(1, COLS - izq.length - der.length)
  return izq.slice(0, COLS) + " ".repeat(espacio) + der
}

/**
 * Arma el recibo de abono como bytes ESC/POS RAW (80mm / 42 cols).
 * Autocontenido: no depende del armador de ticket de venta (serial.ts) porque el
 * layout es distinto (sin artículos/pago-cambio, con aplicación FIFO y saldos).
 */
export function construirBytesAbono(recibo: AbonoRecibo, negocio: EncabezadoNegocio): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)

  b.push(ESC, 0x40) // init
  b.push(ESC, 0x74, 16) // code page Windows-1252
  b.push(ESC, 0x61, 0x01) // center

  b.push(ESC, 0x21, 0x30) // doble alto/ancho
  b.push(...linea(negocio.nombre || "FERREMEX"))
  b.push(ESC, 0x21, 0x00) // normal
  if (negocio.direccion) b.push(...linea(negocio.direccion))
  if (negocio.telefono) b.push(...linea(`Tel: ${negocio.telefono}`))
  if (negocio.rfc) b.push(...linea(`RFC: ${negocio.rfc}`))
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea("RECIBO DE ABONO"))
  b.push(ESC, 0x45, 0x00) // bold off

  b.push(ESC, 0x61, 0x00) // left
  b.push(...linea(sep))
  b.push(...linea(`Folio: ${recibo.folio}`))
  b.push(...linea(`Fecha: ${fmtFechaCorta(recibo.fecha)}`))
  b.push(...linea(`Atendio: ${recibo.cajero}`))
  b.push(...linea(sep))

  const cli = recibo.numCliente ? `${recibo.cliente} (#${recibo.numCliente})` : recibo.cliente
  b.push(...linea(`Cliente: ${cli}`))
  if (recibo.telefono) b.push(...linea(`Tel: ${recibo.telefono}`))
  b.push(...linea(`Metodo: ${recibo.metodo}`))
  if (recibo.referencia) b.push(...linea(`Ref: ${recibo.referencia}`))
  b.push(...linea(sep))

  // Abono recibido (destacado)
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea(filaLR("ABONO RECIBIDO", fmt(recibo.monto))))
  b.push(ESC, 0x45, 0x00) // bold off
  b.push(...linea(sep))

  // Aplicación FIFO
  if (recibo.aplicaciones.length > 0) {
    b.push(...linea("Aplicado a:"))
    for (const a of recibo.aplicaciones) {
      const etiqueta = a.folio || a.descripcion || "Compra"
      b.push(...linea(filaLR(etiqueta.slice(0, 28), fmt(a.aplicado))))
      const cubrioTotal = Math.abs(a.aplicado - a.montoCompra) < 0.01
      const detalle = cubrioTotal
        ? `  ${fmtFechaCorta(a.fecha)} - liquida`
        : `  ${fmtFechaCorta(a.fecha)} - parcial de ${fmt(a.montoCompra)}`
      b.push(...linea(detalle))
    }
  }
  if (recibo.excedente > 0) {
    b.push(...linea(filaLR("Excedente a favor", fmt(recibo.excedente))))
  }
  if (recibo.aplicaciones.length > 0 || recibo.excedente > 0) {
    b.push(...linea(sep))
  }

  // Saldos
  b.push(...linea(filaLR("Saldo anterior", fmt(recibo.saldoAnterior))))
  b.push(...linea(filaLR("Abono", `-${fmt(recibo.monto)}`)))
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea(filaLR("SALDO ACTUAL", fmt(recibo.saldoActual))))
  b.push(ESC, 0x45, 0x00) // bold off

  // Vencimiento / mora
  if (recibo.deudaVencida > 0 || recibo.proximoVence) {
    b.push(...linea(sep))
    if (recibo.deudaVencida > 0) {
      b.push(...linea(filaLR("Deuda vencida", fmt(recibo.deudaVencida))))
    }
    if (recibo.proximoVence) {
      b.push(...linea(`Proximo vence: ${recibo.proximoVence}`))
    }
  }

  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  b.push(...linea("Gracias por su pago"))
  b.push(...linea("Conserve este comprobante"))

  b.push(LF, LF, LF, LF)
  b.push(GS, 0x56, 0x42, 0x00) // corte parcial
  return b
}
