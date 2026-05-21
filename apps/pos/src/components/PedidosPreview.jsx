import { useRef } from "react"
import { X, Printer, MessageSquare, Package } from "lucide-react"

function buildSheetHTML(rows, proveedor, fecha, folio) {
  const totalArts   = rows.length
  const totalPiezas = rows.reduce((s, r) => s + r.cantidad, 0)
  const fechaFmt    = new Date(fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })

  const rowsHTML = rows.map((r, i) => `
    <tr>
      <td class="r">${i + 1}</td>
      <td><div class="pdx-sheet-thumb">IMG</div></td>
      <td style="font-family:monospace;color:#F96302;font-size:11px">${r.clave}</td>
      <td>${r.descripcion}</td>
      <td>${r.unidad}</td>
      <td class="r">${r.cantidad}</td>
    </tr>`).join("")

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Pedido ${folio}</title>
<style>
  body { font-family: "Segoe UI",system-ui,sans-serif; font-size: 13px; color: #1a1a1a; margin: 32px; }
  .header { display: flex; justify-content: space-between; padding-bottom: 14px; border-bottom: 2.5px solid #F96302; margin-bottom: 18px; }
  .logo { font-size: 22px; font-weight: 800; color: #F96302; }
  .sub  { font-size: 11px; color: #666; margin-top: 3px; }
  .right { text-align: right; }
  .title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #333; }
  .folio { font-size: 12px; color: #666; margin-top: 4px; font-family: monospace; }
  .info  { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; padding: 12px 14px; background: #f8f8f8; border-radius: 4px; font-size: 12px; }
  .info-item { display: flex; gap: 8px; }
  .info-label { color: #777; min-width: 70px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #F96302; color: white; padding: 7px 10px; font-weight: 700; font-size: 10px; text-transform: uppercase; text-align: left; }
  th.r, td.r { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #fafafa; }
  .pdx-sheet-thumb { width:28px;height:28px;background:#f0f0f0;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#aaa; }
  .footer { display: flex; justify-content: space-between; margin-top: 18px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 12px; }
</style></head><body>
<div class="header">
  <div><div class="logo">FERREMEX</div><div class="sub">Ferretería Tlaxiaco, Oaxaca</div></div>
  <div class="right"><div class="title">Pedido a Proveedor</div><div class="folio">${folio} · ${fechaFmt}</div></div>
</div>
<div class="info">
  <div class="info-item"><span class="info-label">Proveedor:</span><strong>${proveedor?.nombre ?? "—"}</strong></div>
  <div class="info-item"><span class="info-label">Folio:</span><strong>${folio}</strong></div>
  <div class="info-item"><span class="info-label">Fecha:</span><strong>${fechaFmt}</strong></div>
  <div class="info-item"><span class="info-label">Artículos:</span><strong>${totalArts}</strong></div>
</div>
<table>
  <thead><tr><th class="r">#</th><th></th><th>SKU</th><th>Descripción</th><th>Unidad</th><th class="r">Cant.</th></tr></thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div class="footer">
  <div>Total artículos: <strong>${totalArts}</strong> &nbsp;|&nbsp; Total piezas: <strong>${totalPiezas}</strong></div>
  <div>Firma: ___________________________</div>
</div>
</body></html>`
}

export default function PedidosPreview({ rows, proveedor, fecha, folio, onClose, onShared }) {
  const sheetRef = useRef(null)

  const totalArts   = rows.length
  const totalPiezas = rows.reduce((s, r) => s + r.cantidad, 0)
  const fechaFmt    = fecha
    ? new Date(fecha + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
    : "—"

  function handlePrint() {
    window.print()
  }

  async function handleShare() {
    const html  = buildSheetHTML(rows, proveedor, fecha, folio)
    const blob  = new Blob([html], { type: "text/html" })
    const file  = new File([blob], `Pedido-Ferremex-${folio}.pdf`, { type: "application/pdf" })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Pedido Ferremex",
          text:  `Pedido para surtir – ${proveedor?.nombre ?? ""}`,
        })
        onShared?.()
      } catch (err) {
        if (err.name !== "AbortError") console.warn("share error", err)
      }
    } else {
      // Fallback: download
      const url = URL.createObjectURL(blob)
      const a   = document.createElement("a")
      a.href     = url
      a.download = `Pedido-Ferremex-${folio}.html`
      a.click()
      URL.revokeObjectURL(url)
      onShared?.()
    }
  }

  return (
    <div className="pdx-preview-overlay">
      {/* Toolbar */}
      <div className="pdx-preview-toolbar" style={{ justifyContent: "flex-start" }}>
        <button className="ar-btn-action" onClick={onClose}>
          <X size={14} /> Cerrar
        </button>
        <div className="ar-toolbar-divider" />
        <button className="ar-btn-action" onClick={handlePrint}>
          <Printer size={14} /> Imprimir
        </button>
        <button className="ar-btn-add" onClick={handleShare}>
          <MessageSquare size={14} /> Compartir por WhatsApp
        </button>
      </div>

      {/* Printable sheet */}
      <div className="pdx-preview-body">
        <div className="pdx-sheet" ref={sheetRef}>
          {/* Header */}
          <div className="pdx-sheet-header">
            <div>
              <div className="pdx-sheet-logo">FERREMEX</div>
              <div className="pdx-sheet-sub">Ferretería Tlaxiaco, Oaxaca</div>
            </div>
            <div className="pdx-sheet-right">
              <div className="pdx-sheet-title">Pedido a Proveedor</div>
              <div className="pdx-sheet-folio">{folio} · {fechaFmt}</div>
            </div>
          </div>

          {/* Info grid */}
          <div className="pdx-sheet-info">
            <div className="pdx-sheet-info-item">
              <span className="pdx-sheet-info-label">Proveedor:</span>
              <span className="pdx-sheet-info-val">{proveedor?.nombre ?? "—"}</span>
            </div>
            <div className="pdx-sheet-info-item">
              <span className="pdx-sheet-info-label">Folio:</span>
              <span className="pdx-sheet-info-val">{folio}</span>
            </div>
            <div className="pdx-sheet-info-item">
              <span className="pdx-sheet-info-label">Fecha:</span>
              <span className="pdx-sheet-info-val">{fechaFmt}</span>
            </div>
            <div className="pdx-sheet-info-item">
              <span className="pdx-sheet-info-label">Artículos:</span>
              <span className="pdx-sheet-info-val">{totalArts}</span>
            </div>
          </div>

          {/* Table */}
          <table className="pdx-sheet-table">
            <thead>
              <tr>
                <th style={{ textAlign: "center", width: 28 }}>#</th>
                <th style={{ textAlign: "center", width: 36 }} />
                <th style={{ textAlign: "center" }}>SKU</th>
                <th style={{ textAlign: "center" }}>Descripción</th>
                <th style={{ textAlign: "center" }}>Unidad de medida</th>
                <th style={{ textAlign: "center" }}>Cant. solicitada</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id}>
                  <td style={{ textAlign: "center", color: "#888" }}>{i + 1}</td>
                  <td style={{ textAlign: "center" }}>
                    {row.thumbnail
                      ? <img src={row.thumbnail} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 5 }} />
                      : <div className="pdx-sheet-thumb"><Package size={26} /></div>
                    }
                  </td>
                  <td style={{ textAlign: "center", fontFamily: "monospace", color: "#F96302", fontSize: 17 }}>{row.clave}</td>
                  <td style={{ textAlign: "center" }}>{row.descripcion}</td>
                  <td style={{ textAlign: "center", color: "#666" }}>{row.unidad}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{row.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="pdx-sheet-footer">
            <div className="pdx-sheet-totals">
              <span>Total de artículos: <strong>{totalArts}</strong></span>
              <span>Total de piezas: <strong>{totalPiezas}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
