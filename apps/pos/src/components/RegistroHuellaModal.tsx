// ============================================================================
// Ferremex — Modal de REGISTRO de huella (enroll multi-captura). Reutilizable
// para clientes y empleados (mismo flujo, distinto sujeto_tipo/sujeto_ref).
//
// Flujo:
//   1. Verifica que el servicio local + lector estén disponibles (health).
//   2. capturarEnroll (SSE): pide el dedo N veces, anima el progreso 1/4…4/4.
//   3. Guarda la plantilla consolidada en BD Medusa (registrarHuellaAPI).
//   4. Éxito → cierra y notifica al padre (onRegistrada).
//
// La huella se captura y consolida en el servicio LOCAL (nunca sale de la caja);
// solo la plantilla (bytes) se envía a la BD.
// ============================================================================
import { useEffect, useState } from "react"
import { X, Fingerprint, AlertTriangle } from "lucide-react"
import HuellaAnimacion from "./HuellaAnimacion"
import {
  healthBiometria,
  capturarEnroll,
  cancelar,
  BiometriaError,
  type ProgresoEnroll,
} from "../lib/biometria"
import { registrarHuellaAPI, type SujetoBiometrico } from "../lib/client"

type Fase = "verificando" | "no_disponible" | "listo" | "capturando" | "guardando" | "ok" | "error"

interface Props {
  sujetoTipo: SujetoBiometrico
  sujetoRef: string
  nombre: string           // para el título ("Registrar huella de Juan")
  dedo?: string            // default "indice_der"
  muestras?: number        // default 4
  onCerrar: () => void
  onRegistrada?: () => void // callback tras guardar OK
}

export default function RegistroHuellaModal({
  sujetoTipo,
  sujetoRef,
  nombre,
  dedo = "indice_der",
  muestras = 4,
  onCerrar,
  onRegistrada,
}: Props) {
  const [fase, setFase] = useState<Fase>("verificando")
  const [mensaje, setMensaje] = useState("")
  const [progreso, setProgreso] = useState<ProgresoEnroll | null>(null)
  const [capturaId, setCapturaId] = useState<string | null>(null)

  // Health check al montar.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const h = await healthBiometria()
      if (!vivo) return
      if (!h?.ok) {
        setFase("no_disponible")
        setMensaje("El servicio de huella no está corriendo en esta caja.")
      } else if (!h.lector?.conectado) {
        setFase("no_disponible")
        setMensaje("No se detecta el lector de huella. Revisa la conexión.")
      } else {
        setFase("listo")
      }
    })()
    return () => { vivo = false }
  }, [])

  async function iniciarCaptura() {
    setFase("capturando")
    setProgreso(null)
    try {
      const r = await capturarEnroll({
        muestras,
        onProgreso: (p) => setProgreso(p),
      })
      setCapturaId(r.captura_id)

      // Guardar la plantilla consolidada en BD.
      setFase("guardando")
      await registrarHuellaAPI({
        sujeto_tipo: sujetoTipo,
        sujeto_ref: sujetoRef,
        dedo,
        plantilla_b64: r.plantilla_b64,
        calidad: r.calidad,
        motor: "dpfj",
        formato: "ANSI_378_2004",
      })

      setFase("ok")
      // La animación de éxito corre a 60fps hasta el frame ~105 (≈1.75s). Damos
      // 2.4s para que la palomita termine de dibujarse por completo antes de cerrar.
      setTimeout(() => { onRegistrada?.(); onCerrar() }, 2400)
    } catch (e: any) {
      const be = e as BiometriaError
      setFase("error")
      if (be?.codigo === "TIMEOUT_DEDO") setMensaje("No se detectó el dedo. Inténtalo de nuevo.")
      else if (be?.codigo === "CALIDAD_INSUFICIENTE") setMensaje("Calidad baja. Coloca bien el dedo y reintenta.")
      else if (be?.codigo === "SERVICIO_CAIDO") setMensaje("El servicio de huella dejó de responder.")
      else if (be?.codigo === "CANCELADO") setMensaje("Registro cancelado.")
      else setMensaje(be?.message || "No se pudo registrar la huella.")
    }
  }

  function cerrar() {
    if (capturaId) cancelar(capturaId)
    onCerrar()
  }

  const textoProgreso = progreso
    ? progreso.fase === "esperando_dedo"
      ? `Coloca el dedo (${progreso.muestra}/${progreso.total})`
      : `Captura ${progreso.muestra}/${progreso.total} ✓`
    : ""

  return (
    <div
      className="fixed inset-0 z-[750] flex items-center justify-center p-4 bg-black/50"
      onClick={() => fase !== "capturando" && fase !== "guardando" && cerrar()}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <Fingerprint size={18} />
            </span>
            <h2 className="text-lg font-bold text-gray-900">Registrar huella</h2>
          </div>
          {fase !== "capturando" && fase !== "guardando" && (
            <button onClick={cerrar} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={20} />
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">{nombre}</p>

        {/* Estado: verificando */}
        {fase === "verificando" && (
          <div className="text-center py-8 text-gray-500 text-sm">Verificando el lector…</div>
        )}

        {/* Estado: no disponible */}
        {fase === "no_disponible" && (
          <div className="text-center py-6 flex flex-col items-center gap-3">
            <AlertTriangle size={40} className="text-amber-500" />
            <p className="text-sm text-gray-600">{mensaje}</p>
            <button
              onClick={cerrar}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Estado: listo para empezar */}
        {fase === "listo" && (
          <div className="text-center py-2 flex flex-col items-center gap-4">
            <HuellaAnimacion estado="escaneo" size={150} />
            <p className="text-sm text-gray-600">
              Se pedirá el dedo <strong>{muestras} veces</strong> para registrar la huella.
            </p>
            <button
              onClick={iniciarCaptura}
              className="w-full bg-orange-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-orange-700"
            >
              Comenzar registro
            </button>
          </div>
        )}

        {/* Estado: capturando (progreso en vivo) */}
        {fase === "capturando" && (
          <div className="text-center py-2 flex flex-col items-center gap-3">
            <HuellaAnimacion estado="escaneo" size={150} />
            <div className="text-base font-semibold text-orange-600">{textoProgreso}</div>
            {progreso && (
              <div className="flex gap-1.5 mt-1">
                {Array.from({ length: progreso.total }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full ${
                      i < progreso.muestra ? "bg-orange-500" : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Estado: guardando */}
        {fase === "guardando" && (
          <div className="text-center py-8 text-gray-500 text-sm">Guardando la huella…</div>
        )}

        {/* Estado: éxito */}
        {fase === "ok" && (
          <div className="text-center py-2 flex flex-col items-center gap-3">
            <HuellaAnimacion estado="exito" size={150} />
            <p className="text-base font-bold text-green-600">¡Huella registrada!</p>
          </div>
        )}

        {/* Estado: error */}
        {fase === "error" && (
          <div className="text-center py-2 flex flex-col items-center gap-3">
            <HuellaAnimacion estado="error" size={150} />
            <p className="text-sm text-red-600">{mensaje}</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={cerrar}
                className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                onClick={iniciarCaptura}
                className="flex-1 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-orange-700"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
