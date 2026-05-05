import { useReducer, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import { ConectorImpresora } from "../components/ConectorImpresora"
import { imprimirTicketESCPOS } from "../lib/serial"
import type { TicketPrintData } from "../lib/serial"

/* ── Helpers ────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  "$" +
  (Number.isFinite(n) ? n : 0).toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const uid = () => Math.random().toString(36).slice(2, 9)

interface PkgItem { id: string; name: string; qty: number }
interface LineItem {
  id: string
  description: string
  unitPrice: number
  qty: number
  discount: number
  pkgOpen: boolean
  pkgItems: PkgItem[]
}

const newLine = (overrides: Partial<LineItem> = {}): LineItem => ({
  id: uid(),
  description: "",
  unitPrice: 0,
  qty: 1,
  discount: 0,
  pkgOpen: false,
  pkgItems: [],
  ...overrides,
})

const newPkgItem = (): PkgItem => ({ id: uid(), name: "", qty: 1 })

/* ── State ──────────────────────────────────────────────────────── */
interface Company {
  logo: string | null
  logoSize: number // px ancho en el ticket impreso (térmica B/N)
  name: string
  rfc: string
  address: string
  phone: string
  email: string
}
interface GlobalDiscount { type: "%" | "$"; value: number }
interface CreditNote { folio: string }

// Datos de PREVIEW — vienen de otros paneles, no se editan aquí
interface PreviewData {
  customer: { name: string; rfc: string }
  payment: { method: "efectivo" | "tarjeta" | "transferencia" | "credito"; received: number; creditDays: number }
  loyalty: { redeem: number; rate: number }
  creditNoteAmount: number
}

interface State {
  company: Company
  lines: LineItem[]
  globalDiscount: GlobalDiscount
  creditNote: CreditNote
  preview: PreviewData
}

type Action =
  | { type: "SET_COMPANY"; patch: Partial<Company> }
  | { type: "ADD_LINE" }
  | { type: "REMOVE_LINE"; id: string }
  | { type: "UPDATE_LINE"; id: string; patch: Partial<LineItem> }
  | { type: "TOGGLE_PKG"; id: string }
  | { type: "ADD_PKG_ITEM"; id: string }
  | { type: "REMOVE_PKG_ITEM"; lineId: string; itemId: string }
  | { type: "UPDATE_PKG_ITEM"; lineId: string; itemId: string; patch: Partial<PkgItem> }
  | { type: "SET_GLOBAL_DISCOUNT"; patch: Partial<GlobalDiscount> }
  | { type: "SET_CREDIT_NOTE"; patch: Partial<CreditNote> }
  | { type: "RESET_LINES" }

const initialState: State = {
  company: {
    logo: null,
    logoSize: 80,
    name: "FERREMEX",
    rfc: "FER060101AB1",
    address: "Av. Independencia 145, Tlaxiaco, Oaxaca",
    phone: "(953) 555-0000",
    email: "ventas@ferremex.com",
  },
  lines: [newLine({ description: "Taladro DeWalt DWD024", unitPrice: 1200, qty: 2, discount: 10 })],
  globalDiscount: { type: "%", value: 5 },
  creditNote: { folio: "" },
  // Datos de ejemplo — en producción vendrán del panel de Ventas
  preview: {
    customer: { name: "Juan Pérez", rfc: "PEPJ800101AB1" },
    payment: { method: "efectivo", received: 2300, creditDays: 30 },
    loyalty: { redeem: 300, rate: 0.1 },
    creditNoteAmount: 150,
  },
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_COMPANY":
      return { ...state, company: { ...state.company, ...action.patch } }
    case "ADD_LINE":
      return { ...state, lines: [...state.lines, newLine()] }
    case "REMOVE_LINE":
      return state.lines.length === 1 ? state : { ...state, lines: state.lines.filter((l) => l.id !== action.id) }
    case "UPDATE_LINE":
      return { ...state, lines: state.lines.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) }
    case "TOGGLE_PKG":
      return { ...state, lines: state.lines.map((l) => (l.id === action.id ? { ...l, pkgOpen: !l.pkgOpen } : l)) }
    case "ADD_PKG_ITEM":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.id === action.id && l.pkgItems.length < 6 ? { ...l, pkgItems: [...l.pkgItems, newPkgItem()] } : l
        ),
      }
    case "REMOVE_PKG_ITEM":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.id === action.lineId ? { ...l, pkgItems: l.pkgItems.filter((p) => p.id !== action.itemId) } : l
        ),
      }
    case "UPDATE_PKG_ITEM":
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.id === action.lineId
            ? { ...l, pkgItems: l.pkgItems.map((p) => (p.id === action.itemId ? { ...p, ...action.patch } : p)) }
            : l
        ),
      }
    case "SET_GLOBAL_DISCOUNT":
      return { ...state, globalDiscount: { ...state.globalDiscount, ...action.patch } }
    case "SET_CREDIT_NOTE":
      return { ...state, creditNote: { ...state.creditNote, ...action.patch } }
    case "RESET_LINES":
      return {
        ...state,
        lines: [newLine()],
        globalDiscount: { type: "%", value: 0 },
        creditNote: { folio: "" },
      }
    default:
      return state
  }
}

