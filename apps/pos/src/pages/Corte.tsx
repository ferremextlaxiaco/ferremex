import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { obtenerCorte, cerrarCorte, type CorteResponse } from "../lib/client"
import { usePOS } from "../lib/pos-store"

export function Corte() {
  const { state } = usePOS()
  const navigate = useNavigate()
  const [corte, setCorte] = useState<CorteResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [cerrando, setCerrando] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!state.cajero) {
    navigate("/", { replace: true })
    return null
  }

  const { nombre, turno_id } = state.cajero

  useEffect(() => {
    obtenerCorte(nombre, turno_id)
      .then(setCorte)
      .catch(() => setError("Error al cargar el corte"))
      .finally(() => setCargando(false))
  }, [nombre, turno_id])

  async function handleCerrarTurno() {
    if (!confirm("¿Confirmas el cierre de turno? Esta acción no se puede deshacer.")) return
    setCerrando(true)
    try {
      await cerrarCorte(nombre, turno_id)
      setCerrado(true)
      window.print()
    } catch {
      setError("Error al cerrar el turno")
    } finally {
      setCerrando(false)
    }
  }

  if (cargando) return <div className="loading-page">Cargando corte…</div>

  return (
    <div className="corte-page">
      <header className="pos-header">
        <span className="pos-marca">FERREMEX POS</span>
        <button className="btn-secondary btn-sm" onClick={() => navigate("/venta")}>
          ← Volver a ventas
        </button>
      </header>

      <main className="corte-main">
        <h2 className="corte-titulo">Corte de caja — {nombre}</h2>
        <p className="corte-turno">Turno: {turno_id}</p>

        {error && <p className="error-text">{error}</p>}

        {corte && (
          <>
            <div className="corte-resumen">
              <div className="corte-stat">
                <span className="corte-stat-label">Ventas</span>
                <span className="corte-stat-valor">{corte.num_ventas}</span>
              </div>
              <div className="corte-stat">
                <span className="corte-stat-label">Total en caja</span>
                <span className="corte-stat-valor">${corte.total.toFixed(2)}</span>
              </div>
            </div>

            <table className="corte-tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Hora</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {corte.ventas.map((v) => (
                  <tr key={v.folio}>
                    <td>{v.folio}</td>
                    <td>{new Date(v.fecha).toLocaleTimeString("es-MX")}</td>
                    <td>${v.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!cerrado ? (
              <button
                className="btn-cerrar-turno"
                onClick={handleCerrarTurno}
                disabled={cerrando}
              >
                {cerrando ? "Cerrando…" : "Cerrar turno e imprimir resumen"}
              </button>
            ) : (
              <p className="corte-cerrado">✓ Turno cerrado correctamente</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
