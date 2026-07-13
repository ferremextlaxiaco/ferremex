import { useEffect, useRef, useState } from "react"

/**
 * Select con botón "+" para crear una opción nueva al vuelo (Departamento,
 * Categoría o Marca), sin salir del formulario de artículo. `onCrear(nombre)`
 * hace la llamada al backend y debe resolver cuando la taxonomía ya se
 * recargó; el valor se autoselecciona al terminar.
 *
 * Props:
 *  - value, onChange, options ({id,nombre}[]), placeholder — como un select normal.
 *  - disabled / disabledTitle — deshabilita TODO (select + botón), ej. "elige
 *    depto primero" para Categoría/Marca.
 *  - onCrear(nombre): Promise<void> — crea la opción y refresca la taxonomía.
 *  - crearDeshabilitado / crearDeshabilitadoTitle — deshabilita SOLO el botón +
 *    (ej. Marca sin categoría elegida aún, pero el select de marcas ya existentes
 *    puede seguir vacío/deshabilitado por separado).
 */
export function SelectConOpcion({
  value,
  onChange,
  options,
  placeholder = "— Selecciona —",
  disabled = false,
  disabledTitle,
  onCrear,
  crearDeshabilitado = false,
  crearDeshabilitadoTitle,
  valorActualNoListado, // string opcional: valor legacy que ya no está en `options`
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 40)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    function onKey(e) { if (e.key === "Escape") cerrar() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [abierto])

  function cerrar() {
    setAbierto(false)
    setNombre("")
    setError(null)
  }

  async function confirmar() {
    const n = nombre.trim()
    if (!n || guardando) return
    setGuardando(true)
    setError(null)
    try {
      await onCrear(n)
      onChange(n)
      cerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <select
        className="ar-input"
        style={{ flex: 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.nombre}>{o.nombre}</option>
        ))}
        {valorActualNoListado && (
          <option value={valorActualNoListado}>{valorActualNoListado} (actual)</option>
        )}
      </select>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={disabled || crearDeshabilitado}
        title={disabled ? disabledTitle : crearDeshabilitado ? crearDeshabilitadoTitle : "Crear nueva opción"}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, flexShrink: 0, borderRadius: 6, border: "1px solid var(--border, #d1d5db)",
          background: (disabled || crearDeshabilitado) ? "var(--panel-bg, #f4f4f5)" : "rgba(234,88,12,0.08)",
          color: (disabled || crearDeshabilitado) ? "var(--text-muted, #9ca3af)" : "#ea580c",
          cursor: (disabled || crearDeshabilitado) ? "not-allowed" : "pointer",
          fontSize: 18, fontWeight: 700, lineHeight: 1,
        }}
      >
        +
      </button>

      {abierto && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 6200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)" }}
          onClick={cerrar}
        >
          <div
            style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Crear opción nueva</span>
              <button type="button" onClick={cerrar} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, fontWeight: 700 }}>
                ×
              </button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmar()}
              placeholder="Nombre"
              className="ar-input"
              style={{ width: "100%" }}
            />
            {error && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{error}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={cerrar} style={{ padding: "7px 14px", fontSize: 13, borderRadius: 6, border: "none", background: "none", color: "#6b7280", cursor: "pointer" }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={!nombre.trim() || guardando}
                style={{
                  padding: "7px 14px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none",
                  background: "#ea580c", color: "#fff", cursor: (!nombre.trim() || guardando) ? "not-allowed" : "pointer",
                  opacity: (!nombre.trim() || guardando) ? 0.5 : 1,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {guardando ? "Guardando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
