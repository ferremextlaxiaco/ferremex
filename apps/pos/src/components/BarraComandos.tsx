import { useNavigate } from "react-router-dom"
import { Bookmark, Banknote, BarChart3, Lock, Settings, LogOut } from "lucide-react"
import { usePOS } from "../lib/pos-store"

interface BarraComandosProps {
  /** Cuántos pedidos/cotizaciones hay en espera (badge). */
  pedidosEnEspera: number
  /** Abre el panel de pedidos en espera (acción local, no navega). */
  onAbrirEspera: () => void
}

/**
 * Barra de comandos del panel de venta (segunda fila del header).
 *
 * Atajos táctiles (≥48px) a las operaciones que antes vivían enterradas en
 * /admin. Cada atajo respeta los permisos del cajero: si no tiene el permiso,
 * el botón no se renderiza. Admin y Salir quedan al extremo derecho, discretos.
 */
export function BarraComandos({ pedidosEnEspera, onAbrirEspera }: BarraComandosProps) {
  const { state } = usePOS()
  const navigate = useNavigate()
  const cajero = state.cajero
  if (!cajero) return null

  const puedeAdmin = !!cajero.permisos.puede_ver_admin
  const puedeCorte = !!cajero.permisos.puede_ver_corte

  return (
    <div className="barra-comandos">
      <div className="barra-comandos-grupo">
        {/* Pedidos en espera / cotizaciones — acción local sobre el carrito actual */}
        <button className="cmd-btn" onClick={onAbrirEspera} title="Pedidos en espera / cotizaciones">
          <Bookmark size={18} />
          <span>En espera</span>
          {pedidosEnEspera > 0 && <span className="cmd-badge">{pedidosEnEspera}</span>}
        </button>

        {/* Movimientos de caja (entradas/salidas/fondo) */}
        {puedeAdmin && (
          <button className="cmd-btn" onClick={() => navigate("/admin/caja")} title="Movimientos de caja">
            <Banknote size={18} />
            <span>Movimientos</span>
          </button>
        )}

        {/* Ventas del día / historial */}
        {puedeAdmin && (
          <button className="cmd-btn" onClick={() => navigate("/admin/consulta-ventas")} title="Ventas del día">
            <BarChart3 size={18} />
            <span>Ventas</span>
          </button>
        )}

        {/* Corte de caja / arqueo */}
        {puedeCorte && (
          <button className="cmd-btn" onClick={() => navigate("/corte")} title="Corte de caja / arqueo">
            <Lock size={18} />
            <span>Corte</span>
          </button>
        )}
      </div>

      <div className="barra-comandos-grupo barra-comandos-grupo--fin">
        {puedeAdmin && (
          <button className="cmd-btn cmd-btn--ghost" onClick={() => navigate("/admin")} title="Panel de administración">
            <Settings size={18} />
            <span>Admin</span>
          </button>
        )}
        <button
          className="cmd-btn cmd-btn--ghost"
          onClick={() => navigate("/", { replace: true })}
          title="Cerrar sesión"
        >
          <LogOut size={18} />
          <span>Salir</span>
        </button>
      </div>
    </div>
  )
}
