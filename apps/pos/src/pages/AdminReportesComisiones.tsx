import { useNavigate, Navigate } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import ComisionesReporte from "../components/ComisionesReporte"

export function AdminReportesComisiones() {
  const { state } = usePOS()
  const navigate = useNavigate()

  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_reportes) return <Navigate to="/admin" replace />

  return (
    <div className="rep-contenido">
      <button className="rep-volver-btn" onClick={() => navigate("/admin/reportes/empleados")}>
        <ArrowLeft size={14} /> Reportes de Empleados
      </button>
      <ComisionesReporte />
    </div>
  )
}
