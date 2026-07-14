import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
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

/** Desglose del abono en tienda (método → monto) para el ticket del repartidor. */
function desglosePagosTienda(ficha: EntregaFicha): { label: string; monto: number }[] {
  const pt = ficha.pagos_tienda
  if (!pt) return []
  const out: { label: string; monto: number }[] = []
  if (pt.efectivo && pt.efectivo > 0) out.push({ label: "Efectivo", monto: pt.efectivo })
  if (pt.transferencia && pt.transferencia > 0) out.push({ label: "Transferencia", monto: pt.transferencia })
  if (pt.tarjeta && pt.tarjeta > 0) out.push({ label: "Tarjeta", monto: pt.tarjeta })
  return out
}

/**
 * Los DOS comprobantes de una entrega a domicilio:
 *  1. Ticket del CLIENTE — detalle de compra + sello según naturaleza:
 *     "PAGO CONTRA ENTREGA" (a cobrar) o "PAGADO — ENVÍO A DOMICILIO" (ya pagada).
 *  2. Hoja del REPARTIDOR — ficha de entrega + artículos con casillas ☐ (sin
 *     precios) + "COBRAR $X" (contra entrega) o "PAGADO ✓ SOLO ENTREGAR" (pagada)
 *     + espacio de firmas.
 *
 * La impresión es MANUAL: el cajero decide cuándo imprimir con los botones
 * (cliente / repartidor / ambos). Nada se imprime al montar. Los formatos
 * (título/encabezado/pie/flags) se leen del ticketConfig → formatos
 * (editables en el módulo de Formatos: entrega_cliente / entrega_repartidor).
 */
