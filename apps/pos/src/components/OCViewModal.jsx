import { useState, useEffect } from "react"
import { X, Download, MessageCircle, Mail, Loader } from "lucide-react"
import { generarOCPdf } from "../lib/client"

export default function OCViewModal({ pedido, onClose }) {
  const [blobUrl,    setBlobUrl]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [whatsAppTip,setWhatsAppTip]= useState(false)

  useEffect(() => {
    generarOCPdf({
      rows:           pedido.rows        ?? [],
      freeItems:      pedido.freeItems   ?? [],
      proveedor:      pedido.proveedorData ?? null,
      ocNumber:       pedido.folio,
      fechaEmision:   pedido.fechaEmision,
      mostrarPrecios:  pedido.mostrarPrecios  ?? true,
      mostrarImagenes: pedido.mostrarImagenes ?? true,
    }).then(url => {
      setBlobUrl(url)
      setLoading(false)
    }).catch(err => {
      console.error("Error regenerando PDF:", err)
      setError("No se pudo regenerar el PDF.")
      setLoading(false)
    })
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [])

  function handleDownload() {
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = `${pedido.folio}.pdf`
    a.click()
  }

  function handleWhatsApp() {
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = `${pedido.folio}.pdf`
    a.click()
    setTimeout(() => {
      const msg    = encodeURIComponent(`Orden de Compra ${pedido.folio} - Ferremex`)
      const tel    = (pedido.proveedorData?.telefono ?? "").replace(/\D/g, "")
      const phone  = tel.length === 10 ? `52${tel}` : tel
      const waUrl  = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`
      window.open(waUrl, "_blank")
    }, 400)
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Orden de Compra ${pedido.folio} – Ferremex`)
    const body    = encodeURIComponent(`Estimado proveedor,\n\nAdjunto la Orden de Compra ${pedido.folio} de Ferremex.\n\nSaludos,\nFerremex`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <div className="pdx-modal-overlay" style={{ zIndex: 400 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--at-bg-panel)",
          borderRadius: 12,
          width: loading || error ? "min(420px, 95vw)" : "min(92vw, 1150px)",
          height: loading || error ? "auto" : "88vh",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 72px rgba(0,0,0,0.28)",
          overflow: "hidden",
          transition: "width 0.25s ease",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: "1px solid var(--at-border)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)" }}>
              Orden de Compra
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--at-orange)", marginTop: 2 }}>
              {pedido.folio}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--at-text-muted)", cursor: "pointer", padding: "4px 8px", borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 24px", color: "var(--at-text-muted)", fontSize: 14 }}>
            <Loader size={18} style={{ animation: "spin 1s linear infinite" }} />
            Generando PDF…
          </div>
        ) : error ? (
          <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--at-red, #dc2626)", fontSize: 14 }}>
            {error}
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Panel izquierdo — acciones */}
            <div style={{
              flex: "0 0 38%", display: "flex", flexDirection: "column",
              padding: "28px 24px", gap: 14,
              borderRight: "1px solid var(--at-border)", overflowY: "auto",
            }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--at-text-muted)", marginBottom: 4 }}>Proveedor</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--at-text)" }}>
                  {pedido.proveedor ?? "—"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--at-text-muted)" }}>
                {pedido.fechaEmision} · {(pedido.articulos ?? pedido.rows ?? []).length} artículos
              </div>

              <div style={{ borderTop: "1px solid var(--at-border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--at-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Acciones
                </div>

                <button onClick={handleDownload} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
                  background: "var(--at-orange)", color: "white", border: "none",
                  borderRadius: "var(--at-radius)", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
                }}>
                  <Download size={16} /> Descargar PDF
                </button>

                <div style={{ position: "relative" }}>
                  <button onClick={handleWhatsApp}
                    onMouseEnter={() => setWhatsAppTip(true)}
                    onMouseLeave={() => setWhatsAppTip(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
                      background: "#25d366", color: "white", border: "none",
                      borderRadius: "var(--at-radius)", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
                    }}>
                    <MessageCircle size={16} /> Enviar por WhatsApp
                  </button>
                  {whatsAppTip && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
                      transform: "translateX(-50%)", background: "var(--at-text)", color: "white",
                      padding: "6px 10px", borderRadius: 5, fontSize: 11, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 10,
                    }}>
                      El PDF se descarga. Adjúntalo en WhatsApp.
                      <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                        borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid var(--at-text)" }} />
                    </div>
                  )}
                </div>

                <button onClick={handleEmail} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 16px",
                  background: "transparent", color: "var(--at-text)",
                  border: "1.5px solid var(--at-border)",
                  borderRadius: "var(--at-radius)", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
                }}>
                  <Mail size={16} /> Enviar por Email
                </button>
              </div>

              <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--at-border)" }}>
                <button className="ar-btn-action" style={{ width: "100%", justifyContent: "center" }} onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </div>

            {/* PDF iframe */}
            <div style={{ flex: "0 0 62%", background: "#525659" }}>
              <iframe
                src={`${blobUrl}#navpanes=0&toolbar=1`}
                title="Vista previa OC"
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
