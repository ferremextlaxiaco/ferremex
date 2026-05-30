import { Navigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import CorteModule from "../modules/CorteModule"

/**
 * Página de Corte de caja (arqueo). Wrapper delgado: solo aplica las guardias de
 * acceso y monta el módulo. Toda la lógica vive en CorteModule.
 */
export function Corte() {
  const { state } = usePOS()

  // Guardias de acceso en render con <Navigate> (no navigate() en el cuerpo, que
  // viola las reglas de React y se duplica en StrictMode).
  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_corte) return <Navigate to="/venta" replace />

  return (
    <div className="corte-shell" style={{ height: "100vh" }}>
      <CorteModule />
    </div>
  )
}
