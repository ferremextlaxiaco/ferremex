import { useEffect, useState } from "react"
import { Printer, X } from "lucide-react"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { formatMXN as fmt } from "../lib/format"
import type { EncabezadoNegocio } from "./ComprobanteAbono"

// ─────────────────────────────────────────────────────────────────────────────
// EstadoCuentaTicket — estado de cuenta imprimible de un cliente a crédito.
//
// Es el papel que se entrega al cliente con el desglose de su cuenta: sus compras
// a crédito y abonos (con fecha y estado), el resumen de crédito (límite / saldo /
// disponible / vencido) y el SALDO RESTANTE por liquidar. NO es un CFDI — es un
// comprobante interno del negocio.
//
// Impresión: térmica ESC/POS vía el servicio local (misma vía que el ticket de
// venta, el comprobante de encargo y el recibo de abono), con fallback al diálogo
// del navegador si no hay servicio/impresora.
// ─────────────────────────────────────────────────────────────────────────────

/** Una línea del estado de cuenta (compra o abono, ya con su estado FIFO). */
export interface MovimientoEC {
  tipo: "compra" | "pago"
  monto: number
  fecha: string           // ISO YYYY-MM-DD
  folio?: string
  descripcion?: string
  estado?: string         // pagado | parcial | pendiente | pago
  cancelado?: boolean
}

/** Datos completos para armar el estado de cuenta. */
export interface EstadoCuentaData {
  fecha: string           // ISO de emisión del estado de cuenta
  cajero: string          // quién lo emite
  cliente: string
  telefono: string
  numCliente?: string | number
  plazo: number
  limite: number
  saldo: number           // deuda actual
  disponible: number
  vencido: number
  totalComprado: number   // Σ compras vigentes
  totalAbonado: number    // Σ abonos vigentes
  proximoVence: string | null
  movimientos: MovimientoEC[]  // ya ordenados (más reciente primero para la vista)
}

interface EstadoCuentaTicketProps {
  data: EstadoCuentaData
  negocio: EncabezadoNegocio
  onCerrar: () => void
}

