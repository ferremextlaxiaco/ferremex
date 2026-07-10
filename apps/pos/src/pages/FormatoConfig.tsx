import { useEffect, useState } from "react"
import {
  obtenerTicketConfig,
  guardarTicketConfig,
  migrarTicketConfig,
  type TicketConfig,
  type FormatoDoc,
  type FormatoKey,
} from "../lib/client"

/**
 * Configuración de un documento adicional (Nota de venta / Factura / Cupón).
 * Reutiliza el patrón del tab Ticket: formulario + preview en vivo, persistido
 * en ticket-config.json bajo la sección `formatos`. NO cablea la impresión real
 * (cada documento se imprimirá en una fase posterior con su layout definitivo).
 */
export function FormatoConfig({ formatoKey, label }: { formatoKey: FormatoKey; label: string }) {
  const [config, setConfig] = useState<TicketConfig | null>(null)
  const [doc, setDoc] = useState<FormatoDoc | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    obtenerTicketConfig()
      .then((c) => {
        if (!activo) return
        const migrado = migrarTicketConfig(c)
        setConfig(migrado)
        setDoc(migrado.formatos![formatoKey])
      })
      .catch(() => { if (activo) setError("No se pudo cargar la configuración") })
    return () => { activo = false }
  }, [formatoKey])

  function setField<K extends keyof FormatoDoc>(k: K, v: FormatoDoc[K]) {
    setDoc((d) => (d ? { ...d, [k]: v } : d))
    setGuardado(false)
  }

  function setLineas(campo: "encabezado" | "pie", texto: string) {
    setField(campo, texto.split("\n"))
  }

  async function guardar() {
    if (!config || !doc) return
    setGuardando(true)
    setError(null)
    try {
      const actualizado: TicketConfig = {
        ...config,
        formatos: { ...config.formatos!, [formatoKey]: doc },
      }
      const saved = migrarTicketConfig(await guardarTicketConfig(actualizado))
      setConfig(saved)
      setDoc(saved.formatos![formatoKey])
      setGuardado(true)
    } catch (e) {
      setError("No se pudo guardar: " + (e instanceof Error ? e.message : ""))
    } finally {
      setGuardando(false)
    }
  }

  if (error && !doc) return <p style={{ padding: 24, color: "#dc2626" }}>{error}</p>
  if (!doc) return <p style={{ padding: 24, color: "#71717a" }}>Cargando…</p>

  return (
    <div style={{ display: "flex", gap: 24, padding: 24, height: "100%", boxSizing: "border-box" }}>
      {/* ── Formulario ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Configuración — {label}</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={doc.activo}
              onChange={(e) => setField("activo", e.target.checked)}
            />
            Formato activo
          </label>
        </div>

        <Campo label="Título del documento">
          <input
            style={inputStyle}
            value={doc.titulo}
            onChange={(e) => setField("titulo", e.target.value)}
          />
        </Campo>

        <Campo label="Encabezado (una línea por renglón)">
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            value={doc.encabezado.join("\n")}
            onChange={(e) => setLineas("encabezado", e.target.value)}
          />
        </Campo>

        <Campo label="Pie de página (una línea por renglón)">
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={doc.pie.join("\n")}
            onChange={(e) => setLineas("pie", e.target.value)}
          />
        </Campo>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={doc.mostrar_precios}
              onChange={(e) => setField("mostrar_precios", e.target.checked)}
            />
            Mostrar precios de los artículos
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={doc.mostrar_vigencia}
              onChange={(e) => setField("mostrar_vigencia", e.target.checked)}
            />
            Mostrar vigencia
          </label>
          {doc.mostrar_vigencia && (
            <Campo label="Días de vigencia">
              <input
                type="number"
                min={1}
                style={{ ...inputStyle, width: 120 }}
                value={doc.vigencia_dias || ""}
                onChange={(e) => setField("vigencia_dias", Number(e.target.value))}
              />
            </Campo>
          )}
          {/* Opciones exclusivas de la hoja del repartidor (contra entrega). */}
          {formatoKey === "entrega_repartidor" && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!doc.mostrar_casillas}
                  onChange={(e) => setField("mostrar_casillas", e.target.checked)}
                />
                Casillas para marcar cada artículo entregado
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!doc.mostrar_ficha}
                  onChange={(e) => setField("mostrar_ficha", e.target.checked)}
                />
                Incluir ficha de entrega (dirección, quién recibe, quién paga, comentarios)
              </label>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <button
            onClick={guardar}
            disabled={guardando}
            style={{
              padding: "9px 20px", background: "#F96302", color: "#fff", border: "none",
              borderRadius: 7, fontWeight: 600, cursor: guardando ? "default" : "pointer",
              opacity: guardando ? 0.7 : 1,
            }}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {guardado && <span style={{ color: "#16a34a", fontSize: 13 }}>✓ Guardado</span>}
          {error && <span style={{ color: "#dc2626", fontSize: 13 }}>{error}</span>}
        </div>
      </div>

      {/* ── Preview ────────────────────────────────────────────────── */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#71717a", marginBottom: 8 }}>
          Vista previa
        </p>
        <PreviewDoc doc={doc} />
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#52525b" }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #d4d4d8", borderRadius: 6, fontSize: 13,
  width: "100%", boxSizing: "border-box",
}

