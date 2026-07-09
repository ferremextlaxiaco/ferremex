import { useState, useEffect, useMemo } from "react"
import { Search, X, Check, Loader, ImageOff } from "lucide-react"
import {
  listarArticulosDeCatalogo,
  listarArticulosSinClasificar,
  buscarArticulosTexto,
} from "../lib/client"

// ── Asistente unificado de REASIGNACIÓN MASIVA ─────────────────────────────────
// Encuentra artículos de 3 formas (texto / taxonomía existente / sin clasificar),
// los selecciona con checkbox (selección ACUMULADA entre búsquedas, paginada) y
// les reasigna hasta 4 campos: departamento, categoría, marca y proveedor.

const STEP_LABELS = ["Buscar y seleccionar", "Reasignar"]
const POR_PAGINA = 50

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

export default function CatalogosReasignacion({ depts, cats, marcas, proveedores = [], onComplete, onCancel }) {
  const [step, setStep] = useState(1)

  // ── Modo de búsqueda (paso 1) ──
  const [modo, setModo] = useState("texto") // "texto" | "taxonomia" | "sin"
  const [texto, setTexto] = useState("")
  const [txDep, setTxDep] = useState("")   // taxonomía: depto
  const [txCat, setTxCat] = useState("")   // taxonomía: categoría
  const [txMar, setTxMar] = useState("")   // taxonomía: marca
  const [sinCampo, setSinCampo] = useState("departamento") // sin: qué campo falta

  // Resultados de la búsqueda actual + selección acumulada (Map id → artículo).
  const [resultados, setResultados] = useState([])
  const [cargando, setCargando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState(null)
  const [pagina, setPagina] = useState(0)
  // Selección acumulada: guardamos el artículo completo para poder mostrarlo en
  // el resumen aunque ya no esté en los resultados de la búsqueda actual.
  const [seleccion, setSeleccion] = useState(new Map())

  // ── Destino (paso 2) — los 4 campos, todos opcionales ──
  const [dDep, setDDep] = useState("")   // nombre de depto
  const [dCat, setDCat] = useState("")   // nombre de categoría
  const [dMar, setDMar] = useState("")   // nombre de marca
  const [dProvId, setDProvId] = useState("") // id de proveedor
  const [dstError, setDstError] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!showConfirm) return
    const fn = (e) => { if (e.key === "Escape") setShowConfirm(false) }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showConfirm])

  // Cascada de la taxonomía de ORIGEN
  const txCats = cats.filter((c) => c.depId === txDep)
  const txMarcas = marcas.filter((m) => m.catId === txCat)

  // Cascada del DESTINO (categoría atada al depto elegido)
  const dstDepItem = depts.find((d) => d.nombre === dDep) ?? null
  const dstCats = dstDepItem ? cats.filter((c) => c.depId === dstDepItem.id) : []

  const count = seleccion.size

  // ── Búsqueda ──
  async function buscar() {
    setCargando(true)
    setErrorBusqueda(null)
    setResultados([])
    setPagina(0)
    try {
      let data = []
      if (modo === "texto") {
        data = texto.trim() ? await buscarArticulosTexto(texto) : []
      } else if (modo === "taxonomia") {
        const depN = depts.find((d) => d.id === txDep)?.nombre ?? ""
        const catN = cats.find((c) => c.id === txCat)?.nombre ?? ""
        data = await listarArticulosDeCatalogo(depN, catN)
        const marN = marcas.find((m) => m.id === txMar)?.nombre ?? ""
        if (marN) data = data.filter((a) => (a.marca ?? "") === marN)
      } else if (modo === "sin") {
        data = await listarArticulosSinClasificar(sinCampo)
      }
      setResultados(data)
    } catch (e) {
      setErrorBusqueda(e.message ?? "Error al buscar artículos")
    } finally {
      setCargando(false)
    }
  }

  function toggle(art) {
    setSeleccion((prev) => {
      const s = new Map(prev)
      s.has(art.id) ? s.delete(art.id) : s.set(art.id, art)
      return s
    })
  }

  const paginados = useMemo(
    () => resultados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA),
    [resultados, pagina]
  )
  const totalPaginas = Math.ceil(resultados.length / POR_PAGINA)

  // Selecciona/deselecciona todos los de la página actual.
  const todosPaginaSel = paginados.length > 0 && paginados.every((a) => seleccion.has(a.id))
  function toggleTodosPagina() {
    setSeleccion((prev) => {
      const s = new Map(prev)
      if (todosPaginaSel) paginados.forEach((a) => s.delete(a.id))
      else paginados.forEach((a) => s.set(a.id, a))
      return s
    })
  }

  // ── Destino ──
  function irADestino() {
    setDDep(""); setDCat(""); setDMar(""); setDProvId(""); setDstError("")
    setStep(2)
  }

  function confirmar() {
    if (!dDep && !dCat && !dMar && !dProvId) {
      setDstError("Elige al menos un campo para reasignar")
      return
    }
    setDstError("")
    setShowConfirm(true)
  }

  function ejecutar() {
    const prov = proveedores.find((p) => String(p.id) === dProvId)
    onComplete({
      productIds: [...seleccion.keys()],
      departamento: dDep || undefined,
      categoria: dCat || undefined,
      marca: dMar || undefined,
      proveedorId: dProvId || undefined,
      proveedorNombre: prov?.nombre ?? undefined,
    })
  }

  // Resumen del destino (para el paso 2 y confirmación)
  const destinoChips = [
    dDep && ["Departamento", dDep],
    dCat && ["Categoría", dCat],
    dMar && ["Marca", dMar],
    dProvId && ["Proveedor", proveedores.find((p) => String(p.id) === dProvId)?.nombre ?? ""],
  ].filter(Boolean)

  const puedeBuscar =
    (modo === "texto" && texto.trim()) ||
    (modo === "taxonomia" && (txDep || txCat)) ||
    modo === "sin"

  return (
    <div className="ctg-reasig-root">
      {/* Progreso + contador de selección + volver, en una sola fila */}
      <div className="ctg-reasig-topbar">
        <ProgressBar step={step} />
        {step === 1 && (
          <div className="ctg-reasig-selbar">
            <span className="ctg-reasig-sel-badge">{count} artículo{count !== 1 ? "s" : ""} seleccionado{count !== 1 ? "s" : ""}</span>
            {count > 0 && (
              <button type="button" className="ctg-reasig-sel-clear" onClick={() => setSeleccion(new Map())}>
                Vaciar selección
              </button>
            )}
          </div>
        )}
        <button type="button" className="ar-btn-action ctg-reasig-volver" onClick={onCancel}>
          ← Volver a catálogos
        </button>
      </div>

      {/* ── PASO 1: buscar y seleccionar ── */}
      {step === 1 && (
        <div className="ctg-reasig-panel">
          {/* Modo de búsqueda */}
          <div className="ctg-modo-tabs">
            {[
              ["texto", "Buscar por nombre / clave"],
              ["taxonomia", "Por departamento / marca"],
              ["sin", "Sin clasificar"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={modo === val ? "ar-btn-add" : "ar-btn-action"}
                onClick={() => { setModo(val); setResultados([]); setErrorBusqueda(null) }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Controles según modo */}
          {modo === "texto" && (
            <div className="ctg-reasig-buscador">
              <div className="ctg-reasig-search-input">
                <Search size={16} className="ctg-reasig-search-icon" />
                <input
                  className="ctg-input"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && texto.trim()) buscar() }}
                  placeholder="Ej: codo pvc, 8862, tee…"
                  autoFocus
                />
              </div>
              <button type="button" className="ar-btn-add" disabled={!texto.trim()} onClick={buscar}>
                Buscar
              </button>
            </div>
          )}

          {modo === "taxonomia" && (
            <div className="ctg-reasig-selects">
              <div className="ctg-field">
                <label className="ctg-label">Departamento</label>
                <select className="ctg-input" value={txDep}
                  onChange={(e) => { setTxDep(e.target.value); setTxCat(""); setTxMar("") }}>
                  <option value="">Todos</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
              <div className="ctg-field">
                <label className="ctg-label">Categoría</label>
                <select className="ctg-input" value={txCat} disabled={!txDep}
                  onChange={(e) => { setTxCat(e.target.value); setTxMar("") }}>
                  <option value="">Todas</option>
                  {txCats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="ctg-field">
                <label className="ctg-label">Marca (opcional)</label>
                <select className="ctg-input" value={txMar} disabled={!txCat || txMarcas.length === 0}
                  onChange={(e) => setTxMar(e.target.value)}>
                  <option value="">Todas</option>
                  {txMarcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div className="ctg-field" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="ar-btn-add" onClick={buscar}>Buscar</button>
              </div>
            </div>
          )}

          {modo === "sin" && (
            <div className="ctg-reasig-buscador">
              <div className="ctg-field" style={{ flex: 1 }}>
                <label className="ctg-label">Artículos que NO tienen…</label>
                <select className="ctg-input" value={sinCampo} onChange={(e) => setSinCampo(e.target.value)}>
                  <option value="departamento">Sin departamento</option>
                  <option value="categoria">Sin categoría</option>
                  <option value="marca">Sin marca</option>
                  <option value="proveedor">Sin proveedor</option>
                </select>
              </div>
              <button type="button" className="ar-btn-add" onClick={buscar}>Buscar</button>
            </div>
          )}

          {/* Resultados */}
          {cargando && (
            <div className="ctg-reasig-loading">
              <Loader size={18} className="ctg-spin" /> <span>Buscando…</span>
            </div>
          )}
          {errorBusqueda && !cargando && (
            <div className="ctg-reasig-error" style={{ marginTop: 12 }}>{errorBusqueda}</div>
          )}
          {!cargando && !errorBusqueda && resultados.length === 0 && puedeBuscar && (
            <div className="ctg-reasig-empty">Sin resultados. Ajusta la búsqueda.</div>
          )}

          {!cargando && resultados.length > 0 && (
            <>
              <div className="ctg-reasig-results-head">
                <span>{resultados.length} resultado{resultados.length !== 1 ? "s" : ""}</span>
                <button type="button" className="ctg-reasig-selall" onClick={toggleTodosPagina}>
                  {todosPaginaSel ? "Quitar página" : "Seleccionar página"}
                </button>
              </div>
              <div className="ctg-reasig-table-wrap">
                <table className="ctg-reasig-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }} />
                      <th style={{ width: 48 }} />
                      <th>Clave</th>
                      <th>Descripción</th>
                      <th>Depto</th>
                      <th>Categoría</th>
                      <th>Marca</th>
                      <th>Proveedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginados.map((a) => {
                      const sel = seleccion.has(a.id)
                      return (
                        <tr key={a.id} className={sel ? "ctg-row-sel" : ""} style={{ cursor: "pointer" }} onClick={() => toggle(a)}>
                          <td>
                            <input type="checkbox" checked={sel} onChange={() => toggle(a)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ accentColor: "var(--at-orange)", cursor: "pointer" }} />
                          </td>
                          <td>
                            {a.thumbnail ? (
                              <img src={a.thumbnail} alt="" className="ctg-reasig-thumb" loading="lazy" />
                            ) : (
                              <span className="ctg-reasig-thumb ctg-reasig-thumb--vacio"><ImageOff size={16} /></span>
                            )}
                          </td>
                          <td><span className="ctg-art-clave">{a.clave}</span></td>
                          <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={a.descripcion}>{a.descripcion}</td>
                          <td>{a.departamento || <span className="ctg-muted">—</span>}</td>
                          <td>{a.categoria || <span className="ctg-muted">—</span>}</td>
                          <td>{a.marca || <span className="ctg-muted">—</span>}</td>
                          <td>{a.proveedor || <span className="ctg-muted">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="ctg-reasig-pager">
                  <button type="button" className="ar-btn-action" disabled={pagina === 0}
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}>← Anterior</button>
                  <span>Página {pagina + 1} de {totalPaginas}</span>
                  <button type="button" className="ar-btn-action" disabled={pagina >= totalPaginas - 1}
                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}>Siguiente →</button>
                </div>
              )}
            </>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={onCancel}>Cancelar</button>
            <button type="button" className="ar-btn-add" disabled={count === 0} onClick={irADestino}>
              Continuar con {count} artículo{count !== 1 ? "s" : ""} →
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 2: destino (4 campos, opcionales) ── */}
      {step === 2 && (
        <div className="ctg-reasig-panel">
          <h2 className="ctg-reasig-title">¿Qué les reasignas?</h2>
          <p className="ctg-reasig-src-label" style={{ marginBottom: 14 }}>
            Llena solo los campos que quieras cambiar. Los que dejes vacíos no se tocan.
          </p>
          <div className="ctg-reasig-selects">
            <div className="ctg-field">
              <label className="ctg-label">Departamento</label>
              <select className="ctg-input" value={dDep}
                onChange={(e) => { setDDep(e.target.value); setDCat(""); setDstError("") }}>
                <option value="">— No cambiar —</option>
                {depts.map((d) => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Categoría</label>
              <select className="ctg-input" value={dCat} disabled={!dDep}
                onChange={(e) => { setDCat(e.target.value); setDstError("") }}>
                <option value="">— No cambiar —</option>
                {dstCats.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Marca</label>
              <select className="ctg-input" value={dMar}
                onChange={(e) => { setDMar(e.target.value); setDstError("") }}>
                <option value="">— No cambiar —</option>
                {marcas.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
              </select>
            </div>
            <div className="ctg-field">
              <label className="ctg-label">Proveedor</label>
              <select className="ctg-input" value={dProvId}
                onChange={(e) => { setDProvId(e.target.value); setDstError("") }}>
                <option value="">— No cambiar —</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>

          {dstError && <p className="ctg-reasig-error">{dstError}</p>}

          {destinoChips.length > 0 && (
            <div className="ctg-reasig-summary">
              <p className="ctg-reasig-summary-count">
                {count} artículo{count !== 1 ? "s" : ""} quedarán con:
              </p>
              <div className="ctg-reasig-summary-arrow" style={{ flexWrap: "wrap" }}>
                {destinoChips.map(([k, v]) => (
                  <span key={k} className="ctg-reasig-summary-tag">{k}: {v}</span>
                ))}
              </div>
            </div>
          )}

          <div className="ctg-reasig-footer">
            <button type="button" className="ar-btn-action" onClick={() => setStep(1)}>← Volver</button>
            <button type="button" className="ar-btn-add" onClick={confirmar}>Reasignar</button>
          </div>
        </div>
      )}

      {/* ── Confirmación ── */}
      {showConfirm && (
        <div className="ctg-overlay" onClick={() => setShowConfirm(false)}>
          <div className="ctg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ctg-modal-header">
              <div className="ctg-modal-stripe" style={{ background: "#EA580C" }} />
              <span className="ctg-modal-title">¿Confirmar reasignación de {count} artículo{count !== 1 ? "s" : ""}?</span>
            </div>
            <div className="ctg-modal-body">
              <p className="ctg-modal-body-text">Se aplicarán estos cambios:</p>
              <div className="ctg-reasig-summary" style={{ marginTop: 10 }}>
                <div className="ctg-reasig-summary-arrow" style={{ flexWrap: "wrap" }}>
                  {destinoChips.map(([k, v]) => (
                    <span key={k} className="ctg-reasig-summary-tag">{k}: {v}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="ctg-modal-footer">
              <button type="button" className="ar-btn-action" onClick={() => setShowConfirm(false)}>Cancelar</button>
              <button type="button" className="ar-btn-add" onClick={ejecutar}>Confirmar y reasignar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