/* ── Calculations ───────────────────────────────────────────────── */
interface ComputedLine extends LineItem { gross: number; savings: number; total: number }
interface Totals {
  lines: ComputedLine[]
  subtotal: number
  globalDiscAmt: number
  afterGlobal: number
  iva: number
  pointsDisc: number
  cnAmt: number
  total: number
  change: number
}

function computeTotals(state: State): Totals {
  const lines: ComputedLine[] = state.lines.map((l) => {
    const gross = l.unitPrice * l.qty
    const savings = gross * (l.discount / 100)
    const total = gross - savings
    return { ...l, gross, savings, total }
  })
  const subtotal = lines.reduce((a, l) => a + l.total, 0)

  const gd = state.globalDiscount
  const globalDiscAmt = gd.type === "%" ? subtotal * (gd.value / 100) : Math.min(gd.value, subtotal)
  const afterGlobal = Math.max(0, subtotal - globalDiscAmt)

  const iva = afterGlobal * 0.16
  const beforeAdj = afterGlobal + iva

  // Datos de PREVIEW (vienen de otros paneles)
  const pv = state.preview
  const pointsDisc = Math.min((pv.loyalty.redeem || 0) * (pv.loyalty.rate || 0), beforeAdj)
  const afterPoints = Math.max(0, beforeAdj - pointsDisc)
  const cnAmt = Math.min(pv.creditNoteAmount || 0, afterPoints)
  const total = Math.max(0, afterPoints - cnAmt)

  const change = pv.payment.method === "efectivo"
    ? Math.max(0, (pv.payment.received || 0) - total)
    : 0

  return { lines, subtotal, globalDiscAmt, afterGlobal, iva, pointsDisc, cnAmt, total, change }
}

/* ── Root component ─────────────────────────────────────────────── */
export function GeneradorTickets() {
  const { state: posState } = usePOS()
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(reducer, initialState)
  const totals = computeTotals(state)
  const [printError, setPrintError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  async function handleImprimir() {
    setPrintError(null)
    setPrinting(true)
    const gd = state.globalDiscount
    const pv = state.preview
    const printData: TicketPrintData = {
      company: state.company,
      titulo: "COMPROBANTE DE VENTA",
      folio: "POS-20260502-DEMO",
      fecha: new Date().toLocaleString("es-MX"),
      cajero: posState.cajero?.nombre ?? "Admin",
      cliente: pv.customer.name || pv.customer.rfc ? pv.customer : null,
      lines: totals.lines.map((l) => ({
        description: l.description,
        qty: l.qty,
        unitPrice: l.unitPrice,
        total: l.total,
        savings: l.savings,
        discount: l.discount,
        pkgItems: l.pkgOpen ? l.pkgItems : [],
      })),
      subtotal: totals.subtotal,
      globalDiscAmt: totals.globalDiscAmt,
      globalDiscLabel: gd.type === "%" ? gd.value + "%" : "$" + gd.value,
      iva: totals.iva,
      pointsDisc: totals.pointsDisc,
      pointsRedeemed: pv.loyalty.redeem,
      cnAmt: totals.cnAmt,
      cnFolio: state.creditNote.folio,
      total: totals.total,
      payment: {
        method: pv.payment.method,
        label: {
          efectivo: "EFECTIVO",
          tarjeta: "TARJETA",
          transferencia: "TRANSFERENCIA",
          credito: "CRÉDITO " + pv.payment.creditDays + "d",
        }[pv.payment.method] ?? "EFECTIVO",
        received: pv.payment.received,
        change: totals.change,
      },
      footer: ["¡Gracias por su compra!", "Conserve su ticket"],
    }
    try {
      await imprimirTicketESCPOS(printData)
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Error al imprimir")
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="tg-shell">
      {/* Topbar */}
      <div className="tg-topbar">
        <div className="tg-topbar-brand">
          <span className="tg-brand-mark">FERREMEX</span>
          <span className="tg-brand-sep">—</span>
          <span className="tg-brand-section">Generador de tickets</span>
        </div>
        <div className="tg-topbar-right">
          <ConectorImpresora />
          <span className="tg-user-chip">
            <span className="tg-avatar">{(posState.cajero?.nombre?.[0] ?? "A").toUpperCase()}</span>
            {posState.cajero?.nombre ?? "Admin"}
          </span>
          <button className="tg-btn-back" onClick={() => navigate("/admin/tickets")}>← Formato</button>
        </div>
      </div>

      {/* Body */}
      <div className="tg-body">
        <FormPanel state={state} dispatch={dispatch} totals={totals}
          onImprimir={handleImprimir} printing={printing} printError={printError} />
        <TicketPreview state={state} totals={totals} />
      </div>
    </div>
  )
}

/* ── Form panel ─────────────────────────────────────────────────── */
function FormPanel({
  state, dispatch, totals, onImprimir, printing, printError,
}: {
  state: State
  dispatch: React.Dispatch<Action>
  totals: Totals
  onImprimir: () => void
  printing: boolean
  printError: string | null
}) {
  const [activeTab, setActiveTab] = useState<"ticket" | "perifericos">("ticket")

  const tabSt = (active: boolean): React.CSSProperties => ({
    padding: "8px 16px",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
    borderBottom: active ? "2px solid #f96302" : "2px solid transparent",
    marginBottom: -2,
    color: active ? "#f96302" : "var(--at-text, #1a1a1a)",
    fontSize: 13,
    transition: "color 0.15s",
  })

  return (
    <div className="tg-form">
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "2px solid var(--at-border, #e5e7eb)", flexShrink: 0 }}>
        <button style={tabSt(activeTab === "ticket")} onClick={() => setActiveTab("ticket")}>🧾 Ticket</button>
        <button style={tabSt(activeTab === "perifericos")} onClick={() => setActiveTab("perifericos")}>⚙️ Periféricos</button>
      </div>

      {activeTab === "ticket" ? (
        <>
          <SectionCompany state={state} dispatch={dispatch} />
          <SectionLines state={state} dispatch={dispatch} totals={totals} />
          <SectionTotals state={state} dispatch={dispatch} totals={totals} />
          <SectionCreditNote state={state} dispatch={dispatch} />
          <FormActions dispatch={dispatch} onImprimir={onImprimir} printing={printing} printError={printError} />
        </>
      ) : (
        <PerifericosPanel />
      )}
    </div>
  )
}

