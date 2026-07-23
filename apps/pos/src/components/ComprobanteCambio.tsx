import { useEffect, useState } from "react"
import { Printer, X } from "lucide-react"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { formatMXN as fmt } from "../lib/format"
import type { Cambio } from "../lib/client"
import type { EncabezadoNegocio } from "./ComprobanteAbono"

// ─────────────────────────────────────────────────────────────────────────────
// ComprobanteCambio — comprobante imprimible de una DEVOLUCIÓN O CAMBIO de
// artículo (módulos ferremex_cambios + ferremex_saldo_cambio).
//
// Es el papel que el cliente conserva: artículos que devolvió, artículos nuevos
// que se lleva (si aplica), diferencia cobrada o saldo a favor generado. NO es
// un CFDI — es un comprobante interno del negocio.
//
// Impresión: térmica ESC/POS vía el servicio local (misma vía que el ticket de
// venta y el recibo de abono), con fallback al diálogo del navegador si no hay
// servicio/impresora. Reutilizable: se abre justo al confirmar el cambio
// (CambioWizard) y desde el detalle de un cambio ya registrado (CambiosModule,
// reimpresión).
// ─────────────────────────────────────────────────────────────────────────────

interface ComprobanteCambioProps {
  cambio: Cambio
  /** Encabezado del negocio para la cabecera del ticket. */
  negocio: EncabezadoNegocio
  /** Título del documento (configurable en Formatos → Cambio/Devolución). */
  titulo?: string
  onCerrar: () => void
}

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function ComprobanteCambio({ cambio, negocio, titulo, onCerrar }: ComprobanteCambioProps) {
  const [imprimiendo, setImprimiendo] = useState(false)
  const tituloDoc = titulo || "DEVOLUCIÓN O CAMBIO"

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
        await imprimirBytesLocal(construirBytesCambio(cambio, negocio, tituloDoc))
        onCerrar()
        return
      }
    } catch (err) {
      console.warn("Impresión térmica del comprobante de cambio falló, uso diálogo del navegador:", err)
    } finally {
      setImprimiendo(false)
    }
    window.print()
    window.addEventListener("afterprint", onCerrar, { once: true })
  }

  const lineasNuevas = cambio.lineasNuevas ?? []
  const lineasDevueltas = cambio.lineasDevueltas ?? []

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">Comprobante de cambio</p>

        {/* Vista imprimible (fallback del navegador). */}
        <div className="ticket">
          <div className="ticket-header">
            <p className="ticket-negocio">{negocio.nombre}</p>
            {negocio.direccion && <p className="ticket-sub">{negocio.direccion}</p>}
            {negocio.telefono && <p className="ticket-sub">Tel: {negocio.telefono}</p>}
            {negocio.rfc && <p className="ticket-sub">RFC: {negocio.rfc}</p>}
            <p className="ticket-tipo-doc">{tituloDoc}</p>
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Folio: {cambio.folio_cambio}</p>
          <p className="ticket-meta">Venta origen: {cambio.venta_origen_folio}</p>
          <p className="ticket-meta">Fecha: {fmtFecha(cambio.fecha)}</p>
          <p className="ticket-meta">Atendió: {cambio.cajero}</p>
          <p className="ticket-meta">Cliente: {cambio.cliente_nombre || "Público en general"}</p>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta" style={{ fontWeight: 700 }}>Devuelto:</p>
          {lineasDevueltas.map((l) => (
            <div key={l.id} className="ticket-fila-resumen">
              <span>{l.cantidad}× {l.descripcion}</span>
              <span>{fmt(l.subtotal)}</span>
            </div>
          ))}

          <p className="ticket-meta" style={{ fontWeight: 700, marginTop: 6 }}>Nuevo:</p>
          {lineasNuevas.length === 0 ? (
            <p className="ticket-meta" style={{ fontStyle: "italic" }}>Sin artículo nuevo — solo devolución.</p>
          ) : (
            lineasNuevas.map((l) => (
              <div key={l.id} className="ticket-fila-resumen">
                <span>{l.cantidad}× {l.descripcion}</span>
                <span>{fmt(l.subtotal)}</span>
              </div>
            ))
          )}

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen">
            <span>Valor devuelto</span>
            <span>{fmt(cambio.valor_devuelto)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Valor nuevo</span>
            <span>{fmt(cambio.valor_nuevo)}</span>
          </div>

          {cambio.diferencia_cobrada > 0 && (
            <div className="ticket-fila-resumen" style={{ fontWeight: 700 }}>
              <span>Diferencia cobrada{cambio.venta_diferencia_folio ? ` (${cambio.venta_diferencia_folio})` : ""}</span>
              <span>{fmt(cambio.diferencia_cobrada)}</span>
            </div>
          )}
          {cambio.saldo_generado > 0 && (
            <div className="ticket-fila-resumen ticket-cambio" style={{ fontWeight: 700 }}>
              <span>SALDO A FAVOR GENERADO</span>
              <span>{fmt(cambio.saldo_generado)}</span>
            </div>
          )}

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-gracias">Gracias por su preferencia</p>
          <p className="ticket-gracias">Conserve este comprobante</p>
        </div>

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onCerrar}>
            <X size={16} /> Cerrar
          </button>
          <button className="btn-confirmar" onClick={handleImprimir} disabled={imprimiendo}>
            <Printer size={16} /> {imprimiendo ? "Imprimiendo…" : "Imprimir comprobante"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Construcción de bytes ESC/POS del comprobante de cambio ─────────────────
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
 * Arma el comprobante de cambio como bytes ESC/POS RAW (80mm / 42 cols).
 * Autocontenido: no depende del armador de ticket de venta (serial.ts) porque el
 * layout es distinto (devuelto/nuevo + diferencia/saldo, sin pago-cambio).
 */
export function construirBytesCambio(cambio: Cambio, negocio: EncabezadoNegocio, titulo?: string): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)
  const tituloDoc = titulo || "DEVOLUCION O CAMBIO"

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
  b.push(...linea(tituloDoc))
  b.push(ESC, 0x45, 0x00) // bold off

  b.push(ESC, 0x61, 0x00) // left
  b.push(...linea(sep))
  b.push(...linea(`Folio: ${cambio.folio_cambio}`))
  b.push(...linea(`Venta origen: ${cambio.venta_origen_folio}`))
  b.push(...linea(`Fecha: ${fmtFecha(cambio.fecha)}`))
  b.push(...linea(`Atendio: ${cambio.cajero}`))
  b.push(...linea(`Cliente: ${cambio.cliente_nombre || "Publico en general"}`))
  b.push(...linea(sep))

  b.push(...linea("Devuelto:"))
  for (const l of cambio.lineasDevueltas ?? []) {
    b.push(...linea(filaLR(`${l.cantidad}x ${l.descripcion}`.slice(0, 32), fmt(l.subtotal))))
  }

  b.push(...linea("Nuevo:"))
  const nuevas = cambio.lineasNuevas ?? []
  if (nuevas.length === 0) {
    b.push(...linea("  Sin articulo nuevo - solo devolucion"))
  } else {
    for (const l of nuevas) {
      b.push(...linea(filaLR(`${l.cantidad}x ${l.descripcion}`.slice(0, 32), fmt(l.subtotal))))
    }
  }
  b.push(...linea(sep))

  b.push(...linea(filaLR("Valor devuelto", fmt(cambio.valor_devuelto))))
  b.push(...linea(filaLR("Valor nuevo", fmt(cambio.valor_nuevo))))

  if (cambio.diferencia_cobrada > 0) {
    b.push(ESC, 0x45, 0x01) // bold on
    const etiqueta = cambio.venta_diferencia_folio
      ? `Diferencia cobrada (${cambio.venta_diferencia_folio})`
      : "Diferencia cobrada"
    b.push(...linea(filaLR(etiqueta.slice(0, 32), fmt(cambio.diferencia_cobrada))))
    b.push(ESC, 0x45, 0x00) // bold off
  }
  if (cambio.saldo_generado > 0) {
    b.push(ESC, 0x45, 0x01) // bold on
    b.push(...linea(filaLR("SALDO A FAVOR GENERADO", fmt(cambio.saldo_generado))))
    b.push(ESC, 0x45, 0x00) // bold off
  }

  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  b.push(...linea("Gracias por su preferencia"))
  b.push(...linea("Conserve este comprobante"))

  b.push(LF, LF, LF, LF)
  b.push(GS, 0x56, 0x42, 0x00) // corte parcial
  return b
}
