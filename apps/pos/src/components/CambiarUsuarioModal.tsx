import { useCallback, useEffect, useState } from "react"
import { X, ArrowLeft, RefreshCw } from "lucide-react"
import { obtenerUsuarios, login, type PosUsuario } from "../lib/client"
import { usePOS } from "../lib/pos-store"

/**
 * Cambiar el USUARIO logueado SIN cerrar la caja. A diferencia del login normal,
 * preserva la CAJA física y el turno de la terminal: el corte de esa caja sigue
 * corriendo y acumulando ventas sin importar quién esté en sesión. Útil cuando
 * otra persona toma la caja a media jornada (relevo) sin hacer arqueo.
 *
 * Valida el PIN server-side igual que el login. La caja heredada es la de la
 * TERMINAL (cajaActual), no la del nuevo usuario — el cajón físico no cambia.
 */
export function CambiarUsuarioModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePOS()
  const [usuarios, setUsuarios] = useState<PosUsuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [sel, setSel] = useState<PosUsuario | null>(null)
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState(false)
  const [validando, setValidando] = useState(false)

  const cajeroActual = state.cajero

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const us = await obtenerUsuarios()
        if (on) setUsuarios(us.filter((u) => u.activo))
      } catch { /* sin lista no se puede cambiar; el modal queda vacío */ }
      finally { if (on) setCargando(false) }
    })()
    return () => { on = false }
  }, [])

  // Re-loguea preservando caja/turno de la terminal (no del nuevo usuario).
  const entrar = useCallback((usuario: PosUsuario) => {
    if (!cajeroActual) return
    dispatch({
      type: "SET_CAJERO",
      cajero: {
        id: usuario.id,
        nombre: usuario.nombre,
        alias: usuario.alias?.trim() || undefined,
        rol: usuario.rol,
        // PRESERVAR caja y turno actuales de la terminal: el corte de esta caja
        // sigue corriendo; solo cambia quién opera.
        turno_id: cajeroActual.turno_id,
        caja_id: cajeroActual.caja_id ?? null,
        caja_nombre: cajeroActual.caja_nombre ?? null,
        permisos: usuario.permisos,
      },
    })
    onClose()
  }, [cajeroActual, dispatch, onClose])

  const validarYEntrar = useCallback(async (usuario: PosUsuario, p: string) => {
    setValidando(true)
    try {
      const validado = await login(usuario.id, p)
      entrar(validado)
    } catch {
      setPinError(true)
      setPin("")
    } finally {
      setValidando(false)
    }
  }, [entrar])

  function seleccionar(u: PosUsuario) {
    if (u.tiene_pin) { setSel(u); setPin(""); setPinError(false) }
    else validarYEntrar(u, "")
  }

  const pulsar = useCallback((d: string) => {
    if (validando || !sel) return
    setPinError(false)
    setPin((prev) => {
      const nuevo = (prev + d).slice(0, 4)
      if (nuevo.length === 4) setTimeout(() => validarYEntrar(sel, nuevo), 120)
      return nuevo
    })
  }, [validando, sel, validarYEntrar])

  const borrar = useCallback(() => { setPin((p) => p.slice(0, -1)); setPinError(false) }, [])

  // Teclado físico para el PIN.
  useEffect(() => {
    if (!sel) return
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") pulsar(e.key)
      else if (e.key === "Backspace" || e.key === "Delete") borrar()
      else if (e.key === "Escape") setSel(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sel, pulsar, borrar])

  // Escape global cierra el modal cuando no se está en la pantalla de PIN.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !sel) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sel, onClose])

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
        onClick={(e) => e.stopPropagation()}>
        {/* Encabezado */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {sel && (
              <button onClick={() => setSel(null)} className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw size={18} className="text-orange-600" /> Cambiar usuario
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Aviso: la caja se conserva */}
        <p className="text-xs text-gray-500 mb-4">
          La caja <strong className="text-gray-700">{cajeroActual?.caja_nombre ?? "sin caja"}</strong> y su corte siguen abiertos.
          Solo cambia quién opera; no se hace arqueo.
        </p>

        {!sel ? (
          /* Lista de usuarios */
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {cargando ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">Cargando…</div>
            ) : usuarios.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">No hay usuarios disponibles.</div>
            ) : usuarios.map((u) => (
              <button
                key={u.id}
                onClick={() => seleccionar(u)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50 ${
                  u.id === cajeroActual?.id ? "bg-orange-50/50" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{u.alias?.trim() || u.nombre}</div>
                  <div className="text-xs text-gray-400 capitalize">{u.rol}{u.id === cajeroActual?.id ? " · en sesión" : ""}</div>
                </div>
                {!u.tiene_pin && <span className="text-[11px] text-gray-400">sin PIN</span>}
              </button>
            ))}
          </div>
        ) : (
          /* Teclado de PIN */
          <div className="text-center">
            <div className="text-sm font-semibold text-gray-900 mb-1">{sel.alias?.trim() || sel.nombre}</div>
            <p className="text-xs text-gray-500 mb-4">Ingresa el PIN de 4 dígitos</p>

            <div className="flex justify-center gap-3 mb-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${
                  i < pin.length ? "bg-orange-500 border-orange-500" : "border-gray-300"
                }`} />
              ))}
            </div>
            {pinError && <p className="text-sm text-red-600 mb-3">PIN incorrecto, intenta de nuevo</p>}

            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                <button
                  key={i}
                  disabled={d === "" || validando}
                  onClick={() => d === "⌫" ? borrar() : pulsar(d)}
                  className={`h-14 rounded-xl text-lg font-semibold ${
                    d === ""
                      ? "invisible"
                      : "bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100 active:scale-95 transition-transform"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
