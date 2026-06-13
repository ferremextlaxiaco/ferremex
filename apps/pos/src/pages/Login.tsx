import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { obtenerUsuarios, obtenerTicketConfig, listarCajasAPI, obtenerConfigTurnos, login, type PosUsuario, type TurnosConfig } from "../lib/client"
import { usePOS, buildTurnoId } from "../lib/pos-store"

export function Login() {
  const { dispatch } = usePOS()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<PosUsuario[]>([])
  // Mapa caja_id → nombre, para sellar el corte con la caja del empleado sin un
  // fetch extra en el camino del login. En un ref para que `iniciarSesion` lea
  // siempre el valor más reciente (evita un stale closure si las cajas cargan
  // justo mientras un cajero está validando su PIN).
  const cajasPorIdRef = useRef<Record<string, string>>({})
  // Config de turnos (modo + franjas) para sellar el turno_id correcto al entrar.
  const turnosCfgRef = useRef<TurnosConfig | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pinUsuario, setPinUsuario] = useState<PosUsuario | null>(null)
  const [pinIngresado, setPinIngresado] = useState("")
  const [pinError, setPinError] = useState(false)
  const [validandoPin, setValidandoPin] = useState(false)

  useEffect(() => {
    // Las cajas y la config de turnos son opcionales: si fallan, el login sigue.
    Promise.all([
      obtenerUsuarios(),
      obtenerTicketConfig(),
      listarCajasAPI().catch(() => []),
      obtenerConfigTurnos().catch(() => null),
    ])
      .then(([users, config, cajas, turnosCfg]) => {
        setUsuarios(users.filter((u) => u.activo))
        cajasPorIdRef.current = Object.fromEntries(cajas.map((c) => [c.id, c.nombre]))
        turnosCfgRef.current = turnosCfg
        dispatch({ type: "SET_TICKET_CONFIG", config })
      })
      .catch(() => setError("No se pudo conectar con el servidor"))
      .finally(() => setCargando(false))
  }, [dispatch])

  const iniciarSesion = useCallback((usuario: PosUsuario) => {
    const caja_id = usuario.caja_id ?? null
    dispatch({
      type: "SET_CAJERO",
      cajero: {
        id: usuario.id,
        nombre: usuario.nombre,
        alias: usuario.alias?.trim() || undefined,
        rol: usuario.rol,
        // Modo día (default) → YYYY-MM-DD; modo turnos → franja de la hora actual.
        turno_id: buildTurnoId(turnosCfgRef.current),
        caja_id,
        caja_nombre: caja_id ? (cajasPorIdRef.current[caja_id] ?? null) : null,
        permisos: usuario.permisos,
      },
    })
    navigate("/venta")
  }, [dispatch, navigate])

  // Valida el PIN contra el backend (no se compara en el cliente).
  const validarYEntrar = useCallback(async (usuario: PosUsuario, pin: string) => {
    setValidandoPin(true)
    try {
      const validado = await login(usuario.id, pin)
      iniciarSesion(validado)
    } catch {
      setPinError(true)
      setPinIngresado("")
    } finally {
      setValidandoPin(false)
    }
  }, [iniciarSesion])

  const handlePinDigito = useCallback((d: string) => {
    if (validandoPin) return
    setPinError(false)
    setPinIngresado((prev) => {
      const nuevo = (prev + d).slice(0, 4)
      if (nuevo.length === 4 && pinUsuario) {
        // Disparar la validación tras pintar el 4º punto.
        setTimeout(() => validarYEntrar(pinUsuario, nuevo), 120)
      }
      return nuevo
    })
  }, [validandoPin, pinUsuario, validarYEntrar])

  const handlePinBorrar = useCallback(() => {
    setPinIngresado((p) => p.slice(0, -1))
    setPinError(false)
  }, [])

  // Listener de teclado estable: depende solo de pinUsuario y de los handlers
  // memoizados, no se re-suscribe en cada dígito (antes dependía de pinIngresado).
  useEffect(() => {
    if (!pinUsuario) return
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") handlePinDigito(e.key)
      else if (e.key === "Backspace" || e.key === "Delete") handlePinBorrar()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pinUsuario, handlePinDigito, handlePinBorrar])

  function handleSeleccionar(usuario: PosUsuario) {
    // El cliente ya no conoce el PIN, solo si existe (tiene_pin). Si no tiene PIN,
    // validamos con pin vacío server-side y entramos directo; si tiene, pedimos PIN.
    if (usuario.tiene_pin) {
      setPinUsuario(usuario)
      setPinIngresado("")
      setPinError(false)
    } else {
      validarYEntrar(usuario, "")
    }
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
          <h2 className="login-pin-nombre">{pinUsuario.alias?.trim() || pinUsuario.nombre}</h2>
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
              <span className="btn-cajero-nombre">{u.alias?.trim() || u.nombre}</span>
              <span className={`rol-badge rol-${u.rol}`}>{u.rol}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
