// QA REFERENCE — SalesCreditWarning.jsx
// Props: { customer, saleTotal, saleType }
// customer: Cliente object from pos_clientes localStorage
//   Requires: limite_credito (number), dias_credito (number)
//   Computed: balance and overdue are derived from cartera movements (mocked here)
//
// Shows when: customer.limite_credito > 0 AND (available <= 0 OR overdue > 0)
// - saleType="credito" + available < saleTotal → shows blocking options
// - saleType="contado" → informational only
//
// Self-contained — no shared state with CarteraCredito.jsx
// Mock PIN for supervisor override: 1234

import { useState } from "react"
import { TriangleAlert, X, Lock, Check } from "lucide-react"

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeso(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n)
}

// Mock: derive credit status from customer's limite_credito and dias_credito.
// In production this would read from the cartera state/backend.
// For demo, we simulate a customer with 60% balance used and some overdue.
function deriveCreditStatus(customer) {
  if (!customer || !customer.limite_credito) return null
  const limite = customer.limite_credito
  // Simulate: balance is 60% of limit (mock), overdue is 10% if dias_credito < 30
  const balance  = Math.round(limite * 0.6)
  const overdue  = customer.dias_credito < 30 && customer.dias_credito > 0 ? Math.round(limite * 0.1) : 0
  const available = Math.max(0, limite - balance)
  const overdueDays = overdue > 0 ? 35 : 0
  return { limite, balance, available, overdue, overdueDays }
}

// ── PIN Modal ─────────────────────────────────────────────────────────────────

function PinModal({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)

  function handleSubmit() {
    if (pin === "1234") {
      onSuccess()
    } else {
      setError(true)
      setPin("")
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "white", borderRadius: 10, padding: 24, width: 320,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Lock size={18} color="#F96302" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Autorización requerida</span>
        </div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
          Ingresa el PIN de supervisor para continuar la venta a crédito.
        </p>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(false) }}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="••••"
          style={{
            width: "100%", padding: "10px 12px", fontSize: 20, textAlign: "center",
            letterSpacing: 8, border: `1.5px solid ${error ? "#ef4444" : "#ddd"}`,
            borderRadius: 6, outline: "none", marginBottom: 4, boxSizing: "border-box",
          }}
          autoFocus
        />
        {error && (
          <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 8 }}>
            PIN incorrecto. Intenta de nuevo.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600,
            border: "1px solid #ddd", borderRadius: 6, background: "white", cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={pin.length < 4} style={{
            flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600,
            background: pin.length === 4 ? "#F96302" : "#ddd",
            color: pin.length === 4 ? "white" : "#999",
            border: "none", borderRadius: 6, cursor: pin.length === 4 ? "pointer" : "default",
          }}>Autorizar</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * SalesCreditWarning — banner de advertencia de crédito en el módulo de Ventas.
 *
 * Props:
 *   customer   — objeto Cliente de pos_clientes (o null si no hay cliente seleccionado)
 *   saleTotal  — número: monto total de la venta actual (para calcular si excede disponible)
 *   saleType   — "credito" | "contado"
 *   onContinueAsContado — callback cuando usuario elige continuar como contado
 *   onAuthorized        — callback cuando supervisor autoriza con PIN
 */
export function SalesCreditWarning({
  customer,
  saleTotal = 0,
  saleType = "contado",
  onContinueAsContado,
  onAuthorized,
}) {
  const [showPin, setShowPin] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [authorized, setAuthorized] = useState(false)

  if (!customer || !customer.limite_credito || customer.limite_credito === 0) return null
  if (dismissed || authorized) return null

  const credit = deriveCreditStatus(customer)
  if (!credit) return null

  const hasOverdue     = credit.overdue > 0
  const hasNoAvailable = credit.available <= 0
  const exceedsSale    = saleType === "credito" && credit.available < saleTotal

  if (!hasOverdue && !hasNoAvailable && !exceedsSale) return null

  function handleAuthorized() {
    setShowPin(false)
    setAuthorized(true)
    onAuthorized?.()
    // Toast would be shown by parent
  }

  return (
    <>
      {showPin && (
        <PinModal
          onSuccess={handleAuthorized}
          onCancel={() => setShowPin(false)}
        />
      )}

      <div style={{
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 8,
        padding: "12px 14px",
        fontSize: 13,
        position: "relative",
      }}>
        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: "absolute", top: 8, right: 8,
            background: "none", border: "none", cursor: "pointer",
            color: "#9a9a9a", padding: 2,
          }}
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
          <TriangleAlert size={15} color="#f97316" />
          <span style={{ fontWeight: 700, color: "#7c2d12" }}>
            Este cliente tiene crédito limitado
          </span>
        </div>

        {/* Credit summary line */}
        <p style={{ color: "#555", marginBottom: 4 }}>
          Límite: {fmtPeso(credit.limite)} · Saldo actual: {fmtPeso(credit.balance)} · Disponible: {fmtPeso(credit.available)}
        </p>

        {/* Overdue line */}
        {hasOverdue && (
          <p style={{ color: "#dc2626", marginBottom: 4 }}>
            Tiene deuda vencida desde hace {credit.overdueDays} días.
          </p>
        )}

        {/* Sale exceeds available — blocking options for credit sales */}
        {exceedsSale && (
          <>
            <p style={{ color: "#dc2626", marginBottom: 10 }}>
              El monto de esta venta supera el crédito disponible ({fmtPeso(saleTotal - credit.available)} sobre el límite).
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onContinueAsContado?.()}
                style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  background: "white", border: "1px solid #d1d5db",
                  borderRadius: 6, cursor: "pointer", color: "#374151",
                }}
              >
                Continuar como contado
              </button>
              <button
                onClick={() => setShowPin(true)}
                style={{
                  padding: "7px 14px", fontSize: 12, fontWeight: 600,
                  background: "#F96302", color: "white",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Lock size={12} />
                Requiere autorización de supervisor
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default SalesCreditWarning
