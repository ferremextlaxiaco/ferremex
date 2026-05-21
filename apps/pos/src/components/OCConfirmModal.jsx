import { useState } from "react"
import { X, CheckCircle, MessageCircle, Loader } from "lucide-react"

// ── Helpers ────────────────────────────────────────────────────────────────

function today7() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

// ── Componente ─────────────────────────────────────────────────────────────

export default function OCConfirmModal({
  open,
  proveedores,
  initialProveedor,
  ocNumber,
  onClose,
  onGenerate,
}) {
  const [proveedorId,    setProveedorId]    = useState(initialProveedor?.id ?? "")
  const [fechaEntrega,   setFechaEntrega]   = useState(today7)
  const [mostrarPrecios, setMostrarPrecios] = useState(true)   // default ON
  const [generating,     setGenerating]     = useState(false)
  const [generated,      setGenerated]      = useState(false)
  const [localOcNumber,  setLocalOcNumber]  = useState(null)
  const [whatsAppTip,    setWhatsAppTip]    = useState(false)

  if (!open) return null

  const proveedorSelected = proveedores.find(p => p.id === proveedorId) ?? null

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    try {
      const oc = await onGenerate({
        proveedor:     proveedorSelected,
        fechaEntrega:  fechaEntrega || null,
        mostrarPrecios,
      })
      setLocalOcNumber(oc)
      setGenerated(true)
    } catch (err) {
      console.error("Error generando OC:", err)
    } finally {
      setGenerating(false)
    }
  }

  function handleWhatsApp() {
    const num = localOcNumber || ocNumber || ""
    const msg = encodeURIComponent(`Orden de Compra ${num} - Ferremex`)
    try { window.open(`whatsapp://send?text=${msg}`, "_blank") }
    catch { window.open(`https://web.whatsapp.com/send?text=${msg}`, "_blank") }
  }

  function handleClose() {
    setGenerated(false)
    setGenerating(false)
    setLocalOcNumber(null)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="pdx-modal-overlay"
      style={{ zIndex: 400 }}
      onClick={handleClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--at-bg-panel)",
          borderRadius: 10,
          width: "min(480px, 95vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--at-border)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)" }}>
              {generated ? "PDF generado" : "Confirmar Orden de Compra"}
            </div>
            {!generated && (localOcNumber || ocNumber) && (
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--at-orange)", marginTop: 3 }}>
                {localOcNumber || ocNumber}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            style={{ background: "none", border: "none", color: "var(--at-text-muted)", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "20px", overflowY: "auto" }}>
          {!generated ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Proveedor */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--at-text-soft)" }}>
                  Proveedor <span style={{ color: "var(--at-red, #dc2626)" }}>*</span>
                </label>
                <select
                  value={proveedorId}
                  onChange={e => setProveedorId(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid var(--at-border)", borderRadius: "var(--at-radius)", background: "var(--at-bg-input)", fontSize: 13, color: "var(--at-text)", cursor: "pointer" }}
                >
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Fecha entrega */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--at-text-soft)" }}>
                  Fecha estimada de entrega
                </label>
                <input
                  type="date"
                  value={fechaEntrega}
                  onChange={e => setFechaEntrega(e.target.value)}
                  style={{ padding: "8px 10px", border: "1px solid var(--at-border)", borderRadius: "var(--at-radius)", background: "var(--at-bg-input)", fontSize: 13, color: "var(--at-text)" }}
                />
              </div>

              {/* Toggle precios */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--at-text)" }}>
                    Incluir precio unitario en el PDF
                  </div>
                  <div style={{ fontSize: 11, color: "var(--at-text-muted)", marginTop: 2 }}>
                    Muestra el último precio de compra de cada artículo
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mostrarPrecios}
                  className={`pdx-toggle${mostrarPrecios ? " on" : ""}`}
                  onClick={() => setMostrarPrecios(v => !v)}
                >
                  <span className="pdx-toggle-thumb" />
                </button>
              </div>

            </div>
          ) : (
            /* ── Estado: generado ── */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
              <CheckCircle size={48} style={{ color: "var(--at-green, #16a34a)" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)", marginBottom: 6 }}>
                  PDF generado correctamente
                </div>
                <div style={{ fontSize: 13, color: "var(--at-text-soft)" }}>
                  Se abrió en una nueva pestaña para imprimir o descargar.
                </div>
                {(localOcNumber || ocNumber) && (
                  <div style={{ fontSize: 12, fontFamily: "monospace", color: "var(--at-orange)", marginTop: 6 }}>
                    {localOcNumber || ocNumber}
                  </div>
                )}
              </div>

              {/* Botón WhatsApp */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={handleWhatsApp}
                  onMouseEnter={() => setWhatsAppTip(true)}
                  onMouseLeave={() => setWhatsAppTip(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 18px",
                    border: "1.5px solid var(--at-orange)", borderRadius: "var(--at-radius)",
                    background: "transparent", color: "var(--at-orange)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <MessageCircle size={16} />
                  Enviar por WhatsApp
                </button>
                {whatsAppTip && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--at-text)", color: "white",
                    padding: "6px 10px", borderRadius: 5, fontSize: 11,
                    whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10,
                  }}>
                    Abre WhatsApp. Adjunta el PDF descargado manualmente.
                    <div style={{
                      position: "absolute", top: "100%", left: "50%",
                      transform: "translateX(-50%)",
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: "5px solid var(--at-text)",
                    }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--at-border)",
          display: "flex", justifyContent: "flex-end", gap: 8,
          flexShrink: 0,
        }}>
          {!generated ? (
            <>
              <button className="ar-btn-action" onClick={handleClose}>
                Cancelar
              </button>
              <button
                className="ar-btn-add"
                style={{ background: "var(--at-orange)", borderColor: "var(--at-orange)", minWidth: 130, justifyContent: "center" }}
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating
                  ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Generando PDF…</>
                  : "Generar PDF"
                }
              </button>
            </>
          ) : (
            <button
              className="ar-btn-add"
              style={{ background: "var(--at-orange)", borderColor: "var(--at-orange)" }}
              onClick={handleClose}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
