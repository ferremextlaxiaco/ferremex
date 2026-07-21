import { Navigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import EmployeesModule from "../modules/EmployeesModule"

export function AdminEmpleados() {
  const { state } = usePOS()

  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_gestionar_empleados) return <Navigate to="/admin" replace />

  return <EmployeesModule />
}
