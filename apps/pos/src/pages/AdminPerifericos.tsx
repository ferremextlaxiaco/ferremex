import { useEffect, useRef, useState } from "react"
import {
  Printer, Fingerprint, ScanLine, Monitor, Wallet,
  CheckCircle2, XCircle, RefreshCw, Save, RotateCcw, ExternalLink,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { usePOS } from "../lib/pos-store"
import { useToasts } from "../hooks/useToasts"
import { construirBytesTicket, type TicketPrintData } from "../lib/serial"
import { healthBiometria, type HealthBiometria } from "../lib/biometria"
import {
  listarImpresorasLocales, impresoraElegida, guardarImpresoraElegida,
  imprimirBytesLocal, abrirCajonLocal,
} from "../lib/impresora-local"
import {
  leerPerifPrefs, guardarPerifPrefs, type PerifPrefs,
  diagnosticarSistema, type DiagnosticoSistema,
  evaluarEscaneo, bipEscaner, type ResultadoEscaneo,
} from "../lib/perifericos"

/* ── UI helpers ─────────────────────────────────────────────────── */

function EstadoBadge({ ok, textoOn, textoOff }: { ok: boolean; textoOn: string; textoOff: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12,
      background: ok ? "#dcfce7" : "#f3f4f6",
      color: ok ? "#16a34a" : "#6b7280",
      border: `1px solid ${ok ? "#bbf7d0" : "#e5e7eb"}`,
    }}>
      <span style={{ fontSize: 8 }}>●</span> {ok ? textoOn : textoOff}
    </span>
  )
}

function PSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{
      width: 40, height: 22, borderRadius: 11, cursor: "pointer", flexShrink: 0,
      background: checked ? "#f96302" : "#d1d5db",
      position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 2, left: checked ? 20 : 2,
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </div>
  )
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", minHeight: 44 }}>
      <span style={{ fontSize: 14 }}>{label}</span>
      <PSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function DiagItem({ ok, label, detalle }: { ok: boolean; label: string; detalle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
      {ok ? <CheckCircle2 size={16} color="#16a34a" /> : <XCircle size={16} color="#dc2626" />}
      <span style={{ color: "#374151" }}>{label}</span>
      {detalle && <span style={{ color: "#9ca3af" }}>· {detalle}</span>}
    </div>
  )
}

const secCard: React.CSSProperties = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: 16, marginBottom: 14,
}
const secHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
}
const secTitle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "#111827",
}
const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500,
  cursor: "pointer", border: "1px solid #d1d5db", background: "#fff", color: "#374151",
  minHeight: 44,
}
const btnPrimary: React.CSSProperties = {
  ...btn, background: "#f96302", color: "#fff", border: "none",
}

/* ── Panel principal ────────────────────────────────────────────── */

