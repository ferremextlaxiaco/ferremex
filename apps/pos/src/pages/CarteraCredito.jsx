// QA REFERENCE — mock customers and states:
// 1. Constructora Martínez — darkred, 65d overdue, $8,750 balance of $15,000
// 2. Distribuidora Tlaxiaco — yellow, expires TODAY, $4,200 balance of $8,000
// 3. Ayuntamiento Tlaxiaco — blue, $0 balance of $50,000
// 4. Ana García López — red, 45d overdue, $3,800 of $5,000
// 5. Materiales Oaxaca — orange, 15d overdue, $6,500 of $12,000
// 6. Mueblería Central — yellow, 4d remaining, $12,000 of $20,000
// 7. Ferretería del Sur — green, 15d remaining, $4,500 of $10,000
// 8. Ing. Carlos Mendoza — yellow, 2d remaining, $3,200 of $6,000

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import {
  ShoppingCart, Banknote, Search, X, Plus, ChevronUp, ChevronDown,
  TriangleAlert, Printer, FileText, Edit, Check,
} from "lucide-react"
import { loadClientes, saveClientes } from "../lib/clientes"

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

function fmtPeso(n) {
  return "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  // Sort all by date ascending (for FIFO)
  const sorted = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))

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
    _estado: estados[m.id] ?? (m.tipo === "pago" ? "pago" : "pendiente"),
    _semaforo: m.tipo === "pago" ? "gray" : semaforoMovimiento(m, plazo),
  }))

  const available = Math.max(0, limite - balance)
  return { balance, available, overdue, movimientosConEstado }
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

