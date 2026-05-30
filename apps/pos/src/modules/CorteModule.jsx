import { useState, useEffect, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { usePOS, siguienteTurnoId } from "../lib/pos-store"
import { obtenerCorte, cerrarCorte } from "../lib/client"
import { formatMXN } from "../lib/format"
import { useToasts } from "../hooks/useToasts"
import ConfirmDialog from "../components/ConfirmDialog"
import {
  ArrowLeft, Banknote, CreditCard, ArrowLeftRight, Wallet,
  TrendingUp, TrendingDown, Calculator, Eye, EyeOff, Printer,
  CheckCircle2, AlertTriangle, Lock,
} from "lucide-react"

// ─── CONSTANTES ────────────────────────────────────────────────────────────────

// Denominaciones MXN (billetes + monedas). El orden define el orden en pantalla.
const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5]

// Umbral (MXN) a partir del cual un descuadre exige motivo escrito (auditoría).
const UMBRAL_MOTIVO = 20

// ─── SEMÁFORO DE DIFERENCIA ──────────────────────────────────────────────────
// Coherente con el semáforo de cartera: verde cuadra, amarillo descuadre menor,
// rojo descuadre fuerte. La magnitud manda; el signo (sobra/falta) es etiqueta.
function semaforoDiferencia(dif) {
  const abs = Math.abs(dif)
  if (abs <= 1) return { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "Cuadra", tono: "verde" }
  if (abs <= 50) return { color: "#ca8a04", bg: "#fefce8", border: "#fef08a", label: dif < 0 ? "Faltante leve" : "Sobrante leve", tono: "amarillo" }
  return { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: dif < 0 ? "Faltante" : "Sobrante", tono: "rojo" }
}

// ─── SUB-COMPONENTES ───────────────────────────────────────────────────────────

function StatCard({ icon, label, valor, color = "text-gray-900" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="text-gray-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-base font-semibold ${color}`}>{valor}</div>
      </div>
    </div>
  )
}

function LineaConcepto({ label, valor, signo = "+", muted = false }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className={muted ? "text-gray-400" : "text-gray-600"}>
        <span className="inline-block w-4 text-gray-400">{signo}</span>{label}
      </span>
      <span className={`font-mono ${muted ? "text-gray-400" : "text-gray-800"}`}>{formatMXN(valor)}</span>
    </div>
  )
}