function PerifericosPanel() {
  const { state } = usePOS()
  const navigate = useNavigate()
  const { toasts, push } = useToasts()
  const cajaId = state.cajero?.caja_id ?? null

  // Diagnóstico del sistema (una vez al montar; navegador no cambia en sesión)
  const [diag] = useState<DiagnosticoSistema>(() => diagnosticarSistema())

  // Preferencias por caja
  const [prefs, setPrefs] = useState<PerifPrefs>(() => leerPerifPrefs(cajaId))
  const [prefsGuardadas, setPrefsGuardadas] = useState<PerifPrefs>(prefs)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(prefsGuardadas)

  // Estado impresora / cajón (vía servicio local — la térmica USB no tiene COM)
  const [impresorasDisponibles, setImpresorasDisponibles] = useState<string[] | null>(null)
  const [impresoraSel, setImpresoraSel] = useState<string>(impresoraElegida() ?? "")
  const [chequeandoImpresoras, setChequeandoImpresoras] = useState(true)
  const [probandoImpresion, setProbandoImpresion] = useState(false)

  // Estado lector de huella (real, vía servicio local :52700)
  const [huella, setHuella] = useState<HealthBiometria | null>(null)
  const [chequeandoHuella, setChequeandoHuella] = useState(true)

  // Escáner (captura HID real)
  const [ultimoEscaneo, setUltimoEscaneo] = useState<ResultadoEscaneo | null>(null)
  const escanerRef = useRef<HTMLInputElement>(null)
  const tiemposRef = useRef<number[]>([])

  const [showReset, setShowReset] = useState(false)

  // Chequear el lector de huella + impresoras del servicio local al montar
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const h = await healthBiometria()
      if (vivo) { setHuella(h); setChequeandoHuella(false) }
      const impr = await listarImpresorasLocales()
      if (vivo) { setImpresorasDisponibles(impr); setChequeandoImpresoras(false) }
    })()
    return () => { vivo = false }
  }, [])

  function actualizarPref<K extends keyof PerifPrefs>(k: K, v: PerifPrefs[K]) {
    setPrefs((p) => ({ ...p, [k]: v }))
  }

  // ── Impresora / cajón (vía servicio local) ─────────────────────
  function seleccionarImpresora(nombre: string) {
    setImpresoraSel(nombre)
    guardarImpresoraElegida(nombre || null)
  }

  async function handlePruebaImpresion() {
    if (!impresoraSel) { push("Elige primero tu impresora térmica", "error"); return }
    setProbandoImpresion(true)
    try {
      const ahora = new Date().toLocaleString("es-MX")
      const ticketPrueba: TicketPrintData = {
        company: {
          logo: null, logoSize: 200,
          name: "FERREMEX — PRUEBA", rfc: "", address: "Tlaxiaco, Oaxaca",
          phone: "", email: "",
        },
        titulo: "TICKET DE PRUEBA",
        folio: "PRUEBA-" + Date.now().toString().slice(-6),
        fecha: ahora,
        cajero: state.cajero?.nombre ?? "—",
        cliente: null,
        lines: [{
          description: "Prueba de impresora", qty: 1, unitPrice: 0, total: 0,
          savings: 0, discount: 0, pkgItems: [],
        }],
        subtotal: 0, globalDiscAmt: 0, globalDiscLabel: "", iva: 0,
        pointsDisc: 0, pointsRedeemed: 0, cnAmt: 0, cnFolio: "", total: 0,
        payment: { method: "efectivo", label: "PRUEBA", received: 0, change: 0 },
        footer: ["Si lees esto, la impresora funciona.", "Caja: " + (state.cajero?.caja_nombre ?? "—")],
      }
      const bytes = await construirBytesTicket(ticketPrueba)
      await imprimirBytesLocal(bytes, impresoraSel)
      push("Ticket de prueba enviado", "success")
    } catch (err) {
      push(err instanceof Error ? err.message : "Error al imprimir", "error")
    } finally {
      setProbandoImpresion(false)
    }
  }

  async function handleAbrirCajon() {
    if (!impresoraSel) { push("Elige primero tu impresora térmica", "error"); return }
    try {
      await abrirCajonLocal(impresoraSel)
      push("Comando de apertura enviado al cajón", "success")
    } catch (err) {
      push(err instanceof Error ? err.message : "No se pudo abrir el cajón", "error")
    }
  }

  // ── Huella ─────────────────────────────────────────────────────
  async function rechequearHuella() {
    setChequeandoHuella(true)
    const h = await healthBiometria()
    setHuella(h)
    setChequeandoHuella(false)
    if (h?.lector?.conectado) push("Lector de huella conectado", "success")
    else if (h?.ok) push("Servicio activo, pero sin lector conectado", "info")
    else push("El servicio de huella no responde", "error")
  }

  // ── Escáner ────────────────────────────────────────────────────
  function onEscanerKeyDown() {
    tiemposRef.current.push(performance.now())
  }
  function onEscanerKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const codigo = (e.target as HTMLInputElement).value.trim()
      if (!codigo) { tiemposRef.current = []; return }
      const resultado = evaluarEscaneo(tiemposRef.current, codigo)
      setUltimoEscaneo(resultado)
      if (prefs.sonidoEscaner && resultado.esEscaner) bipEscaner()
      tiemposRef.current = []
      ;(e.target as HTMLInputElement).value = ""
    }
  }

  // ── Guardar / restaurar ────────────────────────────────────────
  function handleGuardar() {
    guardarPerifPrefs(cajaId, prefs)
    setPrefsGuardadas(prefs)
    push("Preferencias guardadas para esta caja", "success")
  }
  function handleReset() {
    const def = leerPerifPrefs("___defaults___") // clave inexistente → defaults
    setPrefs(def)
    setShowReset(false)
    push("Valores restaurados (recuerda guardar)", "info")
  }

  const huellaOk = !!huella?.lector?.conectado

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: t.type === "error" ? "#dc2626" : t.type === "info" ? "#2563eb" : "#16a34a",
            color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}>{t.msg}</div>
        ))}
      </div>

      <div style={{ padding: 16, maxWidth: 720, width: "100%", margin: "0 auto" }}>
        {/* ── Diagnóstico del sistema ── */}
        <div style={secCard}>
          <div style={secHeader}>
            <div style={secTitle}><Monitor size={18} /> Diagnóstico del sistema</div>
            <EstadoBadge ok={diag.esChromium && diag.contextoSeguro} textoOn="Compatible" textoOff="Revisar" />
          </div>
          <DiagItem ok={diag.esChromium} label={`Navegador: ${diag.navegador}`}
            detalle={diag.esChromium ? undefined : "usa Chrome/Edge"} />
          <DiagItem ok={diag.contextoSeguro} label="Contexto seguro"
            detalle={diag.contextoSeguro ? diag.url : "abre por localhost, no por IP"} />
          <DiagItem ok={impresorasDisponibles !== null} label="Servicio de impresión / cajón"
            detalle={impresorasDisponibles !== null ? "127.0.0.1:52700" : "revisa el servicio local de la caja"} />
          <DiagItem ok={huellaOk} label="Servicio de huella"
            detalle={huellaOk ? "lector conectado" : "opcional — solo si esta caja usa huella"} />
        </div>

        {/* ── Impresora + cajón (vía servicio local) ── */}
        <div style={secCard}>
          <div style={secHeader}>
            <div style={secTitle}><Printer size={18} /> Impresora de tickets + cajón</div>
            <EstadoBadge ok={!!impresoraSel && impresorasDisponibles !== null}
              textoOn="Configurada" textoOff={chequeandoImpresoras ? "Buscando…" : "Sin configurar"} />
          </div>

          {chequeandoImpresoras ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "8px 0" }}>Buscando impresoras…</div>
          ) : impresorasDisponibles === null ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "4px 0", lineHeight: 1.6 }}>
              El servicio de impresión no responde. La impresora térmica se maneja por el
              servicio local de la caja (el mismo del lector de huella). Revisa que esté
              instalado y corriendo.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                  Impresora de esta caja
                </label>
                <select value={impresoraSel} onChange={(e) => seleccionarImpresora(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, background: "#fff" }}>
                  <option value="">— Elige tu impresora térmica —</option>
                  {impresorasDisponibles.map((imp) => <option key={imp} value={imp}>{imp}</option>)}
                </select>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
                  Elige tu impresora de tickets (ej. "Sicar"). Evita las de PDF/OneNote.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", minHeight: 44 }}>
                <span style={{ fontSize: 14 }}>Copias por ticket</span>
                <input type="number" min={1} max={5} value={prefs.copias}
                  onChange={(e) => actualizarPref("copias", Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ width: 70, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, textAlign: "center" }} />
              </div>
              <SwitchRow label="Imprimir logo en el ticket" checked={prefs.imprimirLogo} onChange={(v) => actualizarPref("imprimirLogo", v)} />
              <SwitchRow label="Imprimir ticket automáticamente al cobrar" checked={prefs.autoImprimir} onChange={(v) => actualizarPref("autoImprimir", v)} />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button style={impresoraSel ? btnPrimary : { ...btn, opacity: 0.5 }} onClick={handlePruebaImpresion} disabled={probandoImpresion || !impresoraSel}>
                  <Printer size={16} /> {probandoImpresion ? "Imprimiendo…" : "Prueba de impresión"}
                </button>
                <button style={btn} onClick={handleAbrirCajon} disabled={!impresoraSel}>
                  <Wallet size={16} /> Abrir cajón (prueba)
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Lector de huella ── */}
        <div style={secCard}>
          <div style={secHeader}>
            <div style={secTitle}><Fingerprint size={18} /> Lector de huella</div>
            <EstadoBadge ok={huellaOk} textoOn="Listo" textoOff={chequeandoHuella ? "Verificando…" : "No detectado"} />
          </div>

          {chequeandoHuella ? (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "8px 0" }}>Verificando el servicio de huella…</div>
          ) : huellaOk ? (
            <div style={{ fontSize: 13, color: "#374151", padding: "4px 0" }}>
              <DiagItem ok label={`Modelo: ${huella?.lector?.modelo ?? "U.are.U 4500"}`} />
              <DiagItem ok label="Servicio local activo" detalle="127.0.0.1:52700" />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#6b7280", padding: "4px 0", lineHeight: 1.6 }}>
              {huella?.ok
                ? "El servicio está activo pero no detecta el lector. Revisa que el U.are.U 4500 esté conectado por USB."
                : "El servicio de huella no responde. Es opcional: solo lo necesitan las cajas que usan huella. Si esta caja debería tenerlo, revisa que el servicio esté instalado y corriendo."}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button style={btn} onClick={rechequearHuella} disabled={chequeandoHuella}>
              <RefreshCw size={16} /> Volver a verificar
            </button>
            <button style={btn} onClick={() => navigate("/admin/monedero")}>
              <ExternalLink size={16} /> Configurar confirmación por huella (Monedero)
            </button>
          </div>
        </div>

        {/* ── Escáner de código de barras ── */}
        <div style={secCard}>
          <div style={secHeader}>
            <div style={secTitle}><ScanLine size={18} /> Lector de código de barras</div>
            <EstadoBadge ok={!!ultimoEscaneo?.esEscaner} textoOn="Detectado" textoOff="Sin probar" />
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            El escáner funciona como un teclado (no necesita configuración). Para probarlo,
            haz clic en el recuadro y <strong>escanea un código</strong>.
          </div>
          <input ref={escanerRef}
            placeholder="Haz clic aquí y escanea un código…"
            onKeyDown={onEscanerKeyDown} onKeyUp={onEscanerKeyUp}
            style={{ width: "100%", padding: "12px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, fontFamily: "monospace" }} />

          {ultimoEscaneo && (
            <div style={{ marginTop: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {ultimoEscaneo.esEscaner
                  ? <><CheckCircle2 size={16} color="#16a34a" /><span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>Escáner detectado</span></>
                  : <><XCircle size={16} color="#d97706" /><span style={{ fontSize: 13, fontWeight: 600, color: "#d97706" }}>Parece tecleo manual (no escáner)</span></>}
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>
                Código: <strong style={{ fontFamily: "monospace" }}>{ultimoEscaneo.codigo}</strong>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                {ultimoEscaneo.totalCaracteres} caracteres · {ultimoEscaneo.msPromedioPorTecla}ms por tecla
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <SwitchRow label="Sonido (bip) al escanear" checked={prefs.sonidoEscaner} onChange={(v) => actualizarPref("sonidoEscaner", v)} />
          </div>
        </div>
      </div>

      {/* ── Footer fijo ── */}
      <div style={{
        position: "sticky", bottom: 0, background: "#fff", borderTop: "1px solid #e5e7eb",
        padding: "12px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      }}>
        <button style={btnPrimary} onClick={handleGuardar} disabled={!dirty}>
          <Save size={16} /> Guardar preferencias
        </button>
        {dirty && <span style={{ fontSize: 13, color: "#d97706" }}>Cambios sin guardar</span>}
        <div style={{ flex: 1 }} />
        {showReset ? (
          <>
            <span style={{ fontSize: 13, color: "#6b7280" }}>¿Restaurar valores por defecto?</span>
            <button style={{ ...btn, color: "#dc2626", borderColor: "#fecaca" }} onClick={handleReset}>Sí</button>
            <button style={btn} onClick={() => setShowReset(false)}>Cancelar</button>
          </>
        ) : (
          <button style={btn} onClick={() => setShowReset(true)}>
            <RotateCcw size={16} /> Restaurar
          </button>
        )}
      </div>
    </div>
  )
}

export function AdminPerifericos() {
  return <PerifericosPanel />
}
