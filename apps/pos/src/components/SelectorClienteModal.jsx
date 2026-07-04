import { useEffect, useState, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { Search, X, UserRound } from "lucide-react"
import { loadClientes } from "../lib/clientes"

/**
 * Ventana flotante (modal) para buscar y seleccionar un cliente de la BD.
 *
 * Autónomo: NO toca el pos-store ni el clienteActivo. Solo carga la lista de
 * clientes, permite buscar por NÚMERO o NOMBRE, y devuelve el elegido por
 * `onSelect(cliente)`. Pensado como selector reutilizable (p. ej. el filtro por
 * cliente de Consulta de Ventas).
 *
 * Props:
 *  - open: boolean — controla la visibilidad.
 *  - onSelect(cliente | null) — elegido; `null` = "Todos / limpiar filtro".
 *  - onClose() — cerrar sin elegir (overlay / Escape / ✕).
 *  - permitirTodos: boolean (default true) — muestra la opción "Todos".
 */
export default function SelectorClienteModal({ open, onSelect, onClose, permitirTodos = true }) {
  const [busqueda, setBusqueda] = useState("")
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef(null)

  // Cargar clientes frescos de la BD cada vez que se abre.
  useEffect(() => {
    if (!open) return
    let on = true
    setBusqueda("")
    setError(false)
    setCargando(true)
    loadClientes()
      .then((data) => { if (on) setClientes(data) })
      .catch(() => { if (on) { setClientes([]); setError(true) } })
      .finally(() => { if (on) setCargando(false) })
    return () => { on = false }
  }, [open])

  // Foco al buscador al abrir + cerrar con Escape.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [open, onClose])

  // Filtra por nombre o número de cliente (case-insensitive).
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return clientes
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || String(c.num_cliente).toLowerCase().includes(q)
    )
  }, [clientes, busqueda])

  if (!open) return null

  return createPortal(
    <div className="scm-overlay" onClick={onClose}>
      <div className="scm-modal" role="dialog" aria-modal="true" aria-label="Buscar cliente" onClick={(e) => e.stopPropagation()}>
        <div className="scm-head">
          <span className="scm-titulo"><UserRound size={17} /> Buscar cliente</span>
          <button className="scm-cerrar" onClick={onClose} aria-label="Cerrar (Esc)"><X size={18} /></button>
        </div>

        <div className="scm-search-wrap">
          <Search size={15} className="scm-search-icon" />
          <input
            ref={inputRef}
            className="scm-search"
            placeholder="Buscar por número o nombre…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="scm-results">
          {permitirTodos && (
            <button className="scm-item scm-item--todos" onClick={() => onSelect(null)}>
              <span className="scm-item-nombre">Todos los clientes</span>
              <span className="scm-item-meta">Quitar el filtro por cliente</span>
            </button>
          )}

          {cargando && <p className="scm-vacio">Cargando clientes…</p>}
          {error && !cargando && <p className="scm-vacio">No se pudieron cargar los clientes.</p>}

          {!cargando && !error && resultados.map((c) => (
            <button key={c.id} className="scm-item" onClick={() => onSelect(c)}>
              <span className="scm-item-nombre">{c.nombre}</span>
              <span className="scm-item-meta">
                #{c.num_cliente}
                {c.grupo ? ` · ${c.grupo}` : ""}
                {c.telefono ? ` · ${c.telefono}` : ""}
              </span>
            </button>
          ))}

          {!cargando && !error && resultados.length === 0 && (
            <p className="scm-vacio">
              {busqueda.trim() ? `Sin resultados para "${busqueda}"` : "No hay clientes registrados."}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
