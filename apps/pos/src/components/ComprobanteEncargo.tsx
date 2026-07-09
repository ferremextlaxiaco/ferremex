import { useEffect, useState } from "react"
import { Printer, X, ClipboardList } from "lucide-react"
import type { EncargoFicha } from "../lib/client"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { formatMXN as fmt } from "../lib/format"

interface ComprobanteEncargoProps {
  ficha: EncargoFicha
  /** Nombre del negocio (del ticketConfig) para el encabezado. */
  negocio?: string
  onCerrar: () => void
}

/**
 * Comprobante imprimible de una FICHA DE ENCARGO. Es el papel que el cliente
 * conserva como constancia de su pedido especial: folio, artículos, montos
 * (total / anticipo / resta), fecha comprometida y datos de contacto. Da certeza
 * y confianza del encargo.
 *
 * Impresión: térmica ESC/POS vía el servicio local (misma vía que el ticket), con
 * fallback al diálogo del navegador si no hay servicio/impresora. Reutilizable:
 * se abre al cobrar (recién creada) y desde el módulo "Encargos" (reimpresión).
 */
export function ComprobanteEncargo({ ficha, negocio = "FERREMEX", onCerrar }: ComprobanteEncargoProps) {
  const [imprimiendo, setImprimiendo] = useState(false)
  const resta = ficha.resta ?? Math.max(0, ficha.total - ficha.anticipo - (ficha.abonado ?? 0))
  const fechaTxt = new Date(ficha.fecha).toLocaleString("es-MX")

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
        await imprimirBytesLocal(construirBytesComprobante(ficha, negocio))
        onCerrar()
        return
      }
    } catch (err) {
      console.warn("Impresión térmica del comprobante falló, uso diálogo del navegador:", err)
    } finally {
      setImprimiendo(false)
    }
    window.print()
    window.addEventListener("afterprint", onCerrar, { once: true })
  }

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">Comprobante de encargo</p>

        {/* Vista imprimible (fallback del navegador). */}
        <div className="ticket">
          <div className="ticket-header">
            <p className="ticket-negocio">{negocio}</p>
            <p className="ticket-sub">Tlaxiaco, Oaxaca</p>
            <p className="ticket-tipo-doc">COMPROBANTE DE ENCARGO</p>
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Folio: {ficha.folio}</p>
          <p className="ticket-meta">Fecha: {fechaTxt}</p>
          <p className="ticket-meta">Cliente: {ficha.cliente_nombre}</p>
          <p className="ticket-meta">Tel: {ficha.telefono}</p>
          <p className="ticket-meta">Entrega estimada: {ficha.tiempo_entrega || "—"}</p>

          <div className="ticket-separador">————————————————</div>

          <table className="ticket-tabla">
            <thead>
              <tr>
                <th className="ticket-col-desc">Artículo encargado</th>
                <th className="ticket-col-num">Cant</th>
              </tr>
            </thead>
            <tbody>
              {ficha.articulos.map((a, i) => (
                <tr key={i}>
                  <td className="ticket-col-desc">{a.descripcion}</td>
                  <td className="ticket-col-num">{a.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen">
            <span>Total del encargo</span>
            <span>{fmt(ficha.total)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Anticipo pagado</span>
            <span>{fmt(ficha.anticipo)}</span>
          </div>
          {(ficha.abonado ?? 0) > 0 && (
            <div className="ticket-fila-resumen">
              <span>Abonos posteriores</span>
              <span>{fmt(ficha.abonado ?? 0)}</span>
            </div>
          )}
          <div className="ticket-fila-resumen ticket-cambio">
            <span>Resta por pagar</span>
            <span>{fmt(resta)}</span>
          </div>

          {ficha.motivo && (
            <>
              <div className="ticket-separador">————————————————</div>
              <p className="ticket-meta">Motivo: {ficha.motivo}</p>
            </>
          )}
          {ficha.notas && <p className="ticket-meta">Notas: {ficha.notas}</p>}

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-gracias">Conserve este comprobante</p>
          <p className="ticket-gracias">Le avisaremos cuando su pedido llegue</p>
          <p className="ticket-gracias">La resta se liquida al entregar</p>
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

// ── Construcción de bytes ESC/POS del comprobante ────────────────────────────
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
function centrado(txt: string): string {
  const t = txt.slice(0, COLS)
  const pad = Math.max(0, Math.floor((COLS - t.length) / 2))
  return " ".repeat(pad) + t
}
/** Fila etiqueta/valor a lo ancho del ticket. */
function filaLR(izq: string, der: string): string {
  const espacio = Math.max(1, COLS - izq.length - der.length)
  return izq.slice(0, COLS) + " ".repeat(espacio) + der
}

/**
 * Arma el comprobante de encargo como bytes ESC/POS RAW (80mm / 42 cols).
 * Autocontenido: no depende del armador de ticket de venta (serial.ts) porque el
 * layout es distinto (sin pago/cambio, con datos de contacto y resta a pagar).
 */
export function construirBytesComprobante(ficha: EncargoFicha, negocio: string): number[] {
  const resta = ficha.resta ?? Math.max(0, ficha.total - ficha.anticipo - (ficha.abonado ?? 0))
  const b: number[] = []
  const sep = "-".repeat(COLS)

  b.push(ESC, 0x40) // init
  b.push(ESC, 0x61, 0x01) // center

  b.push(ESC, 0x21, 0x30) // doble alto/ancho
  b.push(...linea(negocio))
  b.push(ESC, 0x21, 0x00) // normal
  b.push(...linea("Tlaxiaco, Oaxaca"))
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea("COMPROBANTE DE ENCARGO"))
  b.push(ESC, 0x45, 0x00) // bold off

  b.push(ESC, 0x61, 0x00) // left
  b.push(...linea(sep))
  b.push(...linea(`Folio: ${ficha.folio}`))
  b.push(...linea(`Fecha: ${new Date(ficha.fecha).toLocaleString("es-MX")}`))
  b.push(...linea(`Cliente: ${ficha.cliente_nombre}`))
  b.push(...linea(`Tel: ${ficha.telefono}`))
  b.push(...linea(`Entrega estimada: ${ficha.tiempo_entrega || "-"}`))
  b.push(...linea(sep))

  // Artículos
  for (const a of ficha.articulos) {
    b.push(...linea(filaLR(a.descripcion, `x${a.cantidad}`)))
  }
  b.push(...linea(sep))

  // Montos
  b.push(...linea(filaLR("Total del encargo", fmt(ficha.total))))
  b.push(...linea(filaLR("Anticipo pagado", fmt(ficha.anticipo))))
  if ((ficha.abonado ?? 0) > 0) b.push(...linea(filaLR("Abonos posteriores", fmt(ficha.abonado ?? 0))))
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea(filaLR("RESTA POR PAGAR", fmt(resta))))
  b.push(ESC, 0x45, 0x00) // bold off

  if (ficha.motivo) {
    b.push(...linea(sep))
    b.push(...linea(`Motivo: ${ficha.motivo}`))
  }
  if (ficha.notas) b.push(...linea(`Notas: ${ficha.notas}`))

  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  b.push(...linea("Conserve este comprobante"))
  b.push(...linea("Le avisaremos cuando llegue"))
  b.push(...linea("La resta se liquida al entregar"))

  b.push(LF, LF, LF, LF)
  b.push(GS, 0x56, 0x42, 0x00) // corte parcial
  return b
}
