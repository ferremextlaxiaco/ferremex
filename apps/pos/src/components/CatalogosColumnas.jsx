import { useState, useEffect, useRef } from "react"
import { ChevronRight, Check, X, Factory, Percent, Package, Search } from "lucide-react"
import { COLORES_ACENTO } from "../lib/catalogos-colores"
import { listarArticulosPreview, listarProveedoresDeNivel, listarEjesComisionAPI, guardarEjeComisionAPI } from "../lib/client"

// ── Modal: previsualización de artículos de un departamento/categoría/marca ──
// Carga PAGINADA desde el backend (/caja/catalogos/articulos): nunca trae de
// golpe los miles de artículos de un departamento grande, solo la página
// visible + lo que el usuario pida con "Ver más".

// Primera página: chica, para que se vea contenido casi al instante. Las
// siguientes tandas de autocarga en segundo plano usan un tamaño mayor (menos
// round-trips para llegar al total en departamentos grandes).
const PRIMERA_PAGINA = 12
const SIGUIENTE_TANDA = 40

function ArticulosPreviewModal({ typeLabel, nombre, accentColor, filtro, onClose }) {
  const [qInput, setQInput] = useState("")
  const [q, setQ] = useState("")
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [autocargando, setAutocargando] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  // Debounce de búsqueda (300ms) — evita 1 request por tecla.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300)
    return () => clearTimeout(t)
  }, [qInput])

  // Carga inicial (página chica, casi instantánea) al abrir o cambiar búsqueda.
  useEffect(() => {
    let on = true
    setCargando(true)
    listarArticulosPreview(filtro, { q, limit: PRIMERA_PAGINA, offset: 0 })
      .then(({ items, total }) => { if (on) { setItems(items); setTotal(total) } })
      .catch(() => { if (on) { setItems([]); setTotal(0) } })
      .finally(() => { if (on) setCargando(false) })
    return () => { on = false }
  }, [q, filtro.departamento, filtro.categoria, filtro.marca]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autocarga en segundo plano: sigue trayendo tandas SIN que el usuario haga
  // clic, hasta completar `total` o hasta que cambie la búsqueda/filtro (el
  // `on` del efecto anterior ya cortó esa cadena — aquí solo seguimos mientras
  // los items visibles correspondan a la búsqueda actual).
  useEffect(() => {
    if (cargando) return
    if (items.length >= total) return
    let on = true
    setAutocargando(true)
    listarArticulosPreview(filtro, { q, limit: SIGUIENTE_TANDA, offset: items.length })
      .then(({ items: nuevos }) => { if (on) setItems(prev => [...prev, ...nuevos]) })
      .catch(() => {})
      .finally(() => { if (on) setAutocargando(false) })
    return () => { on = false }
  }, [cargando, items.length, total, q, filtro.departamento, filtro.categoria, filtro.marca]) // eslint-disable-line react-hooks/exhaustive-deps

  const hayMas = items.length < total

  return (
    <div className="ctg-overlay" onClick={onClose}>
      <div className="ctg-modal ctg-arts-modal" onClick={e => e.stopPropagation()}>
        <div className="ctg-modal-header">
          <div className="ctg-modal-stripe" style={{ background: accentColor }} />
          <div style={{ flex: 1 }}>
            <div className="ctg-modal-title">{nombre}</div>
            <div style={{ fontSize: 12, color: "var(--at-text-muted)" }}>
              {typeLabel} · {total} artículo{total !== 1 ? "s" : ""}
            </div>
          </div>
          <button type="button" className="ctg-arts-close" onClick={onClose} title="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="ctg-arts-search-wrap">
          <Search size={14} className="ctg-arts-search-icon" />
          <input
            className="ctg-arts-search"
            placeholder="Buscar por nombre o clave…"
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ctg-arts-list">
          {cargando && (
            <div className="ctg-provs-empty" style={{ padding: "24px 0", textAlign: "center" }}>
              Cargando artículos…
            </div>
          )}
          {!cargando && items.length === 0 && (
            <div className="ctg-provs-empty" style={{ padding: "24px 0", textAlign: "center" }}>
              {total === 0 && !q ? "Sin artículos asignados." : "Sin resultados."}
            </div>
          )}
          {!cargando && items.map(a => (
            <div key={a.id} className="ctg-arts-row">
              <div className="ctg-arts-thumb">
                {a.thumbnail
                  ? <img src={a.thumbnail} alt="" />
                  : <Package size={18} color="var(--at-text-muted)" />}
              </div>
              <div className="ctg-arts-info">
                <div className="ctg-arts-name">{a.descripcion}</div>
                <div className="ctg-arts-meta">
                  <span className="ctg-arts-sku">{a.clave}</span>
                  {a.marca && <span>· {a.marca}</span>}
                </div>
              </div>
              <div className="ctg-arts-exist" title="Existencia">
                {a.existencia}
              </div>
            </div>
          ))}
          {!cargando && hayMas && (
            <div className="ctg-arts-autocarga">
              {autocargando ? `Cargando más… (${items.length} de ${total})` : `${items.length} de ${total}`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Toggle switch (mismo patrón visual que EmployeesModule) ───────────────────

function Toggle({ checked, onChange }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange() } }}
      style={{
        position: "relative", width: 40, height: 20, borderRadius: 10,
        background: checked ? "#ea580c" : "#d1d5db",
        cursor: "pointer", flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: checked ? 22 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        transition: "left .2s",
      }} />
    </div>
  )
}

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }) {
  return (
    <div className="ctg-color-row">
      {COLORES_ACENTO.map(c => (
        <button
          key={c}
          type="button"
          className={`ctg-color-circle${value === c ? " selected" : ""}`}
          style={{ background: c, boxShadow: value === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }}
          onClick={() => onChange(c)}
          title={c}
        >
          {value === c && <Check size={10} color="white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

// ── Formulario inline para agregar nodos ──────────────────────────────────────

function InlineAddForm({ type, parentLabel, defaultColor, onConfirm, onCancel }) {
  const [nombre, setNombre] = useState("")
  const [color,  setColor]  = useState(defaultColor ?? COLORES_ACENTO[0])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleConfirm() {
    const trimmed = nombre.trim()
    if (!trimmed) return
    onConfirm(trimmed, color)
    setNombre("")
  }

  return (
    <div className="ctg-inline-add">
      <input
        ref={inputRef}
        className="ctg-inline-input"
        placeholder={`Nombre del ${type}…`}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter")  handleConfirm()
          if (e.key === "Escape") onCancel()
        }}
      />
      {type === "departamento" && (
        <div style={{ marginTop: 6 }}>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      )}
      {parentLabel && (
        <div className="ctg-inline-parent-label">En: {parentLabel}</div>
      )}
      <div className="ctg-inline-btns">
        <button
          type="button"
          className="ctg-inline-btn-confirm"
          disabled={!nombre.trim()}
          onClick={handleConfirm}
          title="Confirmar (Enter)"
        >
          <Check size={12} strokeWidth={3} />
        </button>
        <button
          type="button"
          className="ctg-inline-btn-cancel"
          onClick={onCancel}
          title="Cancelar (Esc)"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Panel de edición ──────────────────────────────────────────────────────────

function EditPanel({ type, node, depts, cats, marcas, onSave, onDelete }) {
  const [form,  setForm]  = useState({})
  const [dirty, setDirty] = useState(false)
  // Para cascada dept→cat en formulario de Marca
  const [catDepFilter, setCatDepFilter] = useState(null)
  // Proveedores presentes en los productos de este nivel (informativo, solo lectura).
  const [provs, setProvs] = useState({ cargando: false, lista: [], sinAsignar: 0 })
  const [mostrarArticulos, setMostrarArticulos] = useState(false)

  // Reiniciar form al cambiar nodo seleccionado
  useEffect(() => {
    if (!node) { setForm({}); setDirty(false); return }
    if (type === "dep") setForm({ nombre: node.nombre, color: node.color })
    if (type === "cat") setForm({ nombre: node.nombre, depId: node.depId })
    if (type === "mar") setForm({ nombre: node.nombre, catId: node.catId })
    setDirty(false)
  }, [node?.id, type]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (type === "mar" && node) {
      const cat = cats.find(c => c.id === node.catId)
      setCatDepFilter(cat?.depId ?? depts[0]?.id ?? null)
    }
  }, [node?.id, type]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carga los proveedores presentes en los productos de este nivel (informativo).
  // Resuelve depto/categoría/marca según el tipo de nodo y pide el resumen YA
  // AGREGADO al backend (nunca artículos completos — ver /caja/catalogos/proveedores).
  useEffect(() => {
    if (!node) { setProvs({ cargando: false, lista: [], sinAsignar: 0 }); return }
    let on = true
    let depNombre = "", catNombre = "", marNombre = ""
    if (type === "dep") {
      depNombre = node.nombre
    } else if (type === "cat") {
      depNombre = depts.find(d => d.id === node.depId)?.nombre ?? ""
      catNombre = node.nombre
    } else if (type === "mar") {
      const cat = cats.find(c => c.id === node.catId)
      depNombre = depts.find(d => d.id === cat?.depId)?.nombre ?? ""
      catNombre = cat?.nombre ?? ""
      marNombre = node.nombre
    }
    if (!depNombre && !catNombre && !marNombre) { setProvs({ cargando: false, lista: [], sinAsignar: 0 }); return }

    setProvs({ cargando: true, lista: [], sinAsignar: 0 })
    listarProveedoresDeNivel({ departamento: depNombre, categoria: catNombre, marca: marNombre })
      .then(({ lista, sinAsignar }) => { if (on) setProvs({ cargando: false, lista, sinAsignar }) })
      .catch(() => { if (on) setProvs({ cargando: false, lista: [], sinAsignar: 0 }) })
    return () => { on = false }
  }, [node?.id, type]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setMostrarArticulos(false) }, [node?.id, type])

  // Comisión: toggle "admite comisión" para este ámbito (marca/categoría/
  // departamento). Es GLOBAL (no por empleado) — el % por empleado se asigna
  // en Empleados y permisos, solo sobre ámbitos habilitados aquí.
  const ambito = type === "dep" ? "departamento" : type === "cat" ? "categoria" : "marca"
  const [comisionHabilitada, setComisionHabilitada] = useState(false)
  const [comisionCargando, setComisionCargando] = useState(false)
  const [comisionGuardando, setComisionGuardando] = useState(false)

  useEffect(() => {
    if (!node) { setComisionHabilitada(false); return }
    let on = true
    setComisionCargando(true)
    listarEjesComisionAPI()
      .then(ejes => {
        if (!on) return
        const ref = node.nombre.trim().toLowerCase()
        const eje = ejes.find(e => e.ambito === ambito && e.ref.trim().toLowerCase() === ref)
        setComisionHabilitada(!!eje?.habilitado)
      })
      .catch(() => { if (on) setComisionHabilitada(false) })
      .finally(() => { if (on) setComisionCargando(false) })
    return () => { on = false }
  }, [node?.id, type]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleComision() {
    if (comisionGuardando) return
    const nuevoValor = !comisionHabilitada
    setComisionGuardando(true)
    setComisionHabilitada(nuevoValor) // optimista
    try {
      await guardarEjeComisionAPI(ambito, node.nombre.trim(), nuevoValor)
    } catch {
      setComisionHabilitada(!nuevoValor) // revertir si falló
    } finally {
      setComisionGuardando(false)
    }
  }

  if (!node) {
    return (
      <div className="ctg-edit-panel ctg-edit-empty">
        <div className="ctg-edit-empty-icon">⊟</div>
        <p className="ctg-edit-empty-text">Selecciona un elemento para editarlo</p>
      </div>
    )
  }

  function change(field, val) {
    setForm(p => ({ ...p, [field]: val }))
    setDirty(true)
  }

  // Color de acento del nodo seleccionado (heredado del dept padre)
  const accentColor =
    type === "dep" ? node.color
    : type === "cat" ? (depts.find(d => d.id === node.depId)?.color ?? "#6B7280")
    : (() => {
        const cat = cats.find(c => c.id === node.catId)
        return depts.find(d => d.id === cat?.depId)?.color ?? "#6B7280"
      })()

  // Estadísticas del nodo
  const artCount = node.articulos ?? 0
  const catCount = type === "dep"
    ? cats.filter(c => c.depId === node.id).length
    : null
  const marCount = type === "dep"
    ? marcas.filter(m => cats.find(c => c.id === m.catId && c.depId === node.id)).length
    : type === "cat"
    ? marcas.filter(m => m.catId === node.id).length
    : null

  const canDelete     = artCount === 0
  const deleteTooltip = !canDelete
    ? `Tiene ${artCount} artículo${artCount !== 1 ? "s" : ""} asignados. Reasígnalos primero.`
    : null
  const typeLabel = type === "dep" ? "Departamento" : type === "cat" ? "Categoría" : "Marca"

  // Categorías filtradas por dept para el select de Marca
  const catsForFilter = cats.filter(c => c.depId === catDepFilter)

  function handleSave() {
    if (type === "dep") onSave("dep", node.id, form)
    if (type === "cat") onSave("cat", node.id, form)
    if (type === "mar") onSave("mar", node.id, form)
  }

  function handleDelete() {
    onDelete(type, node.id)
  }

  return (
    <div className="ctg-edit-panel">
      {/* Encabezado con color de acento */}
      <div className="ctg-edit-header">
        <div className="ctg-edit-type" style={{ color: accentColor }}>
          <div className="ctg-edit-type-bar" style={{ background: accentColor }} />
          {typeLabel}
        </div>
        <h2 className="ctg-edit-title">{node.nombre}</h2>
      </div>

      {/* Estadísticas */}
      <div className="ctg-stat-row">
        <div className="ctg-stat">
          <span className="ctg-stat-value">{artCount}</span>
          <span className="ctg-stat-label">Artículos</span>
          {artCount > 0 && (
            <button type="button" className="ctg-stat-ver-btn" onClick={() => setMostrarArticulos(true)}>
              <Package size={11} /> Ver artículos
            </button>
          )}
        </div>
        {catCount !== null && (
          <div className="ctg-stat">
            <span className="ctg-stat-value">{catCount}</span>
            <span className="ctg-stat-label">Categorías</span>
          </div>
        )}
        {marCount !== null && (
          <div className="ctg-stat">
            <span className="ctg-stat-value">{marCount}</span>
            <span className="ctg-stat-label">Marcas</span>
          </div>
        )}
      </div>

      {/* Proveedores de los productos de este nivel (informativo, solo lectura). */}
      <div className="ctg-provs">
        <div className="ctg-provs-title">
          <Factory size={13} /> Proveedores
        </div>
        {provs.cargando ? (
          <p className="ctg-provs-empty">Cargando…</p>
        ) : provs.lista.length === 0 && provs.sinAsignar === 0 ? (
          <p className="ctg-provs-empty">Sin artículos que mostrar.</p>
        ) : (
          <div className="ctg-provs-chips">
            {provs.lista.map(p => (
              <span key={p.nombre} className="ctg-prov-chip" title={`${p.n} artículo${p.n !== 1 ? "s" : ""}`}>
                {p.nombre} <span className="ctg-prov-chip-n">{p.n}</span>
              </span>
            ))}
            {provs.sinAsignar > 0 && (
              <span className="ctg-prov-chip ctg-prov-chip--sin" title={`${provs.sinAsignar} sin proveedor`}>
                Sin proveedor <span className="ctg-prov-chip-n">{provs.sinAsignar}</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="ctg-edit-divider" />

      {/* Campo: Nombre */}
      <div className="ctg-field">
        <label className="ctg-label">Nombre</label>
        <input
          className="ctg-input"
          value={form.nombre ?? ""}
          onChange={e => change("nombre", e.target.value)}
        />
      </div>

      {/* Departamento: selector de color */}
      {type === "dep" && (
        <div className="ctg-field">
          <label className="ctg-label">Color de acento</label>
          <ColorPicker value={form.color ?? node.color} onChange={c => change("color", c)} />
        </div>
      )}

      {/* Categoría: selector de departamento padre */}
      {type === "cat" && (
        <div className="ctg-field">
          <label className="ctg-label">Departamento padre</label>
          <select
            className="ctg-input"
            value={form.depId ?? node.depId}
            onChange={e => change("depId", e.target.value)}
          >
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* Marca: dept (auto-fill desde cat) + categoría padre */}
      {type === "mar" && (
        <>
          <div className="ctg-field">
            <label className="ctg-label">Departamento</label>
            <select
              className="ctg-input"
              value={catDepFilter ?? ""}
              onChange={e => {
                const depId = e.target.value
                setCatDepFilter(depId)
                const firstCat = cats.find(c => c.depId === depId)
                if (firstCat) change("catId", firstCat.id)
              }}
            >
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>
          <div className="ctg-field">
            <label className="ctg-label">Categoría padre</label>
            <select
              className="ctg-input"
              value={form.catId ?? node.catId}
              onChange={e => change("catId", e.target.value)}
            >
              {catsForFilter.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Comisión: toggle global. El % por empleado se asigna en Empleados. */}
      <div className="ctg-field">
        <label
          className="ctg-label"
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: comisionCargando ? "default" : "pointer" }}
          onClick={comisionCargando ? undefined : toggleComision}
        >
          <Percent size={13} />
          Admite comisión
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
          <Toggle checked={comisionHabilitada} onChange={toggleComision} />
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            {comisionCargando ? "Cargando…" : comisionHabilitada
              ? "Los empleados pueden recibir % de comisión por esta " + typeLabel.toLowerCase()
              : "No genera comisión para ningún empleado"}
          </span>
        </div>
      </div>

      {/* Artículos asignados (solo lectura) */}
      <div className="ctg-field">
        <label className="ctg-label">Artículos asignados</label>
        <div className="ctg-read-only">{artCount} artículo{artCount !== 1 ? "s" : ""}</div>
      </div>

      {/* Acciones */}
      <div className="ctg-edit-actions">
        <div className="ctg-delete-wrap">
          <button
            type="button"
            className="ar-btn-action ar-btn-danger"
            disabled={!canDelete}
            onClick={handleDelete}
            title={deleteTooltip ?? `Eliminar ${typeLabel.toLowerCase()}`}
          >
            Eliminar {typeLabel.toLowerCase()}
          </button>
          {!canDelete && (
            <div className="ctg-del-tooltip">{deleteTooltip}</div>
          )}
        </div>
        <button
          type="button"
          className="ar-btn-add"
          disabled={!dirty}
          onClick={handleSave}
        >
          Guardar cambios
        </button>
      </div>

      {mostrarArticulos && (
        <ArticulosPreviewModal
          typeLabel={typeLabel}
          nombre={node.nombre}
          accentColor={accentColor}
          filtro={
            type === "dep" ? { departamento: node.nombre }
            : type === "cat" ? { departamento: depts.find(d => d.id === node.depId)?.nombre ?? "", categoria: node.nombre }
            : (() => {
                const cat = cats.find(c => c.id === node.catId)
                return {
                  departamento: depts.find(d => d.id === cat?.depId)?.nombre ?? "",
                  categoria: cat?.nombre ?? "",
                  marca: node.nombre,
                }
              })()
          }
          onClose={() => setMostrarArticulos(false)}
        />
      )}
    </div>
  )
}

// ── Columna ───────────────────────────────────────────────────────────────────

function Column({
  items, selectedId, accentColor, onSelect,
  footerLabel, onFooterAdd,
  headerContent,
  showInlineAdd, onCloseInlineAdd, onConfirmInlineAdd,
  inlineAddType, inlineAddParentLabel, inlineAddDefaultColor,
  search, onSearchChange,
  globalSearch,
}) {
  const filtered = items.filter(item => {
    const q = (globalSearch || search || "").toLowerCase()
    return !q || item.nombre.toLowerCase().includes(q)
  })

  return (
    <div className="ctg-col">
      {headerContent && (
        <div className="ctg-col-header">{headerContent}</div>
      )}
      <div className="ctg-col-search-wrap">
        <input
          className="ctg-col-search"
          placeholder="Buscar…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div className="ctg-col-list">
        {filtered.length === 0 && (
          <div className="ctg-col-empty">
            {search || globalSearch ? "Sin resultados" : "Sin elementos"}
          </div>
        )}
        {filtered.map(item => {
          const color      = accentColor(item)
          const isSelected = item.id === selectedId
          return (
            <div
              key={item.id}
              className={`ctg-node-row${isSelected ? " selected" : ""}`}
              style={{ borderLeftColor: color }}
              onClick={() => onSelect(item.id)}
            >
              <span className="ctg-node-name">{item.nombre}</span>
              <span className="ctg-node-badge">{item.articulos} arts.</span>
              {isSelected && <ChevronRight size={14} className="ctg-node-chevron" />}
            </div>
          )
        })}
        {showInlineAdd && (
          <InlineAddForm
            type={inlineAddType}
            parentLabel={inlineAddParentLabel}
            defaultColor={inlineAddDefaultColor}
            onConfirm={onConfirmInlineAdd}
            onCancel={onCloseInlineAdd}
          />
        )}
      </div>
      <div className="ctg-col-footer">
        <button type="button" className="ctg-col-add-btn" onClick={onFooterAdd}>
          + {footerLabel}
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CatalogosColumnas({
  depts, cats, marcas,
  selDep, selCat, selMar,
  onSelDep, onSelCat, onSelMar,
  inlineAdd, onSetInlineAdd,
  globalSearch,
  onAddDep, onAddCat, onAddMar,
  onSaveDep, onSaveCat, onSaveMar,
  onDeleteDep, onDeleteCat, onDeleteMar,
}) {
  const [searchDep, setSearchDep] = useState("")
  const [searchCat, setSearchCat] = useState("")
  const [searchMar, setSearchMar] = useState("")

  const selectedDep = selDep ? depts.find(d => d.id === selDep) : null
  const selectedCat = selCat ? cats.find(c => c.id === selCat)  : null
  const selectedMar = selMar ? marcas.find(m => m.id === selMar) : null

  const editType = selMar ? "mar" : selCat ? "cat" : selDep ? "dep" : null
  const editNode = selMar ? selectedMar : selCat ? selectedCat : selDep ? selectedDep : null

  const depCats   = selDep ? cats.filter(c => c.depId === selDep)   : []
  const catMarcas = selCat ? marcas.filter(m => m.catId === selCat) : []

  function depAccent(dep) { return dep.color }
  function catAccent(cat) { return depts.find(d => d.id === cat.depId)?.color ?? "#6B7280" }
  function marAccent(mar) {
    const cat = cats.find(c => c.id === mar.catId)
    return depts.find(d => d.id === cat?.depId)?.color ?? "#6B7280"
  }

  function handleSave(type, id, form) {
    if (type === "dep") onSaveDep(id, form)
    if (type === "cat") onSaveCat(id, form)
    if (type === "mar") onSaveMar(id, form)
  }

  function handleDelete(type, id) {
    if (type === "dep") onDeleteDep(id)
    if (type === "cat") onDeleteCat(id)
    if (type === "mar") onDeleteMar(id)
  }

  return (
    <div className="ctg-columns">

      {/* Área de columnas — scrollable horizontalmente si se acumulan */}
      <div className="ctg-cols-area">

      {/* Columna 1 — Departamentos */}
      <Column
        items={depts}
        selectedId={selDep}
        accentColor={depAccent}
        onSelect={id => { onSelDep(id); setSearchCat(""); setSearchMar("") }}
        footerLabel="Agregar departamento"
        onFooterAdd={() => onSetInlineAdd("dep")}
        headerContent={null}
        showInlineAdd={inlineAdd === "dep"}
        onCloseInlineAdd={() => onSetInlineAdd(null)}
        onConfirmInlineAdd={(nombre, color) => { onAddDep(nombre, color); onSetInlineAdd(null) }}
        inlineAddType="departamento"
        inlineAddParentLabel={null}
        inlineAddDefaultColor={COLORES_ACENTO[0]}
        search={searchDep}
        onSearchChange={setSearchDep}
        globalSearch={globalSearch}
      />

      {/* Columna 2 — Categorías (aparece al seleccionar dept) */}
      {selDep && (
        <Column
          items={depCats}
          selectedId={selCat}
          accentColor={catAccent}
          onSelect={id => { onSelCat(id); setSearchMar("") }}
          footerLabel="Agregar categoría"
          onFooterAdd={() => onSetInlineAdd("cat")}
          headerContent={
            <div
              className="ctg-col-parent-label"
              style={{ borderLeftColor: selectedDep?.color }}
            >
              {selectedDep?.nombre}
            </div>
          }
          showInlineAdd={inlineAdd === "cat"}
          onCloseInlineAdd={() => onSetInlineAdd(null)}
          onConfirmInlineAdd={(nombre) => { onAddCat(nombre, selDep); onSetInlineAdd(null) }}
          inlineAddType="categoría"
          inlineAddParentLabel={selectedDep?.nombre}
          inlineAddDefaultColor={null}
          search={searchCat}
          onSearchChange={setSearchCat}
          globalSearch={globalSearch}
        />
      )}

      {/* Columna 3 — Marcas (aparece al seleccionar cat) */}
      {selCat && (
        <Column
          items={catMarcas}
          selectedId={selMar}
          accentColor={marAccent}
          onSelect={onSelMar}
          footerLabel="Agregar marca"
          onFooterAdd={() => onSetInlineAdd("mar")}
          headerContent={
            <div
              className="ctg-col-parent-label"
              style={{ borderLeftColor: selectedDep?.color }}
            >
              {selectedDep?.nombre} → {selectedCat?.nombre}
            </div>
          }
          showInlineAdd={inlineAdd === "mar"}
          onCloseInlineAdd={() => onSetInlineAdd(null)}
          onConfirmInlineAdd={(nombre) => { onAddMar(nombre, selCat); onSetInlineAdd(null) }}
          inlineAddType="marca"
          inlineAddParentLabel={selectedCat?.nombre}
          inlineAddDefaultColor={null}
          search={searchMar}
          onSearchChange={setSearchMar}
          globalSearch={globalSearch}
        />
      )}

      </div>{/* fin ctg-cols-area */}

      {/* Panel de edición — siempre fijo a la derecha */}
      <EditPanel
        type={editType}
        node={editNode}
        depts={depts}
        cats={cats}
        marcas={marcas}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