// ─────────────────────────────────────────────────────────────────────────────
// Mock portfolio data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PORTFOLIO = [
  {
    id: "port-001",
    clienteId: "demo-001",       // matches CLIENTES_DEMO
    nombre: "Constructora Martínez S.A.",
    telefono: "953 104 2231",
    limite: 15000,
    plazo: 30,
    movimientos: [
      { id: "m001a", tipo: "compra", monto: 4500, fecha: daysAgo(95), folio: "POS-20250919-0022", plazo: 30, descripcion: "Materiales de construcción - lote 1" },
      { id: "m001b", tipo: "pago",   monto: 2000, fecha: daysAgo(88), descripcion: "Abono en efectivo" },
      { id: "m001c", tipo: "compra", monto: 3800, fecha: daysAgo(75), folio: "POS-20250929-0041", plazo: 30, descripcion: "Herramienta eléctrica Truper" },
      { id: "m001d", tipo: "pago",   monto: 1550, fecha: daysAgo(60), descripcion: "Abono transferencia SPEI" },
      { id: "m001e", tipo: "compra", monto: 4000, fecha: daysAgo(50), folio: "POS-20251009-0055", plazo: 30, descripcion: "Varilla corrugada 3/8 × 100 pzas" },
    ],
    notas: [
      { id: "n001a", fecha: daysAgo(10), hora: "10:15", autor: "Andrés", texto: "Se habló con el gerente de obra, prometieron liquidar el saldo esta semana." },
      { id: "n001b", fecha: daysAgo(5),  hora: "16:42", autor: "Andrés", texto: "No se presentaron. Llamar de nuevo el lunes." },
      { id: "n001c", fecha: daysAgo(2),  hora: "09:00", autor: "Andrés", texto: "Enviar estado de cuenta por WhatsApp — coordinado con Andrés." },
    ],
    historialLimite: [
      { id: "hl001a", fecha: daysAgo(180), usuario: "Andrés", anterior: 0, nuevo: 10000, nota: "Alta de crédito inicial" },
      { id: "hl001b", fecha: daysAgo(90),  usuario: "Andrés", anterior: 10000, nuevo: 15000, nota: "Buen historial en primeros 3 meses" },
    ],
  },
  {
    id: "port-002",
    clienteId: "demo-003",
    nombre: "Distribuidora Tlaxiaco",
    telefono: "953 108 5512",
    limite: 8000,
    plazo: 15,
    movimientos: [
      { id: "m002a", tipo: "compra", monto: 2800, fecha: daysAgo(30), folio: "POS-20251122-0088", plazo: 15, descripcion: "Tornillería y fijaciones" },
      { id: "m002b", tipo: "pago",   monto: 2800, fecha: daysAgo(20), descripcion: "Pago completo compra anterior" },
      { id: "m002c", tipo: "compra", monto: 3200, fecha: daysAgo(15), folio: "POS-20251207-0101", plazo: 15, descripcion: "Pinturas y solventes" },
      { id: "m002d", tipo: "compra", monto: 1000, fecha: daysAgo(15), folio: "POS-20251207-0102", plazo: 15, descripcion: "Brochas y rodillos" },
    ],
    notas: [
      { id: "n002a", fecha: daysAgo(5), hora: "11:30", autor: "Andrés", texto: "Cliente cumplido históricamente — dar seguimiento hoy." },
      { id: "n002b", fecha: daysAgo(1), hora: "09:15", autor: "Andrés", texto: "Confirmaron pago para mañana por transferencia." },
    ],
    historialLimite: [
      { id: "hl002a", fecha: daysAgo(120), usuario: "Andrés", anterior: 0,    nuevo: 8000, nota: "Alta de crédito para distribuidor" },
    ],
  },
  {
    id: "port-003",
    clienteId: "demo-004",
    nombre: "Ayuntamiento de Tlaxiaco",
    telefono: "953 100 0100",
    limite: 50000,
    plazo: 45,
    movimientos: [
      { id: "m003a", tipo: "compra", monto: 18000, fecha: daysAgo(100), folio: "POS-20250912-0010", plazo: 45, descripcion: "Material eléctrico — planta municipal" },
      { id: "m003b", tipo: "pago",   monto: 18000, fecha: daysAgo(80),  descripcion: "Pago vía transferencia bancaria" },
      { id: "m003c", tipo: "compra", monto: 12000, fecha: daysAgo(60),  folio: "POS-20251012-0030", plazo: 45, descripcion: "Tubería PVC y accesorios — red de agua" },
      { id: "m003d", tipo: "pago",   monto: 12000, fecha: daysAgo(20),  descripcion: "Pago por CLC municipal" },
    ],
    notas: [
      { id: "n003a", fecha: daysAgo(30), hora: "14:00", autor: "Andrés", texto: "Cuenta corriente pagada al día. Excelente cliente institucional." },
      { id: "n003b", fecha: daysAgo(15), hora: "10:00", autor: "Andrés", texto: "Coordinado con Tesorería para nuevos pedidos de obra pública." },
      { id: "n003c", fecha: daysAgo(3),  hora: "09:30", autor: "Andrés", texto: "Nuevo proyecto de infraestructura aprobado — posible pedido grande en enero." },
    ],
    historialLimite: [
      { id: "hl003a", fecha: daysAgo(365), usuario: "Andrés", anterior: 0,     nuevo: 30000, nota: "Alta institucional aprobada por gerencia" },
      { id: "hl003b", fecha: daysAgo(200), usuario: "Andrés", anterior: 30000, nuevo: 50000, nota: "Aumento por historial impecable — obras en curso" },
    ],
  },
  {
    id: "port-004",
    clienteId: "port-cli-004",
    nombre: "Ana García López",
    telefono: "953 112 4450",
    limite: 5000,
    plazo: 30,
    movimientos: [
      { id: "m004a", tipo: "compra", monto: 1800, fecha: daysAgo(85), folio: "POS-20250927-0065", plazo: 30, descripcion: "Pinturas vinílicas y lija" },
      { id: "m004b", tipo: "pago",   monto: 800,  fecha: daysAgo(70), descripcion: "Abono parcial en efectivo" },
      { id: "m004c", tipo: "compra", monto: 2800, fecha: daysAgo(60), folio: "POS-20251012-0071", plazo: 30, descripcion: "Materiales de plomería — baño" },
    ],
    notas: [
      { id: "n004a", fecha: daysAgo(15), hora: "13:20", autor: "Andrés", texto: "Dejó recado que viene el fin de semana a abonar." },
      { id: "n004b", fecha: daysAgo(7),  hora: "11:00", autor: "Andrés", texto: "No se presentó. Evaluando suspender crédito si no abona esta semana." },
    ],
    historialLimite: [
      { id: "hl004a", fecha: daysAgo(150), usuario: "Andrés", anterior: 0,    nuevo: 3000, nota: "Alta de crédito para cliente frecuente" },
      { id: "hl004b", fecha: daysAgo(90),  usuario: "Andrés", anterior: 3000, nuevo: 5000, nota: "Ampliación solicitada para remodelación de casa" },
    ],
  },
  {
    id: "port-005",
    clienteId: "port-cli-005",
    nombre: "Materiales Oaxaca S.A.",
    telefono: "951 200 3344",
    limite: 12000,
    plazo: 30,
    movimientos: [
      { id: "m005a", tipo: "compra", monto: 4500, fecha: daysAgo(55), folio: "POS-20251017-0080", plazo: 30, descripcion: "Clavos, alambre y malla" },
      { id: "m005b", tipo: "pago",   monto: 4500, fecha: daysAgo(40), descripcion: "Pago total — cheque" },
      { id: "m005c", tipo: "compra", monto: 3200, fecha: daysAgo(45), folio: "POS-20251027-0090", plazo: 30, descripcion: "Cemento Moctezuma 50 sacos" },
      { id: "m005d", tipo: "compra", monto: 3300, fecha: daysAgo(40), folio: "POS-20251101-0098", plazo: 30, descripcion: "Varilla 1/2 pulgada — 50 pzas" },
      { id: "m005e", tipo: "pago",   monto: 3000, fecha: daysAgo(20), descripcion: "Abono parcial en efectivo" },
    ],
    notas: [
      { id: "n005a", fecha: daysAgo(10), hora: "15:00", autor: "Andrés", texto: "Cliente de fuera de ciudad — acuerdan pagar cuando bajan a Tlaxiaco." },
      { id: "n005b", fecha: daysAgo(4),  hora: "10:30", autor: "Andrés", texto: "Confirmaron visita para el viernes próximo." },
    ],
    historialLimite: [
      { id: "hl005a", fecha: daysAgo(200), usuario: "Andrés", anterior: 0,     nuevo: 10000, nota: "Alta distribuidora regional" },
      { id: "hl005b", fecha: daysAgo(100), usuario: "Andrés", anterior: 10000, nuevo: 12000, nota: "Incremento por volumen de compra mensual" },
    ],
  },
  {
    id: "port-006",
    clienteId: "port-cli-006",
    nombre: "Mueblería Central",
    telefono: "953 105 7788",
    limite: 20000,
    plazo: 30,
    movimientos: [
      { id: "m006a", tipo: "compra", monto: 5000, fecha: daysAgo(45), folio: "POS-20251027-0085", plazo: 30, descripcion: "Selladores y barnices" },
      { id: "m006b", tipo: "pago",   monto: 5000, fecha: daysAgo(30), descripcion: "Pago completo" },
      { id: "m006c", tipo: "compra", monto: 7000, fecha: daysAgo(26), folio: "POS-20251116-0110", plazo: 30, descripcion: "Chapa y herrajes de mueble" },
      { id: "m006d", tipo: "compra", monto: 5000, fecha: daysAgo(26), folio: "POS-20251116-0111", plazo: 30, descripcion: "Tornillería especial importada" },
      { id: "m006e", tipo: "pago",   monto: 0,    fecha: daysAgo(5),  descripcion: "Sin abono registrado aún" },
    ],
    notas: [
      { id: "n006a", fecha: daysAgo(8), hora: "12:00", autor: "Andrés", texto: "Cliente nuevo — primer ciclo de crédito en evaluación." },
      { id: "n006b", fecha: daysAgo(2), hora: "16:00", autor: "Andrés", texto: "Confirmaron pago la próxima semana." },
    ],
    historialLimite: [
      { id: "hl006a", fecha: daysAgo(60), usuario: "Andrés", anterior: 0,     nuevo: 15000, nota: "Alta cliente nuevo con referencias" },
      { id: "hl006b", fecha: daysAgo(30), usuario: "Andrés", anterior: 15000, nuevo: 20000, nota: "Ampliación rápida por buen inicio" },
    ],
  },
  {
    id: "port-007",
    clienteId: "port-cli-007",
    nombre: "Ferretería del Sur",
    telefono: "953 109 2211",
    limite: 10000,
    plazo: 30,
    movimientos: [
      { id: "m007a", tipo: "compra", monto: 3000, fecha: daysAgo(50), folio: "POS-20251022-0075", plazo: 30, descripcion: "Herramienta manual surtida" },
      { id: "m007b", tipo: "pago",   monto: 3000, fecha: daysAgo(35), descripcion: "Pago total puntual" },
      { id: "m007c", tipo: "compra", monto: 2500, fecha: daysAgo(15), folio: "POS-20251207-0120", plazo: 30, descripcion: "Cables y conectores eléctricos" },
      { id: "m007d", tipo: "compra", monto: 2000, fecha: daysAgo(15), folio: "POS-20251207-0121", plazo: 30, descripcion: "Medidores y interruptores" },
    ],
    notas: [
      { id: "n007a", fecha: daysAgo(20), hora: "09:00", autor: "Andrés", texto: "Reventa — compra cada dos semanas, paga puntual." },
      { id: "n007b", fecha: daysAgo(7),  hora: "11:30", autor: "Andrés", texto: "Solicitan aumento de límite para fin de año — evaluar en enero." },
      { id: "n007c", fecha: daysAgo(2),  hora: "14:00", autor: "Andrés", texto: "Pendiente: enviar cotización de cables coaxiales." },
    ],
    historialLimite: [
      { id: "hl007a", fecha: daysAgo(180), usuario: "Andrés", anterior: 0,    nuevo: 8000,  nota: "Alta reventa regional" },
      { id: "hl007b", fecha: daysAgo(90),  usuario: "Andrés", anterior: 8000, nuevo: 10000, nota: "Excelente historial — aumento aprobado" },
    ],
  },
  {
    id: "port-008",
    clienteId: "port-cli-008",
    nombre: "Ing. Carlos Mendoza",
    telefono: "953 111 9900",
    limite: 6000,
    plazo: 30,
    movimientos: [
      { id: "m008a", tipo: "compra", monto: 1500, fecha: daysAgo(55), folio: "POS-20251017-0077", plazo: 30, descripcion: "Plomería de cobre — obra" },
      { id: "m008b", tipo: "pago",   monto: 1500, fecha: daysAgo(40), descripcion: "Pago completo" },
      { id: "m008c", tipo: "compra", monto: 2200, fecha: daysAgo(28), folio: "POS-20251124-0115", plazo: 30, descripcion: "Cableado eléctrico casa habitación" },
      { id: "m008d", tipo: "compra", monto: 1000, fecha: daysAgo(28), folio: "POS-20251124-0116", plazo: 30, descripcion: "Conduit y accesorios eléctricos" },
    ],
    notas: [
      { id: "n008a", fecha: daysAgo(5), hora: "10:45", autor: "Andrés", texto: "Ingeniero de obra — compra por proyecto. Vence pronto." },
      { id: "n008b", fecha: daysAgo(1), hora: "17:00", autor: "Andrés", texto: "Recordatorio enviado por WhatsApp." },
    ],
    historialLimite: [
      { id: "hl008a", fecha: daysAgo(120), usuario: "Andrés", anterior: 0,    nuevo: 5000, nota: "Alta profesional independiente" },
      { id: "hl008b", fecha: daysAgo(60),  usuario: "Andrés", anterior: 5000, nuevo: 6000, nota: "Ampliación menor por proyecto grande" },
    ],
  },
]

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
    textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a",
    borderBottom: "1px solid #e4e4e7", background: "#fafafa", whiteSpace: "nowrap",
    userSelect: "none",
  },
  td: {
    padding: "8px 10px", fontSize: 13, borderBottom: "1px solid #f4f4f5",
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
      const todos = loadClientes()
      setSinCredito(todos.filter(c => (c.limite_credito ?? 0) === 0))
      setSearch("")
      setSelected(null)
      setLimite("")
      setPlazo("30")
      setNota("")
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
  // ── Clientes reales (localStorage) ────────────────────────────────────────
  const [clientesLS, setClientesLS] = useState(() => loadClientes())

  // ── Portfolio state (mock + dinamically added) ────────────────────────────
  const [portfolios, setPortfolios] = useState(MOCK_PORTFOLIO)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selId,           setSelId]           = useState(null)
  const [tab,             setTab]             = useState("resumen")   // resumen|movimientos|abono|notas
  const [tabCartera,      setTabCartera]      = useState("activa")    // activa|saldo_cero|inhabilitados
  const [search,          setSearch]          = useState("")
  const [filtroEstado,    setFiltroEstado]    = useState("")
  const [filtroPlazo,     setFiltroPlazo]     = useState("")
  const [filtroAntig,     setFiltroAntig]     = useState("")
  const [sortCol,         setSortCol]         = useState("semaforo")
  const [sortDir,         setSortDir]         = useState("asc")
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [showHabilitar,    setShowHabilitar]    = useState(false)
  const [showEditarLimite, setShowEditarLimite] = useState(false)
  const [showAbonoConfirm, setShowAbonoConfirm] = useState(false)

  // ── Abono form ────────────────────────────────────────────────────────────
  const [abonoForm, setAbonoForm] = useState({
    monto: "", metodo: "Efectivo", fecha: todayISO(),
    nota: "", aplicarA: "fifo", movEspecifico: "",
  })

  // ── Notas ─────────────────────────────────────────────────────────────────
  const [nuevaNota, setNuevaNota] = useState("")
  const [addingNota, setAddingNota] = useState(false)

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, color = "#16a34a") {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, color })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // ── ESC to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return
      if (showAbonoConfirm) { setShowAbonoConfirm(false); return }
      if (showEditarLimite) { setShowEditarLimite(false); return }
      if (showHabilitar)    { setShowHabilitar(false); return }
      if (selId)            { setSelId(null) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [showAbonoConfirm, showEditarLimite, showHabilitar, selId])

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
      // Last payment
      const pagos = p.movimientos.filter(m => m.tipo === "pago").sort((a, b) => b.fecha.localeCompare(a.fecha))
      const ultimoPago = pagos[0] ?? null
      return { ...p, balance, available, overdue, movimientosConEstado, semaforo, diasVence, ultimoPago }
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
      return s + p.movimientos.filter(m => m.tipo === "compra" && m.fecha >= cutoff).reduce((ss, m) => ss + m.monto, 0)
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

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      lista = lista.filter(p =>
        p.nombre.toLowerCase().includes(q) || p.telefono.includes(q)
      )
    }

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
  }, [portfoliosComputados, tabCartera, search, filtroEstado, filtroPlazo, filtroAntig, sortCol, sortDir])

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
  function handleHabilitar(cliente, limite, plazo, nota) {
    // Update real clientes in localStorage
    const actualizados = clientesLS.map(c => {
      if (c.id !== cliente.id) return c
      return { ...c, limite_credito: limite, dias_credito: plazo }
    })
    saveClientes(actualizados)
    setClientesLS(actualizados)

    // Add to portfolios
    const nuevaEntrada = {
      id: `port-${uuid()}`,
      clienteId: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      limite,
      plazo,
      movimientos: [],
      notas: nota ? [{
        id: uuid(), fecha: todayISO(), hora: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
        autor: "Andrés", texto: nota,
      }] : [],
      historialLimite: [{
        id: uuid(), fecha: todayISO(), usuario: "Andrés",
        anterior: 0, nuevo: limite,
        nota: nota || "Alta de crédito",
      }],
    }
    setPortfolios(prev => [nuevaEntrada, ...prev])
    setShowHabilitar(false)
    setSelId(nuevaEntrada.id)
    setTab("resumen")
    showToast(`Crédito habilitado para ${cliente.nombre} — límite ${fmtPeso(limite)}`)
  }

  // ── Editar límite ─────────────────────────────────────────────────────────
  function handleEditarLimite(nuevoLimite, razon) {
    if (!selPortfolio) return
    // Update localStorage if clienteId exists in real clients
    const clienteReal = clientesLS.find(c => c.id === selPortfolio.clienteId)
    if (clienteReal) {
      const actualizados = clientesLS.map(c =>
        c.id === clienteReal.id ? { ...c, limite_credito: nuevoLimite } : c
      )
      saveClientes(actualizados)
      setClientesLS(actualizados)
    }
    // Update portfolio
    const nuevoHistorial = {
      id: uuid(), fecha: todayISO(), usuario: "Andrés",
      anterior: selPortfolio.limite, nuevo: nuevoLimite, nota: razon,
    }
    setPortfolios(prev => prev.map(p =>
      p.id !== selPortfolio.id ? p : {
        ...p, limite: nuevoLimite,
        historialLimite: [...(p.historialLimite ?? []), nuevoHistorial],
      }
    ))
    setShowEditarLimite(false)
    showToast(`Límite actualizado a ${fmtPeso(nuevoLimite)}`)
  }

  // ── Registrar abono ───────────────────────────────────────────────────────
  function handleAbonoConfirm() {
    if (!selPortfolio) return
    const monto = Number(abonoForm.monto)
    if (!monto || monto <= 0) return

    const nuevoPago = {
      id: uuid(),
      tipo: "pago",
      monto,
      fecha: abonoForm.fecha,
      descripcion: `Abono — ${abonoForm.metodo}${abonoForm.nota ? ` — ${abonoForm.nota}` : ""}`,
      nota: abonoForm.nota,
    }
    setPortfolios(prev => prev.map(p =>
      p.id !== selPortfolio.id ? p : {
        ...p, movimientos: [...p.movimientos, nuevoPago],
      }
    ))
    setShowAbonoConfirm(false)
    setAbonoForm({ monto: "", metodo: "Efectivo", fecha: todayISO(), nota: "", aplicarA: "fifo", movEspecifico: "" })
    setTab("movimientos")
    showToast(`Abono de ${fmtPeso(monto)} registrado correctamente`)
  }

  // ── Agregar nota ──────────────────────────────────────────────────────────
  function handleAgregarNota() {
    if (!selPortfolio || !nuevaNota.trim()) return
    const nota = {
      id: uuid(),
      fecha: todayISO(),
      hora: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      autor: "Andrés",
      texto: nuevaNota.trim(),
    }
    setPortfolios(prev => prev.map(p =>
      p.id !== selPortfolio.id ? p : { ...p, notas: [...(p.notas ?? []), nota] }
    ))
    setNuevaNota("")
    setAddingNota(false)
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
    const pendientes = movimientosConEstado.filter(m => m.tipo === "compra" && m._estado !== "pagado")
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Límite</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtPeso(limite)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Disponible</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#16a34a" }}>{fmtPeso(available)}</div>
            </div>
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#71717a", marginBottom: 4 }}>
              <span>Saldo: <strong style={{ color: "#18181b" }}>{fmtPeso(balance)}</strong></span>
              <span>{limite > 0 ? Math.round((balance / limite) * 100) : 0}% usado</span>
            </div>
            <ProgressBar used={balance} total={limite} height={7} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <div style={{ background: overdue > 0 ? "rgba(239,68,68,0.07)" : "rgba(22,163,74,0.07)", border: `1px solid ${overdue > 0 ? "rgba(239,68,68,0.2)" : "rgba(22,163,74,0.2)"}`, borderRadius: 6, padding: "6px 10px" }}>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>Deuda vencida</div>
              <div style={{ fontWeight: 700, color: overdue > 0 ? "#ef4444" : "#16a34a", fontSize: 15 }}>{fmtPeso(overdue)}</div>
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
            onClick={() => showToast("Próximamente disponible — configura las terminales primero ⚙", "#F96302")}
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

    return (
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

          return (
            <div key={m.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 14px", borderBottom: "1px solid #f4f4f5",
            }}>
              <div style={{ marginTop: 2 }}>
                {isPago
                  ? <Banknote size={15} style={{ color: "#16a34a" }} />
                  : <ShoppingCart size={15} style={{ color: semColor }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
                    {isPago ? fmtPeso(m.monto) : `${fmtPeso(m.monto)}`}
                  </span>
                  {badge}
                </div>
                <div style={{ fontSize: 12, color: "#71717a", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.descripcion}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 11, color: "#a1a1aa" }}>
                  <span>{fmtFecha(m.fecha)}</span>
                  {m.folio && <span>{m.folio}</span>}
                </div>
              </div>
              {!isPago && (
                <SemaforoDot color={m._semaforo} size={9} />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderAbono() {
    if (!selPortfolio) return null
    const { movimientosConEstado, plazo } = selPortfolio
    const comprasPendientes = movimientosConEstado.filter(
      m => m.tipo === "compra" && m._estado !== "pagado"
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
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#71717a" }} />
            <input
              style={{ ...S.input, paddingLeft: 30 }}
              placeholder="Buscar cliente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#71717a", padding: 2 }} onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </div>

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
                  { col: "semaforo", label: "", width: 32 },
                  { col: "nombre",   label: "Cliente",      width: "auto" },
                  { col: "limite",   label: "Límite",       width: 88 },
                  { col: "balance",  label: "Saldo",        width: 88 },
                  { col: null,       label: "Disponible",   width: 96 },
                  { col: "diasVence",label: "Vence en",     width: 100 },
                  { col: null,       label: "Plazo",        width: 60 },
                  { col: null,       label: "Último abono", width: 96 },
                ].map(({ col, label, width }, i) => (
                  <th
                    key={i}
                    style={{ ...S.th, width }}
                    onClick={col ? () => handleSort(col) : undefined}
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
                <col style={{ width: 32 }} />
                <col />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#a1a1aa", fontSize: 13 }}>
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
                    <td style={{ ...S.td, width: 32, paddingLeft: 10 }}>
                      <SemaforoDot color={p.semaforo} />
                    </td>
                    <td style={{ ...S.td, overflow: "hidden" }}>
                      <div style={{ fontWeight: 600, color: "#18181b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: "#a1a1aa" }}>{p.telefono}</div>
                    </td>
                    <td style={{ ...S.td, fontSize: 12 }}>{fmtPeso(p.limite)}</td>
                    <td style={{ ...S.td, fontWeight: 700, fontSize: 13, color: p.balance > 0 ? "#18181b" : "#16a34a" }}>
                      {fmtPeso(p.balance)}
                    </td>
                    <td style={{ ...S.td }}>
                      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 3 }}>
                        {fmtPeso(p.available)}
                      </div>
                      <ProgressBar used={p.balance} total={p.limite} height={4} />
                    </td>
                    <td style={{ ...S.td, fontSize: 12 }}>
                      {diasVenceLabel(p.diasVence)}
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: "#71717a" }}>{p.plazo}d</td>
                    <td style={{ ...S.td, fontSize: 11, color: "#71717a" }}>
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

        {/* RIGHT PANEL ──────────────────────────────────────────────────── */}
        {selPortfolio ? (
          <div style={S.rightPanel}>
            {/* Header */}
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #e4e4e7", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                    <SemaforoDot color={selPortfolio.semaforo} size={10} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selPortfolio.nombre}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a" }}>{selPortfolio.telefono} · {selPortfolio.plazo}d plazo</div>
                </div>
                <button style={S.btnGhost} onClick={() => setSelId(null)}><X size={15} /></button>
              </div>
            </div>

            {/* Tab bar */}
            <div style={S.tabBar}>
              {[
                { key: "resumen",      label: "Resumen" },
                { key: "movimientos",  label: "Movimientos" },
                { key: "abono",        label: "Abono" },
                { key: "notas",        label: `Notas (${(selPortfolio.notas ?? []).length})` },
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
        ) : (
          <div style={{
            ...S.rightPanel,
            alignItems: "center", justifyContent: "center",
            color: "#a1a1aa", fontSize: 13,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💳</div>
              <div>Selecciona un cliente para ver su cartera</div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}

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

      {/* ── TOAST ───────────────────────────────────────────────────────── */}
      <Toast toast={toast} />
    </div>
  )
}
