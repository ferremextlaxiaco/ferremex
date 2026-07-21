import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  ShoppingCart, Banknote, Search, X, Plus, ChevronUp, ChevronDown,
  TriangleAlert, Printer, FileText, Edit, Check, Trash2,
} from "lucide-react"
import { loadClientes, actualizarCliente, loadCartera, agregarMovimientoCredito, anularAbono } from "../lib/clientes"
import { obtenerVenta, agregarNotaCarteraAPI, registrarCambioLimiteAPI, obtenerTicketConfig, validarPinAutorizacionAPI } from "../lib/client"
import { formatMXN as fmtPeso } from "../lib/format"
import { usePOS } from "../lib/pos-store"
import { ComprobanteAbono } from "../components/ComprobanteAbono"
import { EstadoCuentaTicket } from "../components/EstadoCuentaTicket"

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysFromNow(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtFecha(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

function fmtFechaHora(iso) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore logic
// ─────────────────────────────────────────────────────────────────────────────

const SEMAFORO_COLOR = {
  green:   "#22c55e",
  yellow:  "#eab308",
  orange:  "#f97316",
  red:     "#ef4444",
  darkred: "#991b1b",
  blue:    "#60a5fa",
  gray:    "#a1a1aa",
}

const SEMAFORO_PRIORITY = { darkred: 0, red: 1, orange: 2, yellow: 3, green: 4, blue: 5, gray: 6 }

function semaforoMovimiento(mov, plazo) {
  if (mov.tipo === "pago") return "gray"
  const due = new Date(mov.fecha + "T12:00:00")
  due.setDate(due.getDate() + (mov.plazo ?? plazo))
  const diff = Math.ceil((due - new Date()) / 86400000)
  if (diff > 7)   return "green"
  if (diff >= 1)  return "yellow"
  if (diff >= -30) return "orange"
  if (diff >= -60) return "red"
  return "darkred"
}

// Apply FIFO to determine which purchases are paid/partially paid.
// Returns { balance, available, overdue, movimientosConEstado }
function calcularSaldos(movimientos, plazo, limite) {
  // Los movimientos cancelados (abonos anulados por error) NO cuentan en el
  // cálculo de saldos: el monto "regresa" a la deuda. Se siguen mostrando en la
  // lista (tachados), por eso solo se excluyen del FIFO, no del output.
  const activos = movimientos.filter(m => !m.cancelado)
  // Sort all by date ascending (for FIFO)
  const sorted = [...activos].sort((a, b) => a.fecha.localeCompare(b.fecha))

  // FIFO: pool of available payments
  let paymentPool = 0
  sorted.forEach(m => { if (m.tipo === "pago") paymentPool += m.monto })

  let remainingPool = paymentPool
  let balance = 0
  let overdue = 0
  const estados = {}

  // Process purchases in FIFO order
  sorted.filter(m => m.tipo === "compra").forEach(mov => {
    const monto = mov.monto
    if (remainingPool >= monto) {
      remainingPool -= monto
      estados[mov.id] = "pagado"
    } else if (remainingPool > 0) {
      const partial = remainingPool
      remainingPool = 0
      const saldoMov = monto - partial
      balance += saldoMov
      const sem = semaforoMovimiento(mov, plazo)
      estados[mov.id] = "parcial"
      if (sem === "orange" || sem === "red" || sem === "darkred") {
        overdue += saldoMov
      }
    } else {
      balance += monto
      const sem = semaforoMovimiento(mov, plazo)
      estados[mov.id] = "pendiente"
      if (sem === "orange" || sem === "red" || sem === "darkred") {
        overdue += monto
      }
    }
  })

  const movimientosConEstado = movimientos.map(m => ({
    ...m,
    // Los cancelados se marcan aparte para renderizarlos tachados; no tienen
    // estado FIFO porque no participaron en el cálculo.
    _estado: m.cancelado ? "cancelado" : (estados[m.id] ?? (m.tipo === "pago" ? "pago" : "pendiente")),
    _semaforo: m.cancelado ? "gray" : (m.tipo === "pago" ? "gray" : semaforoMovimiento(m, plazo)),
  }))

  const available = Math.max(0, limite - balance)
  return { balance, available, overdue, movimientosConEstado }
}

// Total abonado A LA DEUDA VIGENTE: cuánto ya se ha cubierto de las compras que
// TODAVÍA tienen saldo (pendientes o parciales). Las compras YA LIQUIDADAS
// (100% pagadas) NO cuentan — ya quedaron atrás, no son "deuda actual".
// Ej.: compra de $4,550 con $2,000 ya abonados y $2,550 aún pendientes → aporta
// $2,000 a este total (no los $4,550 completos, ni nada de compras ya saldadas).
// Mismo FIFO que `calcularSaldos` (pagos aplican a la compra más antigua
// primero), pero aquí trackeamos cuánto se cubrió de CADA compra individual.
function calcularAbonadoVigente(movimientos) {
  const activos = movimientos.filter(m => !m.cancelado)
  const sorted = [...activos].sort((a, b) => a.fecha.localeCompare(b.fecha))

  let paymentPool = 0
  sorted.forEach(m => { if (m.tipo === "pago") paymentPool += m.monto })

  let remainingPool = paymentPool
  let abonadoVigente = 0
  sorted.filter(m => m.tipo === "compra").forEach(mov => {
    const monto = mov.monto
    if (remainingPool >= monto) {
      // Compra 100% liquidada: lo cubierto NO cuenta (ya no es deuda actual).
      remainingPool -= monto
    } else if (remainingPool > 0) {
      // Parcial: lo cubierto de ESTA compra sí cuenta (aún le queda saldo).
      abonadoVigente += remainingPool
      remainingPool = 0
    }
    // Si remainingPool ya era 0, la compra sigue 100% pendiente (abonado = 0).
  })
  return Math.round(abonadoVigente * 100) / 100
}

function semaforoCliente(movimientosConEstado, balance) {
  if (balance === 0) return "blue"
  const pendientes = movimientosConEstado.filter(
    m => m.tipo === "compra" && (m._estado === "pendiente" || m._estado === "parcial")
  )
  if (pendientes.length === 0) return "blue"
  let best = "gray"
  pendientes.forEach(m => {
    const s = m._semaforo
    if (SEMAFORO_PRIORITY[s] < SEMAFORO_PRIORITY[best]) best = s
  })
  return best
}

// Returns which compras a specific pago covered (FIFO order).
// { aplicaciones: [{ compra, aplicado }], excedente }
function calcularAplicacionAbono(movimientos, pagoId) {
  // Excluir movimientos cancelados: un abono anulado no aplica a ninguna compra.
  const activos = movimientos.filter(m => !m.cancelado)
  const sorted = [...activos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const compras = sorted.filter(m => m.tipo === "compra")
  const pagos   = sorted.filter(m => m.tipo === "pago")

  const remaining = {}
  compras.forEach(c => { remaining[c.id] = c.monto })

  for (const pago of pagos) {
    let pool = pago.monto
    const aplicaciones = []
    for (const compra of compras) {
      if ((remaining[compra.id] ?? 0) <= 0) continue
      const aplicado = Math.min(pool, remaining[compra.id])
      if (aplicado > 0) {
        remaining[compra.id] -= aplicado
        pool -= aplicado
        if (pago.id === pagoId) aplicaciones.push({ compra, aplicado })
      }
      if (pool <= 0) break
    }
    if (pago.id === pagoId) return { aplicaciones, excedente: pool > 0 ? pool : 0 }
  }
  return { aplicaciones: [], excedente: 0 }
}

// Folio legible del recibo de abono a partir del id del movimiento.
// El abono (movimiento pago) no tiene folio propio en BD; lo derivamos para el
// papel: AB-YYYYMMDD-<4 primeros hex del id>.
function folioReciboAbono(mov) {
  const fecha = (mov.fecha ?? "").replace(/-/g, "").slice(0, 8) || "00000000"
  const corto = String(mov.id ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "0000"
  return `AB-${fecha}-${corto}`
}

// Construye el objeto AbonoRecibo (para <ComprobanteAbono />) a partir de un
// movimiento de pago y el portfolio del cliente. Reutiliza los mismos helpers
// FIFO que el resto del módulo: `calcularAplicacionAbono` (a qué compras se
// aplicó) y `calcularSaldos` (saldo/vencido). El saldo ANTERIOR se obtiene
// re-corriendo el FIFO sin este abono; el ACTUAL, con él.
function buildReciboAbono(mov, portfolio, cajero) {
  const { aplicaciones, excedente } = calcularAplicacionAbono(portfolio.movimientos, mov.id)

  const conAbono = calcularSaldos(portfolio.movimientos, portfolio.plazo, portfolio.limite)
  // "Sin este abono" = tratar el movimiento como cancelado en el cálculo.
  const movsSinEste = portfolio.movimientos.map(m =>
    m.id === mov.id ? { ...m, cancelado: true } : m
  )
  const sinAbono = calcularSaldos(movsSinEste, portfolio.plazo, portfolio.limite)

  // Próximo vencimiento (texto corto) sobre el estado CON el abono aplicado.
  const pendientes = conAbono.movimientosConEstado.filter(
    m => m.tipo === "compra" && !m.cancelado && m._estado !== "pagado"
  )
  let proximaDue = null
  pendientes.forEach(m => {
    const due = new Date(m.fecha + "T12:00:00")
    due.setDate(due.getDate() + (m.plazo ?? portfolio.plazo))
    if (!proximaDue || due < proximaDue) proximaDue = due
  })
  const proximoVence = proximaDue
    ? proximaDue.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    : null

  // Método + referencia salen de la descripción "Abono — Método — referencia".
  const partes = (mov.descripcion ?? "").split(" — ")
  const metodo = partes[1] || "Efectivo"
  const referencia = mov.nota || partes.slice(2).join(" — ") || ""

  return {
    folio: folioReciboAbono(mov),
    fecha: mov.fecha,
    cajero: cajero || "—",
    cliente: portfolio.nombre,
    telefono: portfolio.telefono || "",
    numCliente: portfolio.numCliente ?? "",
    monto: mov.monto,
    metodo,
    referencia,
    aplicaciones: aplicaciones.map(({ compra, aplicado }) => ({
      folio: compra.folio || "",
      descripcion: compra.descripcion || "Compra",
      fecha: compra.fecha,
      aplicado,
      montoCompra: compra.monto,
    })),
    excedente,
    saldoAnterior: sinAbono.balance,
    saldoActual: conAbono.balance,
    deudaVencida: conAbono.overdue,
    proximoVence,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: build portfolios from BD clientes + cartera
// ─────────────────────────────────────────────────────────────────────────────

function buildPortfolios(clientes, cartera) {
  return clientes
    .filter(c => (c.limite_credito ?? 0) > 0 || (c.dias_credito ?? 0) > 0)
    .map(c => {
      const entry = cartera[c.id]
      return {
        id:             c.id,
        clienteId:      c.id,
        nombre:         c.nombre,
        telefono:       c.telefono,
        numCliente:     c.num_cliente,
        limite:         c.limite_credito,
        plazo:          c.dias_credito,
        movimientos:    entry?.movimientos     ?? [],
        notas:          entry?.notas           ?? [],
        historialLimite:entry?.historialLimite ?? [],
      }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline style constants
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  page: {
    display: "flex", flexDirection: "column", height: "100%",
    background: "#f4f4f5", fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    fontSize: 14, color: "#18181b",
  },
  kpiBar: {
    display: "flex", gap: 12, padding: "12px 16px 0",
    flexShrink: 0,
  },
  kpiCard: {
    flex: 1, background: "#fff", border: "1px solid #e4e4e7",
    borderRadius: 8, padding: "10px 14px",
  },
  kpiLabel: { fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" },
  kpiValue: { fontSize: 22, fontWeight: 700, color: "#18181b", lineHeight: 1.2, marginTop: 2 },
  kpiSub:   { fontSize: 11, color: "#71717a", marginTop: 2 },
  banner: {
    margin: "10px 16px 0",
    background: "#fef3c7", border: "1px solid #fbbf24",
    borderRadius: 8, padding: "8px 14px",
    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
  },
  body: { display: "flex", flex: 1, gap: 0, overflow: "hidden", padding: "10px 12px 12px" },
  leftCol: {
    width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
    marginRight: 8,
  },
  centerCol: {
    flex: 1, background: "#fff", border: "1px solid #e4e4e7",
    borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden",
  },
  rightPanel: {
    width: 420, flexShrink: 0, background: "#fff", border: "1px solid #e4e4e7",
    borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden",
    marginLeft: 8,
  },
  card: {
    background: "#fff", border: "1px solid #e4e4e7",
    borderRadius: 8, padding: "10px 12px",
  },
  input: {
    border: "1px solid #e4e4e7", borderRadius: 6, padding: "6px 10px",
    fontSize: 13, background: "#fff", color: "#18181b", outline: "none",
    width: "100%",
  },
  select: {
    border: "1px solid #e4e4e7", borderRadius: 6, padding: "5px 8px",
    fontSize: 12, background: "#fff", color: "#18181b", outline: "none",
    width: "100%",
  },
  btnPrimary: {
    background: "#F96302", color: "#fff", border: "none", borderRadius: 6,
    padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 5,
  },
  btnSecondary: {
    background: "#fafafa", color: "#18181b", border: "1px solid #e4e4e7",
    borderRadius: 6, padding: "7px 14px", fontSize: 13, fontWeight: 600,
    cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
  },
  btnGhost: {
    background: "transparent", color: "#71717a", border: "none", borderRadius: 6,
    padding: "5px 8px", fontSize: 13, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 4,
  },
  tabBar: {
    display: "flex", borderBottom: "1px solid #e4e4e7", background: "#fafafa",
    flexShrink: 0,
  },
  tab: (active) => ({
    padding: "9px 14px", fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#F96302" : "#71717a",
    borderBottom: active ? "2px solid #F96302" : "2px solid transparent",
    background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
    marginBottom: -1,
  }),
  th: {
    textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a",
    borderBottom: "1px solid #e4e4e7", background: "#fafafa", whiteSpace: "nowrap",
    userSelect: "none",
  },
  td: {
    padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f4f4f5",
    verticalAlign: "middle", color: "#18181b",
  },
  badge: (bg, fg) => ({
    background: bg, color: fg, borderRadius: 20, padding: "2px 8px",
    fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", display: "inline-block",
  }),
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#fff", borderRadius: 10, width: 480, maxWidth: "95vw",
    boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
    display: "flex", flexDirection: "column", maxHeight: "90vh",
  },
  modalHeader: {
    padding: "16px 20px 12px", borderBottom: "1px solid #e4e4e7",
    display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
  },
  modalBody: { padding: "16px 20px", overflowY: "auto", flex: 1 },
  modalFooter: {
    padding: "12px 20px", borderTop: "1px solid #e4e4e7",
    display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0,
  },
  label: { fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4, display: "block" },
  fieldGroup: { marginBottom: 14 },
  progressTrack: {
    height: 6, borderRadius: 99, background: "#f4f4f5",
    overflow: "hidden", flexShrink: 0,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast (internal)
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 2000,
      background: toast.color ?? "#18181b", color: "#fff",
      padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 340,
      animation: "slideInRight 0.2s ease",
    }}>
      {toast.msg}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmModal (generic)
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmModal({ open, title, children, onConfirm, onCancel, confirmLabel = "Confirmar", confirmColor = "#F96302" }) {
  if (!open) return null
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ ...S.modal, width: 420 }}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          <button style={S.btnGhost} onClick={onCancel}><X size={16} /></button>
        </div>
        <div style={S.modalBody}>{children}</div>
        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onCancel}>Cancelar</button>
          <button style={{ ...S.btnPrimary, background: confirmColor }} onClick={onConfirm}>
            <Check size={14} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SemaforoIndicator
// ─────────────────────────────────────────────────────────────────────────────

function SemaforoDot({ color, size = 11 }) {
  const bg = SEMAFORO_COLOR[color] ?? color
  const shadow = color === "darkred"
    ? `0 0 0 2px rgba(153,27,27,0.3)`
    : `0 0 0 2px ${bg}33`
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      borderRadius: "50%", background: bg,
      boxShadow: shadow, flexShrink: 0,
    }} />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HabilitarClienteModal
// ─────────────────────────────────────────────────────────────────────────────

function HabilitarClienteModal({ open, onClose, onHabilitar }) {
  const [search, setSearch]         = useState("")
  const [selected, setSelected]     = useState(null)
  const [limite, setLimite]         = useState("")
  const [plazo, setPlazo]           = useState("30")
  const [nota, setNota]             = useState("")
  const [sinCredito, setSinCredito] = useState([])

  useEffect(() => {
    if (open) {
      setSearch("")
      setSelected(null)
      setLimite("")
      setPlazo("30")
      setNota("")
      let activo = true
      loadClientes()
        .then(todos => { if (activo) setSinCredito(todos.filter(c => (c.limite_credito ?? 0) === 0)) })
        .catch(() => { if (activo) setSinCredito([]) })
      return () => { activo = false }
    }
  }, [open])

  if (!open) return null

  const filtrados = sinCredito.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.num_cliente.includes(search) ||
    c.telefono.includes(search)
  )

  const canConfirm = selected && Number(limite) > 0 && Number(plazo) > 0

  function handleConfirm() {
    if (!canConfirm) return
    onHabilitar(selected, Number(limite), Number(plazo), nota.trim())
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 500 }}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Habilitar crédito a cliente</span>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={S.modalBody}>
          <div style={S.fieldGroup}>
            <label style={S.label}>Buscar cliente sin crédito</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#71717a" }} />
              <input
                style={{ ...S.input, paddingLeft: 28 }}
                placeholder="Nombre, número o teléfono…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null) }}
                autoFocus
              />
            </div>
          </div>

          {/* Lista de clientes sin crédito */}
          <div style={{
            maxHeight: 160, overflowY: "auto", border: "1px solid #e4e4e7",
            borderRadius: 6, marginBottom: 14,
          }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: 12, color: "#71717a", fontSize: 13, textAlign: "center" }}>
                {sinCredito.length === 0
                  ? "Todos los clientes ya tienen crédito habilitado"
                  : "Sin coincidencias"}
              </div>
            ) : filtrados.map(c => (
              <div
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  padding: "8px 12px", cursor: "pointer", fontSize: 13,
                  background: selected?.id === c.id ? "rgba(249,99,2,0.08)" : "transparent",
                  borderLeft: selected?.id === c.id ? "3px solid #F96302" : "3px solid transparent",
                  transition: "background 0.1s",
                }}
              >
                <strong style={{ color: "#18181b" }}>#{c.num_cliente} — {c.nombre}</strong>
                <span style={{ color: "#71717a", marginLeft: 8, fontSize: 12 }}>{c.telefono}</span>
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ background: "rgba(249,99,2,0.06)", border: "1px solid rgba(249,99,2,0.25)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
              <strong>{selected.nombre}</strong> — Grupo: {selected.grupo || "Sin grupo"}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={S.fieldGroup}>
              <label style={S.label}>Límite de crédito (MXN) *</label>
              <input
                type="number" min="100" step="100"
                style={S.input}
                placeholder="Ej: 5000"
                value={limite}
                onChange={e => setLimite(e.target.value)}
              />
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Plazo (días) *</label>
              <select style={S.select} value={plazo} onChange={e => setPlazo(e.target.value)}>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="45">45 días</option>
                <option value="60">60 días</option>
                <option value="90">90 días</option>
              </select>
            </div>
          </div>

          <div style={S.fieldGroup}>
            <label style={S.label}>Nota (opcional)</label>
            <textarea
              style={{ ...S.input, height: 60, resize: "vertical" }}
              placeholder="Motivo del crédito, referencias, observaciones…"
              value={nota}
              onChange={e => setNota(e.target.value)}
            />
          </div>
        </div>
        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onClose}>Cancelar</button>
          <button
            style={{ ...S.btnPrimary, opacity: canConfirm ? 1 : 0.45 }}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            <Check size={14} /> Habilitar crédito
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EditarLimiteModal
// ─────────────────────────────────────────────────────────────────────────────

function EditarLimiteModal({ open, portfolio, onClose, onGuardar }) {
  const [nuevo, setNuevo]   = useState("")
  const [razon, setRazon]   = useState("")

  useEffect(() => {
    if (open && portfolio) {
      setNuevo(String(portfolio.limite))
      setRazon("")
    }
  }, [open, portfolio])

  if (!open || !portfolio) return null

  const canSave = Number(nuevo) > 0 && razon.trim().length > 0

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 400 }}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Editar límite de crédito</span>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={S.modalBody}>
          <div style={{
            background: "#fafafa", border: "1px solid #e4e4e7",
            borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13,
          }}>
            <div style={{ color: "#71717a", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Límite actual</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#18181b" }}>{fmtPeso(portfolio.limite)}</div>
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Nuevo límite (MXN) *</label>
            <input
              type="number" min="0" step="500"
              style={S.input}
              value={nuevo}
              onChange={e => setNuevo(e.target.value)}
              autoFocus
            />
          </div>
          <div style={S.fieldGroup}>
            <label style={S.label}>Motivo del cambio * (requerido)</label>
            <textarea
              style={{ ...S.input, height: 72, resize: "vertical" }}
              placeholder="Explica por qué cambia el límite…"
              value={razon}
              onChange={e => setRazon(e.target.value)}
            />
          </div>
        </div>
        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onClose}>Cancelar</button>
          <button
            style={{ ...S.btnPrimary, opacity: canSave ? 1 : 0.45 }}
            disabled={!canSave}
            onClick={() => onGuardar(Number(nuevo), razon.trim())}
          >
            <Check size={14} /> Guardar cambio
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BuscarClienteModal
// ─────────────────────────────────────────────────────────────────────────────

function BuscarClienteModal({ open, onClose, onSelect, portfolios, clientesLS }) {
  const [q, setQ]       = useState("")
  const inputRef        = useRef(null)

  useEffect(() => {
    if (open) {
      setQ("")
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  if (!open) return null

  const filtrados = portfolios.filter(p => {
    if (!q.trim()) return true
    const low = q.toLowerCase()
    if (p.nombre.toLowerCase().includes(low)) return true
    const cli = clientesLS.find(c => c.id === p.clienteId)
    if (cli?.num_cliente?.toString().includes(q)) return true
    return false
  })

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 480 }}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Buscar cliente</span>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: "12px 20px 10px" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#71717a" }} />
            <input
              ref={inputRef}
              style={{ ...S.input, paddingLeft: 30 }}
              placeholder="Nombre o número de cliente…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && (
              <button
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#71717a", padding: 2 }}
                onClick={() => setQ("")}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowY: "auto", maxHeight: 420, borderTop: "1px solid #e4e4e7" }}>
          {filtrados.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#a1a1aa", fontSize: 13 }}>Sin coincidencias</div>
          ) : filtrados.map(p => {
            const cli = clientesLS.find(c => c.id === p.clienteId)
            const numCli = cli?.num_cliente ?? "—"
            return (
              <div
                key={p.id}
                onClick={() => { onSelect(p.id); onClose() }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", cursor: "pointer",
                  borderBottom: "1px solid #f4f4f5", transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9f9fa"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <SemaforoDot color={p.semaforo} size={10} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nombre}
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a" }}>Cliente #{numCli}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.balance > 0 ? "#18181b" : "#16a34a", whiteSpace: "nowrap" }}>
                  {fmtPeso(p.balance)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EliminarCuentaModal
// ─────────────────────────────────────────────────────────────────────────────

function EliminarCuentaModal({ open, portfolio, onClose, onConfirm }) {
  const [step,       setStep]       = useState(1)
  const [pin,        setPin]        = useState("")
  const [authError,  setAuthError]  = useState("")
  const [verifying,  setVerifying]  = useState(false)
  const pinRef = useRef(null)

  useEffect(() => {
    if (open) { setStep(1); setPin(""); setAuthError("") }
  }, [open])

  useEffect(() => {
    if (step === 2) setTimeout(() => pinRef.current?.focus(), 60)
  }, [step])

  if (!open || !portfolio) return null

  async function handleAuth() {
    if (!pin.trim() || verifying) return
    setVerifying(true)
    setAuthError("")
    try {
      // El PIN se valida EN EL SERVIDOR (nunca se leen PINs ajenos en el
      // cliente): mismo patrón que el override de límite de crédito en ventas.
      const { valido } = await validarPinAutorizacionAPI(pin.trim())
      if (valido) {
        onConfirm()
      } else {
        setAuthError("PIN incorrecto o sin permisos de administrador.")
        setPin("")
        setTimeout(() => pinRef.current?.focus(), 60)
      }
    } catch {
      setAuthError("Error al verificar. Intenta de nuevo.")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 420 }}>
        <div style={S.modalHeader}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626" }}>Eliminar cuenta de crédito</span>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        {step === 1 ? (
          <>
            <div style={S.modalBody}>
              <div style={{
                background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 8, padding: "12px 14px", marginBottom: 14,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <TriangleAlert size={16} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: "#7f1d1d" }}>
                  Esta acción es <strong>irreversible</strong>. Se eliminarán todos los movimientos,
                  notas e historial de límite de este cliente.
                </div>
              </div>
              <div style={{
                background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6,
                padding: "10px 12px", marginBottom: 14, fontSize: 13,
              }}>
                <div style={{ fontWeight: 700, color: "#18181b", marginBottom: 4 }}>{portfolio.nombre}</div>
                <div style={{ display: "flex", gap: 16 }}>
                  <span style={{ color: "#71717a" }}>
                    Saldo: <strong style={{ color: portfolio.balance > 0 ? "#ef4444" : "#16a34a" }}>
                      {fmtPeso(portfolio.balance)}
                    </strong>
                  </span>
                  <span style={{ color: "#71717a" }}>Límite: <strong>{fmtPeso(portfolio.limite)}</strong></span>
                </div>
              </div>
              {portfolio.balance > 0 && (
                <div style={{
                  background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
                  borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#92400e",
                }}>
                  <strong>Advertencia:</strong> El cliente tiene un saldo pendiente de {fmtPeso(portfolio.balance)}.
                  Asegúrate de haber liquidado la deuda antes de eliminar la cuenta.
                </div>
              )}
            </div>
            <div style={S.modalFooter}>
              <button style={S.btnSecondary} onClick={onClose}>Cancelar</button>
              <button
                style={{ ...S.btnPrimary, background: "#dc2626" }}
                onClick={() => setStep(2)}
              >
                Continuar →
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={S.modalBody}>
              <div style={{ fontSize: 13, color: "#18181b", marginBottom: 14 }}>
                Ingresa el PIN de un <strong>administrador</strong> para confirmar la eliminación
                de la cuenta de <strong>{portfolio.nombre}</strong>.
              </div>
              <div style={S.fieldGroup}>
                <label style={S.label}>PIN de administrador *</label>
                <input
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  style={{ ...S.input, letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }}
                  placeholder="••••"
                  value={pin}
                  onChange={e => { setPin(e.target.value); setAuthError("") }}
                  onKeyDown={e => { if (e.key === "Enter") handleAuth() }}
                  maxLength={8}
                />
              </div>
              {authError && (
                <div style={{ fontSize: 13, color: "#dc2626", marginTop: -6 }}>{authError}</div>
              )}
            </div>
            <div style={S.modalFooter}>
              <button style={S.btnSecondary} onClick={() => { setStep(1); setPin(""); setAuthError("") }}>
                ← Atrás
              </button>
              <button
                style={{ ...S.btnPrimary, background: "#dc2626", opacity: pin.trim() && !verifying ? 1 : 0.45 }}
                disabled={!pin.trim() || verifying}
                onClick={handleAuth}
              >
                <Trash2 size={13} /> {verifying ? "Verificando…" : "Eliminar cuenta"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DetalleAbonoModal — FIFO allocation when clicking a pago movement
// ─────────────────────────────────────────────────────────────────────────────

function DetalleAbonoModal({ mov, portfolio, onClose, onAnular, onReimprimir }) {
  if (!mov || !portfolio) return null

  const { aplicaciones, excedente } = calcularAplicacionAbono(portfolio.movimientos, mov.id)

  // Parse "Abono — Efectivo — referencia" from descripcion
  const partes = (mov.descripcion ?? "").split(" — ")
  const metodo = partes[1] ?? ""
  const refNota = partes.slice(2).join(" — ")

  return (
    <div style={{ ...S.overlay, zIndex: 1100 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 480 }}>
        <div style={S.modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
              Abono — {fmtPeso(mov.monto)}
            </div>
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
              {fmtFecha(mov.fecha)}{metodo ? ` · ${metodo}` : ""}
            </div>
          </div>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={S.modalBody}>
          {refNota && (
            <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#71717a" }}>
              Referencia: {refNota}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", marginBottom: 8 }}>
            Aplicado a
          </div>

          {aplicaciones.length === 0 ? (
            <div style={{ padding: "12px 0", color: "#a1a1aa", fontSize: 13 }}>
              Este abono no cubrió ninguna compra pendiente al momento de registrarse.
            </div>
          ) : (
            <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden", marginBottom: excedente > 0 ? 12 : 0 }}>
              {aplicaciones.map(({ compra, aplicado }, i) => {
                const cubrioTotal = Math.abs(aplicado - compra.monto) < 0.01
                const pct = Math.round((aplicado / compra.monto) * 100)
                return (
                  <div key={compra.id} style={{ padding: "10px 14px", borderBottom: i < aplicaciones.length - 1 ? "1px solid #f4f4f5" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: cubrioTotal ? 0 : 6 }}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {compra.descripcion || "Compra"}
                        </div>
                        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
                          {fmtFecha(compra.fecha)}{compra.folio ? ` · ${compra.folio}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                          {fmtPeso(aplicado)}
                        </div>
                        {!cubrioTotal && (
                          <div style={{ fontSize: 11, color: "#71717a" }}>
                            de {fmtPeso(compra.monto)} ({pct}%)
                          </div>
                        )}
                      </div>
                    </div>
                    {!cubrioTotal && <ProgressBar used={aplicado} total={compra.monto} height={3} />}
                  </div>
                )
              })}
            </div>
          )}

          {excedente > 0 && (
            <div style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#71717a" }}>Excedente sin deuda que cubrir</span>
                <strong style={{ color: "#16a34a" }}>{fmtPeso(excedente)}</strong>
              </div>
            </div>
          )}

          {/* Si el abono ya fue anulado, mostrar el aviso con motivo */}
          {mov.cancelado && (
            <div style={{ marginTop: 14, background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 6, padding: "10px 12px", fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>Abono cancelado</div>
              {mov.motivo_cancelacion && (
                <div style={{ color: "#71717a" }}>Motivo: {mov.motivo_cancelacion}</div>
              )}
              {mov.fecha_cancelacion && (
                <div style={{ color: "#a1a1aa", fontSize: 11, marginTop: 2 }}>
                  {fmtFecha(mov.fecha_cancelacion.slice(0, 10))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ ...S.modalFooter, justifyContent: mov.cancelado ? "flex-end" : "space-between" }}>
          {/* Cancelar el abono (devolver el monto a la deuda). Solo si no está ya anulado. */}
          {!mov.cancelado && (
            <button
              style={{ ...S.btnSecondary, color: "#dc2626", borderColor: "rgba(220,38,38,0.4)" }}
              onClick={() => onAnular?.(mov)}
            >
              Cancelar abono
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {/* Reimprimir el recibo de este abono (también para abonos ya cancelados). */}
            <button
              style={{ ...S.btnSecondary, display: "flex", alignItems: "center", gap: 5 }}
              onClick={() => onReimprimir?.(mov)}
            >
              <Printer size={14} /> Imprimir recibo
            </button>
            <button style={S.btnSecondary} onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DetalleVentaModal — ticket detail when clicking a compra movement
// ─────────────────────────────────────────────────────────────────────────────

function DetalleVentaModal({ mov, onClose }) {
  const [venta,   setVenta]   = useState(null)   // full ticket from backend
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!mov) return
    if (!mov.folio) { setVenta(null); setError(null); return }
    setLoading(true)
    setVenta(null)
    setError(null)
    obtenerVenta(mov.folio).then(v => {
      setVenta(v)
      if (!v) setError("No se encontró el ticket en el sistema.")
    }).catch(() => setError("Error al cargar el ticket.")).finally(() => setLoading(false))
  }, [mov?.id])

  if (!mov) return null

  function metodoLabel(v) {
    if (!v) return null
    const partes = []
    if ((v.pago_efectivo ?? 0) > 0)       partes.push(`Efectivo ${fmtPeso(v.pago_efectivo)}`)
    if ((v.pago_transferencia ?? 0) > 0)  partes.push(`Transferencia ${fmtPeso(v.pago_transferencia)}`)
    if ((v.pago_credito ?? 0) > 0)        partes.push(`Crédito ${fmtPeso(v.pago_credito)}`)
    return partes.join(" + ") || "—"
  }

  return (
    <div style={{ ...S.overlay, zIndex: 1100 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...S.modal, width: 540, maxHeight: "88vh" }}>
        {/* Header */}
        <div style={S.modalHeader}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
              {mov.folio ?? "Compra"} &mdash; {fmtPeso(mov.monto)}
            </div>
            <div style={{ fontSize: 12, color: "#71717a", marginTop: 2 }}>
              {fmtFecha(mov.fecha)}
              {venta?.fecha && ` · ${new Date(venta.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
              {venta?.cajero && ` · Cajero: ${venta.cajero}`}
            </div>
          </div>
          <button style={S.btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={S.modalBody}>
          {loading && (
            <div style={{ textAlign: "center", padding: 32, color: "#71717a", fontSize: 14 }}>
              Cargando ticket…
            </div>
          )}

          {!loading && error && (
            <>
              <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#92400e" }}>
                {error}
              </div>
              {/* Show what we have from the movement itself */}
              <div style={{ fontSize: 13, color: "#71717a", marginBottom: 6 }}>Datos del movimiento:</div>
              <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#18181b", marginBottom: 4 }}>{mov.descripcion}</div>
                <div style={{ fontSize: 13, color: "#71717a" }}>Monto: <strong style={{ color: "#18181b" }}>{fmtPeso(mov.monto)}</strong></div>
                <div style={{ fontSize: 13, color: "#71717a", marginTop: 2 }}>Fecha: {fmtFecha(mov.fecha)}</div>
                {mov.folio && <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>Folio: {mov.folio}</div>}
              </div>
            </>
          )}

          {!loading && venta && (
            <>
              {/* Items table */}
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", marginBottom: 8 }}>
                Artículos
              </div>
              <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={{ ...S.th, borderBottom: "1px solid #e4e4e7", fontWeight: 700, fontSize: 11, padding: "8px 12px" }}>Descripción</th>
                      <th style={{ ...S.th, textAlign: "right", borderBottom: "1px solid #e4e4e7", fontWeight: 700, fontSize: 11, padding: "8px 12px", width: 60 }}>Cant.</th>
                      <th style={{ ...S.th, textAlign: "right", borderBottom: "1px solid #e4e4e7", fontWeight: 700, fontSize: 11, padding: "8px 12px", width: 90 }}>P. Unit</th>
                      <th style={{ ...S.th, textAlign: "right", borderBottom: "1px solid #e4e4e7", fontWeight: 700, fontSize: 11, padding: "8px 12px", width: 90 }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(venta.items ?? []).map((item, i) => (
                      <tr key={i} style={{ borderBottom: i < venta.items.length - 1 ? "1px solid #f4f4f5" : "none" }}>
                        <td style={{ padding: "9px 12px", fontSize: 13, color: "#18181b" }}>{item.descripcion}</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right", color: "#71717a" }}>{item.cantidad}</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right", color: "#71717a" }}>{fmtPeso(item.precio_unitario)}</td>
                        <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 600, textAlign: "right", color: "#18181b" }}>{fmtPeso(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                  <span style={{ color: "#71717a" }}>Total</span>
                  <strong style={{ color: "#18181b", fontSize: 16 }}>{fmtPeso(venta.total)}</strong>
                </div>
                <div style={{ borderTop: "1px solid #e4e4e7", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {(venta.pago_efectivo ?? 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#71717a" }}>Efectivo</span>
                      <span style={{ color: "#18181b" }}>{fmtPeso(venta.pago_efectivo)}</span>
                    </div>
                  )}
                  {(venta.pago_transferencia ?? 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#71717a" }}>Transferencia</span>
                      <span style={{ color: "#18181b" }}>{fmtPeso(venta.pago_transferencia)}</span>
                    </div>
                  )}
                  {(venta.pago_credito ?? 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "#71717a" }}>Crédito</span>
                      <span style={{ color: "#ef4444", fontWeight: 600 }}>{fmtPeso(venta.pago_credito)}</span>
                    </div>
                  )}
                  {(venta.cambio ?? 0) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px solid #e4e4e7", paddingTop: 4, marginTop: 4 }}>
                      <span style={{ color: "#71717a" }}>Cambio</span>
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmtPeso(venta.cambio)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={S.modalFooter}>
          <button style={S.btnSecondary} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ProgressBar
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ used, total, height = 6 }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f97316" : "#F96302"
  return (
    <div style={{ ...S.progressTrack, height }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.3s" }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function CarteraCredito() {
  // ── Clientes reales (BD) ──────────────────────────────────────────────────
  const [clientesLS, setClientesLS] = useState([])

  // ── Portfolio state — built from BD clientes + cartera ────────────────────
  const [portfolios, setPortfolios] = useState([])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selId,              setSelId]              = useState(null)
  const [tab,                setTab]                = useState("resumen")   // resumen|movimientos|abono|notas
  const [tabCartera,         setTabCartera]         = useState("activa")    // activa|saldo_cero|inhabilitados
  const [showBuscarCliente,  setShowBuscarCliente]  = useState(false)
  const [filtroEstado,       setFiltroEstado]       = useState("")
  const [filtroPlazo,     setFiltroPlazo]     = useState("")
  const [filtroAntig,     setFiltroAntig]     = useState("")
  const [sortCol,         setSortCol]         = useState("semaforo")
  const [sortDir,         setSortDir]         = useState("asc")
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showHabilitar,    setShowHabilitar]    = useState(false)
  const [showEditarLimite, setShowEditarLimite] = useState(false)
  const [showAbonoConfirm, setShowAbonoConfirm] = useState(false)
  const [showEliminar,     setShowEliminar]     = useState(false)
  const [movDetalle,       setMovDetalle]       = useState(null)
  // Anulación/condonación de movimiento(s): 1 (cancelar abono desde el detalle)
  // o varios (eliminar en lote compras/abonos seleccionados desde Movimientos).
  // Mismo mecanismo para ambos casos: soft-cancel con motivo obligatorio.
  const [anularMovs,       setAnularMovs]       = useState([])   // array de movimientos a cancelar
  const [anularMotivo,     setAnularMotivo]     = useState("")
  const [anulando,         setAnulando]         = useState(false)
  // Selección múltiple en la pestaña Movimientos (checkboxes → eliminar en lote).
  // Los checkboxes solo se muestran cuando el modo selección está activo (botón
  // "Seleccionar"); en vista normal la lista queda limpia, sin checkboxes fijos.
  const [modoSeleccion,    setModoSeleccion]    = useState(false)
  const [seleccionMovs,    setSeleccionMovs]    = useState(() => new Set())

  // ── Abono form ────────────────────────────────────────────────────────────
  const [abonoForm, setAbonoForm] = useState({
    monto: "", metodo: "Efectivo", fecha: todayISO(),
    nota: "", aplicarA: "fifo", movEspecifico: "",
  })

  // ── Notas ─────────────────────────────────────────────────────────────────
  const [nuevaNota, setNuevaNota] = useState("")
  const [addingNota, setAddingNota] = useState(false)

  // ── Recibo de abono imprimible ────────────────────────────────────────────
  const { state: posState } = usePOS()
  const cajeroNombre = posState?.cajero?.nombre ?? "—"
  const [ticketConfig, setTicketConfig] = useState(null)
  const [reciboAbono, setReciboAbono] = useState(null)   // AbonoRecibo a imprimir
  const [estadoCuenta, setEstadoCuenta] = useState(null) // EstadoCuentaData a imprimir

  // Encabezado del negocio para el recibo (del ticketConfig, con fallback).
  const negocioRecibo = useMemo(() => ({
    nombre:    ticketConfig?.encabezado?.nombre    ?? "FERREMEX",
    direccion: ticketConfig?.encabezado?.direccion ?? "Tlaxiaco, Oaxaca",
    telefono:  ticketConfig?.encabezado?.telefono  ?? "",
    rfc:       ticketConfig?.encabezado?.rfc        ?? "",
  }), [ticketConfig])

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, color = "#16a34a") {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, color })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ── Carga inicial async desde BD ──────────────────────────────────────────
  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const [clientes, cartera] = await Promise.all([loadClientes(), loadCartera()])
        if (!activo) return
        setClientesLS(clientes)
        setPortfolios(buildPortfolios(clientes, cartera))
      } catch (e) {
        console.error("Error cargando cartera:", e)
      }
      // Config del ticket (encabezado del negocio para el recibo de abono).
      try {
        const cfg = await obtenerTicketConfig()
        if (activo) setTicketConfig(cfg)
      } catch { /* usa fallback en negocioRecibo */ }
    })()
    return () => { activo = false }
  }, [])

  // Limpiar el modo selección al cambiar/cerrar el cliente activo.
  useEffect(() => { setSeleccionMovs(new Set()); setModoSeleccion(false) }, [selId])

  // ── ESC to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return
      if (anularMovs.length > 0 && !anulando) { setAnularMovs([]); setAnularMotivo(""); return }
      if (movDetalle)         { setMovDetalle(null); return }
      if (showAbonoConfirm)   { setShowAbonoConfirm(false); return }
      if (showEliminar)       { setShowEliminar(false); return }
      if (showEditarLimite)   { setShowEditarLimite(false); return }
      if (showHabilitar)      { setShowHabilitar(false); return }
      if (showBuscarCliente)  { setShowBuscarCliente(false); return }
      if (selId)              { setSelId(null) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [movDetalle, showAbonoConfirm, showEliminar, showEditarLimite, showHabilitar, showBuscarCliente, selId, anularMovs, anulando])

  // ── Computed portfolio with saldos ────────────────────────────────────────
  const portfoliosComputados = useMemo(() =>
    portfolios.map(p => {
      const { balance, available, overdue, movimientosConEstado } = calcularSaldos(p.movimientos, p.plazo, p.limite)
      const semaforo = semaforoCliente(movimientosConEstado, balance)
      // Closest due date among pending
      const pendientes = movimientosConEstado.filter(m => m.tipo === "compra" && m._estado !== "pagado")
      let proximoVence = null
      pendientes.forEach(m => {
        const due = new Date(m.fecha + "T12:00:00")
        due.setDate(due.getDate() + (m.plazo ?? p.plazo))
        if (!proximoVence || due < proximoVence) proximoVence = due
      })
      const diasVence = proximoVence
        ? Math.ceil((proximoVence - new Date()) / 86400000)
        : null
      // Last payment (los abonos cancelados no cuentan como "último abono")
      const pagos = p.movimientos.filter(m => m.tipo === "pago" && !m.cancelado).sort((a, b) => b.fecha.localeCompare(a.fecha))
      const ultimoPago = pagos[0] ?? null
      // Total abonado a la DEUDA VIGENTE (compras aún pendientes/parciales; ver
      // calcularAbonadoVigente). NO es el histórico de toda la vida del cliente.
      const totalAbonado = calcularAbonadoVigente(p.movimientos)
      return { ...p, balance, available, overdue, movimientosConEstado, semaforo, diasVence, ultimoPago, totalAbonado }
    })
  , [portfolios])

  // ── Selected portfolio ────────────────────────────────────────────────────
  const selPortfolio = portfoliosComputados.find(p => p.id === selId) ?? null

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const carteraTotal = portfoliosComputados.reduce((s, p) => s + p.balance, 0)
    const totalVencido  = portfoliosComputados.reduce((s, p) => s + p.overdue, 0)
    const enMora = portfoliosComputados.filter(p => ["darkred","red","orange"].includes(p.semaforo)).length
    // DSO = (cartera total / ventas últimos 30d) × 30 — approximate with total balance / 30 × 30
    const totalVentas30 = portfoliosComputados.reduce((s, p) => {
      const cutoff = daysAgo(30)
      return s + p.movimientos.filter(m => m.tipo === "compra" && !m.cancelado && m.fecha >= cutoff).reduce((ss, m) => ss + m.monto, 0)
    }, 0)
    const dso = totalVentas30 > 0 ? Math.round((carteraTotal / totalVentas30) * 30) : 0
    return { carteraTotal, totalVencido, enMora, dso }
  }, [portfoliosComputados])

  // ── Expiry banner ─────────────────────────────────────────────────────────
  const vencenProximo = useMemo(() =>
    portfoliosComputados.filter(p => p.balance > 0 && p.diasVence !== null && p.diasVence >= 0 && p.diasVence <= 1)
  , [portfoliosComputados])

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const listaFiltrada = useMemo(() => {
    let lista = [...portfoliosComputados]

    // Tab cartera
    if (tabCartera === "activa")      lista = lista.filter(p => p.balance > 0)
    if (tabCartera === "saldo_cero")  lista = lista.filter(p => p.balance === 0)
    // inhabilitados: not in mock (future feature) — show empty for now
    if (tabCartera === "inhabilitados") lista = []

    // Estado filter
    if (filtroEstado === "al_dia")    lista = lista.filter(p => ["green","blue"].includes(p.semaforo))
    if (filtroEstado === "por_vencer") lista = lista.filter(p => p.semaforo === "yellow")
    if (filtroEstado === "vencido")   lista = lista.filter(p => ["orange","red","darkred"].includes(p.semaforo))

    // Plazo filter
    if (filtroPlazo) lista = lista.filter(p => p.plazo === Number(filtroPlazo))

    // Antigüedad filter
    if (filtroAntig === "menos30")  lista = lista.filter(p => p.diasVence !== null && p.diasVence >= 0 && p.diasVence <= 30)
    if (filtroAntig === "30a60")    lista = lista.filter(p => p.diasVence !== null && p.diasVence < 0 && p.diasVence >= -60)
    if (filtroAntig === "mas60")    lista = lista.filter(p => p.diasVence !== null && p.diasVence < -60)

    // Sort
    lista.sort((a, b) => {
      let va, vb
      if (sortCol === "semaforo") {
        va = SEMAFORO_PRIORITY[a.semaforo] ?? 9
        vb = SEMAFORO_PRIORITY[b.semaforo] ?? 9
      } else if (sortCol === "nombre") {
        va = a.nombre; vb = b.nombre
        return sortDir === "asc" ? va.localeCompare(vb, "es") : vb.localeCompare(va, "es")
      } else if (sortCol === "balance") {
        va = a.balance; vb = b.balance
      } else if (sortCol === "totalAbonado") {
        va = a.totalAbonado; vb = b.totalAbonado
      } else if (sortCol === "limite") {
        va = a.limite; vb = b.limite
      } else if (sortCol === "diasVence") {
        va = a.diasVence ?? 9999; vb = b.diasVence ?? 9999
      } else {
        va = 0; vb = 0
      }
      return sortDir === "asc" ? va - vb : vb - va
    })

    return lista
  }, [portfoliosComputados, tabCartera, filtroEstado, filtroPlazo, filtroAntig, sortCol, sortDir])

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
  }

  function SortIcon({ col }) {
    if (sortCol !== col) return <ChevronUp size={12} style={{ opacity: 0.3 }} />
    return sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
  }

  // ── Habilitar cliente ─────────────────────────────────────────────────────
  async function handleHabilitar(cliente, limite, plazo, nota) {
    const actualizados = clientesLS.map(c =>
      c.id !== cliente.id ? c : { ...c, limite_credito: limite, dias_credito: plazo }
    )
    await actualizarCliente(cliente.id, { limite_credito: limite, dias_credito: plazo })
    setClientesLS(actualizados)

    await registrarCambioLimiteAPI(cliente.id, { fecha: todayISO(), usuario: "Andrés", anterior: 0, nuevo: limite, nota: nota || "Alta de crédito" })
    if (nota) await agregarNotaCarteraAPI(cliente.id, { fecha: todayISO(), hora: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }), autor: "Andrés", texto: nota })
    const cartera = await loadCartera()
    const updated = buildPortfolios(actualizados, cartera)
    setPortfolios(updated)
    setShowHabilitar(false)
    setSelId(cliente.id)
    setTab("resumen")
    showToast(`Crédito habilitado para ${cliente.nombre} — límite ${fmtPeso(limite)}`)
  }

  // ── Editar límite ─────────────────────────────────────────────────────────
  async function handleEditarLimite(nuevoLimite, razon) {
    if (!selPortfolio) return
    // Update BD client if clienteId exists in real clients
    const clienteReal = clientesLS.find(c => c.id === selPortfolio.clienteId)
    const clientesActualizados = clientesLS.map(c =>
      c.id === selPortfolio.clienteId ? { ...c, limite_credito: nuevoLimite } : c
    )
    if (clienteReal) {
      await actualizarCliente(clienteReal.id, { limite_credito: nuevoLimite })
      setClientesLS(clientesActualizados)
    }
    // Registrar el cambio de límite en la cartera (también persiste metadata.limite_credito)
    await registrarCambioLimiteAPI(selPortfolio.clienteId, {
      fecha: todayISO(), usuario: "Andrés",
      anterior: selPortfolio.limite, nuevo: nuevoLimite, nota: razon,
    })
    const cartera = await loadCartera()
    setPortfolios(buildPortfolios(clientesActualizados, cartera))
    setShowEditarLimite(false)
    showToast(`Límite actualizado a ${fmtPeso(nuevoLimite)}`)
  }

  // ── Registrar abono ───────────────────────────────────────────────────────
  async function handleAbonoConfirm() {
    if (!selPortfolio) return
    const monto = Number(abonoForm.monto)
    if (!monto || monto <= 0) return

    const clienteId = selPortfolio.clienteId
    const creado = await agregarMovimientoCredito(clienteId, {
      tipo: "pago",
      monto,
      fecha: abonoForm.fecha,
      descripcion: `Abono — ${abonoForm.metodo}${abonoForm.nota ? ` — ${abonoForm.nota}` : ""}`,
      nota: abonoForm.nota,
    })
    const cartera = await loadCartera()
    const nuevos = buildPortfolios(clientesLS, cartera)
    setPortfolios(nuevos)
    setShowAbonoConfirm(false)
    setAbonoForm({ monto: "", metodo: "Efectivo", fecha: todayISO(), nota: "", aplicarA: "fifo", movEspecifico: "" })
    setTab("movimientos")
    showToast(`Abono de ${fmtPeso(monto)} registrado correctamente`)

    // Abrir el recibo imprimible del abono recién registrado. Buscamos el
    // movimiento en el portfolio ya recargado (trae saldos y aplicación FIFO).
    const port = nuevos.find(p => p.id === clienteId)
    const mov = port?.movimientos.find(m => m.id === creado?.id)
    if (port && mov) {
      setReciboAbono(buildReciboAbono(mov, port, cajeroNombre))
    }
  }

  // ── Anular/condonar movimiento(s) ─────────────────────────────────────────
  // Cancela 1 o varios movimientos (abonos o COMPRAS) con un motivo obligatorio.
  // No se borran: quedan marcados cancelados (rastro auditable). Un abono
  // cancelado regresa su monto a la deuda; una compra condonada deja de contar
  // en el saldo (se "perdona" la venta a crédito). Mismo endpoint para ambos
  // (PATCH /caja/cartera/:customerId/movimientos/:movId es genérico por tipo).
  async function handleAnularMovimientos() {
    if (!selPortfolio || anularMovs.length === 0) return
    const motivo = anularMotivo.trim()
    if (!motivo) return
    setAnulando(true)
    try {
      const resultados = await Promise.allSettled(
        anularMovs.map(m => anularAbono(selPortfolio.clienteId, m.id, motivo))
      )
      const fallidos = resultados.filter(r => r.status === "rejected").length
      const cartera = await loadCartera()
      setPortfolios(buildPortfolios(clientesLS, cartera))
      setAnularMovs([])
      setAnularMotivo("")
      setMovDetalle(null)
      // Al terminar de eliminar, sal del modo selección (checkboxes) por completo
      // en vez de dejarlo activo con la selección ya vacía.
      setSeleccionMovs(new Set())
      setModoSeleccion(false)
      const okCount = anularMovs.length - fallidos
      if (fallidos > 0) {
        showToast(`${okCount} de ${anularMovs.length} movimiento(s) cancelado(s); ${fallidos} falló(aron)`, "#dc2626")
      } else if (anularMovs.length === 1) {
        const unico = anularMovs[0]
        const label = unico.tipo === "pago" ? "Abono" : "Compra"
        showToast(`${label} de ${fmtPeso(unico.monto)} cancelado(a) correctamente`, "#dc2626")
      } else {
        const total = anularMovs.reduce((s, m) => s + m.monto, 0)
        showToast(`${anularMovs.length} movimientos cancelados (${fmtPeso(total)})`, "#dc2626")
      }
    } catch (e) {
      showToast(e?.message ?? "No se pudo cancelar el/los movimiento(s)", "#dc2626")
    } finally {
      setAnulando(false)
    }
  }

  // ── Selección múltiple en Movimientos ─────────────────────────────────────
  function toggleSeleccion(movId) {
    setSeleccionMovs(prev => {
      const next = new Set(prev)
      if (next.has(movId)) next.delete(movId)
      else next.add(movId)
      return next
    })
  }
  function limpiarSeleccion() { setSeleccionMovs(new Set()) }
  // Sale del modo selección (checkboxes) y limpia lo marcado.
  function salirModoSeleccion() { setModoSeleccion(false); setSeleccionMovs(new Set()) }

  // ── Reimprimir recibo de un abono ya registrado ───────────────────────────
  // Reconstruye el recibo desde el portfolio actual (mismos helpers FIFO) y abre
  // el comprobante imprimible. Usado desde la lista de Movimientos y el detalle.
  function handleReimprimirAbono(mov) {
    if (!selPortfolio || !mov) return
    setReciboAbono(buildReciboAbono(mov, selPortfolio, cajeroNombre))
  }

  // ── Imprimir estado de cuenta del cliente ──────────────────────────────────
  // Arma el desglose completo (movimientos + saldos) desde el portfolio actual y
  // abre el ticket imprimible. Reutiliza los mismos cálculos que el panel.
  function handleImprimirEstadoCuenta() {
    if (!selPortfolio) return
    const { movimientosConEstado, plazo, limite, balance, available, overdue } = selPortfolio
    // Totales (excluyen cancelados, igual que el saldo).
    const vigentes = movimientosConEstado.filter(m => !m.cancelado)
    const totalComprado = vigentes.filter(m => m.tipo === "compra").reduce((s, m) => s + m.monto, 0)
    // Abonado a la DEUDA VIGENTE (no el histórico de toda la vida del cliente).
    const totalAbonado = calcularAbonadoVigente(selPortfolio.movimientos)
    // Próximo vencimiento (texto corto).
    const pendientes = vigentes.filter(m => m.tipo === "compra" && m._estado !== "pagado")
    let proximaDue = null
    pendientes.forEach(m => {
      const due = new Date(m.fecha + "T12:00:00")
      due.setDate(due.getDate() + (m.plazo ?? plazo))
      if (!proximaDue || due < proximaDue) proximaDue = due
    })
    const proximoVence = proximaDue
      ? proximaDue.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
      : null
    // Movimientos más reciente primero para la vista/ticket.
    const movimientos = [...movimientosConEstado]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(m => ({
        tipo: m.tipo, monto: m.monto, fecha: m.fecha, folio: m.folio,
        descripcion: m.descripcion, estado: m._estado, cancelado: !!m.cancelado,
      }))
    setEstadoCuenta({
      fecha: todayISO(),
      cajero: cajeroNombre,
      cliente: selPortfolio.nombre,
      telefono: selPortfolio.telefono || "",
      numCliente: selPortfolio.numCliente ?? "",
      plazo,
      limite,
      saldo: balance,
      disponible: available,
      vencido: overdue,
      totalComprado: Math.round(totalComprado * 100) / 100,
      totalAbonado: Math.round(totalAbonado * 100) / 100,
      proximoVence,
      movimientos,
    })
  }

  // ── Agregar nota ──────────────────────────────────────────────────────────
  async function handleAgregarNota() {
    if (!selPortfolio || !nuevaNota.trim()) return
    await agregarNotaCarteraAPI(selPortfolio.clienteId, {
      fecha: todayISO(),
      hora: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      autor: "Andrés",
      texto: nuevaNota.trim(),
    })
    const cartera = await loadCartera()
    setPortfolios(buildPortfolios(clientesLS, cartera))
    setNuevaNota("")
    setAddingNota(false)
  }

  // ── Eliminar cuenta ───────────────────────────────────────────────────────
  async function handleEliminarCuenta() {
    if (!selPortfolio) return
    await actualizarCliente(selPortfolio.clienteId, { limite_credito: 0, dias_credito: 0 })
    const actualizados = clientesLS.map(c =>
      c.id !== selPortfolio.clienteId ? c : { ...c, limite_credito: 0, dias_credito: 0 }
    )
    setClientesLS(actualizados)
    const nombre = selPortfolio.nombre
    setPortfolios(ps => ps.filter(p => p.id !== selPortfolio.id))
    setSelId(null)
    setShowEliminar(false)
    showToast(`Cuenta de crédito de ${nombre} eliminada`, "#dc2626")
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function semBadge(color, label) {
    const bg = SEMAFORO_COLOR[color] ?? "#a1a1aa"
    const light = ["gray","blue","green"].includes(color)
    const textColor = light ? "#fff" : color === "yellow" ? "#713f12" : "#fff"
    const bgOpacity = color === "yellow" ? "rgba(234,179,8,0.15)" : `${bg}22`
    return (
      <span style={{
        background: bgOpacity,
        color: color === "yellow" ? "#92400e" : bg,
        border: `1px solid ${bg}44`,
        borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    )
  }

  function diasVenceLabel(dias) {
    if (dias === null) return <span style={{ color: "#a1a1aa" }}>—</span>
    if (dias < -60)    return semBadge("darkred", `${Math.abs(dias)}d VENCIDO`)
    if (dias < -30)    return semBadge("red", `${Math.abs(dias)}d vencido`)
    if (dias < 0)      return semBadge("orange", `${Math.abs(dias)}d vencido`)
    if (dias === 0)    return semBadge("yellow", "HOY")
    if (dias <= 7)     return semBadge("yellow", `Vence en ${dias}d`)
    return semBadge("green", `${dias}d`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RIGHT PANEL TABS
  // ─────────────────────────────────────────────────────────────────────────

  function renderResumen() {
    if (!selPortfolio) return null
    const { balance, available, overdue, limite, plazo, historialLimite, diasVence, movimientosConEstado } = selPortfolio

    // Próximo vencimiento
    const pendientes = movimientosConEstado.filter(m => m.tipo === "compra" && !m.cancelado && m._estado !== "pagado")
    let proximaDue = null
    pendientes.forEach(m => {
      const due = new Date(m.fecha + "T12:00:00")
      due.setDate(due.getDate() + (m.plazo ?? plazo))
      if (!proximaDue || due < proximaDue) proximaDue = due
    })

    return (
      <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1 }}>
        {/* Credit summary */}
        <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ background: balance > 0 ? "rgba(239,68,68,0.07)" : "rgba(22,163,74,0.07)", border: `1px solid ${balance > 0 ? "rgba(239,68,68,0.2)" : "rgba(22,163,74,0.2)"}`, borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Saldo</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: balance === 0 ? "#16a34a" : "#ef4444" }}>{fmtPeso(balance)}</div>
            </div>
            <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Límite</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPeso(limite)}</div>
            </div>
            <div
              title="Cuánto ya se ha abonado a las compras que aún tienen saldo pendiente (no incluye compras ya liquidadas)"
              style={{ background: (selPortfolio.totalAbonado ?? 0) > 0 ? "rgba(22,163,74,0.07)" : "#fafafa", border: `1px solid ${(selPortfolio.totalAbonado ?? 0) > 0 ? "rgba(22,163,74,0.2)" : "#e4e4e7"}`, borderRadius: 6, padding: "6px 10px" }}
            >
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Abonado (deuda actual)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: (selPortfolio.totalAbonado ?? 0) > 0 ? "#16a34a" : "#a1a1aa" }}>{fmtPeso(selPortfolio.totalAbonado ?? 0)}</div>
            </div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 12, color: "#71717a", marginBottom: 4 }}>
              <span>{limite > 0 ? Math.round((balance / limite) * 100) : 0}% usado</span>
            </div>
            <ProgressBar used={balance} total={limite} height={7} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            <div style={{ background: overdue > 0 ? "rgba(239,68,68,0.07)" : "rgba(22,163,74,0.07)", border: `1px solid ${overdue > 0 ? "rgba(239,68,68,0.2)" : "rgba(22,163,74,0.2)"}`, borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Deuda vencida</div>
              <div style={{ fontWeight: 700, color: overdue > 0 ? "#ef4444" : "#16a34a", fontSize: 15 }}>{fmtPeso(overdue)}</div>
            </div>
            <div style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Disponible</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#16a34a" }}>{fmtPeso(available)}</div>
            </div>
            <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Próximo vence</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#18181b" }}>
                {proximaDue ? proximaDue.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            style={{ ...S.btnPrimary, flex: 1, justifyContent: "center" }}
            onClick={() => { setTab("abono"); setAbonoForm(f => ({ ...f, fecha: todayISO() })) }}
          >
            <Banknote size={14} /> Registrar abono
          </button>
          <button
            style={{ ...S.btnSecondary, flex: 1, justifyContent: "center" }}
            onClick={() => setShowEditarLimite(true)}
          >
            <Edit size={14} /> Editar límite
          </button>
        </div>

        {/* Print */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            style={{ ...S.btnGhost, border: "1px solid #e4e4e7", borderRadius: 6, flex: 1, justifyContent: "center" }}
            onClick={handleImprimirEstadoCuenta}
          >
            <Printer size={13} /> Imprimir estado de cuenta
          </button>
          <button
            style={{ ...S.btnGhost, border: "1px solid #e4e4e7", borderRadius: 6, flex: 1, justifyContent: "center" }}
            onClick={() => showToast("Próximamente disponible — configura las terminales primero ⚙", "#F96302")}
          >
            <FileText size={13} /> Exportar PDF
          </button>
        </div>

        {/* Danger zone */}
        {posState?.cajero?.permisos?.puede_eliminar_cartera && (
          <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: 12, marginBottom: 14 }}>
            <button
              style={{
                ...S.btnGhost, border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6,
                width: "100%", justifyContent: "center", color: "#dc2626", gap: 6,
              }}
              onClick={() => setShowEliminar(true)}
            >
              <Trash2 size={13} /> Eliminar cuenta de crédito
            </button>
          </div>
        )}

        {/* Audit log */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Historial de límite
        </div>
        {(historialLimite ?? []).length === 0 ? (
          <div style={{ color: "#a1a1aa", fontSize: 13 }}>Sin cambios registrados</div>
        ) : [...(historialLimite ?? [])].reverse().map(h => (
          <div key={h.id} style={{
            border: "1px solid #e4e4e7", borderRadius: 6, padding: "8px 10px",
            marginBottom: 6, fontSize: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontWeight: 600, color: "#18181b" }}>
                {h.anterior === 0 ? "Alta" : h.nuevo > h.anterior ? "Aumento" : "Reducción"}{" "}
                {fmtPeso(h.anterior)} → {fmtPeso(h.nuevo)}
              </span>
              <span style={{ color: "#71717a" }}>{fmtFecha(h.fecha)}</span>
            </div>
            <div style={{ color: "#71717a" }}>{h.nota} — por {h.usuario}</div>
          </div>
        ))}
      </div>
    )
  }

  function renderMovimientos() {
    if (!selPortfolio) return null
    const { movimientosConEstado, plazo } = selPortfolio
    const sorted = [...movimientosConEstado].sort((a, b) => b.fecha.localeCompare(a.fecha))
    const seleccionables = sorted.filter(m => !m.cancelado)
    const seleccionados = sorted.filter(m => seleccionMovs.has(m.id) && !m.cancelado)

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {/* Barra superior: botón para entrar/salir del modo selección. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "8px 14px", borderBottom: "1px solid #f4f4f5", flexShrink: 0,
        }}>
          {!modoSeleccion ? (
            <button
              style={{ ...S.btnGhost, border: "1px solid #e4e4e7", padding: "5px 10px" }}
              onClick={() => setModoSeleccion(true)}
              disabled={seleccionables.length === 0}
            >
              Seleccionar ventas
            </button>
          ) : (
            <button style={{ ...S.btnGhost, padding: "5px 10px" }} onClick={salirModoSeleccion}>
              Cancelar selección
            </button>
          )}
        </div>

        {/* Barra de acción: aparece solo con selección activa (y modo selección). */}
        {modoSeleccion && seleccionados.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, padding: "8px 14px", background: "rgba(220,38,38,0.06)",
            borderBottom: "1px solid rgba(220,38,38,0.2)", flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, color: "#7f1d1d" }}>
              <strong>{seleccionados.length}</strong> seleccionado{seleccionados.length !== 1 ? "s" : ""}{" "}
              ({fmtPeso(seleccionados.reduce((s, m) => s + m.monto, 0))})
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...S.btnGhost, padding: "5px 10px" }} onClick={limpiarSeleccion}>Limpiar</button>
              <button
                style={{ ...S.btnPrimary, background: "#dc2626", padding: "6px 12px", fontSize: 12 }}
                onClick={() => { setAnularMovs(seleccionados); setAnularMotivo("") }}
              >
                <Trash2 size={13} /> Eliminar seleccionados
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#a1a1aa", fontSize: 13 }}>Sin movimientos registrados</div>
        ) : sorted.map(m => {
          const isPago = m.tipo === "pago"
          const semColor = SEMAFORO_COLOR[m._semaforo] ?? "#a1a1aa"
          let badge = null
          if (isPago) {
            badge = <span style={S.badge("rgba(22,163,74,0.1)", "#16a34a")}>Abono</span>
          } else if (m._estado === "pagado") {
            badge = <span style={S.badge("rgba(22,163,74,0.1)", "#16a34a")}>Pagado</span>
          } else if (m._estado === "parcial") {
            badge = <span style={S.badge("rgba(249,99,2,0.1)", "#F96302")}>Parcial</span>
          } else {
            const due = new Date(m.fecha + "T12:00:00")
            due.setDate(due.getDate() + (m.plazo ?? plazo))
            const diff = Math.ceil((due - new Date()) / 86400000)
            if (diff < 0) {
              badge = <span style={S.badge("rgba(239,68,68,0.1)", "#ef4444")}>VENCIDO {Math.abs(diff)}d</span>
            } else {
              badge = <span style={S.badge("rgba(234,179,8,0.1)", "#92400e")}>Vence {diff}d</span>
            }
          }

          const cancelado = !!m.cancelado
          const seleccionado = seleccionMovs.has(m.id)
          // En modo selección, la fila entera alterna el checkbox (más fácil en
          // pantalla táctil); fuera de ese modo, sigue abriendo el detalle.
          const onClickFila = modoSeleccion
            ? (() => { if (!cancelado) toggleSeleccion(m.id) })
            : (() => setMovDetalle(m))
          return (
            <div
              key={m.id}
              onClick={onClickFila}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 16px", borderBottom: "1px solid #f4f4f5",
                cursor: "pointer", transition: "background 0.1s",
                opacity: cancelado ? 0.6 : 1,
                background: seleccionado ? "rgba(220,38,38,0.04)" : "transparent",
              }}
              onMouseEnter={e => { if (!seleccionado) e.currentTarget.style.background = "#f9f9fa" }}
              onMouseLeave={e => { if (!seleccionado) e.currentTarget.style.background = "transparent" }}
            >
              {/* Checkbox de selección — SOLO visible en modo selección activo. */}
              {modoSeleccion && (
                <div style={{ marginTop: 3, width: 16, flexShrink: 0 }}>
                  {!cancelado && (
                    <input
                      type="checkbox"
                      checked={seleccionado}
                      onClick={e => e.stopPropagation()}
                      onChange={() => toggleSeleccion(m.id)}
                      style={{ width: 15, height: 15, cursor: "pointer" }}
                    />
                  )}
                </div>
              )}
              <div style={{ marginTop: 3 }}>
                {isPago
                  ? <Banknote size={17} style={{ color: cancelado ? "#a1a1aa" : "#16a34a" }} />
                  : <ShoppingCart size={17} style={{ color: semColor }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#18181b", textDecoration: cancelado ? "line-through" : "none" }}>
                    {fmtPeso(m.monto)}
                  </span>
                  {cancelado ? (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
                      background: "rgba(239,68,68,0.1)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.25)",
                    }}>
                      Cancelado
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0,
                      background: isPago ? "rgba(22,163,74,0.1)" : m.tipo === "cancelacion" ? "rgba(239,68,68,0.1)" : "rgba(249,99,2,0.1)",
                      color:      isPago ? "#16a34a"              : m.tipo === "cancelacion" ? "#dc2626"             : "#c75000",
                      border: `1px solid ${isPago ? "rgba(22,163,74,0.25)" : m.tipo === "cancelacion" ? "rgba(239,68,68,0.25)" : "rgba(249,99,2,0.25)"}`,
                    }}>
                      {isPago ? "Abono" : m.tipo === "cancelacion" ? "Cancelación" : "Compra"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#71717a", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.descripcion}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 12, color: "#a1a1aa" }}>
                  <span>{fmtFecha(m.fecha)}</span>
                  {m.folio && <span>{m.folio}</span>}
                  <span style={{ color: "#F96302", fontSize: 11 }}>
                    {isPago ? "Ver aplicación →" : "Ver ticket →"}
                  </span>
                </div>
              </div>
              {/* Reimprimir recibo del abono (solo pagos vigentes, fuera del modo selección). */}
              {isPago && !cancelado && !modoSeleccion && (
                <button
                  title="Reimprimir recibo de abono"
                  onClick={(e) => { e.stopPropagation(); handleReimprimirAbono(m) }}
                  style={{
                    background: "transparent", border: "1px solid #e4e4e7", borderRadius: 6,
                    padding: "5px 7px", cursor: "pointer", color: "#71717a", flexShrink: 0,
                    display: "flex", alignItems: "center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#F96302"; e.currentTarget.style.color = "#F96302" }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e4e4e7"; e.currentTarget.style.color = "#71717a" }}
                >
                  <Printer size={15} />
                </button>
              )}
              {!isPago && !modoSeleccion && (
                <SemaforoDot color={m._semaforo} size={10} />
              )}
            </div>
          )
        })}
        </div>
      </div>
    )
  }

  function renderAbono() {
    if (!selPortfolio) return null
    const { movimientosConEstado, plazo } = selPortfolio
    const comprasPendientes = movimientosConEstado.filter(
      m => m.tipo === "compra" && !m.cancelado && m._estado !== "pagado"
    )

    return (
      <div style={{ padding: "14px", overflowY: "auto", flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b", marginBottom: 12 }}>Registrar abono</div>

        <div style={S.fieldGroup}>
          <label style={S.label}>Monto del abono (MXN) *</label>
          <input
            type="number" min="1" step="0.01"
            style={{ ...S.input, fontSize: 16, fontWeight: 700 }}
            placeholder="0.00"
            value={abonoForm.monto}
            onChange={e => setAbonoForm(f => ({ ...f, monto: e.target.value }))}
          />
        </div>

        <div style={S.fieldGroup}>
          <label style={S.label}>Método de pago</label>
          <select
            style={S.select}
            value={abonoForm.metodo}
            onChange={e => setAbonoForm(f => ({ ...f, metodo: e.target.value }))}
          >
            <option>Efectivo</option>
            <option>Transferencia SPEI</option>
            <option>Cheque</option>
            <option>Tarjeta débito</option>
            <option>Tarjeta crédito</option>
          </select>
        </div>

        <div style={S.fieldGroup}>
          <label style={S.label}>Fecha del abono</label>
          <input
            type="date"
            style={S.input}
            value={abonoForm.fecha}
            onChange={e => setAbonoForm(f => ({ ...f, fecha: e.target.value }))}
          />
        </div>

        <div style={S.fieldGroup}>
          <label style={S.label}>Nota (opcional)</label>
          <input
            style={S.input}
            placeholder="Referencia, número de transferencia…"
            value={abonoForm.nota}
            onChange={e => setAbonoForm(f => ({ ...f, nota: e.target.value }))}
          />
        </div>

        <div style={S.fieldGroup}>
          <label style={S.label}>Aplicar a</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="radio" value="fifo"
              checked={abonoForm.aplicarA === "fifo"}
              onChange={() => setAbonoForm(f => ({ ...f, aplicarA: "fifo", movEspecifico: "" }))}
            />
            <span style={{ fontSize: 13 }}>Automático — FIFO (deuda más antigua primero)</span>
          </label>
          {comprasPendientes.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="radio" value="especifico"
                checked={abonoForm.aplicarA === "especifico"}
                onChange={() => setAbonoForm(f => ({ ...f, aplicarA: "especifico" }))}
              />
              <span style={{ fontSize: 13 }}>Movimiento específico</span>
            </label>
          )}
          {abonoForm.aplicarA === "especifico" && comprasPendientes.length > 0 && (
            <select
              style={{ ...S.select, marginTop: 8 }}
              value={abonoForm.movEspecifico}
              onChange={e => setAbonoForm(f => ({ ...f, movEspecifico: e.target.value }))}
            >
              <option value="">— Seleccionar movimiento —</option>
              {comprasPendientes.map(m => (
                <option key={m.id} value={m.id}>
                  {fmtFecha(m.fecha)} — {fmtPeso(m.monto)} — {m.folio ?? "s/folio"}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          style={{
            ...S.btnPrimary, width: "100%", justifyContent: "center",
            opacity: Number(abonoForm.monto) > 0 ? 1 : 0.45,
          }}
          disabled={!Number(abonoForm.monto)}
          onClick={() => setShowAbonoConfirm(true)}
        >
          <Check size={15} /> Confirmar abono {abonoForm.monto ? fmtPeso(Number(abonoForm.monto)) : ""}
        </button>
      </div>
    )
  }

  function renderNotas() {
    if (!selPortfolio) return null
    const notas = [...(selPortfolio.notas ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora))

    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px 0", display: "flex", justifyContent: "flex-end" }}>
          <button
            style={S.btnPrimary}
            onClick={() => setAddingNota(v => !v)}
          >
            <Plus size={14} /> Nueva nota
          </button>
        </div>

        {addingNota && (
          <div style={{ margin: "10px 14px", padding: "10px 12px", background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8 }}>
            <textarea
              style={{ ...S.input, height: 72, resize: "vertical", marginBottom: 8 }}
              placeholder="Escribe una nota sobre este cliente…"
              value={nuevaNota}
              onChange={e => setNuevaNota(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btnSecondary} onClick={() => { setAddingNota(false); setNuevaNota("") }}>Cancelar</button>
              <button
                style={{ ...S.btnPrimary, opacity: nuevaNota.trim() ? 1 : 0.45 }}
                disabled={!nuevaNota.trim()}
                onClick={handleAgregarNota}
              >
                <Check size={13} /> Guardar nota
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
          {notas.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#a1a1aa", fontSize: 13 }}>
              Sin notas. Agrega una para registrar gestiones de cobro.
            </div>
          ) : notas.map(n => (
            <div key={n.id} style={{
              borderBottom: "1px solid #f4f4f5",
              padding: "10px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#F96302" }}>{n.autor}</span>
                <span style={{ fontSize: 11, color: "#a1a1aa" }}>{fmtFecha(n.fecha)} {n.hora}</span>
              </div>
              <p style={{ fontSize: 13, color: "#18181b", lineHeight: 1.5, margin: 0 }}>{n.texto}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* ── Keyframe styles (injected once) ───────────────────────────────── */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .cc-row:hover { background: #f9f9fa !important; cursor: pointer; }
        .cc-row.selected { background: rgba(249,99,2,0.05) !important; border-left: 3px solid #F96302 !important; }
        .cc-th-btn:hover { color: #18181b !important; }
      `}</style>

      {/* ── KPI BAR ──────────────────────────────────────────────────────── */}
      <div style={S.kpiBar}>
        {[
          {
            label: "Cartera total",
            value: fmtPeso(kpis.carteraTotal),
            sub: `${portfoliosComputados.filter(p => p.balance > 0).length} clientes activos`,
          },
          {
            label: "Total vencido",
            value: fmtPeso(kpis.totalVencido),
            sub: kpis.carteraTotal > 0 ? `${Math.round((kpis.totalVencido / kpis.carteraTotal) * 100)}% de la cartera` : "0%",
            valueColor: kpis.totalVencido > 0 ? "#ef4444" : "#22c55e",
          },
          {
            label: "Clientes en mora",
            value: kpis.enMora,
            sub: "Con vencimiento vencido",
            valueColor: kpis.enMora > 0 ? "#ef4444" : "#22c55e",
          },
          {
            label: "DSO",
            value: `${kpis.dso}d`,
            sub: "Días promedio de cobro",
            valueColor: kpis.dso > 45 ? "#ef4444" : kpis.dso > 30 ? "#f97316" : "#22c55e",
          },
        ].map((kpi, i) => (
          <div key={i} style={S.kpiCard}>
            <div style={S.kpiLabel}>{kpi.label}</div>
            <div style={{ ...S.kpiValue, color: kpi.valueColor ?? "#18181b" }}>{kpi.value}</div>
            <div style={S.kpiSub}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── EXPIRY BANNER ─────────────────────────────────────────────────── */}
      {!bannerDismissed && vencenProximo.length > 0 && (
        <div style={S.banner}>
          <TriangleAlert size={16} style={{ color: "#d97706", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "#92400e" }}>
            <strong>{vencenProximo.length} cliente{vencenProximo.length > 1 ? "s" : ""}</strong>{" "}
            {vencenProximo.length > 1 ? "vencen" : "vence"} hoy o mañana:{" "}
            {vencenProximo.map(p => p.nombre).join(", ")}
          </span>
          <button style={{ ...S.btnGhost, padding: "2px 4px" }} onClick={() => setBannerDismissed(true)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── MAIN BODY ─────────────────────────────────────────────────────── */}
      <div style={S.body}>

        {/* LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div style={S.leftCol}>
          {/* Buscar cliente */}
          <button
            style={{ ...S.btnSecondary, justifyContent: "center", gap: 6, width: "100%" }}
            onClick={() => setShowBuscarCliente(true)}
          >
            <Search size={14} /> Buscar cliente
          </button>

          {/* Filters */}
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a", marginBottom: 8 }}>Filtros</div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Estado</label>
              <select style={S.select} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="al_dia">Al día</option>
                <option value="por_vencer">Por vencer</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
            <div style={S.fieldGroup}>
              <label style={S.label}>Plazo</label>
              <select style={S.select} value={filtroPlazo} onChange={e => setFiltroPlazo(e.target.value)}>
                <option value="">Todos</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="45">45 días</option>
                <option value="60">60 días</option>
              </select>
            </div>
            <div style={{ ...S.fieldGroup, marginBottom: 0 }}>
              <label style={S.label}>Antigüedad de deuda</label>
              <select style={S.select} value={filtroAntig} onChange={e => setFiltroAntig(e.target.value)}>
                <option value="">Todas</option>
                <option value="menos30">Menos de 30d</option>
                <option value="30a60">30 – 60d</option>
                <option value="mas60">Más de 60d</option>
              </select>
            </div>
          </div>

          {/* Tabs cartera */}
          <div style={S.card}>
            {["activa", "saldo_cero", "inhabilitados"].map(t => {
              const labels = { activa: "Cartera activa", saldo_cero: "Saldo $0", inhabilitados: "Inhabilitados" }
              return (
                <button
                  key={t}
                  onClick={() => setTabCartera(t)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "7px 10px", marginBottom: 2, borderRadius: 6,
                    fontSize: 13, fontWeight: tabCartera === t ? 700 : 400,
                    background: tabCartera === t ? "rgba(249,99,2,0.08)" : "transparent",
                    color: tabCartera === t ? "#F96302" : "#18181b",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {labels[t]}
                </button>
              )
            })}
          </div>

          {/* Habilitar button */}
          <button style={{ ...S.btnPrimary, justifyContent: "center" }} onClick={() => setShowHabilitar(true)}>
            <Plus size={14} /> Habilitar cliente
          </button>
        </div>

        {/* CENTER COLUMN ────────────────────────────────────────────────── */}
        <div style={S.centerCol}>
          {/* Table header */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {[
                  { col: "semaforo",     label: "",             width: 36 },
                  { col: "nombre",       label: "Cliente",      width: "auto" },
                  { col: "limite",       label: "Límite",       width: 110 },
                  { col: "balance",      label: "Saldo",        width: 110 },
                  { col: "totalAbonado", label: "Abonado",      width: 110, title: "Abonado a la deuda actual (compras aún pendientes/parciales, no incluye compras ya liquidadas)" },
                  { col: null,           label: "Disponible",   width: 120 },
                  { col: "diasVence",    label: "Vence en",     width: 130 },
                  { col: null,           label: "Último abono", width: 130 },
                ].map(({ col, label, width, title }, i) => (
                  <th
                    key={i}
                    style={{ ...S.th, width }}
                    onClick={col ? () => handleSort(col) : undefined}
                    title={title}
                  >
                    <span className="cc-th-btn" style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: col ? "pointer" : "default", color: sortCol === col ? "#18181b" : "#71717a" }}>
                      {label} {col && <SortIcon col={col} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
          </table>

          {/* Table body — scrollable */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#a1a1aa", fontSize: 14 }}>
                      {tabCartera === "inhabilitados" ? "Módulo de inhabilitados próximamente" : "Sin clientes que coincidan con los filtros"}
                    </td>
                  </tr>
                ) : listaFiltrada.map(p => (
                  <tr
                    key={p.id}
                    className={`cc-row${selId === p.id ? " selected" : ""}`}
                    onClick={() => { setSelId(p.id); setTab("resumen") }}
                    style={{ borderLeft: "3px solid transparent", transition: "background 0.1s" }}
                  >
                    <td style={{ ...S.td, width: 36, paddingLeft: 12 }}>
                      <SemaforoDot color={p.semaforo} size={11} />
                    </td>
                    <td style={{ ...S.td, overflow: "hidden" }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "#18181b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</div>
                      <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{p.telefono}</div>
                    </td>
                    <td style={{ ...S.td }}>{fmtPeso(p.limite)}</td>
                    <td style={{ ...S.td, fontWeight: 700, fontSize: 15, color: p.balance > 0 ? "#ef4444" : "#16a34a" }}>
                      {fmtPeso(p.balance)}
                    </td>
                    <td style={{ ...S.td, fontWeight: 600, fontSize: 14, color: p.totalAbonado > 0 ? "#16a34a" : "#a1a1aa" }}>
                      {fmtPeso(p.totalAbonado)}
                    </td>
                    <td style={{ ...S.td }}>
                      <div style={{ fontSize: 13, color: "#71717a", marginBottom: 4 }}>
                        {fmtPeso(p.available)}
                      </div>
                      <ProgressBar used={p.balance} total={p.limite} height={5} />
                    </td>
                    <td style={{ ...S.td }}>
                      {diasVenceLabel(p.diasVence)}
                    </td>
                    <td style={{ ...S.td, color: "#71717a" }}>
                      {p.ultimoPago ? fmtFecha(p.ultimoPago.fecha) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div style={{ borderTop: "1px solid #e4e4e7", padding: "6px 12px", fontSize: 12, color: "#71717a", flexShrink: 0 }}>
            {listaFiltrada.length} cliente{listaFiltrada.length !== 1 ? "s" : ""}
            {listaFiltrada.length > 0 && (
              <span style={{ marginLeft: 16 }}>
                Total saldo: <strong style={{ color: "#18181b" }}>
                  {fmtPeso(listaFiltrada.reduce((s, p) => s + p.balance, 0))}
                </strong>
              </span>
            )}
          </div>
        </div>

      </div>

      {/* ── PANEL CLIENTE (modal) ───────────────────────────────────────── */}
      {selPortfolio && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setSelId(null) }}>
          <div style={{
            background: "#fff", borderRadius: 12, width: 740, maxWidth: "96vw",
            height: "92vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)", overflow: "hidden",
            animation: "slideInRight 0.18s ease",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid #e4e4e7", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <SemaforoDot color={selPortfolio.semaforo} size={11} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selPortfolio.nombre}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a" }}>{selPortfolio.telefono} · {selPortfolio.plazo}d plazo</div>
                </div>
                <button style={S.btnGhost} onClick={() => setSelId(null)}><X size={16} /></button>
              </div>
            </div>

            {/* Tab bar */}
            <div style={S.tabBar}>
              {[
                { key: "resumen",     label: "Resumen" },
                { key: "movimientos", label: "Movimientos" },
                { key: "abono",       label: "Abono" },
                { key: "notas",       label: `Notas (${(selPortfolio.notas ?? []).length})` },
              ].map(t => (
                <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {tab === "resumen"     && renderResumen()}
              {tab === "movimientos" && renderMovimientos()}
              {tab === "abono"       && renderAbono()}
              {tab === "notas"       && renderNotas()}
            </div>
          </div>
        </div>
      )}

      {/* ── DETALLE MOVIMIENTO MODALS ───────────────────────────────────── */}
      <DetalleVentaModal
        mov={movDetalle?.tipo !== "pago" ? movDetalle : null}
        onClose={() => setMovDetalle(null)}
      />
      <DetalleAbonoModal
        mov={movDetalle?.tipo === "pago" ? movDetalle : null}
        portfolio={selPortfolio}
        onClose={() => setMovDetalle(null)}
        onAnular={(mov) => { setAnularMovs([mov]); setAnularMotivo("") }}
        onReimprimir={(mov) => { setMovDetalle(null); handleReimprimirAbono(mov) }}
      />

      {/* ── ANULAR/CONDONAR MOVIMIENTO(S) (motivo obligatorio) ──────────── */}
      {anularMovs.length > 0 && (() => {
        const esUno = anularMovs.length === 1
        const unico = esUno ? anularMovs[0] : null
        const totalMonto = anularMovs.reduce((s, m) => s + m.monto, 0)
        const hayCompras = anularMovs.some(m => m.tipo !== "pago")
        const hayAbonos = anularMovs.some(m => m.tipo === "pago")
        const titulo = esUno
          ? (unico.tipo === "pago" ? "Cancelar abono" : "Condonar compra")
          : `Cancelar ${anularMovs.length} movimientos`
        return (
          <div style={{ ...S.overlay, zIndex: 1200 }} onClick={e => { if (e.target === e.currentTarget && !anulando) { setAnularMovs([]); setAnularMotivo("") } }}>
            <div style={{ ...S.modal, width: 460 }}>
              <div style={S.modalHeader}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>{titulo}</div>
                <button style={S.btnGhost} disabled={anulando} onClick={() => { setAnularMovs([]); setAnularMotivo("") }}><X size={16} /></button>
              </div>
              <div style={S.modalBody}>
                <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.22)", borderRadius: 6, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#71717a" }}>
                  {esUno ? (
                    <>
                      Se cancelará {unico.tipo === "pago" ? "el abono" : "la compra"} de{" "}
                      <strong style={{ color: "#dc2626" }}>{fmtPeso(unico.monto)}</strong> del {fmtFecha(unico.fecha)}
                      {unico.folio ? ` (${unico.folio})` : ""}.{" "}
                      {unico.tipo === "pago"
                        ? <>El monto <strong>regresará a la deuda</strong> del cliente.</>
                        : <>La venta <strong>dejará de contar en el saldo</strong> del cliente (se condona/perdona).</>}
                      {" "}No se borra: queda registrado como cancelado.
                    </>
                  ) : (
                    <>
                      Se cancelarán <strong>{anularMovs.length} movimientos</strong> por un total de{" "}
                      <strong style={{ color: "#dc2626" }}>{fmtPeso(totalMonto)}</strong>.
                      {hayCompras && hayAbonos
                        ? " Las compras dejarán de contar en el saldo y los abonos regresarán a la deuda."
                        : hayCompras
                          ? " Las ventas dejarán de contar en el saldo del cliente (se condonan/perdonan)."
                          : " Los montos regresarán a la deuda del cliente."}
                      {" "}Ninguno se borra: quedan registrados como cancelados.
                    </>
                  )}
                </div>
                {!esUno && (
                  <div style={{ border: "1px solid #e4e4e7", borderRadius: 6, marginBottom: 14, maxHeight: 140, overflowY: "auto" }}>
                    {anularMovs.map(m => (
                      <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #f4f4f5" }}>
                        <span style={{ color: "#71717a" }}>
                          {m.tipo === "pago" ? "Abono" : (m.folio || "Compra")} — {fmtFecha(m.fecha)}
                        </span>
                        <strong>{fmtPeso(m.monto)}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <div style={S.fieldGroup}>
                  <label style={S.label}>Motivo de la cancelación *</label>
                  <textarea
                    style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
                    placeholder="Ej. Se condona por acuerdo con el cliente"
                    value={anularMotivo}
                    onChange={e => setAnularMotivo(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div style={S.modalFooter}>
                <button style={S.btnSecondary} disabled={anulando} onClick={() => { setAnularMovs([]); setAnularMotivo("") }}>Volver</button>
                <button
                  style={{ ...S.btnPrimary, background: "#dc2626", opacity: (!anularMotivo.trim() || anulando) ? 0.5 : 1, cursor: (!anularMotivo.trim() || anulando) ? "default" : "pointer" }}
                  disabled={!anularMotivo.trim() || anulando}
                  onClick={handleAnularMovimientos}
                >
                  {anulando ? "Cancelando…" : esUno ? "Confirmar cancelación" : `Cancelar ${anularMovs.length} movimientos`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MODALS ──────────────────────────────────────────────────────── */}

      <BuscarClienteModal
        open={showBuscarCliente}
        onClose={() => setShowBuscarCliente(false)}
        onSelect={id => { setSelId(id); setTab("resumen") }}
        portfolios={portfoliosComputados}
        clientesLS={clientesLS}
      />

      <EliminarCuentaModal
        open={showEliminar}
        portfolio={selPortfolio}
        onClose={() => setShowEliminar(false)}
        onConfirm={handleEliminarCuenta}
      />

      <HabilitarClienteModal
        open={showHabilitar}
        onClose={() => setShowHabilitar(false)}
        onHabilitar={handleHabilitar}
      />

      <EditarLimiteModal
        open={showEditarLimite}
        portfolio={selPortfolio}
        onClose={() => setShowEditarLimite(false)}
        onGuardar={handleEditarLimite}
      />

      <ConfirmModal
        open={showAbonoConfirm}
        title="Confirmar abono"
        onConfirm={handleAbonoConfirm}
        onCancel={() => setShowAbonoConfirm(false)}
        confirmLabel="Registrar abono"
      >
        {selPortfolio && (
          <div>
            <div style={{ marginBottom: 10, fontSize: 14, color: "#18181b" }}>
              ¿Registrar abono de <strong>{fmtPeso(Number(abonoForm.monto))}</strong> para{" "}
              <strong>{selPortfolio.nombre}</strong>?
            </div>
            <div style={{ background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
              <div><span style={{ color: "#71717a" }}>Método: </span><strong>{abonoForm.metodo}</strong></div>
              <div><span style={{ color: "#71717a" }}>Fecha: </span><strong>{fmtFecha(abonoForm.fecha)}</strong></div>
              <div><span style={{ color: "#71717a" }}>Aplicar: </span><strong>{abonoForm.aplicarA === "fifo" ? "FIFO — más antigua primero" : "Movimiento específico"}</strong></div>
              {abonoForm.nota && <div><span style={{ color: "#71717a" }}>Nota: </span>{abonoForm.nota}</div>}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "#71717a" }}>
              Saldo actual: <strong>{fmtPeso(selPortfolio.balance)}</strong> →{" "}
              <strong style={{ color: "#16a34a" }}>
                {fmtPeso(Math.max(0, selPortfolio.balance - Number(abonoForm.monto)))}
              </strong>
            </div>
          </div>
        )}
      </ConfirmModal>

      {/* ── RECIBO DE ABONO (imprimible) ─────────────────────────────────── */}
      {reciboAbono && (
        <ComprobanteAbono
          recibo={reciboAbono}
          negocio={negocioRecibo}
          onCerrar={() => setReciboAbono(null)}
        />
      )}

      {/* ── ESTADO DE CUENTA (imprimible) ────────────────────────────────── */}
      {estadoCuenta && (
        <EstadoCuentaTicket
          data={estadoCuenta}
          negocio={negocioRecibo}
          onCerrar={() => setEstadoCuenta(null)}
        />
      )}

      {/* ── TOAST ───────────────────────────────────────────────────────── */}
      <Toast toast={toast} />
    </div>
  )
}