function fmtFechaCorta(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function estadoLabel(m: MovimientoEC): string {
  if (m.cancelado) return "Cancelado"
  if (m.tipo === "pago") return "Abono"
  if (m.estado === "pagado") return "Pagado"
  if (m.estado === "parcial") return "Parcial"
  return "Pendiente"
}

export function EstadoCuentaTicket({ data, negocio, onCerrar }: EstadoCuentaTicketProps) {
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
        await imprimirBytesLocal(construirBytesEstadoCuenta(data, negocio))
        onCerrar()
        return
      }
    } catch (err) {
      console.warn("Impresión térmica del estado de cuenta falló, uso diálogo del navegador:", err)
    } finally {
      setImprimiendo(false)
    }
    window.print()
    window.addEventListener("afterprint", onCerrar, { once: true })
  }

  // Solo movimientos vigentes en la vista (los cancelados no aportan al saldo).
  const movs = data.movimientos.filter((m) => !m.cancelado)

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box">
        <p className="ticket-preview-titulo">Estado de cuenta</p>

        <div className="ticket">
          <div className="ticket-header">
            <p className="ticket-negocio">{negocio.nombre}</p>
            {negocio.direccion && <p className="ticket-sub">{negocio.direccion}</p>}
            {negocio.telefono && <p className="ticket-sub">Tel: {negocio.telefono}</p>}
            {negocio.rfc && <p className="ticket-sub">RFC: {negocio.rfc}</p>}
            <p className="ticket-tipo-doc">ESTADO DE CUENTA</p>
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Fecha: {fmtFechaCorta(data.fecha)}</p>
          <p className="ticket-meta">Atendió: {data.cajero}</p>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">
            Cliente: {data.cliente}{data.numCliente ? ` (#${data.numCliente})` : ""}
          </p>
          {data.telefono && <p className="ticket-meta">Tel: {data.telefono}</p>}
          <p className="ticket-meta">Plazo de crédito: {data.plazo} días</p>

          <div className="ticket-separador">————————————————</div>

          {/* Resumen de crédito */}
          <div className="ticket-fila-resumen">
            <span>Límite de crédito</span><span>{fmt(data.limite)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Total comprado</span><span>{fmt(data.totalComprado)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Abonado a deuda actual</span><span>{fmt(data.totalAbonado)}</span>
          </div>
          <div className="ticket-fila-resumen">
            <span>Disponible</span><span>{fmt(data.disponible)}</span>
          </div>
          {data.vencido > 0 && (
            <div className="ticket-fila-resumen">
              <span>Deuda vencida</span><span>{fmt(data.vencido)}</span>
            </div>
          )}

          <div className="ticket-separador">————————————————</div>

          {/* Movimientos */}
          <p className="ticket-meta" style={{ fontWeight: 700 }}>Movimientos:</p>
          {movs.length === 0 ? (
            <p className="ticket-meta">Sin movimientos registrados.</p>
          ) : movs.map((m, i) => (
            <div key={i} style={{ marginBottom: 3 }}>
              <div className="ticket-fila-resumen">
                <span>{m.tipo === "pago" ? "Abono" : (m.folio || "Compra")}</span>
                <span>{m.tipo === "pago" ? "-" : ""}{fmt(m.monto)}</span>
              </div>
              <p className="ticket-meta" style={{ fontSize: 11, opacity: 0.8 }}>
                {fmtFechaCorta(m.fecha)} · {estadoLabel(m)}
              </p>
            </div>
          ))}

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen ticket-cambio" style={{ fontWeight: 700 }}>
            <span>SALDO POR LIQUIDAR</span><span>{fmt(data.saldo)}</span>
          </div>
          {data.proximoVence && (
            <p className="ticket-meta">Próximo vencimiento: {data.proximoVence}</p>
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
            <Printer size={16} /> {imprimiendo ? "Imprimiendo…" : "Imprimir estado de cuenta"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Construcción de bytes ESC/POS del estado de cuenta ───────────────────────
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
function filaLR(izq: string, der: string): string {
  const espacio = Math.max(1, COLS - izq.length - der.length)
  return izq.slice(0, COLS) + " ".repeat(espacio) + der
}

/**
 * Arma el estado de cuenta como bytes ESC/POS RAW (80mm / 42 cols).
 * Autocontenido: no depende del armador de ticket de venta (serial.ts).
 */
export function construirBytesEstadoCuenta(data: EstadoCuentaData, negocio: EncabezadoNegocio): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)
  const movs = data.movimientos.filter((m) => !m.cancelado)

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
  b.push(...linea("ESTADO DE CUENTA"))
  b.push(ESC, 0x45, 0x00) // bold off

  b.push(ESC, 0x61, 0x00) // left
  b.push(...linea(sep))
  b.push(...linea(`Fecha: ${fmtFechaCorta(data.fecha)}`))
  b.push(...linea(`Atendio: ${data.cajero}`))
  b.push(...linea(sep))

  const cli = data.numCliente ? `${data.cliente} (#${data.numCliente})` : data.cliente
  b.push(...linea(`Cliente: ${cli}`))
  if (data.telefono) b.push(...linea(`Tel: ${data.telefono}`))
  b.push(...linea(`Plazo de credito: ${data.plazo} dias`))
  b.push(...linea(sep))

  // Resumen de crédito
  b.push(...linea(filaLR("Limite de credito", fmt(data.limite))))
  b.push(...linea(filaLR("Total comprado", fmt(data.totalComprado))))
  b.push(...linea(filaLR("Abonado a deuda actual", fmt(data.totalAbonado))))
  b.push(...linea(filaLR("Disponible", fmt(data.disponible))))
  if (data.vencido > 0) b.push(...linea(filaLR("Deuda vencida", fmt(data.vencido))))
  b.push(...linea(sep))

  // Movimientos
  b.push(...linea("Movimientos:"))
  if (movs.length === 0) {
    b.push(...linea("  Sin movimientos registrados."))
  } else {
    for (const m of movs) {
      const etiqueta = m.tipo === "pago" ? "Abono" : (m.folio || "Compra")
      const monto = (m.tipo === "pago" ? "-" : "") + fmt(m.monto)
      b.push(...linea(filaLR(etiqueta.slice(0, 28), monto)))
      b.push(...linea(`  ${fmtFechaCorta(m.fecha)} - ${estadoLabel(m)}`))
    }
  }
  b.push(...linea(sep))

  // Saldo por liquidar (destacado)
  b.push(ESC, 0x45, 0x01) // bold on
  b.push(...linea(filaLR("SALDO POR LIQUIDAR", fmt(data.saldo))))
  b.push(ESC, 0x45, 0x00) // bold off
  if (data.proximoVence) b.push(...linea(`Proximo vencimiento: ${data.proximoVence}`))

  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  b.push(...linea("Gracias por su preferencia"))
  b.push(...linea("Conserve este comprobante"))

  b.push(LF, LF, LF, LF)
  b.push(GS, 0x56, 0x42, 0x00) // corte parcial
  return b
}
