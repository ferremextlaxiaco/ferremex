import { useState, useEffect, useRef } from "react"
import { ChevronRight, Check, X } from "lucide-react"
import { COLORES_ACENTO } from "../lib/catalogos-colores"

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
