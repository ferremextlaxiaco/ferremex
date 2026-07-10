import { useEffect, useState } from "react"
import { Printer, X, User, Truck } from "lucide-react"
import type { VentaResponse, EntregaFicha, TicketConfig, FormatoDoc } from "../lib/client"
import { usePOS } from "../lib/pos-store"
import { imprimirBytesLocal, impresoraElegida } from "../lib/impresora-local"
import { formatMXN as fmt } from "../lib/format"

interface TicketsEntregaProps {
  venta: VentaResponse
  ficha: EntregaFicha
  onCerrar: () => void
}

/**
 * Los DOS comprobantes de una venta contra entrega:
 *  1. Ticket del CLIENTE — detalle de compra + sello "PAGO CONTRA ENTREGA".
 *  2. Hoja del REPARTIDOR — ficha de entrega + artículos con casillas ☐ (sin
 *     precios) + TOTAL A COBRAR + espacio de firmas.
 *
 * Al montar se imprimen AMBOS automáticamente a la térmica (uno tras otro, con
 * corte de papel entre ellos). Quedan botones para reimprimir cada uno. Los
 * formatos (título/encabezado/pie/flags) se leen del ticketConfig → formatos
 * (editables en el módulo de Formatos: entrega_cliente / entrega_repartidor).
 */
