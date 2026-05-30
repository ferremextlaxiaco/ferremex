import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

/**
 * Diálogo de confirmación reutilizable para reemplazar window.confirm/alert
 * (bloqueantes, no estilizados, no accesibles por teclado) en el POS.
 *
 * Props:
 *   open       — visible o no
 *   title      — título
 *   message    — texto del cuerpo
 *   confirmLabel / cancelLabel — etiquetas de los botones
 *   danger     — pinta el botón de confirmar en rojo (acción destructiva)
 *   onConfirm  — callback al confirmar
 *   onClose    — callback al cancelar / cerrar
 */
export default function ConfirmDialog({
  open,
  title = "Confirmar",
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onClose,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === "Escape") onClose()
      else if (e.key === "Enter") onConfirm()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, onConfirm])

  if (!open) return null

  return (
    <div
      className="pdx-modal-overlay"
      style={{ zIndex: 600 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--at-bg-panel, #fff)",
          borderRadius: 12,
          width: "min(420px, 95vw)",
          boxShadow: "0 24px 72px rgba(0,0,0,0.28)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 22px", display: "flex", gap: 14, alignItems: "flex-start" }}>
          {danger && <AlertTriangle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text, #111)", marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 13, color: "var(--at-text-muted, #555)", lineHeight: 1.5 }}>{message}</div>
          </div>
        </div>
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--at-border, #eee)",
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button className="ar-btn-action" onClick={onClose}>{cancelLabel}</button>
          <button
            className="ar-btn-add"
            autoFocus
            style={danger
              ? { background: "#dc2626", borderColor: "#dc2626", minWidth: 110, justifyContent: "center" }
              : { background: "var(--at-orange)", borderColor: "var(--at-orange)", minWidth: 110, justifyContent: "center" }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