export function TicketsEntrega({ venta, ficha, onCerrar }: TicketsEntregaProps) {
  const { state } = usePOS()
  const cfg = state.ticketConfig
  const fmtCliente = cfg?.formatos?.entrega_cliente
  const fmtReparto = cfg?.formatos?.entrega_repartidor
  // El flete ya NO tiene ticket dedicado: ahora es una línea del ticket de venta
  // (cliente). Solo quedan cliente / repartidor / ambos.
  type Cual = "cliente" | "repartidor" | "ambos"
  const [imprimiendo, setImprimiendo] = useState<null | Cual>(null)
  // Mensaje de estado bajo los botones (error de servicio/impresora o aviso de
  // impresión del navegador). Antes los errores se tragaban en silencio y el
  // cajero no sabía por qué "no imprimía".
  const [aviso, setAviso] = useState<{ tipo: "error" | "info"; texto: string } | null>(null)
  // Qué ticket(s) marcar para el diálogo de impresión del navegador (fallback sin
  // impresora térmica). Controla la clase `.ticket--print` que el CSS @media print
  // usa para imprimir SOLO esos y no toda la pantalla.
  const [porImprimir, setPorImprimir] = useState<null | Cual>(null)
  const printCliente = porImprimir === "cliente" || porImprimir === "ambos"
  const printReparto = porImprimir === "repartidor" || porImprimir === "ambos"

  // Envío con pago en tienda (pagada) vs. contra entrega (se cobra todo al recibir).
  const pagada = !!ficha.pagada
  // Total de la venta, abono en tienda y RESTA a cobrar al entregar.
  const totalVenta = ficha.total
  const abonado = Number(ficha.abonado) || 0
  const restaCobrar = ficha.resta != null ? Number(ficha.resta) : (venta.entrega_total ?? ficha.total)
  // `total` legacy usado en varios lugares = lo que se cobra al entregar (la resta).
  const total = restaCobrar
  // ¿Queda algo por cobrar al entregar? (contra entrega siempre; pagada solo si
  // el abono no cubrió el total).
  const hayResta = restaCobrar > 0.005

  // Flete (opcional, separado del total). Solo cuenta si existe y no está cancelado.
  const flete = ficha.flete && !ficha.flete.cancelado ? ficha.flete : null
  const fletePrecio = flete ? Number(flete.precio) || 0 : 0
  // Flete que el repartidor cobra al entregar (marcado "al entregar" y no cobrado).
  const fleteAlEntregar = !!(flete && flete.cobrar_al_entregar && !flete.cobrado)
  const fleteACobrarReparto = fleteAlEntregar ? fletePrecio : 0

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onCerrar])

  async function imprimir(cual: Cual) {
    if (imprimiendo) return
    setImprimiendo(cual)
    setAviso(null)
    try {
      const bytesCliente = () => construirTicketCliente(venta, ficha, cfg, fmtCliente)
      const bytesReparto = () => construirHojaRepartidor(venta, ficha, cfg, fmtReparto)
      if (impresoraElegida()) {
        // Impresora térmica vía servicio local. Si falla (servicio caído, nombre
        // erróneo), el error se muestra al cajero en vez de tragarse.
        if (cual === "cliente" || cual === "ambos") await imprimirBytesLocal(bytesCliente())
        if (cual === "repartidor" || cual === "ambos") await imprimirBytesLocal(bytesReparto())
        setAviso({ tipo: "info", texto: "Enviado a la impresora." })
      } else {
        // Sin impresora térmica configurada (p. ej. desde la PC de administración):
        // se usa el diálogo de impresión del navegador. Marcamos qué ticket(s)
        // imprimir con `data-print` para que el CSS @media print aísle solo esos
        // (y no salga toda la pantalla ni ambos tickets cuando pediste uno).
        setAviso({ tipo: "info", texto: "No hay impresora térmica configurada en esta terminal; se abrió el diálogo del navegador." })
        setPorImprimir(cual)
        // Deja que React pinte el marcador antes de abrir el diálogo del navegador.
        await new Promise((r) => setTimeout(r, 30))
        window.print()
        setPorImprimir(null)
      }
    } catch (e) {
      console.warn("Impresión de tickets de entrega falló:", e)
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo imprimir. Revisa el servicio de impresión." })
    } finally {
      setImprimiendo(null)
    }
  }

  // Se renderiza con createPortal a document.body para que el modal salga SIEMPRE
  // por encima de cualquier panel/drawer (p. ej. el drawer de detalle de venta en
  // Consulta de ventas, con z-index alto). Si se montara en el árbol del drawer,
  // quedaría atrapado en su stacking context y aparecería por detrás.
  return createPortal(
    <div className="ticket-overlay">
      {/* Dos tickets: cliente + repartidor (el flete ya no tiene ticket aparte). */}
      <div className="ticket-preview-box" style={{ maxWidth: 560 }}>
        <p className="ticket-preview-titulo">
          {imprimiendo ? "Imprimiendo…" : "Comprobantes de entrega"}
        </p>

        <div className="ticket-preview-tickets" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {/* Vista del ticket del cliente */}
          <div className={`ticket ${printCliente ? "ticket--print" : ""}`} style={{ flex: "1 1 240px" }}>
            <div className="ticket-header">
              <p className="ticket-negocio">{cfg?.encabezado?.nombre || "FERREMEX"}</p>
              {(fmtCliente?.encabezado ?? []).slice(1).map((l, i) => <p key={i} className="ticket-sub">{l}</p>)}
              <p className="ticket-tipo-doc">
                {!pagada
                  ? (fmtCliente?.titulo || "PAGO CONTRA ENTREGA")
                  : "ENVIO A DOMICILIO"}
              </p>
              {/* Distingue cuál copia es (la del cliente). */}
              <p className="ticket-copia-tag">CLIENTE</p>
            </div>
            <div className="ticket-separador">————————————————</div>
            <p className="ticket-meta">Folio: {venta.folio}</p>
            <p className="ticket-meta">Fecha: {new Date(venta.fecha).toLocaleString("es-MX")}</p>
            {/* En ambos modos el que recibe es la persona relevante (en contra
                entrega es también quien paga al recibir). */}
            <p className="ticket-meta">Recibe: {ficha.recibe.nombre}</p>
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
            {/* Totales. Pagada parcial → total, abono y resta. Pagada total →
                "TOTAL PAGADO". Contra entrega → "TOTAL A PAGAR". */}
            {pagada && hayResta ? (
              <>
                <div className="ticket-fila-resumen"><span>Total</span><span>{fmt(totalVenta)}</span></div>
                <div className="ticket-fila-resumen"><span>Abonado</span><span>{fmt(abonado)}</span></div>
                <div className="ticket-fila-resumen ticket-cambio"><span>RESTA A PAGAR</span><span>{fmt(restaCobrar)}</span></div>
              </>
            ) : (
              <div className="ticket-fila-resumen ticket-cambio">
                <span>{pagada ? "TOTAL PAGADO" : "TOTAL A PAGAR"}</span><span>{fmt(pagada ? totalVenta : total)}</span>
              </div>
            )}
            <div className="ticket-separador">————————————————</div>
            {(pagada
              ? (hayResta ? ["Abono recibido — el resto se paga al recibir"] : ["Material pagado — se entrega a domicilio"])
              : (fmtCliente?.pie ?? ["Pago contra entrega"])
            ).map((l, i) => <p key={i} className="ticket-gracias">{l}</p>)}
          </div>

          {/* Vista de la hoja del repartidor */}
          <div className={`ticket ${printReparto ? "ticket--print" : ""}`} style={{ flex: "1 1 240px" }}>
            <div className="ticket-header">
              <p className="ticket-negocio">{cfg?.encabezado?.nombre || "FERREMEX"}</p>
              <p className="ticket-tipo-doc">{fmtReparto?.titulo || "HOJA DE ENTREGA"}</p>
              {/* Distingue cuál copia es (la del repartidor). */}
              <p className="ticket-copia-tag">REPARTIDOR</p>
            </div>
            <div className="ticket-separador">————————————————</div>
            <p className="ticket-meta">Folio: {venta.folio}</p>
            {fmtReparto?.mostrar_ficha !== false && (
              <>
                <p className="ticket-meta">Dirección: {ficha.direccion}</p>
                {/* El que recibe es también quien paga en contra entrega, así que
                    con una sola línea basta. */}
                <p className="ticket-meta">Recibe: {ficha.recibe.nombre} · {ficha.recibe.telefono}</p>
                {ficha.comentarios && <p className="ticket-meta">Ref: {ficha.comentarios}</p>}
              </>
            )}
            <div className="ticket-separador">————————————————</div>
            <table className="ticket-tabla">
              <tbody>
                {venta.items.map((it, i) => (
                  <tr key={i}>
                    <td className="ticket-col-desc">
                      {fmtReparto?.mostrar_casillas !== false && <span className="ticket-casilla">☐</span>}{it.descripcion}
                    </td>
                    <td className="ticket-col-num">x{it.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ticket-separador">————————————————</div>
            {pagada && !hayResta && fleteACobrarReparto <= 0.005 ? (
              // Pagó todo en tienda y sin flete por cobrar → solo entregar.
              <div className="ticket-fila-resumen ticket-cambio"><span>PAGADO ✓</span><span>SOLO ENTREGAR</span></div>
            ) : (
              <>
                {/* Desglose del abono en tienda (solo pagada parcial). */}
                {pagada && hayResta && (
                  <>
                    <div className="ticket-fila-resumen"><span>Total</span><span>{fmt(totalVenta)}</span></div>
                    {desglosePagosTienda(ficha).map((p, i) => (
                      <div key={i} className="ticket-fila-resumen"><span>Abonó ({p.label})</span><span>{fmt(p.monto)}</span></div>
                    ))}
                  </>
                )}
                {/* Desglose material + flete cuando hay flete por cobrar al entregar. */}
                {fleteACobrarReparto > 0.005 ? (
                  <>
                    {hayResta && <div className="ticket-fila-resumen"><span>Material</span><span>{fmt(restaCobrar)}</span></div>}
                    <div className="ticket-fila-resumen"><span>Flete</span><span>{fmt(fleteACobrarReparto)}</span></div>
                    <div className="ticket-fila-resumen ticket-cambio"><span>COBRAR</span><span>{fmt(restaCobrar + fleteACobrarReparto)}</span></div>
                  </>
                ) : (
                  <div className="ticket-fila-resumen ticket-cambio"><span>COBRAR</span><span>{fmt(restaCobrar)}</span></div>
                )}
                {/* Cambio a llevar: sobre el total a cobrar (material + flete). */}
                {ficha.paga_con != null && ficha.paga_con > 0 && (
                  <>
                    <div className="ticket-fila-resumen"><span>Paga con</span><span>{fmt(ficha.paga_con)}</span></div>
                    <div className="ticket-fila-resumen ticket-cambio">
                      <span>CAMBIO</span><span>{fmt(Math.max(0, ficha.paga_con - restaCobrar - fleteACobrarReparto))}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* El flete ya no tiene ticket dedicado: aparece como línea del ticket de
              venta (cliente). Las entregas viejas con `ficha.flete` conservan el
              dato pero ya no generan comprobante aparte. */}
        </div>

        {/* Aviso de estado de impresión (error o info). No se traga en silencio. */}
        {aviso && (
          <div className={`ticket-preview-aviso ${aviso.tipo === "error" ? "ticket-preview-aviso--error" : "ticket-preview-aviso--info"}`}>
            {aviso.texto}
          </div>
        )}

        <div className="ticket-preview-acciones">
          <button className="btn-secondary" onClick={onCerrar}><X size={16} /> Cerrar</button>
          <button className="btn-secondary" onClick={() => imprimir("cliente")} disabled={!!imprimiendo}>
            <User size={16} /> Imprimir cliente
          </button>
          <button className="btn-secondary" onClick={() => imprimir("repartidor")} disabled={!!imprimiendo}>
            <Truck size={16} /> Imprimir repartidor
          </button>
          <button className="btn-confirmar" onClick={() => imprimir("ambos")} disabled={!!imprimiendo}>
            <Printer size={16} /> Imprimir ambos
          </button>
        </div>
      </div>
    </div>,
    document.body
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
function encabezadoComun(b: number[], negocio: string, extras: string[], titulo: string, copia?: string) {
  b.push(ESC, 0x40, ESC, 0x61, 0x01) // init + center
  b.push(ESC, 0x21, 0x30, ...linea(negocio), ESC, 0x21, 0x00) // doble + negocio
  for (const e of extras) b.push(...linea(e))
  b.push(ESC, 0x45, 0x01, ...linea(titulo), ESC, 0x45, 0x00) // bold título
  // Etiqueta de a quién pertenece la copia (CLIENTE / REPARTIDOR).
  if (copia) b.push(...linea(copia))
  b.push(ESC, 0x61, 0x00) // left
}

/** Ticket del cliente: detalle de compra + total + sello contra entrega. */
export function construirTicketCliente(
  venta: VentaResponse, ficha: EntregaFicha, cfg: TicketConfig | null, doc?: FormatoDoc
): number[] {
  const b: number[] = []
  const sep = "-".repeat(COLS)
  const negocio = cfg?.encabezado?.nombre || "FERREMEX"
  const pagada = !!ficha.pagada
  const totalVenta = ficha.total
  const abonado = Number(ficha.abonado) || 0
  const restaCobrar = ficha.resta != null ? Number(ficha.resta) : (venta.entrega_total ?? ficha.total)
  const hayResta = restaCobrar > 0.005
  const titulo = !pagada
    ? (doc?.titulo || "PAGO CONTRA ENTREGA")
    : "ENVIO A DOMICILIO"
  encabezadoComun(b, negocio, (doc?.encabezado ?? ["Tlaxiaco, Oaxaca"]).slice(1), titulo, "CLIENTE")

  b.push(...linea(sep))
  b.push(...linea(`Folio: ${venta.folio}`))
  b.push(...linea(`Fecha: ${new Date(venta.fecha).toLocaleString("es-MX")}`))
  // El que recibe es también quien paga en contra entrega → una sola línea.
  b.push(...linea(`Recibe: ${ficha.recibe.nombre}`))
  b.push(...linea(sep))
  for (const it of venta.items) {
    b.push(...linea(it.descripcion.slice(0, COLS)))
    b.push(...linea(filaLR(`  ${it.cantidad} x $${it.precio_unitario.toFixed(2)}`, `$${it.subtotal.toFixed(2)}`)))
  }
  b.push(...linea(sep))
  if (pagada && hayResta) {
    // Abono parcial: total, abonado y resta a pagar.
    b.push(...linea(filaLR("Total:", `$${totalVenta.toFixed(2)}`)))
    b.push(...linea(filaLR("Abonado:", `$${abonado.toFixed(2)}`)))
    b.push(ESC, 0x21, 0x20) // doble ancho
    b.push(...linea(filaLR("RESTA:", `$${restaCobrar.toFixed(2)}`)))
    b.push(ESC, 0x21, 0x00)
  } else {
    b.push(ESC, 0x21, 0x20) // doble ancho
    b.push(...linea(filaLR(pagada ? "PAGADO" : "TOTAL", `$${(pagada ? totalVenta : restaCobrar).toFixed(2)}`)))
    b.push(ESC, 0x21, 0x00)
  }
  b.push(...linea(sep))
  b.push(ESC, 0x61, 0x01) // center
  const pie = pagada
    ? (hayResta ? ["Abono recibido - el resto se paga al recibir"] : (doc?.pie && doc.pie.length ? doc.pie : ["Material pagado - se entrega a domicilio"]))
    : (doc?.pie ?? ["El pago se realiza al recibir el material"])
  for (const l of pie) b.push(...linea(l))
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
  const casillas = doc?.mostrar_casillas !== false
  const conFicha = doc?.mostrar_ficha !== false
  const pagada = !!ficha.pagada
  const totalVenta = ficha.total
  const abonado = Number(ficha.abonado) || 0
  const restaCobrar = ficha.resta != null ? Number(ficha.resta) : (venta.entrega_total ?? ficha.total)
  const hayResta = restaCobrar > 0.005
  // Flete que el repartidor cobra al entregar (al entregar, no cobrado, no cancelado).
  const fl = ficha.flete
  const fleteACobrar = (fl && fl.cobrar_al_entregar && !fl.cobrado && !fl.cancelado)
    ? Math.round((Number(fl.precio) || 0) * 100) / 100 : 0
  encabezadoComun(b, negocio, (doc?.encabezado ?? ["Copia del repartidor"]).slice(1), doc?.titulo || "HOJA DE ENTREGA", "REPARTIDOR")

  b.push(...linea(sep))
  b.push(...linea(`Folio: ${venta.folio}`))
  b.push(...linea(`Fecha: ${new Date(venta.fecha).toLocaleString("es-MX")}`))
  if (conFicha) {
    b.push(...linea(sep))
    b.push(ESC, 0x45, 0x01, ...linea("ENTREGA"), ESC, 0x45, 0x00)
    b.push(...linea("Direccion:"))
    for (const l of envolver(ficha.direccion)) b.push(...linea(`  ${l}`))
    // El que recibe es también quien paga en contra entrega → una sola línea.
    b.push(...linea(`Recibe: ${ficha.recibe.nombre}`))
    b.push(...linea(`  Tel: ${ficha.recibe.telefono}`))
    if (ficha.comentarios) {
      b.push(...linea("Referencias:"))
      for (const l of envolver(ficha.comentarios)) b.push(...linea(`  ${l}`))
    }
  }
  b.push(...linea(sep))
  b.push(ESC, 0x45, 0x01, ...linea("ARTICULOS A ENTREGAR"), ESC, 0x45, 0x00)
  for (const it of venta.items) {
    // Casilla grande para palomear: se imprime "[  ]" en doble alto/ancho y el
    // texto del artículo debajo, para que sea fácil marcar en el reparto.
    if (casillas) {
      b.push(ESC, 0x21, 0x30) // doble alto/ancho
      b.push(...linea("[  ]"))
      b.push(ESC, 0x21, 0x00)
      b.push(...linea(`  ${it.cantidad} x ${it.descripcion}`.slice(0, COLS)))
    } else {
      b.push(...linea(`${it.cantidad} x ${it.descripcion}`.slice(0, COLS)))
    }
  }
  b.push(...linea(sep))
  if (pagada && !hayResta && fleteACobrar <= 0.005) {
    // Pagó todo en tienda y sin flete por cobrar → solo entregar.
    b.push(ESC, 0x21, 0x30) // doble alto/ancho
    b.push(ESC, 0x61, 0x01, ...linea("PAGADO"), ...linea("SOLO ENTREGAR"), ESC, 0x61, 0x00)
    b.push(ESC, 0x21, 0x00)
  } else {
    // Desglose del abono en tienda (solo pagada parcial).
    if (pagada && hayResta) {
      b.push(...linea(filaLR("Total:", `$${totalVenta.toFixed(2)}`)))
      for (const p of desglosePagosTienda(ficha)) {
        b.push(...linea(filaLR(`Abono ${p.label}:`, `$${p.monto.toFixed(2)}`)))
      }
      if (desglosePagosTienda(ficha).length === 0 && abonado > 0) {
        b.push(...linea(filaLR("Abonado:", `$${abonado.toFixed(2)}`)))
      }
    }
    // Desglose material + flete cuando hay flete por cobrar al entregar.
    if (fleteACobrar > 0.005) {
      if (hayResta) b.push(...linea(filaLR("Material:", `$${restaCobrar.toFixed(2)}`)))
      b.push(...linea(filaLR("Flete:", `$${fleteACobrar.toFixed(2)}`)))
    }
    // COBRAR = resta + flete (grande).
    const cobrarTotal = Math.round((restaCobrar + fleteACobrar) * 100) / 100
    b.push(ESC, 0x21, 0x30) // doble alto/ancho
    b.push(ESC, 0x61, 0x01, ...linea(`COBRAR $${cobrarTotal.toFixed(2)}`), ESC, 0x61, 0x00)
    b.push(ESC, 0x21, 0x00)
    // Cambio a llevar (si el cajero capturó con cuánto paga).
    if (ficha.paga_con != null && ficha.paga_con > 0) {
      const cambio = Math.max(0, ficha.paga_con - cobrarTotal)
      b.push(...linea(filaLR("Paga con:", `$${ficha.paga_con.toFixed(2)}`)))
      b.push(ESC, 0x21, 0x10) // doble alto
      b.push(...linea(filaLR("CAMBIO:", `$${cambio.toFixed(2)}`)))
      b.push(ESC, 0x21, 0x00)
    }
  }
  b.push(...linea(sep))
  for (const l of (doc?.pie ?? [])) b.push(ESC, 0x61, 0x01, ...linea(l), ESC, 0x61, 0x00)
  b.push(LF, LF, LF, LF, GS, 0x56, 0x42, 0x00) // corte
  return b
}

// El comprobante dedicado de flete (construirTicketFlete) se eliminó: el flete
// ahora es una línea del ticket de venta (cliente), no un ticket aparte.
