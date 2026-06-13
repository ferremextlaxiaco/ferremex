import { useState, useEffect } from "react"
import { listarArticulosDeCatalogo } from "../lib/client"

// ── Barra de progreso ─────────────────────────────────────────────────────────

const STEP_LABELS = ["Origen", "Artículos", "Destino"]

function ProgressBar({ step }) {
  return (
    <div className="ctg-reasig-progress">
      {STEP_LABELS.map((label, i) => {
        const n      = i + 1
        const active = n === step
        const done   = n < step
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function CatalogosReasignacion({ depts, cats, marcas, onComplete, onCancel }) {
  const [step, setStep] = useState(1)

  // Paso 1 — filtros de origen
  const [srcDep, setSrcDep] = useState("")
  const [srcCat, setSrcCat] = useState("")
  const [srcMar, setSrcMar] = useState("")

  // Paso 2 — artículos cargados y selección
  const [articulos,      setArticulos]      = useState([])
  const [cargandoArts,   setCargandoArts]   = useState(false)
  const [errorArts,      setErrorArts]      = useState(null)
  const [selectedIds,    setSelectedIds]    = useState(new Set())

  // Paso 3 — destino
  const [dstDep,   setDstDep]   = useState("")
  const [dstCat,   setDstCat]   = useState("")
  const [dstMar,   setDstMar]   = useState("")
  const [dstError, setDstError] = useState("")

  // Modal de confirmación final
  const [showConfirm, setShowConfirm] = useState(false)

  // Escape cierra el modal de confirmación final (igual que su clic-fuera/Cancelar).
  useEffect(() => {
    if (!showConfirm) return
    const fn = (e) => { if (e.key === "Escape") setShowConfirm(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showConfirm])

  // Selects en cascada — origen
  const srcCats   = cats.filter(c => c.depId === srcDep)
  const srcMarcas = marcas.filter(m => m.catId === srcCat)

  // Selects en cascada — destino
  const dstCats   = cats.filter(c => c.depId === dstDep)
  const dstMarcas = marcas.filter(m => m.catId === dstCat)

  // Nombres para los filtros seleccionados
  const srcDepNombre = depts.find(d => d.id === srcDep)?.nombre ?? ""
  const srcCatNombre = cats.find(c => c.id === srcCat)?.nombre  ?? ""
  const srcMarNombre = marcas.find(m => m.id === srcMar)?.nombre ?? ""

  // Artículos filtrados por marca (si se especificó)
  const articulosFiltrados = srcMarNombre
    ? articulos.filter(a => (a.marca ?? "") === srcMarNombre)
    : articulos

  // ── Acciones ─────────────────────────────────────────────────────────────────

  async function handleVerArticulos() {
    setCargandoArts(true)
    setErrorArts(null)
    setArticulos([])
    setSelectedIds(new Set())
    try {
      const data = await listarArticulosDeCatalogo(srcDepNombre, srcCatNombre)
      setArticulos(data)
    } catch (e) {
      setErrorArts(e.message ?? "Error al cargar artículos")
    } finally {
      setCargandoArts(false)
    }
    setStep(2)
  }

  function toggleArt(id) {
    setSelectedIds(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  function toggleAll() {
    if (selectedIds.size === articulosFiltrados.length && articulosFiltrados.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(articulosFiltrados.map(a => a.id)))
    }
  }

  function validateDest() {
    if (!dstDep) {
      setDstError("Selecciona un departamento de destino")
      return false
    }
    const dstDepNombre = depts.find(d => d.id === dstDep)?.nombre ?? ""
    const dstCatNombre = cats.find(c => c.id === dstCat)?.nombre  ?? ""
    const dstMarNombre = marcas.find(m => m.id === dstMar)?.nombre ?? ""
    if (srcDepNombre === dstDepNombre && srcCatNombre === dstCatNombre && srcMarNombre === dstMarNombre) {
      setDstError("El destino debe ser diferente al origen")
      return false
    }
    setDstError("")
    return true
  }

  function handleConfirmReasign() {
    if (!validateDest()) return
    setShowConfirm(true)
  }

  function handleExecute() {
    onComplete({
      productIds:      [...selectedIds],
      destDeptNombre:  depts.find(d => d.id === dstDep)?.nombre  ?? "",
      destCatNombre:   cats.find(c  => c.id === dstCat)?.nombre   ?? "",
      destMarcaNombre: marcas.find(m => m.id === dstMar)?.nombre  ?? "",
    })
  }

  // Etiquetas para el resumen
  const srcLabel = [srcDepNombre, srcCatNombre, srcMarNombre].filter(Boolean).join(" / ") || "Todos"
  const dstLabel = [
    depts.find(d => d.id === dstDep)?.nombre,
    cats.find(c => c.id === dstCat)?.nombre,
    marcas.find(m => m.id === dstMar)?.nombre,
  ].filter(Boolean).join(" / ") || "—"

  const count = selectedIds.size

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="ctg-reasig-root">
      <ProgressBar step={step} />

      {/* ── Paso 1: Selección de origen ── */}
      {step === 1 && (
        <div className="ctg-reasig-panel">
          <h2 className="ctg-reasig-title">¿Qué artículos quieres reasignar?</h2>
          <div className="ctg-reasig-selects">
            <div className="ctg-field">
              <label className="ctg-label">Departamento</label>
              <select
                className="ctg-input"
                value={srcDep}
                onChange={e => { setSrcDep(e.target.value); setSrcCat(""); setSrcMar("") }}
              >
                <option value="">Todos los departamentos</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Categoría</label>
              <select
                className="ctg-input"
                value={srcCat}
                disabled={!srcDep}
                onChange={e => { setSrcCat(e.target.value); setSrcMar("") }}
              >
                <option value="">Todas las categorías</option>
                {srcCats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Marca (opcional)</label>
              <select
                className="ctg-input"
                value={srcMar}
                disabled={!srcCat || srcMarcas.length === 0}
                onChange={e => setSrcMar(e.target.value)}
              >
                <option value="">Todas las marcas</option>
                {srcMarcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={onCancel}>Cancelar</button>
            <button
              type="button"
              className="ar-btn-add"
              disabled={!srcDep && !srcCat}
              onClick={handleVerArticulos}
            >
              Ver artículos →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 2: Selección de artículos ── */}
      {step === 2 && (
        <div className="ctg-reasig-panel">
          <div className="ctg-reasig-step2-header">
            <h2 className="ctg-reasig-title" style={{ marginBottom: 0 }}>
              Selecciona los artículos
              {srcLabel !== "Todos" && (
                <span className="ctg-reasig-src-label"> — {srcLabel}</span>
              )}
            </h2>
            <div className="ctg-reasig-sel-badge">{count} seleccionado{count !== 1 ? "s" : ""}</div>
          </div>

          {/* Estado de carga */}
          {cargandoArts && (
            <div className="ctg-reasig-loading">
              <div className="ctg-loading-spinner" />
              <span>Cargando artículos…</span>
            </div>
          )}

          {/* Error */}
          {errorArts && !cargandoArts && (
            <div className="ctg-reasig-error" style={{ marginTop: 16 }}>
              Error al cargar artículos: {errorArts}
            </div>
          )}

          {/* Sin resultados */}
          {!cargandoArts && !errorArts && articulosFiltrados.length === 0 && (
            <div className="ctg-reasig-empty">
              No se encontraron artículos con los filtros seleccionados.
            </div>
          )}

          {/* Tabla */}
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
                    <th>Departamento</th>
                    <th>Categoría</th>
                    <th>Marca</th>
                    <th style={{ textAlign: "right" }}>Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {articulosFiltrados.map(a => (
                    <tr
                      key={a.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleArt(a.id)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleArt(a.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ accentColor: "var(--at-orange)", cursor: "pointer" }}
                        />
                      </td>
                      <td><span className="ctg-art-clave">{a.clave}</span></td>
                      <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={a.descripcion}>{a.descripcion}</td>
                      <td>{a.departamento}</td>
                      <td>{a.categoria}</td>
                      <td>{a.marca || <span style={{ color: "var(--at-text-muted)" }}>—</span>}</td>
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
              onClick={() => { setDstDep(""); setDstCat(""); setDstMar(""); setDstError(""); setStep(3) }}
            >
              Continuar con {count} artículo{count !== 1 ? "s" : ""} →
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: Selección de destino ── */}
      {step === 3 && (
        <div className="ctg-reasig-panel">
          <h2 className="ctg-reasig-title">¿A dónde quieres moverlos?</h2>
          <div className="ctg-reasig-selects">
            <div className="ctg-field">
              <label className="ctg-label">Departamento destino</label>
              <select
                className="ctg-input"
                value={dstDep}
                onChange={e => { setDstDep(e.target.value); setDstCat(""); setDstMar(""); setDstError("") }}
              >
                <option value="">Seleccionar departamento…</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Categoría destino</label>
              <select
                className="ctg-input"
                value={dstCat}
                disabled={!dstDep}
                onChange={e => { setDstCat(e.target.value); setDstMar(""); setDstError("") }}
              >
                <option value="">Seleccionar categoría…</option>
                {dstCats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Marca destino (opcional)</label>
              <select
                className="ctg-input"
                value={dstMar}
                disabled={!dstCat || dstMarcas.length === 0}
                onChange={e => { setDstMar(e.target.value); setDstError("") }}
              >
                <option value="">Sin marca específica</option>
                {dstMarcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          </div>

          {dstError && <p className="ctg-reasig-error">{dstError}</p>}

          {dstDep && (
            <div className="ctg-reasig-summary">
              <p className="ctg-reasig-summary-count">
                {count} artículo{count !== 1 ? "s" : ""} se moverán de
              </p>
              <div className="ctg-reasig-summary-arrow">
                <span className="ctg-reasig-summary-tag">{srcLabel}</span>
                <span className="ctg-reasig-summary-arrow-icon">→</span>
                <span className="ctg-reasig-summary-tag">{dstLabel}</span>
              </div>
            </div>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={() => setStep(2)}>← Volver</button>
            <button type="button" className="ar-btn-add" onClick={handleConfirmReasign}>
              Confirmar reasignación
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de confirmación final ── */}
      {showConfirm && (
        <div className="ctg-overlay" onClick={() => setShowConfirm(false)}>
          <div className="ctg-modal" onClick={e => e.stopPropagation()}>
            <div className="ctg-modal-header">
              <div className="ctg-modal-stripe" style={{ background: "#EA580C" }} />
              <span className="ctg-modal-title">¿Confirmar reasignación masiva?</span>
            </div>
            <div className="ctg-modal-body">
              <p className="ctg-modal-body-text">
                Se reasignarán <strong>{count}</strong> artículo{count !== 1 ? "s" : ""} de
              </p>
              <div className="ctg-reasig-summary" style={{ marginTop: 12 }}>
                <div className="ctg-reasig-summary-arrow">
                  <span className="ctg-reasig-summary-tag">{srcLabel}</span>
                  <span className="ctg-reasig-summary-arrow-icon">→</span>
                  <span className="ctg-reasig-summary-tag">{dstLabel}</span>
                </div>
              </div>
            </div>
            <div className="ctg-modal-footer">
              <button type="button" className="ar-btn-action" onClick={() => setShowConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="ar-btn-add" onClick={handleExecute}>
                Confirmar y reasignar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
