import { useEffect, useState } from "react"
import { Type, FolderTree, Package, X, Check, ArrowLeft } from "lucide-react"
import {
  listarCatalogos,
  type CatalogosData,
  type CatalogosCat,
  type CatalogosDept,
  type CatalogosMarca,
  type FiltrosBusqueda,
} from "../lib/client"

export type FiltroStock = "todos" | "con-stock" | "sin-stock"

interface FiltroBarProps {
  filtros: FiltrosBusqueda
  onChange: (f: FiltrosBusqueda) => void
  filtroStock: FiltroStock
  onFiltroStockChange: (v: FiltroStock) => void
}

type ModoFiltro = "nombre" | "explorar"

export function FiltroBar({ filtros, onChange, filtroStock, onFiltroStockChange }: FiltroBarProps) {
  const [modo, setModo] = useState<ModoFiltro>("nombre")
  const [datos, setDatos] = useState<CatalogosData | null>(null)
  const [deptActivo, setDeptActivo] = useState<CatalogosDept | null>(null)
  const [catActiva, setCatActiva] = useState<CatalogosCat | null>(null)
  // Marcas seleccionadas (múltiples). Guardamos NOMBRES para casar con el filtro.
  const [marcasActivas, setMarcasActivas] = useState<string[]>([])

  useEffect(() => {
    listarCatalogos().then(setDatos).catch(() => {})
  }, [])

  function resetCascada() {
    setDeptActivo(null)
    setCatActiva(null)
    setMarcasActivas([])
  }

  function handleNombreClick() {
    setModo("nombre")
    resetCascada()
    onChange({})
  }

  // Base del filtro (categoría o departamento) según la selección actual.
  function baseFiltro(): FiltrosBusqueda {
    return catActiva?.medusaId
      ? { category_id: catActiva.medusaId }
      : { departamento: deptActivo?.nombre }
  }

  function seleccionarDept(dept: CatalogosDept) {
    setDeptActivo(dept)
    setCatActiva(null)
    setMarcasActivas([])
    onChange({ departamento: dept.nombre })
  }

  function seleccionarCat(cat: CatalogosCat) {
    setCatActiva(cat)
    setMarcasActivas([])
    const f: FiltrosBusqueda = cat.medusaId
      ? { category_id: cat.medusaId }
      : { departamento: deptActivo?.nombre }
    onChange(f)
  }

  // Marca = toggle: agrega o quita del conjunto de marcas activas. Sin ninguna
  // seleccionada, se muestran todas las de la categoría.
  function toggleMarca(mar: CatalogosMarca) {
    const activa = marcasActivas.includes(mar.nombre)
    const nuevas = activa
      ? marcasActivas.filter((m) => m !== mar.nombre)
      : [...marcasActivas, mar.nombre]
    setMarcasActivas(nuevas)
    onChange({ ...baseFiltro(), ...(nuevas.length > 0 ? { marcas: nuevas } : {}) })
  }

  function irAtras() {
    // Las marcas ya no son un nivel de cascada (son chips dentro de la categoría);
    // "atrás" sube de categoría → departamento → raíz.
    if (catActiva) {
      setCatActiva(null)
      setMarcasActivas([])
      onChange({ departamento: deptActivo!.nombre })
    } else if (deptActivo) {
      resetCascada()
      onChange({})
    }
  }

  function irADept() {
    setCatActiva(null)
    setMarcasActivas([])
    onChange({ departamento: deptActivo!.nombre })
  }

  const catsParaDept = datos?.cats.filter(c => c.depId === deptActivo?.id) ?? []
  const marcasParaCat = datos?.marcas.filter(m => m.catId === catActiva?.id) ?? []

  const explorarActivo = !!(filtros.departamento || filtros.category_id || filtros.marca || (filtros.marcas && filtros.marcas.length))
  const hayFiltroActivo = explorarActivo || filtroStock !== "todos"

  return (
    <div className="filtro-bar">
      <div className="filtro-tabs">
        <button
          className={`filtro-tab ${modo === "nombre" ? "filtro-tab-activo" : ""}`}
          onClick={handleNombreClick}
        >
          <Type size={16} /> Nombre
        </button>
        <button
          className={`filtro-tab ${modo === "explorar" ? "filtro-tab-activo" : ""}`}
          onClick={() => setModo("explorar")}
        >
          <FolderTree size={16} /> Explorar{explorarActivo && <span className="filtro-tab-dot" />}
        </button>
        {/* Filtro de existencia CÍCLICO: clic alterna todos → con existencia →
            sin existencia → todos. La etiqueta refleja el estado actual. */}
        <button
          className={`filtro-tab ${filtroStock !== "todos" ? "filtro-tab-activo filtro-tab-con-dato" : ""}`}
          onClick={() => onFiltroStockChange(
            filtroStock === "todos" ? "con-stock" : filtroStock === "con-stock" ? "sin-stock" : "todos"
          )}
          title="Clic para alternar: Todos → Con existencia → Sin existencia"
        >
          <Package size={16} /> {
            filtroStock === "con-stock" ? "Con existencia"
            : filtroStock === "sin-stock" ? "Sin existencia"
            : "Existencia"
          }
          {filtroStock !== "todos" && <span className="filtro-tab-dot" />}
        </button>
        {hayFiltroActivo && (
          <button
            className="filtro-limpiar"
            onClick={() => { resetCascada(); setModo("nombre"); onChange({}); onFiltroStockChange("todos") }}
          >
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* ── Explorar: cascada Dept → Cat → Marca ── */}
      {modo === "explorar" && (
        <>
          {!datos && <p className="filtro-cargando">Cargando…</p>}

          {datos && deptActivo && (
            <div className="filtro-breadcrumb">
              <button className="filtro-bc-back" onClick={irAtras}><ArrowLeft size={15} /></button>
              <button
                className={`filtro-bc-item ${!catActiva ? "filtro-bc-activo" : ""}`}
                onClick={irADept}
              >
                {deptActivo.nombre}
              </button>
              {catActiva && (
                <>
                  <span className="filtro-bc-sep">›</span>
                  <span className="filtro-bc-item filtro-bc-activo">{catActiva.nombre}</span>
                </>
              )}
              {marcasActivas.length > 0 && (
                <>
                  <span className="filtro-bc-sep">›</span>
                  <span className="filtro-bc-item filtro-bc-activo">
                    {marcasActivas.length === 1 ? marcasActivas[0] : `${marcasActivas.length} marcas`}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Level 0: todos los departamentos */}
          {datos && !deptActivo && (
            <div className="filtro-chips">
              {datos.depts.map(dept => (
                <button
                  key={dept.id}
                  className="filtro-chip"
                  onClick={() => seleccionarDept(dept)}
                >
                  {dept.nombre}
                </button>
              ))}
            </div>
          )}

          {/* Level 1: categorías del departamento */}
          {datos && deptActivo && !catActiva && (
            <div className="filtro-chips">
              {catsParaDept.length > 0
                ? catsParaDept.map(cat => (
                    <button
                      key={cat.id}
                      className="filtro-chip"
                      onClick={() => seleccionarCat(cat)}
                    >
                      {cat.nombre}
                    </button>
                  ))
                : <span className="filtro-cargando">Sin categorías en este departamento</span>}
            </div>
          )}

          {/* Level 2: marcas de la categoría — selección MÚLTIPLE (toggle).
              Sin ninguna activa = se muestran todas las de la categoría. */}
          {datos && catActiva && (
            <>
              {marcasParaCat.length > 0 && (
                <p className="filtro-marcas-hint">
                  Elige una o varias marcas (sin selección se muestran todas)
                </p>
              )}
              <div className="filtro-chips">
                {marcasParaCat.length > 0
                  ? marcasParaCat.map(mar => {
                      const activa = marcasActivas.includes(mar.nombre)
                      return (
                        <button
                          key={mar.id}
                          className={`filtro-chip ${activa ? "filtro-chip-activo" : ""}`}
                          onClick={() => toggleMarca(mar)}
                        >
                          {activa && <Check size={13} />}{mar.nombre}
                        </button>
                      )
                    })
                  : <span className="filtro-cargando">Sin marcas en esta categoría</span>}
              </div>
            </>
          )}
        </>
      )}

    </div>
  )
}