/* ── Sección: Empresa ───────────────────────────────────────────── */
function SectionCompany({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const c = state.company

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => dispatch({ type: "SET_COMPANY", patch: { logo: r.result as string } })
    r.readAsDataURL(f)
  }

  return (
    <div className="tg-section">
      <div className="tg-section-title"><span className="tg-num">1</span>Datos del negocio</div>

      {/* Logo upload */}
      <div className="tg-logo-row" style={{ marginBottom: 12 }}>
        <div className="tg-logo-preview">
          {c.logo
            ? <img src={c.logo} alt="logo" style={{ filter: "grayscale(1) contrast(1.1)" }} />
            : <div className="tg-logo-empty"><span>🏪</span>Sin logo</div>}
        </div>
        <div className="tg-logo-actions">
          <p className="tg-logo-help">
            ⚠ Impresión térmica B/N. El logo se imprime en escala de grises; usa un archivo de alto contraste
            (PNG con fondo transparente recomendado).
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tg-btn-upload" onClick={() => fileRef.current?.click()}>📤 Subir logo</button>
            {c.logo && (
              <button className="tg-btn-link" onClick={() => dispatch({ type: "SET_COMPANY", patch: { logo: null } })}>Quitar</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        </div>
      </div>

      {/* Logo size slider (only when logo is set) */}
      {c.logo && (
        <div className="tg-field">
          <label className="tg-label">
            Tamaño del logo en el ticket: <strong>{c.logoSize}px</strong> de ancho
          </label>
          <input
            type="range"
            min="40"
            max="180"
            step="5"
            value={c.logoSize}
            style={{ width: "100%" }}
            onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { logoSize: parseInt(e.target.value) } })}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--at-text-soft)" }}>
            <span>40px</span><span>180px (máx recomendado para 80mm)</span>
          </div>
        </div>
      )}

      <div className="tg-field">
        <label className="tg-label">Nombre del negocio</label>
        <input className="tg-input" value={c.name} onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { name: e.target.value } })} />
      </div>
      <div className="tg-grid-2">
        <div className="tg-field">
          <label className="tg-label">RFC</label>
          <input className="tg-input" value={c.rfc} onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { rfc: e.target.value } })} />
        </div>
        <div className="tg-field">
          <label className="tg-label">Teléfono</label>
          <input className="tg-input" value={c.phone} onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { phone: e.target.value } })} />
        </div>
      </div>
      <div className="tg-field">
        <label className="tg-label">Dirección</label>
        <input className="tg-input" value={c.address} onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { address: e.target.value } })} />
      </div>
      <div className="tg-field">
        <label className="tg-label">Email</label>
        <input className="tg-input" value={c.email} onChange={(e) => dispatch({ type: "SET_COMPANY", patch: { email: e.target.value } })} />
      </div>
    </div>
  )
}

