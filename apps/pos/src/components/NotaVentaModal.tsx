import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X, FileText, Image as ImageIcon, Hash, DollarSign, UserRound,
  StickyNote, Printer, Download, Loader2, AlertTriangle,
} from "lucide-react"
import { generarNotaVentaPdf, type NotaVentaOpts, type VentaResponse } from "../lib/client"

const LS_KEY = "pos_nota_venta_opts"

const DEFAULT_OPTS: NotaVentaOpts = {
  imagen: true, sku: true, precio: true, cliente: true, notas: false, notasTexto: "",
}

/** Carga las preferencias de toggles guardadas (el usuario casi siempre repite formato). */
function loadOpts(): NotaVentaOpts {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_OPTS, ...JSON.parse(raw) }
  } catch { /* corrupto → defaults */ }
  return { ...DEFAULT_OPTS }
}

interface NotaVentaModalProps {
  venta: VentaResponse
  onClose: () => void
  pushToast?: (msg: string, tipo?: "success" | "error" | "info") => void
}

/**
 * Modal de opciones + visor PDF de la NOTA DE VENTA (hoja carta, estética factura,
 * sin sellos fiscales). Dos fases:
 *  1. Opciones — toggles (imagen / SKU / precio / cliente / notas) + campo de notas.
 *  2. Visor — el PDF a pantalla completa con Imprimir / Descargar.
 * Se renderiza con createPortal a document.body para salir por encima del drawer.
 */
export default function NotaVentaModal({ venta, onClose, pushToast }: NotaVentaModalProps) {
  const toast = pushToast ?? (() => {})
  const [opts, setOpts] = useState<NotaVentaOpts>(loadOpts)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const urlRef = useRef<string | null>(null)

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Revoca el object URL al desmontar (evita fugas de memoria del blob).
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const sinCliente = !venta.cliente_id && !venta.cliente_nombre

  function set<K extends keyof NotaVentaOpts>(k: K, v: NotaVentaOpts[K]) {
    setOpts((o) => ({ ...o, [k]: v }))
  }

  async function generar() {
    if (generando) return
    setGenerando(true); setError(null)
    // Persistir preferencias (sin el texto de notas, que es específico de esta nota).
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ...opts, notasTexto: "" })) } catch { /* noop */ }
    try {
      const url = await generarNotaVentaPdf(venta.folio, opts)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setPdfUrl(url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo generar la nota de venta"
      setError(msg); toast(msg, "error")
    } finally {
      setGenerando(false)
    }
  }

  function imprimir() {
    const win = iframeRef.current?.contentWindow
    if (win) { win.focus(); win.print() }
    else toast("No se pudo abrir el diálogo de impresión", "error")
  }

  function descargar() {
    if (!pdfUrl) return
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `nota-${venta.folio}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
  }

  // ── Fase 2: visor PDF a pantalla completa ─────────────────────────────────
  if (pdfUrl) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 4200, background: "rgba(0,0,0,0.55)", display: "flex", flexDirection: "column" }}>
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-900">
            <FileText size={18} className="text-orange-600" /> Nota de venta · {venta.folio}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={imprimir}
              className="inline-flex items-center gap-1.5 bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700">
              <Printer size={16} /> Imprimir
            </button>
            <button onClick={descargar}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              <Download size={16} /> Descargar
            </button>
            <button onClick={onClose} aria-label="Cerrar"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>
        <iframe ref={iframeRef} src={pdfUrl} title={`Nota de venta ${venta.folio}`}
          style={{ flex: 1, width: "100%", border: "none", background: "#525659" }} />
      </div>,
      document.body
    )
  }

  // ── Fase 1: modal de opciones ─────────────────────────────────────────────
  const toggles: { key: keyof NotaVentaOpts; label: string; hint: string; icon: typeof ImageIcon; disabled?: boolean }[] = [
    { key: "imagen", label: "Imagen del producto", hint: "Muestra la miniatura de cada artículo", icon: ImageIcon },
    { key: "sku", label: "Código (SKU)", hint: "Incluye la clave de cada producto", icon: Hash },
    { key: "precio", label: "Precio e importe", hint: "Precio unitario, subtotal, IVA y total", icon: DollarSign },
    { key: "cliente", label: "Datos del cliente", hint: sinCliente ? "Esta venta es a público en general" : "Nombre y RFC del cliente", icon: UserRound, disabled: sinCliente },
  ]

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: "fixed", inset: 0, zIndex: 4200, background: "rgba(0,0,0,0.48)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 60 }}>
      <div className="bg-white rounded-2xl shadow-2xl" style={{ width: "min(420px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <span className="inline-flex items-center gap-2 text-base font-bold text-gray-900">
            <FileText size={18} className="text-orange-600" /> Nota de venta · {venta.folio}
          </span>
          <button onClick={onClose} aria-label="Cerrar"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 mb-3">Personaliza qué incluir en la nota (hoja tamaño carta):</p>

          <div className="flex flex-col gap-1.5">
            {toggles.map((t) => (
              <label key={t.key}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  t.disabled ? "opacity-40 pointer-events-none border-gray-200"
                  : opts[t.key] ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
                }`}>
                <input type="checkbox" checked={!!opts[t.key]} disabled={t.disabled}
                  onChange={(e) => set(t.key, e.target.checked as NotaVentaOpts[typeof t.key])}
                  className="w-4 h-4 accent-orange-600" />
                <t.icon size={16} className={opts[t.key] && !t.disabled ? "text-orange-600" : "text-gray-400"} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">{t.label}</span>
                  <span className="block text-xs text-gray-400">{t.hint}</span>
                </span>
              </label>
            ))}

            {/* Notas / observaciones */}
            <label className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
              opts.notas ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:bg-gray-50"
            }`}>
              <input type="checkbox" checked={opts.notas}
                onChange={(e) => set("notas", e.target.checked)}
                className="w-4 h-4 accent-orange-600" />
              <StickyNote size={16} className={opts.notas ? "text-orange-600" : "text-gray-400"} />
              <span className="flex-1">
                <span className="block text-sm font-medium text-gray-900">Notas / observaciones</span>
                <span className="block text-xs text-gray-400">Texto libre al pie de la nota</span>
              </span>
            </label>
            {opts.notas && (
              <textarea value={opts.notasTexto ?? ""} onChange={(e) => set("notasTexto", e.target.value)}
                placeholder="Ej. Garantía 30 días. Gracias por su compra."
                maxLength={600} rows={2}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none" />
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={generar} disabled={generando}
            className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-60">
            {generando ? <><Loader2 size={16} className="animate-spin" /> Generando…</> : <><FileText size={16} /> Generar nota</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
