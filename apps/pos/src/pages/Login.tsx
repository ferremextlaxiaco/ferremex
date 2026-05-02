import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { obtenerUsuarios, obtenerTicketConfig, type PosUsuario } from "../lib/client"
import { usePOS, buildTurnoId } from "../lib/pos-store"

export function Login() {
  const { dispatch } = usePOS()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<PosUsuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pinUsuario, setPinUsuario] = useState<PosUsuario | null>(null)
  const [pinIngresado, setPinIngresado] = useState("")
  const [pinError, setPinError] = useState(false)

  useEffect(() => {
    Promise.all([obtenerUsuarios(), obtenerTicketConfig()])
      .then(([users, config]) => {
        setUsuarios(users.filter((u) => u.activo))
        dispatch({ type: "SET_TICKET_CONFIG", config })
      })
      .catch(() => setError("No se pudo conectar con el servidor"))
      .finally(() => setCargando(false))
  }, [dispatch])

  function iniciarSesion(usuario: PosUsuario) {
    dispatch({
      type: "SET_CAJERO",
      cajero: {
        id: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        turno_id: buildTurnoId(),
        permisos: usuario.permisos,
      },
    })
    if (usuario.permisos.puede_ver_admin && usuario.rol === "admin") {
      navigate("/venta")
    } else {
      navigate("/venta")
    }
  }

  function handleSeleccionar(usuario: PosUsuario) {
    if (usuario.pin) {
      setPinUsuario(usuario)
      setPinIngresado("")
      setPinError(false)
    } else {
      iniciarSesion(usuario)
    }
  }

  function handlePinDigito(d: string) {
    const nuevo = (pinIngresado + d).slice(0, 4)
    setPinIngresado(nuevo)
    setPinError(false)
    if (nuevo.length === 4) {
      setTimeout(() => {
        if (nuevo === pinUsuario?.pin) {
          iniciarSesion(pinUsuario)
        } else {
          setPinError(true)
          setPinIngresado("")
        }
      }, 120)
    }
  }

  function handlePinBorrar() {
    setPinIngresado((p) => p.slice(0, -1))
    setPinError(false)
  }

  if (cargando) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-titulo">FERREMEX POS</h1>
          <p className="login-sub">Conectando…</p>
        </div>
      </div>
    )
  }

  // ── Modal de PIN ──────────────────────────────────────────────────────────
  if (pinUsuario) {
    return (
      <div className="login-page">
        <div className="login-card">
          <button className="login-volver" onClick={() => setPinUsuario(null)}>← Volver</button>
          <h2 className="login-pin-nombre">{pinUsuario.nombre}</h2>
          <p className="login-sub">Ingresa tu PIN de 4 dígitos</p>

          <div className={`pin-dots ${pinError ? "pin-dots-error" : ""}`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`pin-dot ${i < pinIngresado.length ? "pin-dot-lleno" : ""}`} />
            ))}
          </div>

          {pinError && <p className="pin-error-msg">PIN incorrecto, intenta de nuevo</p>}

          <div className="pin-teclado">
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
              <button
                key={i}
                className={`pin-tecla ${d === "" ? "pin-tecla-vacia" : ""}`}
                disabled={d === ""}
                onClick={() => d === "⌫" ? handlePinBorrar() : handlePinDigito(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Selección de usuario ──────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-titulo">FERREMEX POS</h1>
        <p className="login-sub">¿Quién atiende este turno?</p>

        {error && <p className="error-text">{error}</p>}

        {!error && usuarios.length === 0 && (
          <p className="login-sub" style={{ color: "var(--text-soft)" }}>
            No hay usuarios configurados. Contacta al administrador.
          </p>
        )}

        <div className="login-cajeros">
          {usuarios.map((u) => (
            <button
              key={u.id}
              className="btn-cajero"
              onClick={() => handleSeleccionar(u)}
            >
              <span className="btn-cajero-nombre">{u.nombre}</span>
              <span className={`rol-badge rol-${u.rol}`}>{u.rol}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
