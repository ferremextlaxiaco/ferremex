import { useEffect, useState } from "react"
import { buscarCategorias, type CategoriasPOS, type FiltrosBusqueda } from "../lib/client"

export type FiltroStock = "todos" | "con-stock" | "sin-stock"

interface FiltroBarProps {
  filtros: FiltrosBusqueda
  onChange: (f: FiltrosBusqueda) => void
  filtroStock: FiltroStock
  onFiltroStockChange: (v: FiltroStock) => void
}

type ModoFiltro = "nombre" | "departamento" | "categoria" | "existencia"

export function FiltroBar({ filtros, onChange, filtroStock, onFiltroStockChange }: FiltroBarProps) {
  const [modo, setModo] = useState<ModoFiltro>("nombre")
  const [datos, setDatos] = useState<CategoriasPOS | null>(null)

  useEffect(() => {
    buscarCategorias()
      .then(setDatos)
      .catch(() => {/* sin filtros disponibles */})
  }, [])

  function seleccionarDepartamento(dep: string) {
    const nuevo = dep === filtros.departamento ? {} : { departamento: dep }
    onChange(nuevo)
  }

  function seleccionarCategoria(id: string) {
    const nuevo = id === filtros.category_id ? {} : { category_id: id }
    onChange(nuevo)
  }

  function cambiarModo(m: ModoFiltro) {
    setModo(m)
    // Limpiar filtros del modo anterior al cambiar
    onChange({})
  }

  const hayFiltroActivo = !!(filtros.departamento || filtros.category_id || filtroStock !== "todos")

  return (
    <div className="filtro-bar">
      {/* Tabs de modo */}
      <div className="filtro-tabs">
        <button
          className={`filtro-tab ${modo === "nombre" ? "filtro-tab-activo" : ""}`}
          onClick={() => cambiarModo("nombre")}
        >
          🔤 Nombre
        </button>
        <button
          className={`filtro-tab ${modo === "departamento" ? "filtro-tab-activo" : ""}`}
          onClick={() => cambiarModo("departamento")}
        >
          🏪 Departamento
        </button>
        <button
          className={`filtro-tab ${modo === "categoria" ? "filtro-tab-activo" : ""}`}
          onClick={() => cambiarModo("categoria")}
        >
          📂 Categoría
        </button>
        <button
          className={`filtro-tab ${modo === "existencia" ? "filtro-tab-activo" : ""} ${filtroStock !== "todos" ? "filtro-tab-con-dato" : ""}`}
          onClick={() => setModo("existencia")}
        >
          📦 Existencia{filtroStock !== "todos" ? " ●" : ""}
        </button>
        {hayFiltroActivo && (
          <button className="filtro-limpiar" onClick={() => { onChange({}); onFiltroStockChange("todos") }}>
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Chips de departamentos */}
      {modo === "departamento" && datos && datos.departamentos.length > 0 && (
        <div className="filtro-chips">
          {datos.departamentos.map((dep) => (
            <button
              key={dep}
              className={`filtro-chip ${filtros.departamento === dep ? "filtro-chip-activo" : ""}`}
              onClick={() => seleccionarDepartamento(dep)}
            >
              {dep}
            </button>
          ))}
        </div>
      )}

      {/* Chips de categorías */}
      {modo === "categoria" && datos && datos.categorias.length > 0 && (
        <div className="filtro-chips">
          {datos.categorias.map((cat) => (
            <button
              key={cat.id}
              className={`filtro-chip ${filtros.category_id === cat.id ? "filtro-chip-activo" : ""}`}
              onClick={() => seleccionarCategoria(cat.id)}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Chips de existencia */}
      {modo === "existencia" && (
        <div className="filtro-chips">
          {([["todos", "Todos los productos"], ["con-stock", "✓ Con existencia"], ["sin-stock", "✗ Sin existencia"]] as [FiltroStock, string][]).map(([val, label]) => (
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

      {(modo === "departamento" || modo === "categoria") && !datos && (
        <p className="filtro-cargando">Cargando filtros…</p>
      )}
    </div>
  )
}
