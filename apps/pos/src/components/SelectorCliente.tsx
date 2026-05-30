import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import { loadClientes, type Cliente } from "../lib/clientes"

export function SelectorCliente() {
  const { state, dispatch } = usePOS()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  // Cargar clientes frescos desde la BD cada vez que se abre el panel
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(false)

  const cliente = state.clienteActivo

  // Filtra en tiempo real mientras escribe
  const resultados = busqueda.trim()
    ? clientes.filter((c) => {
        const q = busqueda.toLowerCase()
        return (
          c.nombre.toLowerCase().includes(q) ||
          c.num_cliente.includes(q)
        )
      })
    : clientes

  async function abrir() {
    setBusqueda("")
    setAbierto(true)
    setCargando(true)
    try {
      setClientes(await loadClientes())   // datos frescos desde la BD
    } catch {
      setClientes([])
    } finally {
      setCargando(false)
    }
  }

  function cerrar() {
    setAbierto(false)
    setBusqueda("")
  }

  function seleccionar(c: Cliente | null) {
    dispatch({ type: "SET_CLIENTE", cliente: c })
    cerrar()
  }

  function irAEditar() {
    if (!cliente) return
    navigate(`/admin/clientes?editar=${cliente.id}`)
  }

  function irANuevo() {
    navigate("/admin/clientes?nuevo=1")
  }

  return (
    <div className="sc-widget">
      {/* Trigger: siempre visible */}
      <button className="sc-trigger" onClick={abierto ? cerrar : abrir}>
        <span className="sc-icon">👤</span>
        {cliente ? (
          <div className="sc-selected">
            <span className="sc-nombre">{cliente.nombre}</span>
            <span className="sc-meta">
              #{cliente.num_cliente}
              {" · "}Precio {cliente.num_precio}
              {cliente.grupo ? ` · ${cliente.grupo}` : ""}
              {cliente.monedero ? " · 💰 Monedero" : ""}
            </span>
          </div>
        ) : (
          <span className="sc-publico">Público en general</span>
        )}
        <span className="sc-chevron">{abierto ? "▲" : "▼"}</span>
      </button>

      {/* Botones de acción rápida (solo cuando hay cliente y el panel está cerrado) */}
      {cliente && !abierto && (
        <div className="sc-acciones">
          <button
            className="sc-btn-accion"
            title="Editar datos del cliente"
            onClick={irAEditar}
          >
            ✏️
          </button>
          <button
            className="sc-btn-accion"
            title="Nuevo cliente"
            onClick={irANuevo}
          >
            ➕
          </button>
        </div>
      )}

      {/* Panel de búsqueda */}
      {abierto && (
        <>
          {/* Overlay para cerrar al hacer clic fuera */}
          <div className="sc-overlay" onClick={cerrar} />

          <div className="sc-panel">
            <input
              className="sc-search"
              placeholder="Buscar por nombre o número…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
            />

            <div className="sc-results">
              {/* Opción siempre visible: Público en general */}
              <button
                className={`sc-result-item${!cliente ? " sc-result-activo" : ""}`}
                onClick={() => seleccionar(null)}
              >
                <span className="sc-result-publico">👤 Público en general</span>
              </button>

              {resultados.map((c) => (
                <button
                  key={c.id}
                  className={`sc-result-item${cliente?.id === c.id ? " sc-result-activo" : ""}`}
                  onClick={() => seleccionar(c)}
                >
                  <span className="sc-result-nombre">{c.nombre}</span>
                  <span className="sc-result-meta">
                    #{c.num_cliente}
                    {c.grupo ? ` · ${c.grupo}` : ""}
                    {" · "}Precio {c.num_precio}
                    {c.telefono ? ` · ${c.telefono}` : ""}
                    {c.monedero ? " · 💰" : ""}
                  </span>
                </button>
              ))}

              {cargando && (
                <p className="sc-vacio">Cargando clientes…</p>
              )}

              {!cargando && resultados.length === 0 && busqueda.trim() && (
                <p className="sc-vacio">Sin resultados para "{busqueda}"</p>
              )}
            </div>

            {/* Pie del panel: acceso directo a nuevo cliente */}
            <div className="sc-panel-footer">
              <button className="sc-btn-nuevo" onClick={() => { cerrar(); irANuevo() }}>
                ➕ Nuevo cliente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