/* ── Sección: Líneas ────────────────────────────────────────────── */
function SectionLines({ state, dispatch, totals }: { state: State; dispatch: React.Dispatch<Action>; totals: Totals }) {
  return (
    <div className="tg-section">
      <div className="tg-section-title"><span className="tg-num">2</span>Productos</div>
      {totals.lines.map((line) => (
        <LineRow key={line.id} line={line} dispatch={dispatch} />
      ))}
      <button className="tg-btn-add-row" onClick={() => dispatch({ type: "ADD_LINE" })}>+ Agregar producto</button>
    </div>
  )
}

function LineRow({ line, dispatch }: { line: ComputedLine; dispatch: React.Dispatch<Action> }) {
  const upd = (patch: Partial<LineItem>) => dispatch({ type: "UPDATE_LINE", id: line.id, patch })
  return (
    <>
      <div className="tg-line-row">
        <input className="tg-input" placeholder="Descripción" value={line.description}
          onChange={(e) => upd({ description: e.target.value })} />
        <input className="tg-input" type="number" min="0" step="0.01" placeholder="Precio" value={line.unitPrice}
          onChange={(e) => upd({ unitPrice: parseFloat(e.target.value) || 0 })} />
        <input className="tg-input" type="number" min="1" step="1" value={line.qty}
          onChange={(e) => upd({ qty: parseInt(e.target.value) || 1 })} />
        <input className="tg-input" type="number" min="0" max="100" step="1" value={line.discount}
          onChange={(e) => upd({ discount: parseFloat(e.target.value) || 0 })} />
        <div className="tg-line-total">{fmt(line.total)}</div>
        <button
          className={`tg-pkg-btn${line.pkgOpen ? " active" : ""}`}
          onClick={() => dispatch({ type: "TOGGLE_PKG", id: line.id })}
        >PKG</button>
        <button className="tg-row-remove" onClick={() => dispatch({ type: "REMOVE_LINE", id: line.id })}>✕</button>
        {line.savings > 0 && <div className="tg-line-savings">Ahorro: -{fmt(line.savings)}</div>}
      </div>
      {line.pkgOpen && (
        <div className="tg-pkg-section">
          <div className="tg-pkg-title">Contenido del paquete (informativo)</div>
          {line.pkgItems.map((p) => (
            <div key={p.id} className="tg-pkg-item-row">
              <input className="tg-input" placeholder="Artículo incluido" value={p.name}
                onChange={(e) => dispatch({ type: "UPDATE_PKG_ITEM", lineId: line.id, itemId: p.id, patch: { name: e.target.value } })} />
              <input className="tg-input" type="number" min="1" value={p.qty}
                onChange={(e) => dispatch({ type: "UPDATE_PKG_ITEM", lineId: line.id, itemId: p.id, patch: { qty: parseInt(e.target.value) || 1 } })} />
              <button className="tg-row-remove"
                onClick={() => dispatch({ type: "REMOVE_PKG_ITEM", lineId: line.id, itemId: p.id })}>✕</button>
            </div>
          ))}
          {line.pkgItems.length < 6 && (
            <button className="tg-btn-add-row" style={{ marginTop: 4 }}
              onClick={() => dispatch({ type: "ADD_PKG_ITEM", id: line.id })}>
              + Agregar contenido ({line.pkgItems.length}/6)
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* ── Sección: Impuestos y descuentos ────────────────────────────── */
function SectionTotals({ state, dispatch, totals }: { state: State; dispatch: React.Dispatch<Action>; totals: Totals }) {
  const gd = state.globalDiscount
  return (
    <div className="tg-section">
      <div className="tg-section-title"><span className="tg-num">3</span>Descuentos e impuestos</div>

      <div className="tg-totals-block" style={{ marginBottom: 10 }}>
        {/* Descuento global */}
        <div className="tg-tax-row">
          <div className="tg-tax-label">
            Descuento global
            <div className="tg-seg">
              <button className={gd.type === "%" ? "active" : ""}
                onClick={() => dispatch({ type: "SET_GLOBAL_DISCOUNT", patch: { type: "%" } })}>%</button>
              <button className={gd.type === "$" ? "active" : ""}
                onClick={() => dispatch({ type: "SET_GLOBAL_DISCOUNT", patch: { type: "$" } })}>$</button>
            </div>
          </div>
          <input className="tg-input tg-rate-input" type="number" min="0" step="0.01" value={gd.value}
            onChange={(e) => dispatch({ type: "SET_GLOBAL_DISCOUNT", patch: { value: parseFloat(e.target.value) || 0 } })} />
        </div>

        {/* IVA — siempre activo */}
        <div className="tg-tax-row">
          <div className="tg-tax-label">
            IVA 16% <span className="tg-tax-note">(siempre activo)</span>
          </div>
          <div className="tg-rate-input" style={{ color: "var(--at-text-soft)" }}>{fmt(totals.iva)}</div>
        </div>
      </div>

      {/* Resumen */}
      <div className="tg-totals-block">
        <div className="tg-tot-row"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
        {totals.globalDiscAmt > 0 && (
          <div className="tg-tot-row tg-tot-discount">
            <span>Desc. global {gd.type === "%" ? gd.value + "%" : ""}</span>
            <span>-{fmt(totals.globalDiscAmt)}</span>
          </div>
        )}
        <div className="tg-tot-row"><span>IVA 16%</span><span>{fmt(totals.iva)}</span></div>
        {totals.pointsDisc > 0 && (
          <div className="tg-tot-row tg-tot-discount">
            <span>Desc. puntos (panel ventas)</span>
            <span>-{fmt(totals.pointsDisc)}</span>
          </div>
        )}
        {totals.cnAmt > 0 && (
          <div className="tg-tot-row tg-tot-discount">
            <span>Nota crédito (panel ventas)</span>
            <span>-{fmt(totals.cnAmt)}</span>
          </div>
        )}
        <div className="tg-tot-row tg-tot-total"><span>TOTAL</span><span>{fmt(totals.total)}</span></div>
      </div>
    </div>
  )
}

/* ── Sección: Nota de crédito (solo folio) ──────────────────────── */
function SectionCreditNote({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const cn = state.creditNote
  return (
    <div className="tg-section">
      <div className="tg-section-title"><span className="tg-num">4</span>Folio de nota de crédito</div>
      <p style={{ fontSize: 12, color: "var(--at-text-soft)", marginBottom: 8, lineHeight: 1.4 }}>
        El monto y registro de la nota de crédito se gestionan desde el panel de ventas.
        Aquí solo asignas un folio manual si es necesario.
      </p>
      <div className="tg-field">
        <label className="tg-label">Folio (opcional)</label>
        <input className="tg-input" placeholder="CN-001" value={cn.folio}
          onChange={(e) => dispatch({ type: "SET_CREDIT_NOTE", patch: { folio: e.target.value } })} />
      </div>
    </div>
  )
}

/* ── Acciones ───────────────────────────────────────────────────── */
function FormActions({
  dispatch, onImprimir, printing, printError,
}: {
  dispatch: React.Dispatch<Action>
  onImprimir: () => void
  printing: boolean
  printError: string | null
}) {
  return (
    <div className="tg-actions">
      <button className="tg-btn" onClick={() => dispatch({ type: "RESET_LINES" })}>🔄 Nuevo ticket</button>
      <button className="tg-btn tg-btn-primary" onClick={onImprimir} disabled={printing}>
        {printing ? "Enviando…" : "🖨️ Imprimir ticket"}
      </button>
      {printError && (
        <p style={{ gridColumn: "1/-1", margin: 0, fontSize: 12, color: "var(--red, #dc2626)" }}>
          {printError}
        </p>
      )}
    </div>
  )
}

/* ── Preview (derecha) ──────────────────────────────────────────── */
function TicketPreview({ state, totals }: { state: State; totals: Totals }) {
  const c = state.company
  const pv = state.preview
  const cust = pv.customer
  const payLabel: Record<string, string> = {
    efectivo: "EFECTIVO",
    tarjeta: "TARJETA",
    transferencia: "TRANSFERENCIA",
    credito: `CRÉDITO ${pv.payment.creditDays}d`,
  }

  return (
    <div className="tg-preview">
      <div className="tg-ticket">
        {/* Logo */}
        <div className="tg-tk-logo">
          {c.logo
            ? <img
                src={c.logo}
                alt="logo"
                style={{ width: c.logoSize + "px", maxHeight: 80, objectFit: "contain", filter: "grayscale(1) contrast(1.15)" }}
              />
            : <div className="tg-tk-placeholder">[ LOGO ]</div>}
        </div>

        <div className="tg-tk-business">{c.name || "—"}</div>
        {c.rfc && <div className="tg-tk-center tg-tk-meta">RFC: {c.rfc}</div>}
        {c.address && <div className="tg-tk-center tg-tk-meta">{c.address}</div>}
        <div className="tg-tk-center tg-tk-meta">
          {[c.phone, c.email].filter(Boolean).join(" · ")}
        </div>

        <hr className="tg-tk-sep" />
        <div className="tg-tk-center tg-tk-bold">COMPROBANTE DE VENTA</div>
        <hr className="tg-tk-sep-solid" />

        <div className="tg-tk-meta">Folio: POS-20260502-DEMO</div>
        <div className="tg-tk-meta">Fecha: 02/05/2026 10:32 a.m.</div>
        <div className="tg-tk-meta">Cajero: André</div>
        {(cust.name || cust.rfc) && (
          <>
            <div className="tg-tk-meta" style={{ marginTop: 4 }}>Cliente: {cust.name || "—"}</div>
            {cust.rfc && <div className="tg-tk-meta">RFC: {cust.rfc}</div>}
          </>
        )}

        <hr className="tg-tk-sep" />

        <table className="tg-tk-table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="num">Cant</th>
              <th className="num">P.U.</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description || "—"}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{fmt(l.unitPrice)}</td>
                <td className="num">{fmt(l.total)}</td>
              </tr>
            ))}
            {totals.lines.map((l) => l.discount > 0 ? (
              <tr key={l.id + "-disc"}>
                <td colSpan={4} className="tg-tk-pkg" style={{ fontStyle: "italic" }}>
                  Desc. {l.discount}%: -{fmt(l.savings)}
                </td>
              </tr>
            ) : null)}
            {totals.lines.map((l) => (l.pkgOpen && l.pkgItems.length > 0) ? (
              <tr key={l.id + "-pkg"}>
                <td colSpan={4} className="tg-tk-pkg">
                  <div style={{ fontWeight: 700, marginTop: 2 }}>Incluye:</div>
                  {l.pkgItems.map((p) => (
                    <div key={p.id}>· {p.name || "—"} ×{p.qty}</div>
                  ))}
                </td>
              </tr>
            ) : null)}
          </tbody>
        </table>

        <div className="tg-tk-totals">
          <div className="tg-tk-row"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
          {totals.globalDiscAmt > 0 && (
            <div className="tg-tk-row tg-tk-discount"><span>Desc. global</span><span>-{fmt(totals.globalDiscAmt)}</span></div>
          )}
          <div className="tg-tk-row"><span>IVA 16%</span><span>{fmt(totals.iva)}</span></div>
          {totals.pointsDisc > 0 && (
            <div className="tg-tk-row tg-tk-discount">
              <span>Desc. puntos ({pv.loyalty.redeem} pts)</span>
              <span>-{fmt(totals.pointsDisc)}</span>
            </div>
          )}
          {totals.cnAmt > 0 && (
            <div className="tg-tk-row tg-tk-discount">
              <span>N. crédito {state.creditNote.folio && "#" + state.creditNote.folio}</span>
              <span>-{fmt(totals.cnAmt)}</span>
            </div>
          )}
          <div className="tg-tk-row tg-tk-total"><span>TOTAL</span><span>{fmt(totals.total)}</span></div>
        </div>

        <div className="tg-tk-center">
          <span className="tg-tk-pay-badge">{payLabel[pv.payment.method] ?? "EFECTIVO"}</span>
        </div>

        {pv.payment.method === "efectivo" && pv.payment.received > 0 && (
          <>
            <div className="tg-tk-row"><span>Recibido</span><span>{fmt(pv.payment.received)}</span></div>
            <div className="tg-tk-row"><span>Cambio</span><span>{fmt(totals.change)}</span></div>
          </>
        )}

        <hr className="tg-tk-sep" />
        <div className="tg-tk-footer">
          <div>¡Gracias por su compra!</div>
          <div>Conserve su ticket</div>
        </div>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "var(--at-text-soft)", textAlign: "center", maxWidth: 320 }}>
        Cliente · Pago · Puntos · Monto de nota de crédito → vienen del panel de Ventas.
        Esta vista los muestra a modo de ejemplo.
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   ─── PERIFÉRICOS TAB ─────────────────────────────────────────────
   Self-contained — removing this block leaves the rest 100% intact
   ═══════════════════════════════════════════════════════════════════ */

// ─── PERIPHERAL STATE ───
interface PeriphPrinter {
  connected: boolean; tipo: string; puerto: string
  copias: number; imprimirLogo: boolean; corteAuto: boolean
}
interface PeriphFingerprint {
  connected: boolean; modelo: string; sensibilidad: number
  usos: { descuentos: boolean; apertura: boolean; gerencial: boolean }
  intentosMax: number
}
interface PeriphBarcode {
  connected: boolean; tipoConexion: string; puertoId: string
  symbologias: { ean13: boolean; code128: boolean; qr: boolean; datamatrix: boolean; pdf417: boolean }
  sonido: boolean; prefijo: string; scanInput: string; lastScan: string
}
interface PeriphState { printer: PeriphPrinter; fingerprint: PeriphFingerprint; barcode: PeriphBarcode }

const defaultPeriph: PeriphState = {
  printer: { connected: false, tipo: "Térmica 80mm", puerto: "COM3", copias: 1, imprimirLogo: true, corteAuto: true },
  fingerprint: {
    connected: false, modelo: "ZKTeco ZK4500", sensibilidad: 3,
    usos: { descuentos: true, apertura: true, gerencial: false }, intentosMax: 3,
  },
  barcode: {
    connected: false, tipoConexion: "USB HID", puertoId: "USB-HID-01",
    symbologias: { ean13: true, code128: true, qr: true, datamatrix: false, pdf417: false },
    sonido: true, prefijo: "", scanInput: "", lastScan: "",
  },
}

function PerifericosPanel() {
  const [periph, setPeriph] = useState<PeriphState>(defaultPeriph)
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string }>>([])
  const [fpScanning, setFpScanning] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  function addToast(msg: string) {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }

  const setPrinter = (patch: Partial<PeriphPrinter>) =>
    setPeriph((prev) => ({ ...prev, printer: { ...prev.printer, ...patch } }))
  const setFp = (patch: Partial<PeriphFingerprint>) =>
    setPeriph((prev) => ({ ...prev, fingerprint: { ...prev.fingerprint, ...patch } }))
  const setBc = (patch: Partial<PeriphBarcode>) =>
    setPeriph((prev) => ({ ...prev, barcode: { ...prev.barcode, ...patch } }))

  function handlePrinterTest() { addToast("✓ Prueba enviada a impresora") }

  function handleFpTest() {
    setFpScanning(true)
    setTimeout(() => { setFpScanning(false); addToast("✓ Huella capturada correctamente") }, 2000)
  }

  function handleScan() {
    const code = periph.barcode.scanInput.trim()
    if (code) setBc({ lastScan: code, scanInput: "" })
  }

  function handleReset() {
    setPeriph(defaultPeriph)
    setShowResetConfirm(false)
    addToast("✓ Valores restaurados")
  }

  const p = periph.printer
  const fp = periph.fingerprint
  const bc = periph.barcode

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Toasts */}
      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: "#16a34a", color: "#fff", padding: "8px 14px", borderRadius: 6,
            fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>{t.msg}</div>
        ))}
      </div>

      {/* ── Impresora ── */}
      <PeriphSection icon="🖨️" title="Impresora de Tickets"
        connected={p.connected} statusOn="Conectada" statusOff="Sin conexión"
        onToggle={(v) => setPrinter({ connected: v })}>
        <PeriphField label="Tipo">
          <select className="tg-input" value={p.tipo} onChange={(e) => setPrinter({ tipo: e.target.value })}>
            {["Térmica 58mm", "Térmica 80mm", "Laser A4"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label="Nombre del puerto">
          <input className="tg-input" value={p.puerto} onChange={(e) => setPrinter({ puerto: e.target.value })} />
        </PeriphField>
        <PeriphField label="Copias por ticket">
          <input className="tg-input" type="number" min={1} max={5} value={p.copias}
            onChange={(e) => setPrinter({ copias: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })} />
        </PeriphField>
        <SwitchRow label="Imprimir logo" checked={p.imprimirLogo} onChange={(v) => setPrinter({ imprimirLogo: v })} />
        <SwitchRow label="Corte automático" checked={p.corteAuto} onChange={(v) => setPrinter({ corteAuto: v })} />
        <button className="tg-btn" style={{ marginTop: 10 }} onClick={handlePrinterTest}>
          🖨️ Prueba de impresión
        </button>
      </PeriphSection>

      {/* ── Huellas ── */}
      <PeriphSection icon="👆" title="Lector de Huellas Digitales"
        connected={fp.connected} statusOn="Listo" statusOff="No detectado"
        onToggle={(v) => setFp({ connected: v })}>
        <PeriphField label="Modelo">
          <select className="tg-input" value={fp.modelo} onChange={(e) => setFp({ modelo: e.target.value })}>
            {["ZKTeco ZK4500", "DigitalPersona 4500", "Futronic FS80"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label={`Sensibilidad: ${fp.sensibilidad}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--at-text-soft)" }}>Baja</span>
            <input type="range" min={1} max={5} value={fp.sensibilidad} style={{ flex: 1 }}
              onChange={(e) => setFp({ sensibilidad: parseInt(e.target.value) })} />
            <span style={{ fontSize: 11, color: "var(--at-text-soft)" }}>Alta</span>
          </div>
        </PeriphField>
        <div className="tg-field">
          <label className="tg-label">Usar para</label>
          {([["descuentos", "Autorizar descuentos"], ["apertura", "Apertura de caja"], ["gerencial", "Acceso gerencial"]] as [keyof typeof fp.usos, string][]).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={fp.usos[key]}
                onChange={(e) => setFp({ usos: { ...fp.usos, [key]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
        <PeriphField label="Intentos máximos">
          <input className="tg-input" type="number" min={1} max={5} value={fp.intentosMax}
            onChange={(e) => setFp({ intentosMax: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })} />
        </PeriphField>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 10 }}>
          {fpScanning && (
            <div style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 0 8px #f96302) drop-shadow(0 0 18px #f96302)" }}>
              👆
            </div>
          )}
          <button className="tg-btn" onClick={handleFpTest} disabled={fpScanning}>
            {fpScanning ? "⏳ Escaneando…" : "👆 Capturar huella de prueba"}
          </button>
        </div>
      </PeriphSection>

      {/* ── Código de barras ── */}
      <PeriphSection icon="📷" title="Lector de Código de Barras"
        connected={bc.connected} statusOn="Activo" statusOff="Desconectado"
        onToggle={(v) => setBc({ connected: v })}>
        <PeriphField label="Tipo de conexión">
          <select className="tg-input" value={bc.tipoConexion} onChange={(e) => setBc({ tipoConexion: e.target.value })}>
            {["USB HID", "Serial COM", "Bluetooth"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label="Puerto / ID">
          <input className="tg-input" value={bc.puertoId} onChange={(e) => setBc({ puertoId: e.target.value })} />
        </PeriphField>
        <div className="tg-field">
          <label className="tg-label">Symbologías</label>
          {([["ean13", "EAN-13"], ["code128", "Code 128"], ["qr", "QR Code"], ["datamatrix", "DataMatrix"], ["pdf417", "PDF417"]] as [keyof typeof bc.symbologias, string][]).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={bc.symbologias[key]}
                onChange={(e) => setBc({ symbologias: { ...bc.symbologias, [key]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
        <SwitchRow label="Sonido al escanear" checked={bc.sonido} onChange={(v) => setBc({ sonido: v })} />
        <PeriphField label="Prefijo de búsqueda">
          <input className="tg-input" placeholder="Opcional — ej: P-" value={bc.prefijo}
            onChange={(e) => setBc({ prefijo: e.target.value })} />
        </PeriphField>
        <div style={{ marginTop: 10, background: "var(--at-bg, #f5f5f7)", borderRadius: 6, padding: 10, border: "1px solid var(--at-border, #e5e7eb)" }}>
          <div className="tg-label" style={{ marginBottom: 6 }}>Simular escaneo (escribe o pega código)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="tg-input" placeholder="Ej: 7501030301321" value={bc.scanInput}
              onChange={(e) => setBc({ scanInput: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleScan()} />
            <button className="tg-btn" onClick={handleScan}>📷 Escanear</button>
          </div>
          {bc.lastScan && (
            <div style={{ marginTop: 8 }}>
              <div className="tg-label" style={{ marginBottom: 4 }}>Último código leído:</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input className="tg-input" readOnly value={bc.lastScan} style={{ flex: 1, background: "var(--at-bg-card, #fff)" }} />
                <button className="tg-btn" style={{ padding: "6px 10px", fontSize: 14 }} title="Copiar"
                  onClick={() => { try { navigator.clipboard.writeText(bc.lastScan) } catch { /* noop */ } }}>
                  📋
                </button>
              </div>
            </div>
          )}
        </div>
      </PeriphSection>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--at-border, #e5e7eb)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, marginTop: "auto" }}>
        <button className="tg-btn tg-btn-primary" onClick={() => addToast("✓ Configuración guardada")}>
          💾 Guardar configuración
        </button>
        {showResetConfirm ? (
          <>
            <span style={{ fontSize: 13, color: "var(--at-text-soft)" }}>¿Restaurar valores predeterminados?</span>
            <button className="tg-btn" style={{ background: "#dc2626", color: "#fff", border: "none" }} onClick={handleReset}>Sí</button>
            <button className="tg-btn" onClick={() => setShowResetConfirm(false)}>Cancelar</button>
          </>
        ) : (
          <button className="tg-btn" onClick={() => setShowResetConfirm(true)}>↺ Restaurar valores predeterminados</button>
        )}
      </div>
    </div>
  )
}

/* ── Periph helper components ───────────────────────────────────── */
function PeriphSection({ icon, title, connected, onToggle, statusOn, statusOff, children }: {
  icon: string; title: string; connected: boolean
  onToggle: (v: boolean) => void; statusOn: string; statusOff: string
  children: React.ReactNode
}) {
  return (
    <div className="tg-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="tg-section-title" style={{ margin: 0 }}>{icon} {title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            background: connected ? "#dcfce7" : "#f3f4f6",
            color: connected ? "#16a34a" : "#6b7280",
            border: `1px solid ${connected ? "#bbf7d0" : "#e5e7eb"}`,
          }}>
            {connected ? statusOn : statusOff}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--at-text-soft)" }}>Simular conexión</span>
            <PSwitch checked={connected} onChange={onToggle} />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

function PeriphField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tg-field">
      <label className="tg-label">{label}</label>
      {children}
    </div>
  )
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <PSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function PSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{
      width: 36, height: 20, borderRadius: 10, cursor: "pointer", flexShrink: 0,
      background: checked ? "var(--orange, #f96302)" : "var(--at-border, #d1d5db)",
      position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </div>
  )
}