/** Maqueta de ticket térmico (58mm) con datos de ejemplo. */
function PreviewDoc({ doc }: { doc: FormatoDoc }) {
  return (
    <div
      style={{
        background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
        padding: "16px 14px", fontFamily: "'Courier New', monospace", fontSize: 11,
        color: "#18181b", lineHeight: 1.45, width: "100%", boxSizing: "border-box",
      }}
    >
      {doc.encabezado.map((l, i) => (
        <p key={i} style={{ margin: 0, textAlign: "center", fontWeight: i === 0 ? 700 : 400 }}>{l}</p>
      ))}
      <p style={{ margin: "8px 0", textAlign: "center", fontWeight: 700, borderTop: "1px dashed #a1a1aa", borderBottom: "1px dashed #a1a1aa", padding: "4px 0" }}>
        {doc.titulo}
      </p>
      <p style={{ margin: "2px 0", color: "#71717a" }}>Folio: EJEMPLO-001</p>
      <p style={{ margin: "2px 0 6px", color: "#71717a" }}>Fecha: 29/05/2026</p>
      <div style={{ borderTop: "1px dashed #a1a1aa", paddingTop: 4 }}>
        <Linea desc="Martillo carpintero" cant={2} precio={doc.mostrar_precios ? "$ 180.00" : ""} />
        <Linea desc="Clavos 2'' (kg)" cant={1} precio={doc.mostrar_precios ? "$ 45.00" : ""} />
      </div>
      {doc.mostrar_precios && (
        <p style={{ margin: "6px 0 2px", textAlign: "right", fontWeight: 700, borderTop: "1px dashed #a1a1aa", paddingTop: 4 }}>
          TOTAL: $ 405.00
        </p>
      )}
      {doc.mostrar_vigencia && doc.vigencia_dias > 0 && (
        <p style={{ margin: "6px 0 0", textAlign: "center", color: "#71717a" }}>
          Vigencia: {doc.vigencia_dias} días
        </p>
      )}
      <div style={{ marginTop: 8, borderTop: "1px dashed #a1a1aa", paddingTop: 6 }}>
        {doc.pie.map((l, i) => (
          <p key={i} style={{ margin: 0, textAlign: "center", color: "#52525b" }}>{l}</p>
        ))}
      </div>
    </div>
  )
}

function Linea({ desc, cant, precio }: { desc: string; cant: number; precio: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cant}× {desc}</span>
      {precio && <span style={{ flexShrink: 0 }}>{precio}</span>}
    </div>
  )
}
