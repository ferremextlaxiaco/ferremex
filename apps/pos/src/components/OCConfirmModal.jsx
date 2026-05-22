import { useState } from "react"
import { X, Download, MessageCircle, Mail, Loader } from "lucide-react"

export default function OCConfirmModal({
  open,
  initialProveedor,
  ocNumber,
  onClose,
  onGenerate,
}) {
  const [mostrarPrecios,  setMostrarPrecios]  = useState(true)
  const [mostrarImagenes, setMostrarImagenes] = useState(true)
  const [generating,      setGenerating]      = useState(false)
  const [preview,         setPreview]         = useState(null)   // { oc, blobUrl }
  const [whatsAppTip,     setWhatsAppTip]     = useState(false)

  if (!open) return null

  const isPreview = !!preview

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    try {
      const result = await onGenerate({ proveedor: initialProveedor, mostrarPrecios, mostrarImagenes })
      setPreview(result)
    } catch (err) {
      console.error("Error generando OC:", err)
    } finally {
      setGenerating(false)
    }
  }

  function handleClose() {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
    setGenerating(false)
    onClose()
  }

  function handleDownload() {
    const a = document.createElement("a")
    a.href = preview.blobUrl
    a.download = `${preview.oc}.pdf`
    a.click()
  }

  function handleWhatsApp() {
    // Descarga el PDF automáticamente para que el usuario lo adjunte en WhatsApp
    const a = document.createElement("a")
    a.href = preview.blobUrl
    a.download = `${preview.oc}.pdf`
    a.click()

    // Abre WhatsApp Web directamente al número del proveedor (sin seleccionar contacto)
    setTimeout(() => {
      const msg     = encodeURIComponent(
        `Hola, adjunto la Orden de Compra *${preview.oc}* de Ferremex.\nPor favor confirmar recepción.`
      )
      const telRaw  = initialProveedor?.telefono ?? ""
      const digits  = telRaw.replace(/\D/g, "")
      // Agrega código de país México (52) si no lo tiene ya
      const phone   = digits.length === 10 ? `52${digits}` : digits
      const waUrl   = phone
        ? `https://wa.me/${phone}?text=${msg}`
        : `https://wa.me/?text=${msg}`
      window.open(waUrl, "_blank")
    }, 400)
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Orden de Compra ${preview.oc} – Ferremex`)
    const body    = encodeURIComponent(`Estimado proveedor,\n\nAdjunto encontrará la Orden de Compra ${preview.oc} de Ferremex.\n\nSaludos,\nFerremex`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
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
          borderRadius: 12,
          width:    isPreview ? "min(92vw, 1150px)" : "min(480px, 95vw)",
          height:   isPreview ? "88vh" : "auto",
          maxHeight: isPreview ? "88vh" : "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 72px rgba(0,0,0,0.28)",
          overflow: "hidden",
          transition: "width 0.2s ease",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--at-border)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)" }}>
              {isPreview ? "Orden de Compra" : "Confirmar Orden de Compra"}
            </div>
            {(isPreview ? preview.oc : (ocNumber)) && (
              <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--at-orange)", marginTop: 2 }}>
                {isPreview ? preview.oc : ocNumber}
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
        {isPreview ? (
          /* ── Vista previa ── */
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Panel de acciones */}
            <div style={{
              flex: "0 0 38%",
              display: "flex",
              flexDirection: "column",
              padding: "28px 24px",
              gap: 14,
              borderRight: "1px solid var(--at-border)",
              overflowY: "auto",
            }}>

              {/* Info */}
              <div>
                <div style={{ fontSize: 12, color: "var(--at-text-muted)", marginBottom: 4 }}>Proveedor</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)" }}>
                  {initialProveedor?.nombre ?? "—"}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--at-border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--at-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Acciones
                </div>

                {/* Descargar */}
                <button
                  onClick={handleDownload}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 16px",
                    background: "var(--at-orange)", color: "white",
                    border: "none", borderRadius: "var(--at-radius)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <Download size={16} /> Descargar PDF
                </button>

                {/* WhatsApp */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={handleWhatsApp}
                    onMouseEnter={() => setWhatsAppTip(true)}
                    onMouseLeave={() => setWhatsAppTip(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 16px",
                      background: "#25d366", color: "white",
                      border: "none", borderRadius: "var(--at-radius)",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    <MessageCircle size={16} /> Enviar por WhatsApp
                  </button>
                  {whatsAppTip && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--at-text)", color: "white",
                      padding: "6px 10px", borderRadius: 5, fontSize: 11,
                      whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10,
                    }}>
                      El PDF se descarga automáticamente. En WhatsApp solo adjúntalo con el clip y envía.
                      <div style={{
                        position: "absolute", top: "100%", left: "50%",
                        transform: "translateX(-50%)",
                        borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                        borderTop: "5px solid var(--at-text)",
                      }} />
                    </div>
                  )}
                </div>

                {/* Email */}
                <button
                  onClick={handleEmail}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 16px",
                    background: "transparent", color: "var(--at-text)",
                    border: "1.5px solid var(--at-border)",
                    borderRadius: "var(--at-radius)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    width: "100%",
                  }}
                >
                  <Mail size={16} /> Enviar por Email
                </button>
              </div>

              <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--at-border)" }}>
                <button
                  className="ar-btn-action"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={handleClose}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* PDF iframe */}
            <div style={{ flex: "0 0 62%", background: "#525659", position: "relative" }}>
              <iframe
                src={`${preview.blobUrl}#navpanes=0&toolbar=1`}
                title="Vista previa OC"
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              />
            </div>
          </div>
        ) : (
          /* ── Config inicial ── */
          <div style={{ padding: "20px", overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Proveedor (solo lectura) */}
              {initialProveedor && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: "var(--at-bg-subtle, #f8f8f8)",
                  borderRadius: "var(--at-radius)",
                  border: "1px solid var(--at-border)",
                }}>
                  <span style={{ fontSize: 12, color: "var(--at-text-muted)", minWidth: 72 }}>Proveedor</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--at-text)" }}>
                    {initialProveedor.nombre}
                  </span>
                </div>
              )}

              {/* Toggle imágenes */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--at-text)" }}>Incluir imágenes en el PDF</div>
                  <div style={{ fontSize: 11, color: "var(--at-text-muted)", marginTop: 2 }}>Muestra la foto de cada artículo en la tabla</div>
                </div>
                <button type="button" role="switch" aria-checked={mostrarImagenes}
                  className={`pdx-toggle${mostrarImagenes ? " on" : ""}`}
                  onClick={() => setMostrarImagenes(v => !v)}
                ><span className="pdx-toggle-thumb" /></button>
              </div>

              {/* Toggle precios */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--at-text)" }}>Incluir precio unitario en el PDF</div>
                  <div style={{ fontSize: 11, color: "var(--at-text-muted)", marginTop: 2 }}>Muestra el último precio de compra de cada artículo</div>
                </div>
                <button type="button" role="switch" aria-checked={mostrarPrecios}
                  className={`pdx-toggle${mostrarPrecios ? " on" : ""}`}
                  onClick={() => setMostrarPrecios(v => !v)}
                ><span className="pdx-toggle-thumb" /></button>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer (solo en config) ── */}
        {!isPreview && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--at-border)",
            display: "flex", justifyContent: "flex-end", gap: 8,
            flexShrink: 0,
          }}>
            <button className="ar-btn-action" onClick={handleClose}>Cancelar</button>
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
          </div>
        )}
      </div>
    </div>
  )
}
