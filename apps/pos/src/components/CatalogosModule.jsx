import { useState, useRef, useEffect } from "react"
import { Plus, ArrowLeftRight } from "lucide-react"
import CatalogosColumnas from "./CatalogosColumnas"
import CatalogosReasignacion from "./CatalogosReasignacion"
import { listarCatalogos, actualizarCatalogo } from "../lib/client"
import { loadProveedores } from "../lib/proveedores"
import { COLORES_ACENTO } from "../lib/catalogos-colores"

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }

// Los colores se asignan en orden de aparición al cargar desde la API.
// Se persisten en estado para que rename / agregar no cambien los colores.
function asignarColores(depts) {
  return depts.map((d, i) => ({
    ...d,
    color: d.color ?? COLORES_ACENTO[i % COLORES_ACENTO.length],
  }))
}

// ── Modal de confirmación ──────────────────────────────────────────────────────
// severity: "rename" | "changeParent" | "deleteBlocked" | "deleteEmpty"

function ConfirmModal({ modal, onClose, onGotoReasign }) {
  // Cerrar con Escape (igual que el botón "Cancelar" / clic en el overlay).
  // El hook va antes del early-return para no romper las reglas de hooks.
  useEffect(() => {
    if (!modal) return
    const fn = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [modal, onClose])

  if (!modal) return null
  const { severity, title, body, affectedCount, affectedSample, onConfirm } = modal

  const stripeColor =
    severity === "rename"       ? "#CA8A04" :
    severity === "changeParent" ? "#EA580C" : "#DC2626"

  const isBlocked = severity === "deleteBlocked"

  const btnLabel =
    severity === "rename"        ? "Sí, renombrar" :
    severity === "changeParent"  ? "Confirmar movimiento" :
    "Eliminar definitivamente"

  return (
    <div className="ctg-overlay" onClick={onClose}>
      <div className="ctg-modal" onClick={e => e.stopPropagation()}>
        <div className="ctg-modal-header">
          <div className="ctg-modal-stripe" style={{ background: stripeColor }} />
          <span className="ctg-modal-title">{title}</span>
        </div>

        <div className="ctg-modal-body">
          <p className="ctg-modal-body-text">{body}</p>
          {affectedSample?.length > 0 && (
            <div className="ctg-modal-affected">
              {affectedSample.slice(0, 5).map((name, i) => (
                <div key={i} className="ctg-modal-art-item">· {name}</div>
              ))}
              {affectedCount > affectedSample.length && (
                <div className="ctg-modal-art-item ctg-modal-art-more">
                  ...y {affectedCount - affectedSample.length} más
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ctg-modal-footer">
          <button className="ar-btn-action" onClick={onClose}>Cancelar</button>
          {isBlocked ? (
            <button className="ar-btn-add" onClick={() => { onClose(); onGotoReasign() }}>
              Ir a Reasignación masiva
            </button>
          ) : (
            <button
              className="ar-btn-add"
              style={severity === "deleteEmpty" ? { background: "#DC2626", borderColor: "#DC2626" } : {}}
              onClick={onConfirm}
            >
              {btnLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CatalogosModule() {
  const [depts,  setDepts]  = useState([])
  const [cats,   setCats]   = useState([])
  const [marcas, setMarcas] = useState([])

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)

  const [selDep, setSelDep] = useState(null)
  const [selCat, setSelCat] = useState(null)
  const [selMar, setSelMar] = useState(null)

  const [viewMode,     setViewMode]     = useState("columns") // "columns" | "reasignacion"
  const [globalSearch, setGlobalSearch] = useState("")
  const [inlineAdd,    setInlineAdd]    = useState(null)      // null | "dep" | "cat" | "mar"
  // Catálogo de proveedores (para la asignación masiva de proveedor).
  const [proveedores,  setProveedores]  = useState([])

  const [toast,        setToast]        = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)

  const toastTimer = useRef(null)

  // ── Carga inicial desde la API ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setCargando(true)
    setErrorCarga(null)
    listarCatalogos()
      .then(data => {
        if (cancelled) return
        setDepts(asignarColores(data.depts))
        setCats(data.cats)
        setMarcas(data.marcas)
      })
      .catch(err => {
        if (cancelled) return
        setErrorCarga(err.message ?? "Error al cargar catálogos")
      })
      .finally(() => {
        if (!cancelled) setCargando(false)
      })
    return () => { cancelled = true }
  }, [])

  // Proveedores para la asignación masiva (catálogo ferremex_proveedores).
  useEffect(() => {
    loadProveedores().then(setProveedores).catch(() => {})
  }, [])

  function showToast(msg, tipo = "ok") {
    clearTimeout(toastTimer.current)
    setToast({ msg, tipo })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  function closeConfirm() { setConfirmModal(null) }

  // ── Selección ────────────────────────────────────────────────────────────────

  function handleSelDep(id) {
    setSelDep(prev => prev === id ? null : id)
    setSelCat(null)
    setSelMar(null)
  }

  function handleSelCat(id) {
    setSelCat(prev => prev === id ? null : id)
    setSelMar(null)
  }

  function handleSelMar(id) {
    setSelMar(prev => prev === id ? null : id)
  }

  // ── Crear nodos ──────────────────────────────────────────────────────────────

  function handleAddDep(nombre, color) {
    const n = { id: "dep-" + uid(), nombre, color, articulos: 0 }
    setDepts(p => [...p, n])
    setSelDep(n.id); setSelCat(null); setSelMar(null)
    showToast(`Departamento "${nombre}" creado`)
  }

  function handleAddCat(nombre, depId) {
    const n = { id: "cat-" + uid(), nombre, depId, articulos: 0 }
    setCats(p => [...p, n])
    setSelCat(n.id); setSelMar(null)
    showToast(`Categoría "${nombre}" creada`)
  }

  function handleAddMar(nombre, catId) {
    const cat   = cats.find(c => c.id === catId)
    const dep   = cat ? depts.find(d => d.id === cat.depId) : null
    const newId = "mar-" + uid()

    // Agrega a estado local inmediatamente
    setMarcas(p => [...p, { id: newId, nombre, catId, articulos: 0 }])
    setSelMar(newId)

    // Persiste en el archivo de marcas del catálogo (sobrevive recargas)
    actualizarCatalogo({
      op: "create_marca",
      nombre,
      cat_nombre: cat?.nombre ?? "",
      dep_nombre: dep?.nombre ?? "",
    })
      .then(() => showToast(`Marca "${nombre}" creada — úsala en Reasignación masiva para asignarla a artículos`))
      .catch(e => showToast(e.message ?? "Error al guardar marca", "error"))
  }

  // ── Guardar con persistencia en BD ──────────────────────────────────────────

  function handleSaveDep(id, updates) {
    const dep = depts.find(d => d.id === id)
    if (!dep) return

    const renamed = updates.nombre && updates.nombre !== dep.nombre

    // Solo cambio de color → local, sin llamada a API
    if (!renamed) {
      setDepts(p => p.map(d => d.id === id ? { ...d, ...updates } : d))
      showToast("Color actualizado")
      return
    }

    setConfirmModal({
      severity: "rename",
      title: "¿Confirmar cambio de nombre?",
      body: `Estás renombrando "${dep.nombre}" a "${updates.nombre}". Se actualizarán ${dep.articulos} artículo${dep.articulos !== 1 ? "s" : ""} en la base de datos.`,
      onConfirm: () => {
        closeConfirm()
        showToast(`Actualizando ${dep.articulos} artículo${dep.articulos !== 1 ? "s" : ""}…`)
        actualizarCatalogo({ op: "rename_dept", nombre_actual: dep.nombre, nombre_nuevo: updates.nombre })
          .then(r => {
            setDepts(p => p.map(d => d.id === id ? { ...d, ...updates } : d))
            showToast(`Nombre actualizado — ${r.actualizados} artículo${r.actualizados !== 1 ? "s" : ""} modificados`)
          })
          .catch(e => showToast(e.message ?? "Error al guardar en la BD", "error"))
      },
    })
  }

  function handleSaveCat(id, updates) {
    const cat = cats.find(c => c.id === id)
    if (!cat) return
    const renamed     = updates.nombre && updates.nombre !== cat.nombre
    const parentMoved = updates.depId  && updates.depId  !== cat.depId

    if (parentMoved) {
      const oldDep = depts.find(d => d.id === cat.depId)
      const newDep = depts.find(d => d.id === updates.depId)
      setConfirmModal({
        severity: "changeParent",
        title: "¿Confirmar cambio de ubicación?",
        body: `Estás moviendo "${cat.nombre}" de "${oldDep?.nombre}" a "${newDep?.nombre}". Se actualizarán ${cat.articulos} artículo${cat.articulos !== 1 ? "s" : ""} en la base de datos.`,
        affectedCount: cat.articulos,
        affectedSample: [],
        onConfirm: () => {
          closeConfirm()
          showToast(`Actualizando ${cat.articulos} artículo${cat.articulos !== 1 ? "s" : ""}…`)
          actualizarCatalogo({
            op: "move_cat",
            cat_nombre: cat.nombre,
            dept_nombre_actual: oldDep?.nombre ?? "",
            dept_nombre_nuevo: newDep?.nombre ?? "",
          })
            .then(r => {
              setCats(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
              showToast(`Categoría movida — ${r.actualizados} artículo${r.actualizados !== 1 ? "s" : ""} actualizados`)
            })
            .catch(e => showToast(e.message ?? "Error al guardar en la BD", "error"))
        },
      })
    } else if (renamed) {
      setConfirmModal({
        severity: "rename",
        title: "¿Confirmar cambio de nombre?",
        body: `Estás renombrando "${cat.nombre}" a "${updates.nombre}". Esto actualizará la categoría en ${cat.articulos} artículo${cat.articulos !== 1 ? "s" : ""}.`,
        onConfirm: () => {
          closeConfirm()
          showToast("Actualizando categoría en la base de datos…")
          actualizarCatalogo({ op: "rename_cat", nombre_actual: cat.nombre, nombre_nuevo: updates.nombre })
            .then(() => {
              setCats(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
              showToast("Nombre de categoría actualizado")
            })
            .catch(e => showToast(e.message ?? "Error al guardar en la BD", "error"))
        },
      })
    } else {
      setCats(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
      showToast("Categoría actualizada")
    }
  }

  function handleSaveMar(id, updates) {
    const mar = marcas.find(m => m.id === id)
    if (!mar) return
    const renamed     = updates.nombre && updates.nombre !== mar.nombre
    const parentMoved = updates.catId  && updates.catId  !== mar.catId

    if (parentMoved) {
      const newCat = cats.find(c => c.id === updates.catId)
      setConfirmModal({
        severity: "changeParent",
        title: "¿Confirmar cambio de ubicación?",
        body: `Estás moviendo "${mar.nombre}" a la categoría "${newCat?.nombre}". Esto afecta a ${mar.articulos} artículo${mar.articulos !== 1 ? "s" : ""}.`,
        affectedCount: mar.articulos,
        affectedSample: [],
        onConfirm: () => {
          closeConfirm()
          setMarcas(p => p.map(m => m.id === id ? { ...m, ...updates } : m))
          showToast("Marca movida (los artículos se actualizarán al guardar desde Artículos)")
        },
      })
    } else if (renamed) {
      setConfirmModal({
        severity: "rename",
        title: "¿Confirmar cambio de nombre?",
        body: `Estás renombrando "${mar.nombre}" a "${updates.nombre}". Se actualizarán ${mar.articulos} artículo${mar.articulos !== 1 ? "s" : ""} en la base de datos.`,
        onConfirm: () => {
          closeConfirm()
          showToast(`Actualizando ${mar.articulos} artículo${mar.articulos !== 1 ? "s" : ""}…`)
          actualizarCatalogo({ op: "rename_marca", nombre_actual: mar.nombre, nombre_nuevo: updates.nombre })
            .then(r => {
              setMarcas(p => p.map(m => m.id === id ? { ...m, ...updates } : m))
              showToast(`Nombre de marca actualizado — ${r.actualizados} artículo${r.actualizados !== 1 ? "s" : ""} modificados`)
            })
            .catch(e => showToast(e.message ?? "Error al guardar en la BD", "error"))
        },
      })
    } else {
      setMarcas(p => p.map(m => m.id === id ? { ...m, ...updates } : m))
      showToast("Marca actualizada")
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────────

  function handleDeleteDep(id) {
    const dep = depts.find(d => d.id === id)
    if (!dep) return
    // Safety check (button is already disabled when articulos > 0)
    if (dep.articulos > 0) {
      setConfirmModal({
        severity: "deleteBlocked",
        title: `No es posible eliminar "${dep.nombre}"`,
        body: `Este departamento tiene ${dep.articulos} artículo${dep.articulos !== 1 ? "s" : ""} asignados. Debes moverlos a otro departamento antes de poder eliminarlo.`,
        onConfirm: null,
      })
      return
    }
    const depCats = cats.filter(c => c.depId === id)
    const emptyCatCount = depCats.length
    const body = emptyCatCount > 0
      ? `Esta acción no se puede deshacer. También se eliminarán ${emptyCatCount} categoría${emptyCatCount !== 1 ? "s" : ""} vacía${emptyCatCount !== 1 ? "s" : ""} asociadas.`
      : "Esta acción no se puede deshacer."
    setConfirmModal({
      severity: "deleteEmpty",
      title: `¿Eliminar "${dep.nombre}"?`,
      body,
      onConfirm: () => {
        const catIds = depCats.map(c => c.id)
        setMarcas(p => p.filter(m => !catIds.includes(m.catId)))
        setCats(p => p.filter(c => c.depId !== id))
        setDepts(p => p.filter(d => d.id !== id))
        if (selDep === id) { setSelDep(null); setSelCat(null); setSelMar(null) }
        closeConfirm(); showToast("Departamento eliminado")
      },
    })
  }

  function handleDeleteCat(id) {
    const cat = cats.find(c => c.id === id)
    if (!cat) return
    if (cat.articulos > 0) {
      setConfirmModal({
        severity: "deleteBlocked",
        title: `No es posible eliminar "${cat.nombre}"`,
        body: `Esta categoría tiene ${cat.articulos} artículo${cat.articulos !== 1 ? "s" : ""} asignados. Debes moverlos a otra categoría antes de poder eliminarla.`,
        onConfirm: null,
      })
      return
    }
    const catMarcas = marcas.filter(m => m.catId === id)
    const emptyMarcas = catMarcas.length
    const body = emptyMarcas > 0
      ? `Esta acción no se puede deshacer. También se eliminarán ${emptyMarcas} marca${emptyMarcas !== 1 ? "s" : ""} vacía${emptyMarcas !== 1 ? "s" : ""} asociadas.`
      : "Esta acción no se puede deshacer."
    setConfirmModal({
      severity: "deleteEmpty",
      title: `¿Eliminar "${cat.nombre}"?`,
      body,
      onConfirm: () => {
        setMarcas(p => p.filter(m => m.catId !== id))
        setCats(p => p.filter(c => c.id !== id))
        if (selCat === id) { setSelCat(null); setSelMar(null) }
        closeConfirm(); showToast("Categoría eliminada")
      },
    })
  }

  function handleDeleteMar(id) {
    const mar = marcas.find(m => m.id === id)
    if (!mar) return
    if (mar.articulos > 0) {
      setConfirmModal({
        severity: "deleteBlocked",
        title: `No es posible eliminar "${mar.nombre}"`,
        body: `Esta marca tiene ${mar.articulos} artículo${mar.articulos !== 1 ? "s" : ""} asignados. Debes moverlos a otra marca antes de poder eliminarla.`,
        onConfirm: null,
      })
      return
    }
    setConfirmModal({
      severity: "deleteEmpty",
      title: `¿Eliminar "${mar.nombre}"?`,
      body: "Esta acción no se puede deshacer.",
      onConfirm: () => {
        setMarcas(p => p.filter(m => m.id !== id))
        if (selMar === id) setSelMar(null)
        closeConfirm(); showToast("Marca eliminada")
      },
    })
  }

  // ── Reasignación (persiste en BD) ────────────────────────────────────────────

  // Reasignación masiva unificada: aplica los campos que vengan (depto/categoría/
  // marca/proveedor) a los productos seleccionados.
  function handleReasign({ productIds, departamento, categoria, marca, proveedorId, proveedorNombre }) {
    showToast(`Guardando reasignación de ${productIds.length} artículo${productIds.length !== 1 ? "s" : ""}…`)
    actualizarCatalogo({
      op: "reasignar",
      product_ids: productIds,
      ...(departamento ? { departamento } : {}),
      ...(categoria ? { categoria } : {}),
      ...(marca ? { marca } : {}),
      ...(proveedorId ? { proveedor_id: proveedorId, proveedor: proveedorNombre ?? "" } : {}),
    })
      .then(r => {
        showToast(`${r.actualizados} artículo${r.actualizados !== 1 ? "s" : ""} reasignados correctamente`)
        // Refresca el catálogo para reflejar los nuevos conteos
        listarCatalogos(true)
          .then(data => { setDepts(asignarColores(data.depts)); setCats(data.cats); setMarcas(data.marcas) })
          .catch(() => {})
      })
      .catch(e => showToast(e.message ?? "Error en reasignación", "error"))
    setViewMode("columns")
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className="ctg-root">
        <div className="ctg-loading">
          <div className="ctg-loading-spinner" />
          <span>Cargando catálogos…</span>
        </div>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="ctg-root">
        <div className="ctg-loading">
          <span style={{ color: "var(--at-red)", fontSize: 13 }}>
            Error al cargar: {errorCarga}
          </span>
          <button
            className="ar-btn-action"
            style={{ marginTop: 10 }}
            onClick={() => { setErrorCarga(null); setCargando(true); listarCatalogos().then(d => { setDepts(asignarColores(d.depts)); setCats(d.cats); setMarcas(d.marcas) }).catch(e => setErrorCarga(e.message)).finally(() => setCargando(false)) }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ctg-root">

      {/* Toolbar — solo en modo columnas. En reasignación, el asistente trae su
          propia barra superior (con "Volver") y sube pegado al header global. */}
      {viewMode === "columns" && (
        <div className="ctg-toolbar">
          <div className="ctg-toolbar-left">
            <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Catálogos</p>
            <span className="ctg-toolbar-sub">Departamentos, Categorías y Marcas</span>
          </div>

          <div className="ctg-global-search-wrap">
            <svg className="ctg-search-icon" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="ctg-global-search"
              placeholder="Buscar en todos los catálogos…"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
            />
            {globalSearch && (
              <button className="ctg-search-clear" onClick={() => setGlobalSearch("")}>✕</button>
            )}
          </div>

          <div className="ctg-toolbar-right">
            <button className="ar-btn-add" onClick={() => setInlineAdd("dep")}>
              <Plus size={14} /> Nuevo departamento
            </button>
            <button className="ar-btn-action" onClick={() => setViewMode("reasignacion")}>
              <ArrowLeftRight size={14} /> Reasignación masiva
            </button>
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="ctg-main">
        {viewMode === "columns" ? (
          <CatalogosColumnas
            depts={depts}
            cats={cats}
            marcas={marcas}
            selDep={selDep}
            selCat={selCat}
            selMar={selMar}
            onSelDep={handleSelDep}
            onSelCat={handleSelCat}
            onSelMar={handleSelMar}
            inlineAdd={inlineAdd}
            onSetInlineAdd={setInlineAdd}
            globalSearch={globalSearch}
            onAddDep={handleAddDep}
            onAddCat={handleAddCat}
            onAddMar={handleAddMar}
            onSaveDep={handleSaveDep}
            onSaveCat={handleSaveCat}
            onSaveMar={handleSaveMar}
            onDeleteDep={handleDeleteDep}
            onDeleteCat={handleDeleteCat}
            onDeleteMar={handleDeleteMar}
            onOpenReasign={() => setViewMode("reasignacion")}
          />
        ) : (
          <CatalogosReasignacion
            depts={depts}
            cats={cats}
            marcas={marcas}
            proveedores={proveedores}
            onComplete={handleReasign}
            onCancel={() => setViewMode("columns")}
          />
        )}
      </div>

      {/* Modal de confirmación */}
      <ConfirmModal
        modal={confirmModal}
        onClose={closeConfirm}
        onGotoReasign={() => setViewMode("reasignacion")}
      />


      {/* Toast */}
      {toast && (
        <div className={`ctg-toast${toast.tipo === "error" ? " error" : ""}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
