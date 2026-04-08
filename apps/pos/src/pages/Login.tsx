import { useNavigate } from "react-router-dom"
import { usePOS, buildTurnoId } from "../lib/pos-store"

// Lista de cajeros del negocio — agregar o editar según necesidades
const CAJEROS = ["André", "Cajero 2", "Cajero 3"]

export function Login() {
  const { dispatch } = usePOS()
  const navigate = useNavigate()

  function seleccionarCajero(nombre: string) {
    dispatch({
      type: "SET_CAJERO",
      cajero: { nombre, turno_id: buildTurnoId() },
    })
    navigate("/venta")
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-titulo">FERREMEX POS</h1>
        <p className="login-sub">¿Quién atiende este turno?</p>
        <div className="login-cajeros">
          {CAJEROS.map((nombre) => (
            <button
              key={nombre}
              className="btn-cajero"
              onClick={() => seleccionarCajero(nombre)}
            >
              {nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
