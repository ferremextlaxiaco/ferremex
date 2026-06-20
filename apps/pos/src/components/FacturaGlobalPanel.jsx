import { useState, useEffect, useCallback, useRef } from "react"
import {
  Calculator, Globe2, CheckCircle2, AlertTriangle, XCircle, Loader2,
  Download, FileCode2, RefreshCw, ArrowRightLeft,
} from "lucide-react"
import {
  previewGlobalAPI, emitirGlobalAPI, listarCajasAPI,
  abrirArchivoComprobanteAPI,
} from "../lib/client"
import { formatMXN } from "../lib/format"

/**
 * Tab "Global del día" — Factura global de público en general (CFDI 4.0).
 *
 * Flujo:
 *  1. Elegir fecha (default hoy) + caja (default todas) → "Calcular".
 *  2. El preview separa los artículos en ENTRAN / SE EXCLUYEN / SIN CLAVE SAT
 *     según el saldo facturable (doble inventario fiscal).
 *  3. "Timbrar" abre el SWITCH de confirmación: muestra el saldo facturable que
 *     se va a CONSUMIR de cada artículo (lo que pediste: "entran X facturados,
 *     los demás siguen como no-factura"). Al confirmar → timbra + consume saldo.
 *
 * Decisión: artículos sin respaldo se EXCLUYEN; un toggle permite FORZAR los
 * excluidos solo por saldo insuficiente (con advertencia). Los excluidos por
 * depto no facturable y los sin clave SAT nunca se fuerzan.
 */