export function TicketsEntrega({ venta, ficha, onCerrar }: TicketsEntregaProps) {
  const { state } = usePOS()
  const cfg = state.ticketConfig
  const fmtCliente = cfg?.formatos?.entrega_cliente
  const fmtReparto = cfg?.formatos?.entrega_repartidor
  const [imprimiendo, setImprimiendo] = useState<null | "cliente" | "repartidor" | "ambos">("ambos")

  const total = venta.entrega_total ?? ficha.total

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  // Impresión automática de ambos al montar (best-effort). Si no hay servicio de
  // impresión, no bloquea: el cajero puede reimprimir con los botones.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!impresoraElegida()) { if (vivo) setImprimiendo(null); return }
      try {
        await imprimirBytesLocal(construirTicketCliente(venta, ficha, cfg, fmtCliente))
        await imprimirBytesLocal(construirHojaRepartidor(venta, ficha, cfg, fmtReparto))
      } catch (e) {
        console.warn("Impresión automática de tickets de entrega falló:", e)
      } finally {
        if (vivo) setImprimiendo(null)
      }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reimprimir(cual: "cliente" | "repartidor") {
    if (imprimiendo) return
    setImprimiendo(cual)
    try {
      const bytes = cual === "cliente"
        ? construirTicketCliente(venta, ficha, cfg, fmtCliente)
        : construirHojaRepartidor(venta, ficha, cfg, fmtReparto)
      if (impresoraElegida()) await imprimirBytesLocal(bytes)
      else window.print()
    } catch (e) {
      console.warn("Reimpresión falló:", e)
    } finally {
      setImprimiendo(null)
    }
  }

  return (
    <div className="ticket-overlay">
      <div className="ticket-preview-box" style={{ maxWidth: 560 }}>
        <p className="ticket-preview-titulo">
          {imprimiendo === "ambos" ? "Imprimiendo comprobantes…" : "Comprobantes de entrega"}
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {/* Vista del ticket del cliente */}
          <div className="ticket" style={{ flex: "1 1 240px" }}>
            <div className="ticket-header">
              <p className="ticket-negocio">{cfg?.encabezado?.nombre || "FERREMEX"}</p>
              {(fmtCliente?.encabezado ?? []).slice(1).map((l, i) => <p key={i} className="ticket-sub">{l}</p>)}
              <p className="ticket-tipo-doc">{fmtCliente?.titulo || "PAGO CONTRA ENTREGA"}</p>
            </div>
            <div className="ticket-separador">————————————————</div>
            <p className="ticket-meta">Folio: {venta.folio}</p>
            <p className="ticket-meta">Fecha: {new Date(venta.fecha).toLocaleString("es-MX")}</p>
            <p className="ticket-meta">Paga: {ficha.paga.nombre}</p>
            <div className="ticket-separador">————————————————</div>
            <table className="ticket-tabla">
              <thead><tr><th className="ticket-col-desc">Artículo</th><th className="ticket-col-num">Cant</th><th className="ticket-col-num">Total</th></tr></thead>
              <tbody>
                {venta.items.map((it, i) => (
                  <tr key={i}>
                    <td className="ticket-col-desc">{it.descripcion}</td>
                    <td className="ticket-col-num">{it.cantidad}</td>
                    <td className="ticket-col-num">${it.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ticket-separador">————————————————</div>
            <div className="ticket-fila-resumen ticket-cambio"><span>TOTAL A PAGAR</span><span>{fmt(total)}</span></div>
            <div className="ticket-separador">————————————————</div>
            {(fmtCliente?.pie ?? ["Pago contra entrega"]).map((l, i) => <p key={i} className="ticket-gracias">{l}</p>)}
          </div>

          {/* Vista de la hoja del repartidor */}
          <div className="ticket" style={{ flex: "1 1 240px" }}>
            <div className="ticket-header">
              <p className="ticket-negocio">{cfg?.encabezado?.nombre || "FERREMEX"}</p>
              <p className="ticket-tipo-doc">{fmtReparto?.titulo || "HOJA DE ENTREGA"}</p>
            </div>
            <div className="ticket-separador">————————————————</div>
            <p className="ticket-meta">Folio: {venta.folio}</p>
            {fmtReparto?.mostrar_ficha !== false && (
              <>
                <p className="ticket-meta">Dirección: {ficha.direccion}</p>
                <p className="ticket-meta">Recibe: {ficha.recibe.nombre} · {ficha.recibe.telefono}</p>
                <p className="ticket-meta">Paga: {ficha.paga.nombre} · {ficha.paga.telefono}</p>
                {ficha.comentarios && <p className="ticket-meta">Ref: {ficha.comentarios}</p>}
              </>
            )}
            <div className="ticket-separador">————————————————</div>
            <table className="ticket-tabla">
              <tbody>
                {venta.items.map((it, i) => (
                  <tr key={i}>
                    <td className="ticket-col-desc">
                      {fmtReparto?.mostrar_casillas !== false && "☐ "}{it.descripcion}
                    </td>
                    <td className="ticket-col-num">x{it.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ticket-separador">————————————————</div>
            <div className="ticket-fila-resumen ticket-cambio"><span>COBRAR</span><span>{fmt(total)}</span></div>
            <div className="ticket-separador">————————————————</div>
            <p className="ticket-meta">Recibí conforme:</p>
            <p className="ticket-meta">_______________________</p>
            <p className="ticket-meta">Pagó:</p>
            <p className="ticket-meta">_______________________</p>
          </div>
        </div>

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onCerrar}><X size={16} /> Cerrar</button>
          <button className="btn-secondary" onClick={() => reimprimir("cliente")} disabled={!!imprimiendo}>
            <User size={16} /> Reimprimir cliente
          </button>
          <button className="btn-confirmar" onClick={() => reimprimir("repartidor")} disabled={!!imprimiendo}>
            <Truck size={16} /> Reimprimir repartidor
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Construcción de bytes ESC/POS ────────────────────────────────────────────
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a
const COLS = 42

function latin1(text: string): number[] {
  const out: number[] = []
  for (const ch of text) { const c = ch.charCodeAt(0); out.push(c < 256 ? c : 0x3f) }
  return out
}
function linea(txt: string): number[] { return [...latin1(txt), LF] }
function filaLR(izq: string, der: string): string {
  const espacio = Math.max(1, COLS - izq.length - der.length)
  return izq.slice(0, COLS) + " ".repeat(espacio) + der
}
/** Envuelve texto largo a COLS columnas (para direcciones/comentarios). */
function envolver(txt: string): string[] {
  const palabras = txt.split(/\s+/)
  const out: string[] = []
  let l = ""
  for (const p of palabras) {
    if ((l + " " + p).trim().length > COLS) { if (l) out.push(l); l = p }
    else l = (l + " " + p).trim()
  }
  if (l) out.push(l)
  return out.length ? out : [""]
}
function encabezadoComun(b: number[], negocio: string, extras: string[], titulo: string) {
  b.push(ESC, 0x40, ESC, 0x61, 0x01) // init + center
  b.push(ESC, 0x21, 0x30, ...linea(negocio), ESC, 0x21, 0x00) // doble + negocio
  for (const e of extras) b.push(...linea(e))
  b.push(ESC, 0x45, 0x01, ...linea(titulo), ESC, 0x45, 0x00) // bold título
  b.push(ESC, 0x61, 0x00) // left
}

/** Ticket del cliente: detalle de compra + total + sello contra entrega. */
export function construirTicketCliente(
  venta: VentaResponse, ficha: EntregaFicha, cfg: TicketConfig | null, doc?: FormatoDoc
): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)
  const negocio = cfg?.encabezado?.nombre || "FERREMEX"
  const total = venta.entrega_total ?? ficha.total
  encabezadoComun(b, negocio, (doc?.encabezado ?? ["Tlaxiaco, Oaxaca"]).slice(1), doc?.titulo || "PAGO CONTRA ENTREGA")

  b.push(...linea(sep))
  b.push(...linea(`Folio: ${venta.folio}`))
  b.push(...linea(`Fecha: ${new Date(venta.fecha).toLocaleString("es-MX")}`))
  b.push(...linea(`Paga: ${ficha.paga.nombre}`))
  b.push(...linea(sep))
  for (const it of venta.items) {
    b.push(...linea(it.descripcion.slice(0, COLS)))
    b.push(...linea(filaLR(`  ${it.cantidad} x $${it.precio_unitario.toFixed(2)}`, `$${it.subtotal.toFixed(2)}`)))
  }
  b.push(...linea(sep))
  b.push(ESC, 0x21, 0x20) // doble ancho
  b.push(...linea(filaLR("TOTAL", `$${total.toFixed(2)}`)))
  b.push(ESC, 0x21, 0x00)
  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  for (const l of (doc?.pie ?? ["El pago se realiza al recibir el material"])) b.push(...linea(l))
  b.push(LF, LF, LF, LF, GS, 0x56, 0x42, 0x00) // corte
  return b
}

/** Hoja del repartidor: ficha + casillas + total a cobrar + firmas. */
export function construirHojaRepartidor(
  venta: VentaResponse, ficha: EntregaFicha, cfg: TicketConfig | null, doc?: FormatoDoc
): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)
  const negocio = cfg?.encabezado?.nombre || "FERREMEX"
  const total = venta.entrega_total ?? ficha.total
  const casillas = doc?.mostrar_casillas !== false
  const conFicha = doc?.mostrar_ficha !== false
  encabezadoComun(b, negocio, (doc?.encabezado ?? ["Copia del repartidor"]).slice(1), doc?.titulo || "HOJA DE ENTREGA")

  b.push(...linea(sep))
  b.push(...linea(`Folio: ${venta.folio}`))
  b.push(...linea(`Fecha: ${new Date(venta.fecha).toLocaleString("es-MX")}`))
  if (conFicha) {
    b.push(...linea(sep))
    b.push(ESC, 0x45, 0x01, ...linea("ENTREGA"), ESC, 0x45, 0x00)
    b.push(...linea("Direccion:"))
    for (const l of envolver(ficha.direccion)) b.push(...linea(`  ${l}`))
    b.push(...linea(`Recibe: ${ficha.recibe.nombre}`))
    b.push(...linea(`  Tel: ${ficha.recibe.telefono}`))
    b.push(...linea(`Paga: ${ficha.paga.nombre}`))
    b.push(...linea(`  Tel: ${ficha.paga.telefono}`))
    if (ficha.comentarios) {
      b.push(...linea("Referencias:"))
      for (const l of envolver(ficha.comentarios)) b.push(...linea(`  ${l}`))
    }
  }
  b.push(...linea(sep))
  b.push(ESC, 0x45, 0x01, ...linea("ARTICULOS A ENTREGAR"), ESC, 0x45, 0x00)
  for (const it of venta.items) {
    const marca = casillas ? "[ ] " : ""
    b.push(...linea(`${marca}${it.cantidad} x ${it.descripcion}`.slice(0, COLS)))
  }
  b.push(...linea(sep))
  b.push(ESC, 0x21, 0x30) // doble alto/ancho
  b.push(ESC, 0x61, 0x01, ...linea(`COBRAR $${total.toFixed(2)}`), ESC, 0x61, 0x00)
  b.push(ESC, 0x21, 0x00)
  b.push(...linea(sep))
  b.push(...linea("Recibi conforme:"))
  b.push(...linea(""))
  b.push(...linea("_______________________________"))
  b.push(...linea("Pago:"))
  b.push(...linea(""))
  b.push(...linea("_______________________________"))
  for (const l of (doc?.pie ?? [])) b.push(ESC, 0x61, 0x01, ...linea(l), ESC, 0x61, 0x00)
  b.push(LF, LF, LF, LF, GS, 0x56, 0x42, 0x00) // corte
  return b
}