// Panel de desglose por denominación. Suma automática.
function DenominacionInput({ denoms, onChange }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <span>Denominación</span>
        <span className="text-center">Cantidad</span>
        <span className="text-right">Subtotal</span>
      </div>
      <div className="divide-y divide-gray-100">
        {DENOMINACIONES.map((d) => {
          const qty = denoms[d] ?? 0
          return (
            <div key={d} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center px-3 py-2">
              <span className="text-sm text-gray-700 font-medium">{formatMXN(d)}</span>
              <input
                type="number" min="0" step="1" inputMode="numeric"
                value={qty === 0 ? "" : qty}
                onChange={(e) => onChange(d, Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="0"
                className="w-20 text-center border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500"
              />
              <span className="text-sm text-right font-mono text-gray-600">{formatMXN(d * qty)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MÓDULO PRINCIPAL ────────────────────────────────────────────────────────

export default function CorteModule() {
  const { state } = usePOS()
  const navigate = useNavigate()
  const { toasts, push } = useToasts()

  const cajero = state.cajero
  // Conteo abierto (ve el esperado en vivo) para admin/supervisor; conteo ciego
  // para cajero raso (no ve el esperado hasta confirmar). Sugerencia aprobada.
  const conteoAbierto = !!cajero?.permisos?.puede_ver_admin

  const [corte, setCorte] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // Conteo físico: modo total directo o desglose por denominación.
  const [modoConteo, setModoConteo] = useState("total") // "total" | "denominacion"
  const [totalDirecto, setTotalDirecto] = useState("")
  const [denoms, setDenoms] = useState({})

  // Fondo a dejar para el siguiente turno.
  const [fondoDejado, setFondoDejado] = useState("")
  const [motivo, setMotivo] = useState("")

  // Conteo ciego: el cajero revela el esperado solo al pedir confirmar.
  const [revelado, setRevelado] = useState(conteoAbierto)
  const [confirmAbierto, setConfirmAbierto] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [resultado, setResultado] = useState(null) // snapshot tras cerrar

  // ── Carga del resumen del turno ───────────────────────────────────────────
  useEffect(() => {
    if (!cajero) return
    let on = true
    setCargando(true)
    obtenerCorte(cajero.nombre, cajero.turno_id)
      .then((data) => {
        if (!on) return
        setCorte(data)
        // Si el turno ya está cerrado, mostramos el snapshot en solo lectura.
        if (data.cerrado) setResultado(data.cerrado)
      })
      .catch(() => { if (on) setError("No se pudo cargar el corte") })
      .finally(() => { if (on) setCargando(false) })
    return () => { on = false }
  }, [cajero])

  // ── Conteo físico calculado ─────────────────────────────────────────────────
  const totalDenoms = useMemo(
    () => DENOMINACIONES.reduce((s, d) => s + d * (denoms[d] ?? 0), 0),
    [denoms]
  )
  const efectivoContado = modoConteo === "denominacion" ? totalDenoms : (parseFloat(totalDirecto) || 0)

  const esperado = corte?.efectivo_esperado ?? 0
  const diferencia = efectivoContado - esperado
  const sem = semaforoDiferencia(diferencia)
  const fondoNum = Math.max(0, parseFloat(fondoDejado) || 0)
  const requiereMotivo = Math.abs(diferencia) > UMBRAL_MOTIVO

  const yaCerrado = !!resultado

  const handleDenomChange = useCallback((d, qty) => {
    setDenoms((prev) => ({ ...prev, [d]: qty }))
  }, [])

  // ── Validaciones previas al cierre ──────────────────────────────────────────
  function validar() {
    if (efectivoContado < 0) { push("El conteo no puede ser negativo", "error"); return false }
    if (modoConteo === "total" && totalDirecto.trim() === "") {
      push("Captura el efectivo contado", "error"); return false
    }
    if (fondoNum > efectivoContado) {
      push("El fondo a dejar no puede exceder el efectivo contado", "error"); return false
    }
    if (requiereMotivo && !motivo.trim()) {
      push(`Hay un descuadre de ${formatMXN(Math.abs(diferencia))}. Escribe el motivo.`, "error")
      return false
    }
    return true
  }

  // Paso 1: el cajero pide cerrar → revela el esperado (conteo ciego) y abre el
  // diálogo de confirmación con el resultado.
  function pedirCierre() {
    if (!validar()) return
    setRevelado(true)
    setConfirmAbierto(true)
  }

  // Paso 2: confirmar el cierre → persistir el arqueo.
  async function confirmarCierre() {
    setConfirmAbierto(false)
    setCerrando(true)
    try {
      const res = await cerrarCorte({
        cajero: cajero.nombre,
        turno_id: cajero.turno_id,
        efectivo_contado: efectivoContado,
        fondo_dejado: fondoNum,
        motivo: motivo.trim() || undefined,
        denominaciones: modoConteo === "denominacion" ? denoms : null,
        siguiente_turno_id: fondoNum > 0 ? siguienteTurnoId(cajero.turno_id) : null,
        cajero_id: cajero.id,
      })
      setResultado(res.corte)
      if (res.yaCerrado) push("Este turno ya estaba cerrado", "info")
      else push("Turno cerrado correctamente ✓", "success")
    } catch {
      push("No se pudo cerrar el turno", "error")
    } finally {
      setCerrando(false)
    }
  }

  function imprimir() {
    window.print()
  }

  // ── Guardias ────────────────────────────────────────────────────────────────
  if (!cajero) return null
  if (cargando) return <div className="p-10 text-center text-gray-400">Cargando corte…</div>

  const mostrarEsperado = conteoAbierto || revelado || yaCerrado

  return (
    <div className="corte-module flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* HEADER */}
      <div className="corte-no-print h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/venta")}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft size={18} /> Volver a ventas
          </button>
          <span className="text-gray-300">·</span>
          <h1 className="text-lg font-semibold text-gray-900">Corte de caja</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{cajero.alias?.trim() || cajero.nombre}</span>
          <span className="text-gray-300">·</span>
          <span className="font-mono">{cajero.turno_id}</span>
          {!conteoAbierto && !yaCerrado && (
            <span className="flex items-center gap-1 bg-indigo-50 text-indigo-600 text-xs rounded-full px-2 py-0.5">
              <EyeOff size={12} /> Conteo ciego
            </span>
          )}
        </div>
      </div>

      {error && <p className="corte-no-print px-6 py-2 text-sm text-red-600">{error}</p>}

      {/* CUERPO */}
      <div className="flex-1 overflow-y-auto p-6">
        {yaCerrado ? (
          <CorteCerradoView resultado={resultado} onImprimir={imprimir} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* COLUMNA IZQUIERDA — resumen del turno */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Resumen del turno</h2>

              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={<Banknote size={20} />} label="Ventas en efectivo" valor={formatMXN(corte.ventas_efectivo)} />
                <StatCard icon={<ArrowLeftRight size={20} />} label="Transferencia" valor={formatMXN(corte.ventas_transferencia)} />
                <StatCard icon={<CreditCard size={20} />} label="Crédito" valor={formatMXN(corte.ventas_credito)} />
                <StatCard icon={<Calculator size={20} />} label={`${corte.num_ventas} venta${corte.num_ventas !== 1 ? "s" : ""}`} valor={formatMXN(corte.total_ventas)} />
              </div>

              {/* Desglose del efectivo esperado */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Efectivo esperado en caja</h3>
                <LineaConcepto label="Fondo inicial" valor={corte.fondo_inicial} signo="+" />
                <LineaConcepto label="Ventas en efectivo" valor={corte.ventas_efectivo} signo="+" />
                <LineaConcepto label="Entradas manuales" valor={corte.entradas_manuales} signo="+" />
                <LineaConcepto label="Salidas manuales" valor={-corte.salidas_manuales} signo="−" />
                <div className="border-t border-gray-200 mt-2 pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">= Efectivo esperado</span>
                  {mostrarEsperado ? (
                    <span className="text-base font-bold font-mono text-gray-900">{formatMXN(esperado)}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-indigo-500">
                      <Lock size={14} /> oculto hasta confirmar
                    </span>
                  )}
                </div>
              </div>

              {corte.fondo_inicial === 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>Este turno no tiene fondo inicial registrado. Si abriste con efectivo, regístralo en <b>Movimientos de caja → Fondo inicial</b> antes de cerrar.</span>
                </div>
              )}
            </div>

            {/* COLUMNA DERECHA — conteo físico + fondo */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Conteo de efectivo</h2>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  <button onClick={() => setModoConteo("total")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${modoConteo === "total" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                    Total
                  </button>
                  <button onClick={() => setModoConteo("denominacion")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${modoConteo === "denominacion" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                    Por denominación
                  </button>
                </div>
              </div>

              {modoConteo === "total" ? (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Efectivo contado</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal"
                      value={totalDirecto} onChange={(e) => setTotalDirecto(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-3 text-lg font-mono focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
              ) : (
                <>
                  <DenominacionInput denoms={denoms} onChange={handleDenomChange} />
                  <div className="flex items-center justify-between bg-gray-100 rounded-lg px-4 py-3">
                    <span className="text-sm font-semibold text-gray-700">Total contado</span>
                    <span className="text-lg font-bold font-mono text-gray-900">{formatMXN(totalDenoms)}</span>
                  </div>
                </>
              )}

              {/* Diferencia en vivo — solo si conteo abierto */}
              {conteoAbierto && (
                <div className="rounded-lg px-4 py-3 flex items-center justify-between border"
                  style={{ background: sem.bg, borderColor: sem.border }}>
                  <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: sem.color }}>
                    {sem.tono === "verde" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {sem.label}
                  </span>
                  <span className="text-base font-bold font-mono" style={{ color: sem.color }}>
                    {diferencia >= 0 ? "+" : ""}{formatMXN(diferencia)}
                  </span>
                </div>
              )}

              {/* Fondo a dejar */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Wallet size={14} className="inline mr-1 -mt-0.5 text-indigo-500" />
                  ¿Dejar fondo para el siguiente turno?
                </label>
                <p className="text-xs text-gray-400 mb-2">Se registrará como fondo inicial del próximo turno automáticamente.</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal"
                    value={fondoDejado} onChange={(e) => setFondoDejado(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-500" />
                </div>
              </div>

              {/* Motivo (obligatorio si descuadre fuerte) */}
              {requiereMotivo && (conteoAbierto || revelado) && (
                <div className="bg-white border border-red-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-red-700 mb-2">
                    <AlertTriangle size={14} className="inline mr-1 -mt-0.5" />
                    Motivo del descuadre <span className="text-red-500">*</span>
                  </label>
                  <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Explica la diferencia (obligatorio)…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER FIJO */}
      {!yaCerrado && (
        <div className="corte-no-print border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-gray-500">
            Contado: <span className="font-mono font-semibold text-gray-800">{formatMXN(efectivoContado)}</span>
            {fondoNum > 0 && <> · Fondo a dejar: <span className="font-mono">{formatMXN(fondoNum)}</span></>}
          </span>
          <button onClick={pedirCierre} disabled={cerrando}
            className={`bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors ${cerrando ? "opacity-40 pointer-events-none" : ""}`}>
            {cerrando ? "Cerrando…" : "Cerrar turno"}
          </button>
        </div>
      )}

      {/* CONFIRMACIÓN — revela el resultado antes de cerrar */}
      <ConfirmDialog
        open={confirmAbierto}
        title="Confirmar cierre de turno"
        message={
          `Efectivo esperado: ${formatMXN(esperado)}\n` +
          `Efectivo contado: ${formatMXN(efectivoContado)}\n` +
          `Diferencia: ${diferencia >= 0 ? "+" : ""}${formatMXN(diferencia)} (${sem.label})` +
          (fondoNum > 0 ? `\nFondo a dejar: ${formatMXN(fondoNum)}` : "") +
          `\n\nEsta acción no se puede deshacer.`
        }
        confirmLabel="Cerrar turno"
        cancelLabel="Revisar"
        danger={sem.tono === "rojo"}
        onConfirm={confirmarCierre}
        onClose={() => setConfirmAbierto(false)}
      />

      <ToastViewport toasts={toasts} />
    </div>
  )
}

// ─── VISTA DE CORTE CERRADO (solo lectura + impresión) ─────────────────────────

function CorteCerradoView({ resultado, onImprimir }) {
  const sem = semaforoDiferencia(resultado.diferencia)
  return (
    <div className="max-w-2xl mx-auto">
      <div className="corte-printable bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4 corte-no-print">
          <span className="flex items-center gap-2 text-green-600 font-semibold">
            <CheckCircle2 size={20} /> Turno cerrado
          </span>
          <button onClick={onImprimir}
            className="flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
            <Printer size={16} /> Imprimir
          </button>
        </div>

        <div className="text-center mb-4 corte-print-only">
          <div className="text-lg font-bold">FERREMEX — Corte de caja</div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
          <div className="text-gray-500">Cajero</div><div className="text-right font-medium">{resultado.cajero}</div>
          <div className="text-gray-500">Turno</div><div className="text-right font-mono">{resultado.turno_id}</div>
          <div className="text-gray-500">Cerrado</div><div className="text-right">{new Date(resultado.cerrado_en).toLocaleString("es-MX")}</div>
        </div>

        <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
          <Row label="Ventas en efectivo" valor={resultado.ventas_efectivo} />
          <Row label="Transferencia" valor={resultado.ventas_transferencia} />
          <Row label="Crédito" valor={resultado.ventas_credito} />
          <Row label={`Total ventas (${resultado.num_ventas})`} valor={resultado.total_ventas} bold />
        </div>

        <div className="border-t border-gray-200 mt-3 pt-3 space-y-1 text-sm">
          <Row label="Fondo inicial" valor={resultado.fondo_inicial} signo="+" />
          <Row label="Ventas en efectivo" valor={resultado.ventas_efectivo} signo="+" />
          <Row label="Entradas manuales" valor={resultado.entradas_manuales} signo="+" />
          <Row label="Salidas manuales" valor={-resultado.salidas_manuales} signo="−" />
          <Row label="Efectivo esperado" valor={resultado.efectivo_esperado} bold />
          <Row label="Efectivo contado" valor={resultado.efectivo_contado} bold />
        </div>

        <div className="rounded-lg px-4 py-3 mt-3 flex items-center justify-between border"
          style={{ background: sem.bg, borderColor: sem.border }}>
          <span className="font-semibold" style={{ color: sem.color }}>{sem.label}</span>
          <span className="text-lg font-bold font-mono" style={{ color: sem.color }}>
            {resultado.diferencia >= 0 ? "+" : ""}{formatMXN(resultado.diferencia)}
          </span>
        </div>

        {resultado.fondo_dejado > 0 && (
          <div className="text-sm text-gray-600 mt-3 flex justify-between">
            <span>Fondo dejado para el siguiente turno</span>
            <span className="font-mono">{formatMXN(resultado.fondo_dejado)}</span>
          </div>
        )}
        {resultado.motivo && (
          <div className="text-sm mt-3 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-500">Motivo del descuadre: </span>
            <span className="text-gray-800">{resultado.motivo}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, valor, signo, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-gray-800" : "text-gray-600"}>
        {signo && <span className="inline-block w-4 text-gray-400">{signo}</span>}{label}
      </span>
      <span className={`font-mono ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>{formatMXN(valor)}</span>
    </div>
  )
}

// ─── TOASTS ──────────────────────────────────────────────────────────────────

function ToastViewport({ toasts }) {
  return (
    <div className="corte-no-print fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white
            ${t.type === "success" ? "bg-green-600" : t.type === "warning" ? "bg-amber-500" : t.type === "info" ? "bg-gray-700" : "bg-red-600"}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
