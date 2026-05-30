import { useState, useRef, useCallback } from "react"
import { listarArticulos, ajustarInventario } from "../lib/client"
import { useToasts } from "../hooks/useToasts"

/**
 * Ajuste masivo de inventario por SKU — módulo React.
 *
 * Reemplaza el viejo `<iframe>` a `/pos/ajuste-inventario.html` (deuda POS-I6):
 * ahora vive dentro de React, con acceso al sistema de toasts y a `client.ts`
 * (`ajustarInventario`). Flujo: buscar → agregar a la tabla → fijar nueva
 * cantidad → confirmar. Advierte si alguna cantidad es negativa.
 */
export function InventarioModule() {
  const { toasts, push } = useToasts()
  const [query, setQuery] = useState("")
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [mostrarResultados, setMostrarResultados] = useState(false)
  // Filas de ajuste: { clave, descripcion, existencia, nueva }
  const [filas, setFilas] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const inputRef = useRef(null)

  const buscar = useCallback(async (q) => {
    const term = q.trim()
    if (!term) { setResultados([]); setMostrarResultados(false); return }
    setBuscando(true)
    try {
      const arts = await listarArticulos(term)
      setResultados(arts.slice(0, 50))
      setMostrarResultados(true)
    } catch (e) {
      push(`Error al buscar: ${e instanceof Error ? e.message : "desconocido"}`, "error")
    } finally {
      setBuscando(false)
    }
  }, [push])

  function agregar(art) {
    if (!art.clave) { push("El artículo no tiene clave/SKU", "error"); return }
    setFilas((prev) => {
      if (prev.some((f) => f.clave === art.clave)) return prev // ya está
      return [
        ...prev,
        {
          clave: art.clave,
          descripcion: art.descripcion,
          existencia: art.existencia ?? 0,
          nueva: String(art.existencia ?? 0),
        },
      ]
    })
    setQuery("")
    setResultados([])
    setMostrarResultados(false)
    inputRef.current?.focus()
  }

  function setNueva(clave, valor) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, nueva: valor } : f)))
  }

  function quitar(clave) {
    setFilas((prev) => prev.filter((f) => f.clave !== clave))
  }

  const filasValidas = filas.filter((f) => f.nueva !== "" && !isNaN(Number(f.nueva)))
  const hayNegativos = filasValidas.some((f) => Number(f.nueva) < 0)
  const hayCambios = filasValidas.some((f) => Number(f.nueva) !== f.existencia)

  function pedirConfirmar() {
    if (!hayCambios) { push("No hay cambios que aplicar", "error"); return }
    setConfirmando(true)
  }

  async function confirmar() {
    setConfirmando(false)
    setGuardando(true)
    try {
      const ajustes = filasValidas
        .filter((f) => Number(f.nueva) !== f.existencia)
        .map((f) => ({ sku: f.clave, nueva_cantidad: Number(f.nueva) }))
      await ajustarInventario(ajustes)
      push(`Inventario ajustado: ${ajustes.length} artículo(s)`, "success")
      setFilas([])
    } catch (e) {
      push(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`, "error")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="inv-root" style={{ display: "flex", flexDirection: "column", height: "100%", padding: 20, gap: 16, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="admin-seccion-titulo" style={{ margin: 0 }}>Ajuste de Inventario</h2>
        <button
          onClick={pedirConfirmar}
          disabled={guardando || !hayCambios}
          style={{
            padding: "9px 20px", background: "#F96302", color: "#fff", border: "none",
            borderRadius: 7, fontWeight: 600, cursor: guardando || !hayCambios ? "default" : "pointer",
            opacity: guardando || !hayCambios ? 0.6 : 1,
          }}
        >
          {guardando ? "Guardando…" : "Confirmar ajuste"}
        </button>
      </div>

      {/* Buscador */}
      <div style={{ position: "relative", maxWidth: 520 }}>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          placeholder="Buscar por nombre, clave o código de barras…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); buscar(e.target.value) }}
          onKeyDown={(e) => { if (e.key === "Enter") buscar(query) }}
          style={{
            width: "100%", padding: "9px 12px", border: "1px solid #d4d4d8",
            borderRadius: 6, fontSize: 13, boxSizing: "border-box",
          }}
        />
        {mostrarResultados && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
              background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
              maxHeight: 320, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
          >
            {buscando ? (
              <p style={{ padding: 12, margin: 0, color: "#71717a", fontSize: 13 }}>Buscando…</p>
            ) : resultados.length === 0 ? (
              <p style={{ padding: 12, margin: 0, color: "#71717a", fontSize: 13 }}>Sin resultados</p>
            ) : (
              resultados.map((a) => (
                <button
                  key={a.id}
                  onClick={() => agregar(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "8px 12px", background: "none", border: "none",
                    borderBottom: "1px solid #f4f4f5", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#71717a", width: 80, flexShrink: 0 }}>
                    {a.clave || "—"}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.descripcion}
                  </span>
                  <span style={{ fontSize: 12, color: "#52525b", flexShrink: 0 }}>
                    Stock: {a.existencia ?? 0}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Tabla de ajuste */}
      <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e4e4e7", borderRadius: 8 }}>
        {filas.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "#71717a", fontSize: 13 }}>
            Usa el buscador para agregar artículos al ajuste.
          </p>
        ) : (
          <table className="admin-tabla" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Clave</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right" }}>Existencia actual</th>
                <th style={{ textAlign: "right" }}>Nueva cantidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const n = Number(f.nueva)
                const invalido = f.nueva === "" || isNaN(n)
                const negativo = !invalido && n < 0
                const cambia = !invalido && n !== f.existencia
                return (
                  <tr key={f.clave} style={{ background: cambia ? "rgba(249,99,2,0.04)" : "transparent" }}>
                    <td style={{ fontFamily: "monospace", fontSize: 11, color: "#71717a" }}>{f.clave}</td>
                    <td>{f.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{f.existencia}</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        type="number"
                        value={f.nueva}
                        onChange={(e) => setNueva(f.clave, e.target.value)}
                        style={{
                          width: 90, textAlign: "right", padding: "5px 8px", fontWeight: 700,
                          border: `1px solid ${negativo || invalido ? "#dc2626" : "#d4d4d8"}`,
                          borderRadius: 4, fontSize: 13,
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => quitar(f.clave)}
                        title="Quitar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", fontSize: 16 }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de confirmación */}
      {confirmando && (
        <div style={overlayStyle} onClick={() => setConfirmando(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Confirmar ajuste de inventario</h3>
            <p style={{ fontSize: 13, color: "#52525b", margin: "0 0 8px" }}>
              Se actualizará el stock de {filasValidas.filter((f) => Number(f.nueva) !== f.existencia).length} artículo(s).
            </p>
            {hayNegativos && (
              <p style={{ fontSize: 13, color: "#dc2626", margin: "0 0 8px", fontWeight: 600 }}>
                ⚠️ Hay cantidades negativas. ¿Seguro que deseas continuar?
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setConfirmando(false)} style={btnCancelStyle}>Cancelar</button>
              <button onClick={confirmar} style={btnConfirmStyle}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 100 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 16px", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600,
              background: t.type === "error" ? "#dc2626" : t.type === "success" ? "#16a34a" : "#3f3f46",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
}
const modalStyle = {
  background: "#fff", borderRadius: 10, padding: 24, width: 420, maxWidth: "90vw",
  boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
}
const btnCancelStyle = {
  padding: "8px 16px", background: "#f4f4f5", border: "1px solid #d4d4d8",
  borderRadius: 7, fontWeight: 600, cursor: "pointer",
}
const btnConfirmStyle = {
  padding: "8px 16px", background: "#F96302", color: "#fff", border: "none",
  borderRadius: 7, fontWeight: 600, cursor: "pointer",
}
