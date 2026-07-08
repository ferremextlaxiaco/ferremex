import { useState, useEffect } from "react"
import { listarArticulosDeCatalogo, listarArticulosSinClasificar, buscarArticulosTexto } from "../lib/client"

// Wizard de ASIGNACIÓN MASIVA DE PROVEEDOR — hermano de CatalogosReasignacion.
// Reusa el molde de 3 pasos (Origen → Artículos → Proveedor) pero el destino no
// es depto/marca sino un proveedor del catálogo real (ferremex_proveedores).
// Escribe metadata.proveedor_id + proveedor vía op "assign_proveedor".

const STEP_LABELS = ["Filtrar", "Artículos", "Proveedor"]

function ProgressBar({ step }) {
  return (
    <div className="ctg-reasig-progress">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={n} className="ctg-reasig-step-wrap">
            <div className={`ctg-reasig-step${active ? " active" : ""}${done ? " done" : ""}`}>
              <div className="ctg-reasig-step-num">{done ? "✓" : n}</div>
              <span className="ctg-reasig-step-label">{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`ctg-reasig-step-line${done ? " done" : ""}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CatalogosAsignarProveedor({ depts, cats, marcas, proveedores, onComplete, onCancel }) {
  const [step, setStep] = useState(1)

  // Modo de búsqueda del paso 1: por taxonomía, por "sin proveedor", o por texto.
  const [modo, setModo] = useState("taxonomia") // "taxonomia" | "sin_proveedor" | "texto"
  const [texto, setTexto] = useState("")

  // Paso 1 — filtros de origen (por qué grupo de productos)
  const [srcDep, setSrcDep] = useState("")
  const [srcCat, setSrcCat] = useState("")
  const [srcMar, setSrcMar] = useState("")

  // Paso 2 — artículos + selección
  const [articulos, setArticulos] = useState([])
  const [cargandoArts, setCargandoArts] = useState(false)
  const [errorArts, setErrorArts] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Paso 3 — proveedor destino
  const [provId, setProvId] = useState("")
  const [dstError, setDstError] = useState("")

  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!showConfirm) return
    const fn = (e) => { if (e.key === "Escape") setShowConfirm(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showConfirm])

  // Cascada de origen (Depto→Cat→Marca, igual que el resto del panel)
  const srcCats = cats.filter((c) => c.depId === srcDep)
  const srcMarcas = marcas.filter((m) => m.catId === srcCat)

  const srcDepNombre = depts.find((d) => d.id === srcDep)?.nombre ?? ""
  const srcCatNombre = cats.find((c) => c.id === srcCat)?.nombre ?? ""
  const srcMarNombre = marcas.find((m) => m.id === srcMar)?.nombre ?? ""

  // Filtro por marca en cliente (solo en modo taxonomía; los otros modos ya
  // traen su propio conjunto).
  const articulosFiltrados = (modo === "taxonomia" && srcMarNombre)
    ? articulos.filter((a) => (a.marca ?? "") === srcMarNombre)
    : articulos

  const provNombre = proveedores.find((p) => String(p.id) === provId)?.nombre ?? ""
  const count = selectedIds.size

  async function handleVerArticulos() {
    setCargandoArts(true)
    setErrorArts(null)
    setArticulos([])
    setSelectedIds(new Set())
    try {
      let data
      if (modo === "sin_proveedor") {
        data = await listarArticulosSinClasificar("proveedor")
      } else if (modo === "texto") {
        data = await buscarArticulosTexto(texto)
      } else {
        data = await listarArticulosDeCatalogo(srcDepNombre, srcCatNombre)
      }
      setArticulos(data)
    } catch (e) {
      setErrorArts(e.message ?? "Error al cargar artículos")
    } finally {
      setCargandoArts(false)
    }
    setStep(2)
  }

  function toggleArt(id) {
    setSelectedIds((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleAll() {
    if (selectedIds.size === articulosFiltrados.length && articulosFiltrados.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(articulosFiltrados.map((a) => a.id)))
    }
  }

  function handleConfirm() {
    if (!provId) { setDstError("Selecciona un proveedor"); return }
    setDstError("")
    setShowConfirm(true)
  }

  function handleExecute() {
    onComplete({
      productIds: [...selectedIds],
      proveedorId: provId,
      proveedorNombre: provNombre,
    })
  }

  const srcLabel =
    modo === "sin_proveedor" ? "Sin proveedor asignado"
    : modo === "texto" ? (texto ? `Búsqueda: "${texto}"` : "Búsqueda")
    : ([srcDepNombre, srcCatNombre, srcMarNombre].filter(Boolean).join(" / ") || "Todos")

  return (
    <div className="ctg-reasig-root">
      <ProgressBar step={step} />

      {/* ── Paso 1: filtro de origen ── */}
      {step === 1 && (
        <div className="ctg-reasig-panel">
          <h2 className="ctg-reasig-title">¿A qué artículos les asignas proveedor?</h2>

          {/* Selector de modo: cómo encontrar los productos. "Sin proveedor" y
              "Búsqueda" alcanzan productos aunque no tengan clasificación. */}
          <div className="ctg-modo-tabs" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              ["taxonomia", "Por departamento / categoría"],
              ["sin_proveedor", "Sin proveedor asignado"],
              ["texto", "Buscar por nombre / clave"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={modo === val ? "ar-btn-add" : "ar-btn-action"}
                onClick={() => setModo(val)}
              >
                {label}
              </button>
            ))}
          </div>

          {modo === "taxonomia" && (
            <div className="ctg-reasig-selects">
              <div className="ctg-field">
                <label className="ctg-label">Departamento</label>
                <select
                  className="ctg-input"
                  value={srcDep}
                  onChange={(e) => { setSrcDep(e.target.value); setSrcCat(""); setSrcMar("") }}
                >
                  <option value="">Todos los departamentos</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="ctg-field">
                <label className="ctg-label">Categoría</label>
                <select
                  className="ctg-input"
                  value={srcCat}
                  disabled={!srcDep}
                  onChange={(e) => { setSrcCat(e.target.value); setSrcMar("") }}
                >
                  <option value="">Todas las categorías</option>
                  {srcCats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="ctg-field">
                <label className="ctg-label">Marca (opcional)</label>
                <select
                  className="ctg-input"
                  value={srcMar}
                  disabled={!srcCat || srcMarcas.length === 0}
                  onChange={(e) => setSrcMar(e.target.value)}
                >
                  <option value="">Todas las marcas</option>
                  {srcMarcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
          )}

          {modo === "sin_proveedor" && (
            <p className="ctg-reasig-src-label" style={{ marginBottom: 8 }}>
              Se listarán los artículos que aún <strong>no tienen proveedor</strong> asignado
              (máximo 500 a la vez). Ideal para clasificar los productos importados.
            </p>
          )}

          {modo === "texto" && (
            <div className="ctg-field" style={{ marginBottom: 8 }}>
              <label className="ctg-label">Buscar por nombre, clave o código de barras</label>
              <input
                type="text"
                className="ctg-input"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) handleVerArticulos() }}
                placeholder="Ej: rotoplas, 8862, tubo…"
                autoFocus
              />
              <p className="ctg-reasig-src-label" style={{ marginTop: 6 }}>
                Encuentra el producto aunque no tenga departamento ni proveedor.
              </p>
            </div>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={onCancel}>Cancelar</button>
            <button
              type="button"
              className="ar-btn-add"
              disabled={
                (modo === "taxonomia" && !srcDep && !srcCat) ||
                (modo === "texto" && !texto.trim())
              }
              onClick={handleVerArticulos}
            >
              Ver artículos →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: selección de artículos ── */}
      {step === 2 && (
        <div className="ctg-reasig-panel">
          <div className="ctg-reasig-step2-header">
            <h2 className="ctg-reasig-title" style={{ marginBottom: 0 }}>
              Selecciona los artículos
              {srcLabel !== "Todos" && <span className="ctg-reasig-src-label"> — {srcLabel}</span>}
            </h2>
            <div className="ctg-reasig-sel-badge">{count} seleccionado{count !== 1 ? "s" : ""}</div>
          </div>

          {cargandoArts && (
            <div className="ctg-reasig-loading">
              <div className="ctg-loading-spinner" />
              <span>Cargando artículos…</span>
            </div>
          )}

          {errorArts && !cargandoArts && (
            <div className="ctg-reasig-error" style={{ marginTop: 16 }}>
              Error al cargar artículos: {errorArts}
            </div>
          )}

          {!cargandoArts && !errorArts && articulosFiltrados.length === 0 && (
            <div className="ctg-reasig-empty">
              No se encontraron artículos con los filtros seleccionados.
            </div>
          )}

          {!cargandoArts && articulosFiltrados.length > 0 && (
            <div className="ctg-reasig-table-wrap">
              <table className="ctg-reasig-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={count === articulosFiltrados.length && articulosFiltrados.length > 0}
                        onChange={toggleAll}
                        style={{ accentColor: "var(--at-orange)", cursor: "pointer" }}
                        title="Seleccionar todos"
                      />
                    </th>
                    <th>Clave</th>
                    <th>Descripción</th>
                    <th>Marca</th>
                    <th>Proveedor actual</th>
                    <th style={{ textAlign: "right" }}>Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {articulosFiltrados.map((a) => (
                    <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => toggleArt(a.id)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleArt(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ accentColor: "var(--at-orange)", cursor: "pointer" }}
                        />
                      </td>
                      <td><span className="ctg-art-clave">{a.clave}</span></td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={a.descripcion}>{a.descripcion}</td>
                      <td>{a.marca || <span style={{ color: "var(--at-text-muted)" }}>—</span>}</td>
                      <td>{a.proveedor || <span style={{ color: "var(--at-text-muted)" }}>— sin asignar</span>}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{a.existencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={() => setStep(1)}>← Volver</button>
            <button
              type="button"
              className="ar-btn-add"
              disabled={count === 0}
              onClick={() => { setProvId(""); setDstError(""); setStep(3) }}
            >
              Continuar con {count} artículo{count !== 1 ? "s" : ""} →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: elegir proveedor ── */}
      {step === 3 && (
        <div className="ctg-reasig-panel">
          <h2 className="ctg-reasig-title">¿Qué proveedor les asignas?</h2>
          <div className="ctg-reasig-selects">
            <div className="ctg-field" style={{ gridColumn: "1 / -1" }}>
              <label className="ctg-label">Proveedor</label>
              <select
                className="ctg-input"
                value={provId}
                onChange={(e) => { setProvId(e.target.value); setDstError("") }}
              >
                <option value="">Seleccionar proveedor…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.num_proveedor ? ` (#${p.num_proveedor})` : ""}</option>
                ))}
              </select>
              {proveedores.length === 0 && (
                <p className="ctg-reasig-error">No hay proveedores en el catálogo. Da de alta proveedores en el módulo de Proveedores primero.</p>
              )}
            </div>
          </div>

          {dstError && <p className="ctg-reasig-error">{dstError}</p>}

          {provId && (
            <div className="ctg-reasig-summary">
              <p className="ctg-reasig-summary-count">
                {count} artículo{count !== 1 ? "s" : ""} quedarán con proveedor
              </p>
              <div className="ctg-reasig-summary-arrow">
                <span className="ctg-reasig-summary-tag">{srcLabel}</span>
                <span className="ctg-reasig-summary-arrow-icon">→</span>
                <span className="ctg-reasig-summary-tag">{provNombre}</span>
              </div>
            </div>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={() => setStep(2)}>← Volver</button>
            <button type="button" className="ar-btn-add" onClick={handleConfirm} disabled={!provId}>
              Asignar proveedor
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmación final ── */}
      {showConfirm && (
        <div className="ctg-overlay" onClick={() => setShowConfirm(false)}>
          <div className="ctg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ctg-modal-header">
              <div className="ctg-modal-stripe" style={{ background: "#EA580C" }} />
              <span className="ctg-modal-title">¿Asignar proveedor a {count} artículo{count !== 1 ? "s" : ""}?</span>
            </div>
            <div className="ctg-modal-body">
              <p className="ctg-modal-body-text">
                Se asignará el proveedor <strong>{provNombre}</strong> a <strong>{count}</strong> artículo{count !== 1 ? "s" : ""}
                {srcLabel !== "Todos" && <> de <strong>{srcLabel}</strong></>}. Reemplaza el proveedor anterior si lo tenían.
              </p>
            </div>
            <div className="ctg-modal-footer">
              <button type="button" className="ar-btn-action" onClick={() => setShowConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="ar-btn-add" onClick={handleExecute}>
                Confirmar y asignar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