const MOTIVO_LABEL = {
  depto_no_facturable: "Departamento no facturable",
  saldo_insuficiente: "Saldo facturable insuficiente",
  sin_clave_sat: "Sin clave SAT",
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function FacturaGlobalPanel({ pushToast }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [cajaId, setCajaId] = useState("")
  const [forzar, setForzar] = useState(false)
  const [cajas, setCajas] = useState([])

  const [preview, setPreview] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [calculado, setCalculado] = useState(false)

  const [confirmando, setConfirmando] = useState(false) // modal switch abierto
  const [timbrando, setTimbrando] = useState(false)
  const [resultado, setResultado] = useState(null)       // GlobalRegistro timbrada
  const [descargando, setDescargando] = useState(null)   // "pdf" | "xml" | null

  // Guard de montaje: evita setear estado tras desmontar (cambio de tab durante
  // una petición en vuelo) → sin warnings ni updates huérfanas.
  const montado = useRef(true)
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])

  useEffect(() => {
    listarCajasAPI().then((c) => { if (montado.current) setCajas(c) }).catch(() => { /* sin cajas: queda "Todas" */ })
  }, [])

  // `calcular` acepta un override de `forzar` para poder recalcular con el valor
  // nuevo del toggle SIN depender de que el estado ya se haya re-renderizado
  // (evita el stale closure de un efecto sobre [forzar]).
  const calcular = useCallback(async (forzarOverride) => {
    const f = forzarOverride ?? forzar
    setCargando(true); setResultado(null)
    try {
      const data = await previewGlobalAPI(fecha, { caja_id: cajaId || undefined, forzar: f })
      if (!montado.current) return
      setPreview(data)
      setCalculado(true)
    } catch (e) {
      if (montado.current) pushToast(e?.message ?? "No se pudo calcular el preview", "error")
    } finally {
      if (montado.current) setCargando(false)
    }
  }, [fecha, cajaId, forzar, pushToast])

  // El toggle "forzar" recalcula explícitamente con el valor nuevo (no vía
  // efecto, que capturaría fecha/caja viejos).
  function onToggleForzar(nuevoForzar) {
    setForzar(nuevoForzar)
    if (calculado) calcular(nuevoForzar)
  }

  async function timbrar() {
    setTimbrando(true)
    try {
      const r = await emitirGlobalAPI(fecha, { caja_id: cajaId || undefined, forzar })
      if (!montado.current) return
      setResultado(r.global)
      setConfirmando(false)
      if (r.consumos_fallidos?.length) {
        pushToast(`Timbrada, pero ${r.consumos_fallidos.length} saldo(s) no se descontaron — revísalos`, "warning")
      } else if (r.duplicado_detectado) {
        pushToast("Timbrada, pero ya existía otra global del período — concíliala", "warning")
      } else {
        pushToast("Factura global timbrada", "success")
      }
      // Refrescar preview (las ventas ya quedaron marcadas → ya no aparecen).
      calcular()
    } catch (e) {
      if (montado.current) pushToast(e?.message ?? "No se pudo timbrar la factura global", "error")
    } finally {
      if (montado.current) setTimbrando(false)
    }
  }

  async function descargar(formato) {
    if (!resultado || descargando) return
    setDescargando(formato)
    try {
      await abrirArchivoComprobanteAPI(resultado.cfdi_id, formato, `global-${resultado.fecha_periodo}`)
    } catch (e) {
      pushToast(e?.message ?? `No se pudo descargar el ${formato.toUpperCase()}`, "error")
    } finally {
      setDescargando(null)
    }
  }

  const t = preview?.totales
  // SKUs incluidos que CONSUMEN saldo (manejan saldo facturable).
  const consumos = (preview?.entran ?? []).filter((l) => l.saldoDisponible != null)
  const puedeTimbrar = preview && (preview.entran?.length ?? 0) > 0 && !t?.hayBloqueante && preview.configurado

  return (
    <div className="fac-pane">
      {/* ── Barra de criterios ── */}
      <div className="fac-toolbar">
        <label className="fac-field">
          <span>Fecha</span>
          <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className="fac-input" />
        </label>
        <label className="fac-field">
          <span>Caja</span>
          <select value={cajaId} onChange={(e) => setCajaId(e.target.value)} className="fac-input">
            <option value="">Todas las cajas</option>
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <button className="fac-btn-primary" onClick={calcular} disabled={cargando}>
          {cargando ? <Loader2 size={16} className="fac-spin" /> : <Calculator size={16} />}
          Calcular
        </button>
        {calculado && (
          <button className="fac-btn-ghost" onClick={calcular} disabled={cargando} title="Recalcular">
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      {/* ── Estado: no configurado ── */}
      {preview && !preview.configurado && (
        <div className="fac-alert fac-alert--warn">
          <AlertTriangle size={16} />
          Facturama no está configurado en el servidor. Puedes ver el preview, pero no timbrar.
        </div>
      )}

      {/* ── Sin cálculo ── */}
      {!calculado && !cargando && (
        <div className="fac-empty">
          <Globe2 size={40} />
          <p>Elige una fecha y caja, luego <b>Calcular</b> para ver qué entra en la factura global del día.</p>
        </div>
      )}

      {/* ── KPIs + grupos ── */}
      {calculado && preview && (
        <>
          <div className="fac-kpis">
            <Kpi label="Ventas de público" value={t.ventasCandidatas} />
            <Kpi label="Monto total" value={formatMXN(t.importeTotal)} />
            <Kpi label="Entra a factura" value={formatMXN(t.importeEntran)} tone="ok" />
            <Kpi label="Se excluye" value={formatMXN(t.importeExcluido)} tone="muted" />
          </div>

          {/* Bloqueante: sin clave SAT */}
          {t.hayBloqueante && (
            <div className="fac-alert fac-alert--error">
              <XCircle size={16} />
              <div>
                <b>{preview.sinClaveSat.length} artículo(s) sin clave SAT.</b> No se puede timbrar la
                global hasta asignarles clave SAT en <b>Artículos → Saldo facturable</b>.
              </div>
            </div>
          )}

          {/* Toggle forzar (solo tiene efecto si hay excluidos por saldo) */}
          {preview.excluidas.some((l) => l.motivoExclusion === "saldo_insuficiente") && (
            <label className="fac-forzar">
              <input type="checkbox" checked={forzar} onChange={(e) => onToggleForzar(e.target.checked)} />
              <span>Forzar inclusión de artículos con <b>saldo insuficiente</b> (el saldo quedará en negativo / sobregiro).</span>
            </label>
          )}

          <div className="fac-cols">
            {/* ENTRAN */}
            <div className="fac-col">
              <div className="fac-col-head fac-col-head--ok">
                <CheckCircle2 size={15} /> Entran a la factura ({preview.entran.length})
              </div>
              {preview.entran.length === 0 ? (
                <div className="fac-col-empty">Ningún artículo con respaldo facturable.</div>
              ) : (
                <table className="fac-tabla">
                  <thead><tr><th>Artículo</th><th className="num">Cant</th><th className="num">Saldo</th><th className="num">Importe</th></tr></thead>
                  <tbody>
                    {preview.entran.map((l) => (
                      <tr key={l.sku}>
                        <td><div className="fac-art">{l.descripcion}</div><div className="fac-sku">{l.sku} · {l.claveSat}</div></td>
                        <td className="num">{l.cantidad}</td>
                        <td className="num">{l.saldoDisponible == null ? "∞" : l.saldoDisponible}</td>
                        <td className="num">{formatMXN(l.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* SE EXCLUYEN */}
            <div className="fac-col">
              <div className="fac-col-head fac-col-head--warn">
                <AlertTriangle size={15} /> Se excluyen ({preview.excluidas.length + preview.sinClaveSat.length})
              </div>
              {preview.excluidas.length + preview.sinClaveSat.length === 0 ? (
                <div className="fac-col-empty">Nada excluido. Todo tiene respaldo.</div>
              ) : (
                <table className="fac-tabla">
                  <thead><tr><th>Artículo</th><th className="num">Cant</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {[...preview.sinClaveSat, ...preview.excluidas].map((l) => (
                      <tr key={`${l.sku}-${l.motivoExclusion}`}>
                        <td><div className="fac-art">{l.descripcion}</div><div className="fac-sku">{l.sku}</div></td>
                        <td className="num">{l.cantidad}</td>
                        <td><span className={`fac-motivo fac-motivo--${l.motivoExclusion}`}>{MOTIVO_LABEL[l.motivoExclusion] ?? "Excluido"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Acción */}
          <div className="fac-acciones">
            <button
              className="fac-btn-primary fac-btn-lg"
              disabled={!puedeTimbrar || timbrando}
              title={puedeTimbrar ? "Timbrar factura global" : "No hay artículos con respaldo (o falta clave SAT / Facturama)"}
              onClick={() => setConfirmando(true)}
            >
              <Globe2 size={18} /> Timbrar factura global
            </button>
          </div>
        </>
      )}

      {/* ── Resultado: ya timbrada ── */}
      {resultado && (
        <div className="fac-resultado">
          <div className="fac-check fac-check--ok"><CheckCircle2 size={16} /> Factura global timbrada.</div>
          <div className="fac-resultado-datos">
            {resultado.uuid && <div><b>Folio fiscal (UUID):</b> <span className="fac-uuid">{resultado.uuid}</span></div>}
            {resultado.total != null && <div><b>Total:</b> {formatMXN(resultado.total)}</div>}
            <div><b>Ventas incluidas:</b> {resultado.folios_incluidos.length}</div>
          </div>
          <div className="fac-resultado-acciones">
            <button className="fac-btn-secondary" onClick={() => descargar("xml")} disabled={!!descargando}>
              {descargando === "xml" ? <Loader2 size={15} className="fac-spin" /> : <FileCode2 size={15} />} XML
            </button>
            <button className="fac-btn-primary" onClick={() => descargar("pdf")} disabled={!!descargando}>
              {descargando === "pdf" ? <Loader2 size={15} className="fac-spin" /> : <Download size={15} />} Descargar PDF
            </button>
          </div>
        </div>
      )}

      {/* ── SWITCH de confirmación (consumo de saldo facturable) ── */}
      {confirmando && (
        <div className="fac-overlay" onClick={() => !timbrando && setConfirmando(false)}>
          <div className="fac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fac-modal-head">
              <span><ArrowRightLeft size={18} /> Confirmar factura global</span>
            </div>
            <div className="fac-modal-body">
              <p className="fac-modal-intro">
                Vas a timbrar la global de <b>{fecha}</b> con <b>{preview.entran.length}</b> artículo(s).
                Se <b>descontará del saldo facturable</b> lo siguiente (el resto sigue como venta no facturada):
              </p>
              {consumos.length === 0 ? (
                <p className="fac-modal-nota">Ninguno de los artículos maneja saldo facturable; no se descuenta saldo.</p>
              ) : (
                <table className="fac-tabla fac-tabla--switch">
                  <thead><tr><th>Artículo</th><th className="num">Saldo antes</th><th className="num">Descuento</th><th className="num">Saldo después</th></tr></thead>
                  <tbody>
                    {consumos.map((l) => (
                      <tr key={l.sku}>
                        <td><div className="fac-art">{l.descripcion}</div><div className="fac-sku">{l.sku}</div></td>
                        <td className="num">{l.saldoDisponible}</td>
                        <td className="num fac-neg">−{l.cantidad}</td>
                        <td className={`num${l.saldoDisponible - l.cantidad < 0 ? " fac-neg" : ""}`}>{l.saldoDisponible - l.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {forzar && consumos.some((l) => l.saldoDisponible - l.cantidad < 0) && (
                <div className="fac-alert fac-alert--warn" style={{ marginTop: 10 }}>
                  <AlertTriangle size={15} /> Algunos saldos quedarán en negativo (sobregiro forzado).
                </div>
              )}
            </div>
            <div className="fac-modal-acciones">
              <button className="fac-btn-secondary" onClick={() => setConfirmando(false)} disabled={timbrando}>Cancelar</button>
              <button className="fac-btn-primary" onClick={timbrar} disabled={timbrando}>
                {timbrando ? <><Loader2 size={15} className="fac-spin" /> Timbrando…</> : "Confirmar y timbrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`fac-kpi${tone ? " fac-kpi--" + tone : ""}`}>
      <div className="fac-kpi-label">{label}</div>
      <div className="fac-kpi-value">{value}</div>
    </div>
  )
}
