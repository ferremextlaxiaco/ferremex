import { useEffect, useState } from "react"
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

type ModoFiltro = "nombre" | "explorar" | "existencia"

export function FiltroBar({ filtros, onChange, filtroStock, onFiltroStockChange }: FiltroBarProps) {
  const [modo, setModo] = useState<ModoFiltro>("nombre")
  const [datos, setDatos] = useState<CatalogosData | null>(null)
  const [deptActivo, setDeptActivo] = useState<CatalogosDept | null>(null)
  const [catActiva, setCatActiva] = useState<CatalogosCat | null>(null)
  const [marcaActiva, setMarcaActiva] = useState<CatalogosMarca | null>(null)

  useEffect(() => {
    listarCatalogos().then(setDatos).catch(() => {})
  }, [])

  function resetCascada() {
    setDeptActivo(null)
    setCatActiva(null)
    setMarcaActiva(null)
  }

  function handleNombreClick() {
    setModo("nombre")
    resetCascada()
    onChange({})
  }

  function seleccionarDept(dept: CatalogosDept) {
    setDeptActivo(dept)
    setCatActiva(null)
    setMarcaActiva(null)
    onChange({ departamento: dept.nombre })
  }

  function seleccionarCat(cat: CatalogosCat) {
    setCatActiva(cat)
    setMarcaActiva(null)
    const f: FiltrosBusqueda = cat.medusaId
      ? { category_id: cat.medusaId }
      : { departamento: deptActivo?.nombre }
    onChange(f)
  }

  function seleccionarMarca(mar: CatalogosMarca) {
    setMarcaActiva(mar)
    const base: FiltrosBusqueda = catActiva?.medusaId
      ? { category_id: catActiva.medusaId }
      : { departamento: deptActivo?.nombre }
    onChange({ ...base, marca: mar.nombre })
  }

  function irAtras() {
    if (marcaActiva) {
      setMarcaActiva(null)
      const f: FiltrosBusqueda = catActiva?.medusaId
        ? { category_id: catActiva.medusaId }
        : { departamento: deptActivo?.nombre }
      onChange(f)
    } else if (catActiva) {
      setCatActiva(null)
      onChange({ departamento: deptActivo!.nombre })
    } else if (deptActivo) {
      resetCascada()
      onChange({})
    }
  }

  function irADept() {
    setCatActiva(null)
    setMarcaActiva(null)
    onChange({ departamento: deptActivo!.nombre })
  }

  function irACat() {
    setMarcaActiva(null)
    const f: FiltrosBusqueda = catActiva?.medusaId
      ? { category_id: catActiva.medusaId }
      : { departamento: deptActivo?.nombre }
    onChange(f)
  }

  const catsParaDept = datos?.cats.filter(c => c.depId === deptActivo?.id) ?? []
  const marcasParaCat = datos?.marcas.filter(m => m.catId === catActiva?.id) ?? []

  const explorarActivo = !!(filtros.departamento || filtros.category_id || filtros.marca)
  const hayFiltroActivo = explorarActivo || filtroStock !== "todos"

  return (
    <div className="filtro-bar">
      <div className="filtro-tabs">
        <button
          className={`filtro-tab ${modo === "nombre" ? "filtro-tab-activo" : ""}`}
          onClick={handleNombreClick}
        >
          🔤 Nombre
        </button>
        <button
          className={`filtro-tab ${modo === "explorar" ? "filtro-tab-activo" : ""}`}
          onClick={() => setModo("explorar")}
        >
          🗂️ Explorar{explorarActivo ? " ●" : ""}
        </button>
        <button
          className={`filtro-tab ${modo === "existencia" ? "filtro-tab-activo" : ""} ${filtroStock !== "todos" ? "filtro-tab-con-dato" : ""}`}
          onClick={() => setModo("existencia")}
        >
          📦 Existencia{filtroStock !== "todos" ? " ●" : ""}
        </button>
        {hayFiltroActivo && (
          <button
            className="filtro-limpiar"
            onClick={() => { resetCascada(); setModo("nombre"); onChange({}); onFiltroStockChange("todos") }}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* ── Explorar: cascada Dept → Cat → Marca ── */}
      {modo === "explorar" && (
        <>
          {!datos && <p className="filtro-cargando">Cargando…</p>}

          {datos && deptActivo && (
            <div className="filtro-breadcrumb">
              <button className="filtro-bc-back" onClick={irAtras}>←</button>
              <button
                className={`filtro-bc-item ${!catActiva ? "filtro-bc-activo" : ""}`}
                onClick={irADept}
              >
                {deptActivo.nombre}
              </button>
              {catActiva && (
                <>
                  <span className="filtro-bc-sep">›</span>
                  <button
                    className={`filtro-bc-item ${!marcaActiva ? "filtro-bc-activo" : ""}`}
                    onClick={irACat}
                  >
                    {catActiva.nombre}
                  </button>
                </>
              )}
              {marcaActiva && (
                <>
                  <span className="filtro-bc-sep">›</span>
                  <span className="filtro-bc-item filtro-bc-activo">{marcaActiva.nombre}</span>
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

          {/* Level 2: marcas de la categoría */}
          {datos && catActiva && (
            <div className="filtro-chips">
              {marcasParaCat.length > 0
                ? marcasParaCat.map(mar => (
                    <button
                      key={mar.id}
                      className={`filtro-chip ${marcaActiva?.id === mar.id ? "filtro-chip-activo" : ""}`}
                      onClick={() => seleccionarMarca(mar)}
                    >
                      {mar.nombre}
                    </button>
                  ))
                : <span className="filtro-cargando">Sin marcas en esta categoría</span>}
            </div>
          )}
        </>
      )}

      {/* ── Existencia ── */}
      {modo === "existencia" && (
        <div className="filtro-chips">
          {(
            [
              ["todos", "Todos los productos"],
              ["con-stock", "✓ Con existencia"],
              ["sin-stock", "✗ Sin existencia"],
            ] as [FiltroStock, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              className={`filtro-chip ${filtroStock === val ? "filtro-chip-activo" : ""}`}
              onClick={() => onFiltroStockChange(val)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
