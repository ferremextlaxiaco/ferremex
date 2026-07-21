import { useEffect, useMemo, useState, useCallback } from "react"
import {
  Wallet, Plus, Search, Eye, RotateCcw, Trash2, X, Pencil, Save,
  TrendingUp, Award, Coins, Users, AlertTriangle, Fingerprint, ScanBarcode,
} from "lucide-react"
import {
  listarClientesMonederoAPI, obtenerDetalleMonederoAPI, inscribirMonederoAPI,
  darDeBajaMonederoAPI, ajustarPuntosMonederoAPI, resetearPuntosMonederoAPI,
  listarReglasMonederoAPI, crearReglaMonederoAPI, actualizarReglaMonederoAPI, eliminarReglaMonederoAPI,
  listarNivelesMonederoAPI, crearNivelMonederoAPI, actualizarNivelMonederoAPI, eliminarNivelMonederoAPI,
  obtenerConfigMonederoAPI, guardarConfigMonederoAPI,
  listarClientesAPI, listarCatalogos,
} from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import { formatMXN } from "../lib/format"
import ConfirmDialog from "../components/ConfirmDialog"
import { usePOS } from "../lib/pos-store"

/* ─── Estilos compartidos (Tailwind v4, tokens Ferremex) ──────────────────── */
const btnPrimary = "inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-40 disabled:pointer-events-none"
const btnSecondary = "inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50"
const btnDanger = "inline-flex items-center gap-2 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-sm hover:bg-red-50"
const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
const labelCls = "block text-xs font-medium text-gray-500 mb-1"

function Toasts({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-[9999] pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm font-medium text-white shadow-lg ${
          t.type === "error" ? "bg-red-600" : t.type === "info" ? "bg-gray-800" : t.type === "warning" ? "bg-amber-600" : "bg-green-600"
        }`}>{t.msg}</div>
      ))}
    </div>
  )
}

const TABS = [
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "reglas", label: "Reglas de puntos", icon: TrendingUp, permiso: "puede_ver_reglas_monedero" },
  { id: "niveles", label: "Niveles", icon: Award, permiso: "puede_ver_niveles_monedero" },
  { id: "config", label: "Configuración", icon: Coins, permiso: "puede_ver_config_monedero" },
]

export default function MonederoModule() {
  const { state } = usePOS()
  const { toasts, push } = useToasts()
  const [tab, setTab] = useState("clientes")
  // Elevado desde TabClientes para poder disparar "Inscribir cliente" desde la
  // barra superior (junto a las tabs), no solo desde la toolbar interna del tab.
  const [inscribiendo, setInscribiendo] = useState(false)

  const tabsVisibles = TABS.filter((t) => !t.permiso || state.cajero?.permisos?.[t.permiso])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Encabezado */}
      <div className="px-6 pt-5 pb-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={22} className="text-orange-600" />
          <h1 className="text-lg font-semibold text-gray-900">Monedero Electrónico</h1>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tabsVisibles.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 -mb-[1px] ${
                  tab === id ? "border-orange-600 text-orange-700 bg-orange-50" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          {tab === "clientes" && (
            <button className={btnPrimary} onClick={() => setInscribiendo(true)}>
              <Plus size={16} /> Inscribir cliente
            </button>
          )}
        </div>
      </div>

      {/* Contenido del tab */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "clientes" && <TabClientes push={push} inscribiendo={inscribiendo} setInscribiendo={setInscribiendo} />}
        {tab === "reglas" && <TabReglas push={push} />}
        {tab === "niveles" && <TabNiveles push={push} />}
        {tab === "config" && <TabConfig push={push} />}
      </div>

      <Toasts toasts={toasts} />
    </div>
  )
}

/* ══════════════════════ TAB CLIENTES ══════════════════════ */
function TabClientes({ push, inscribiendo, setInscribiendo }) {
  const [resp, setResp] = useState({ clientes: [], kpis: { inscritos: 0, puntos_circulacion: 0, valor_circulacion: 0 } })
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [soloConPuntos, setSoloConPuntos] = useState(false)
  const [detalleId, setDetalleId] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const d = await listarClientesMonederoAPI()
      setResp(d)
    } catch { push("No se pudieron cargar los clientes del monedero", "error") }
    finally { setCargando(false) }
  }, [push])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return resp.clientes.filter((c) => {
      if (soloConPuntos && c.puntos <= 0) return false
      if (!q) return true
      return c.nombre.toLowerCase().includes(q) || c.num_cliente.toLowerCase().includes(q) || (c.telefono || "").includes(q)
    })
  }, [resp.clientes, busqueda, soloConPuntos])

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard icon={Users} label="Clientes inscritos" valor={resp.kpis.inscritos} />
        <KpiCard icon={Coins} label="Puntos en circulación" valor={resp.kpis.puntos_circulacion.toLocaleString("es-MX")} />
        <KpiCard icon={Wallet} label="Valor en circulación" valor={formatMXN(resp.kpis.valor_circulacion)} />
      </div>

      {/* Barra de acciones */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar por nombre, # cliente o teléfono…"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={soloConPuntos} onChange={(e) => setSoloConPuntos(e.target.checked)} />
          Solo con puntos
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">#</th>
              <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
              <th className="text-left px-4 py-2.5 font-medium">Nivel</th>
              <th className="text-right px-4 py-2.5 font-medium">Puntos</th>
              <th className="text-right px-4 py-2.5 font-medium">Equivale a</th>
              <th className="text-right px-4 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                {resp.clientes.length === 0 ? "Aún no hay clientes inscritos al monedero." : "Sin resultados para el filtro."}
              </td></tr>
            ) : filtrados.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500">{c.num_cliente || "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-gray-900">{c.nombre || "(sin nombre)"}</div>
                  {c.telefono && <div className="text-xs text-gray-400">{c.telefono}</div>}
                </td>
                <td className="px-4 py-2.5">
                  {c.nivel_nombre
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: (c.nivel_color || "#f59e0b") + "22", color: c.nivel_color || "#b45309" }}>
                        <Award size={12} /> {c.nivel_nombre}
                      </span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{c.puntos.toLocaleString("es-MX")}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{formatMXN(c.valor ?? 0)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="Ver detalle" onClick={() => setDetalleId(c.id)}><Eye size={16} /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalleId && (
        <DetalleDrawer customerId={detalleId} push={push}
          onClose={() => setDetalleId(null)} onChanged={cargar} />
      )}
      {inscribiendo && (
        <InscribirDrawer push={push} yaInscritos={new Set(resp.clientes.map((c) => c.id))}
          onClose={() => setInscribiendo(false)} onInscrito={() => { setInscribiendo(false); cargar() }} />
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, valor }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 shrink-0"><Icon size={18} /></div>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-lg font-semibold text-gray-900">{valor}</div>
      </div>
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick}
      className={`w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg ${
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-500 hover:bg-gray-100"}`}>
      {children}
    </button>
  )
}

/* ─── Drawer de detalle del cliente ─── */
function DetalleDrawer({ customerId, push, onClose, onChanged }) {
  const [det, setDet] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [ajuste, setAjuste] = useState({ puntos: "", descripcion: "" })
  const [confirm, setConfirm] = useState(null) // "reset" | "baja"

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setDet(await obtenerDetalleMonederoAPI(customerId)) }
    catch { push("No se pudo cargar el detalle", "error") }
    finally { setCargando(false) }
  }, [customerId, push])

  useEffect(() => { cargar() }, [cargar])

  async function handleAjuste() {
    const p = parseInt(ajuste.puntos, 10)
    if (!Number.isFinite(p) || p === 0) { push("Ingresa un ajuste distinto de 0", "error"); return }
    if (!ajuste.descripcion.trim()) { push("El motivo del ajuste es obligatorio", "error"); return }
    try {
      await ajustarPuntosMonederoAPI(customerId, p, ajuste.descripcion.trim())
      push("Ajuste aplicado")
      setAjuste({ puntos: "", descripcion: "" })
      cargar(); onChanged()
    } catch (e) { push(e?.message || "No se pudo aplicar el ajuste", "error") }
  }

  async function handleReset() {
    try {
      await resetearPuntosMonederoAPI(customerId, "Reseteo manual desde administración")
      push("Puntos reseteados")
      setConfirm(null); cargar(); onChanged()
    } catch (e) { push(e?.message || "No se pudo resetear", "error") }
  }

  async function handleBaja() {
    try {
      await darDeBajaMonederoAPI(customerId)
      push("Cliente dado de baja del monedero")
      setConfirm(null); onChanged(); onClose()
    } catch (e) { push(e?.message || "No se pudo dar de baja", "error") }
  }

  const progreso = useMemo(() => {
    if (!det?.nivel_siguiente) return null
    const base = det.nivel_actual?.umbral_periodo ?? 0
    const meta = det.nivel_siguiente.umbral_periodo
    const pct = Math.max(0, Math.min(100, ((det.compras_periodo - base) / (meta - base)) * 100))
    return { pct, falta: Math.max(0, meta - det.compras_periodo) }
  }, [det])

  return (
    <DrawerShell title="Detalle del monedero" onClose={onClose}>
      {cargando || !det ? (
        <div className="p-6 text-center text-gray-400">Cargando…</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Saldo */}
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-center">
            <div className="text-xs text-orange-700/70 mb-1">Saldo de puntos</div>
            <div className="text-3xl font-bold text-orange-700">{det.saldo.toLocaleString("es-MX")}</div>
            <div className="text-sm text-orange-700/80 mt-1">Equivale a {formatMXN(det.valor_saldo)}</div>
          </div>

          {/* Nivel + progreso */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Nivel actual</span>
              {det.nivel_actual
                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: (det.nivel_actual.color || "#f59e0b") + "22", color: det.nivel_actual.color || "#b45309" }}>
                    <Award size={12} /> {det.nivel_actual.nombre} ·{det.nivel_actual.multiplicador}×
                  </span>
                : <span className="text-gray-300 text-xs">Sin nivel</span>}
            </div>
            <div className="text-xs text-gray-500 mb-2">
              Compras del periodo ({det.periodo_meses} mes{det.periodo_meses > 1 ? "es" : ""}): <strong>{formatMXN(det.compras_periodo)}</strong>
            </div>
            {progreso && det.nivel_siguiente && (
              <div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${progreso.pct}%` }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Faltan {formatMXN(progreso.falta)} para <strong>{det.nivel_siguiente.nombre}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Ajuste manual */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Ajuste manual de puntos</div>
            <div className="flex gap-2 mb-2">
              <input className={`${inputCls} w-32`} type="number" placeholder="+/- puntos"
                value={ajuste.puntos} onChange={(e) => setAjuste((a) => ({ ...a, puntos: e.target.value }))} />
              <input className={inputCls} placeholder="Motivo (obligatorio)"
                value={ajuste.descripcion} onChange={(e) => setAjuste((a) => ({ ...a, descripcion: e.target.value }))} />
            </div>
            <button className={btnSecondary} onClick={handleAjuste}><Save size={15} /> Aplicar ajuste</button>
          </div>

          {/* Movimientos */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 text-sm font-medium text-gray-700 border-b border-gray-100">Movimientos</div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {det.movimientos.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-400 text-sm">Sin movimientos.</div>
              ) : det.movimientos.map((m) => (
                <div key={m.id} className={`px-4 py-2.5 flex items-center justify-between text-sm ${m.cancelado ? "opacity-50" : ""}`}>
                  <div>
                    <div className={`text-gray-700 ${m.cancelado ? "line-through" : ""}`}>{m.descripcion}</div>
                    <div className="text-xs text-gray-400">
                      {String(m.fecha).slice(0, 10)} · {m.tipo}{m.cancelado ? " · cancelado" : ""}
                    </div>
                  </div>
                  <span className={`font-semibold ${m.puntos >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.puntos >= 0 ? "+" : ""}{m.puntos.toLocaleString("es-MX")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Acciones destructivas */}
          <div className="flex gap-2">
            <button className={btnDanger} onClick={() => setConfirm("reset")}><RotateCcw size={15} /> Resetear puntos</button>
            <button className={btnDanger} onClick={() => setConfirm("baja")}><Trash2 size={15} /> Dar de baja</button>
          </div>
        </div>
      )}

      <ConfirmDialog open={confirm === "reset"} danger title="Resetear puntos"
        message="Esto llevará el saldo de puntos del cliente a 0. Queda registrado como movimiento auditable. ¿Continuar?"
        confirmLabel="Resetear" onConfirm={handleReset} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === "baja"} danger title="Dar de baja del monedero"
        message="El cliente saldrá del programa. Su historial de puntos se conserva; si se reinscribe, recupera su saldo. ¿Continuar?"
        confirmLabel="Dar de baja" onConfirm={handleBaja} onClose={() => setConfirm(null)} />
    </DrawerShell>
  )
}

/* ─── Drawer para inscribir un cliente existente ─── */
function InscribirDrawer({ push, yaInscritos, onClose, onInscrito }) {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState("")

  useEffect(() => {
    let on = true
    ;(async () => {
      try { const d = await listarClientesAPI(); if (on) setClientes(d) }
      catch { if (on) push("No se pudieron cargar los clientes", "error") }
      finally { if (on) setCargando(false) }
    })()
    return () => { on = false }
  }, [push])

  const disponibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return clientes
      .filter((c) => !yaInscritos.has(c.id))
      .filter((c) => !t || c.nombre.toLowerCase().includes(t) || (c.num_cliente || "").includes(t) || (c.telefono || "").includes(t))
  }, [clientes, q, yaInscritos])

  async function inscribir(id) {
    try { await inscribirMonederoAPI(id); push("Cliente inscrito al monedero"); onInscrito() }
    catch (e) { push(e?.message || "No se pudo inscribir", "error") }
  }

  return (
    <DrawerShell title="Inscribir cliente al monedero" onClose={onClose}>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className={`${inputCls} pl-9`} placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto divide-y divide-gray-50">
        {cargando ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">Cargando…</div>
        ) : disponibles.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">No hay clientes disponibles para inscribir.</div>
        ) : disponibles.map((c) => (
          <div key={c.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
            <div>
              <div className="text-sm font-medium text-gray-900">{c.nombre || "(sin nombre)"}</div>
              <div className="text-xs text-gray-400">#{c.num_cliente || "—"}{c.telefono ? ` · ${c.telefono}` : ""}</div>
            </div>
            <button className={btnPrimary} onClick={() => inscribir(c.id)}><Plus size={15} /> Inscribir</button>
          </div>
        ))}
      </div>
    </DrawerShell>
  )
}

/* ══════════════════════ TAB REGLAS ══════════════════════ */
function TabReglas({ push }) {
  const [reglas, setReglas] = useState([])
  const [cfg, setCfg] = useState(null)
  const [cat, setCat] = useState({ depts: [], cats: [], marcas: [] })
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null) // regla o {} (nueva)
  const [confirmDel, setConfirmDel] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [r, c, t] = await Promise.all([listarReglasMonederoAPI(), obtenerConfigMonederoAPI(), listarCatalogos()])
      setReglas(r); setCfg(c); setCat(t)
    } catch { push("No se pudieron cargar las reglas", "error") }
    finally { setCargando(false) }
  }, [push])

  useEffect(() => { cargar() }, [cargar])

  async function guardar(data) {
    try {
      if (data.id) await actualizarReglaMonederoAPI(data.id, data)
      else await crearReglaMonederoAPI(data)
      push("Regla guardada"); setEditando(null); cargar()
    } catch (e) { push(e?.message || "No se pudo guardar la regla", "error") }
  }
  async function eliminar(id) {
    try { await eliminarReglaMonederoAPI(id); push("Regla eliminada"); setConfirmDel(null); cargar() }
    catch (e) { push(e?.message || "No se pudo eliminar", "error") }
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Tasa base global: <strong className="text-gray-900">{cfg ? `${cfg.tasa_base}%` : "—"}</strong>
          <span className="text-gray-400"> · se aplica a los productos sin regla específica.</span>
        </div>
        <button className={btnPrimary} onClick={() => setEditando({})}><Plus size={16} /> Nueva regla</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Ámbito</th>
              <th className="text-left px-4 py-2.5 font-medium">Referencia</th>
              <th className="text-right px-4 py-2.5 font-medium">Tasa</th>
              <th className="text-center px-4 py-2.5 font-medium">Activa</th>
              <th className="text-right px-4 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Cargando…</td></tr>
            ) : reglas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Sin reglas. Todos los productos usan la tasa base.</td></tr>
            ) : reglas.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 capitalize text-gray-500">{r.ambito}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.ref}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.tasa === 0
                    ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 font-medium">Excluido</span>
                    : <span className="font-semibold text-gray-900">{r.tasa}%</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-block w-2 h-2 rounded-full ${r.activa ? "bg-green-500" : "bg-gray-300"}`} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="Editar" onClick={() => setEditando(r)}><Pencil size={16} /></IconBtn>
                    <IconBtn title="Eliminar" danger onClick={() => setConfirmDel(r)}><Trash2 size={16} /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && <ReglaDrawer regla={editando} cat={cat} onGuardar={guardar} onClose={() => setEditando(null)} />}
      <ConfirmDialog open={!!confirmDel} danger title="Eliminar regla"
        message={confirmDel ? `¿Eliminar la regla de "${confirmDel.ref}"? Los productos de ese ámbito volverán a la tasa base.` : ""}
        confirmLabel="Eliminar" onConfirm={() => eliminar(confirmDel.id)} onClose={() => setConfirmDel(null)} />
    </div>
  )
}

function ReglaDrawer({ regla, cat, onGuardar, onClose }) {
  const [ambito, setAmbito] = useState(regla.ambito || "marca")
  const [ref, setRef] = useState(regla.ref || "")
  const [excluir, setExcluir] = useState(regla.id ? regla.tasa === 0 : false)
  const [tasa, setTasa] = useState(regla.id && regla.tasa > 0 ? String(regla.tasa) : "")
  const [activa, setActiva] = useState(regla.activa !== undefined ? regla.activa : true)

  // Opciones según el ámbito, de la taxonomía (listarCatalogos()).
  const opciones = useMemo(() => {
    if (ambito === "marca") return cat.marcas.map((m) => m.nombre)
    if (ambito === "categoria") return cat.cats.map((c) => c.nombre)
    return cat.depts.map((d) => d.nombre)
  }, [ambito, cat])
  const opcionesUnicas = useMemo(() => [...new Set(opciones)].sort((a, b) => a.localeCompare(b, "es")), [opciones])

  function submit() {
    onGuardar({
      ...(regla.id ? { id: regla.id } : {}),
      ambito, ref,
      tasa: excluir ? 0 : (parseFloat(tasa) || 0),
      activa,
    })
  }

  return (
    <DrawerShell title={regla.id ? "Editar regla de puntos" : "Nueva regla de puntos"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>Ámbito</label>
          <select className={inputCls} value={ambito} onChange={(e) => { setAmbito(e.target.value); setRef("") }}>
            <option value="marca">Marca</option>
            <option value="categoria">Categoría</option>
            <option value="departamento">Departamento</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{ambito === "marca" ? "Marca" : ambito === "categoria" ? "Categoría" : "Departamento"}</label>
          <select className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">— Selecciona —</option>
            {opcionesUnicas.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} />
          Excluir de puntos (este ámbito no genera puntos)
        </label>
        {!excluir && (
          <div>
            <label className={labelCls}>Tasa de generación (%)</label>
            <input className={inputCls} type="number" step="0.1" min="0" max="100" placeholder="Ej. 2"
              value={tasa} onChange={(e) => setTasa(e.target.value)} />
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Regla activa
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} onClick={submit} disabled={!ref}><Save size={16} /> Guardar</button>
        </div>
      </div>
    </DrawerShell>
  )
}

/* ══════════════════════ TAB NIVELES ══════════════════════ */
function TabNiveles({ push }) {
  const [niveles, setNiveles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editando, setEditando] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setNiveles(await listarNivelesMonederoAPI()) }
    catch { push("No se pudieron cargar los niveles", "error") }
    finally { setCargando(false) }
  }, [push])

  useEffect(() => { cargar() }, [cargar])

  async function guardar(data) {
    try {
      if (data.id) await actualizarNivelMonederoAPI(data.id, data)
      else await crearNivelMonederoAPI(data)
      push("Nivel guardado"); setEditando(null); cargar()
    } catch (e) { push(e?.message || "No se pudo guardar el nivel", "error") }
  }
  async function eliminar(id) {
    try { await eliminarNivelMonederoAPI(id); push("Nivel eliminado"); setConfirmDel(null); cargar() }
    catch (e) { push(e?.message || "No se pudo eliminar", "error") }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Los niveles se asignan automáticamente según las compras del periodo de cada cliente.</p>
        <button className={btnPrimary} onClick={() => setEditando({})}><Plus size={16} /> Nuevo nivel</button>
      </div>

      {cargando ? (
        <div className="text-center text-gray-400 py-10">Cargando…</div>
      ) : niveles.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-10 text-center text-gray-400">
          Sin niveles. Todos los clientes ganan puntos a 1× (multiplicador base).
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {niveles.map((n) => (
            <div key={n.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold"
                  style={{ background: (n.color || "#f59e0b") + "22", color: n.color || "#b45309" }}>
                  <Award size={14} /> {n.nombre}
                </span>
                <div className="flex items-center gap-1">
                  <IconBtn title="Editar" onClick={() => setEditando(n)}><Pencil size={16} /></IconBtn>
                  <IconBtn title="Eliminar" danger onClick={() => setConfirmDel(n)}><Trash2 size={16} /></IconBtn>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Dato label="Compras/periodo" valor={formatMXN(n.umbral_periodo)} />
                <Dato label="Multiplicador" valor={`${n.multiplicador}×`} />
                <Dato label="Valor punto bonus" valor={n.valor_punto_bonus != null ? formatMXN(n.valor_punto_bonus) : "—"} />
                <Dato label="Nivel de precio" valor={n.nivel_precio != null ? `Precio ${n.nivel_precio}` : "—"} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && <NivelDrawer nivel={editando} onGuardar={guardar} onClose={() => setEditando(null)} />}
      <ConfirmDialog open={!!confirmDel} danger title="Eliminar nivel"
        message={confirmDel ? `¿Eliminar el nivel "${confirmDel.nombre}"?` : ""}
        confirmLabel="Eliminar" onConfirm={() => eliminar(confirmDel.id)} onClose={() => setConfirmDel(null)} />
    </div>
  )
}

function Dato({ label, valor }) {
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className="font-medium text-gray-800">{valor}</div>
    </div>
  )
}

function NivelDrawer({ nivel, onGuardar, onClose }) {
  const [f, setF] = useState({
    nombre: nivel.nombre || "",
    orden: nivel.orden ?? 1,
    umbral_periodo: nivel.umbral_periodo ?? 0,
    multiplicador: nivel.multiplicador ?? 1,
    valor_punto_bonus: nivel.valor_punto_bonus ?? "",
    nivel_precio: nivel.nivel_precio ?? "",
    color: nivel.color || "#f59e0b",
    activo: nivel.activo !== undefined ? nivel.activo : true,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  function submit() {
    onGuardar({
      ...(nivel.id ? { id: nivel.id } : {}),
      nombre: f.nombre,
      orden: parseInt(f.orden, 10) || 0,
      umbral_periodo: parseFloat(f.umbral_periodo) || 0,
      multiplicador: parseFloat(f.multiplicador) || 1,
      valor_punto_bonus: f.valor_punto_bonus === "" ? null : parseFloat(f.valor_punto_bonus),
      nivel_precio: f.nivel_precio === "" ? null : parseInt(f.nivel_precio, 10),
      color: f.color,
      activo: f.activo,
    })
  }

  return (
    <DrawerShell title={nivel.id ? "Editar nivel" : "Nuevo nivel"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Nombre del nivel</label>
            <input className={inputCls} placeholder="Ej. Oro, Constructor" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Orden (1 = más bajo)</label>
            <input className={inputCls} type="number" min="1" value={f.orden} onChange={(e) => set("orden", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <input className="w-full h-[42px] border border-gray-300 rounded-lg px-1" type="color" value={f.color} onChange={(e) => set("color", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Compras del periodo (umbral $)</label>
            <input className={inputCls} type="number" min="0" value={f.umbral_periodo} onChange={(e) => set("umbral_periodo", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Multiplicador de puntos</label>
            <input className={inputCls} type="number" step="0.1" min="0.1" value={f.multiplicador} onChange={(e) => set("multiplicador", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Valor punto bonus ($) — opcional</label>
            <input className={inputCls} type="number" step="0.01" min="0" placeholder="Hereda el global" value={f.valor_punto_bonus} onChange={(e) => set("valor_punto_bonus", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Nivel de precio — opcional</label>
            <select className={inputCls} value={f.nivel_precio} onChange={(e) => set("nivel_precio", e.target.value)}>
              <option value="">No forzar</option>
              <option value="2">Precio 2 (Cliente)</option>
              <option value="3">Precio 3 (Distribuidor)</option>
              <option value="4">Precio 4 (Especial)</option>
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={f.activo} onChange={(e) => set("activo", e.target.checked)} /> Nivel activo
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} onClick={submit} disabled={!f.nombre.trim()}><Save size={16} /> Guardar</button>
        </div>
      </div>
    </DrawerShell>
  )
}

/* ══════════════════════ TAB CONFIG ══════════════════════ */
function TabConfig({ push }) {
  const [cfg, setCfg] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let on = true
    ;(async () => {
      try { const c = await obtenerConfigMonederoAPI(); if (on) setCfg(c) }
      catch { if (on) push("No se pudo cargar la configuración", "error") }
      finally { if (on) setCargando(false) }
    })()
    return () => { on = false }
  }, [push])

  const set = (k, v) => setCfg((p) => ({ ...p, [k]: v }))

  async function guardar() {
    setGuardando(true)
    try { const c = await guardarConfigMonederoAPI(cfg); setCfg(c); push("Configuración guardada") }
    catch (e) { push(e?.message || "No se pudo guardar", "error") }
    finally { setGuardando(false) }
  }

  if (cargando || !cfg) return <div className="text-center text-gray-400 py-10">Cargando…</div>

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-4">Valores del programa</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Valor del punto ($ por punto)</label>
            <input className={inputCls} type="number" step="0.01" min="0.01" value={cfg.valor_punto} onChange={(e) => set("valor_punto", parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-gray-400 mt-1">Ej. 1.00 → 1 punto equivale a $1.</p>
          </div>
          <div>
            <label className={labelCls}>Tasa base de generación (%)</label>
            <input className={inputCls} type="number" step="0.1" min="0" max="100" value={cfg.tasa_base} onChange={(e) => set("tasa_base", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Tope de canje (% del ticket)</label>
            <input className={inputCls} type="number" min="0" max="100" value={cfg.max_canje_pct} onChange={(e) => set("max_canje_pct", parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Mínimo de puntos para canjear</label>
            <input className={inputCls} type="number" min="0" value={cfg.min_puntos_canje} onChange={(e) => set("min_puntos_canje", parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Vencimiento de puntos (meses, 0 = nunca)</label>
            <input className={inputCls} type="number" min="0" value={cfg.vencimiento_meses} onChange={(e) => set("vencimiento_meses", parseInt(e.target.value, 10) || 0)} />
          </div>
          <div>
            <label className={labelCls}>Periodo para nivel (meses)</label>
            <input className={inputCls} type="number" min="1" value={cfg.periodo_nivel_meses} onChange={(e) => set("periodo_nivel_meses", parseInt(e.target.value, 10) || 1)} />
          </div>
          <div>
            <label className={labelCls}>Redondeo de puntos</label>
            <select className={inputCls} value={cfg.redondeo} onChange={(e) => set("redondeo", e.target.value)}>
              <option value="abajo">Hacia abajo</option>
              <option value="normal">Normal</option>
              <option value="ninguno">Sin redondear (decimales)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Confirmación de canje en caja</div>
        <p className="text-xs text-gray-400 mb-3">
          Define cómo confirma el cliente el uso de sus puntos. El hardware se configura en <strong>Periféricos</strong>;
          aquí se habilita la exigencia. Mientras el lector no esté conectado, la confirmación se simula.
        </p>
        <ToggleRow icon={Fingerprint} label="Exigir huella del cliente al canjear"
          checked={cfg.confirmar_huella} onChange={(v) => set("confirmar_huella", v)} />
        <ToggleRow icon={ScanBarcode} label="Exigir tarjeta / código de barras (# de cliente) al canjear"
          checked={cfg.confirmar_codigo} onChange={(v) => set("confirmar_codigo", v)} />
        {(cfg.confirmar_huella || cfg.confirmar_codigo) && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            La confirmación está activa pero el lector se simula hasta conectarlo en Periféricos.
          </div>
        )}
      </div>

      <button className={btnPrimary} onClick={guardar} disabled={guardando}>
        <Save size={16} /> {guardando ? "Guardando…" : "Guardar configuración"}
      </button>
    </div>
  )
}

function ToggleRow({ icon: Icon, label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="inline-flex items-center gap-2 text-sm text-gray-700"><Icon size={16} className="text-gray-400" /> {label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`w-10 h-5.5 rounded-full relative transition-colors ${checked ? "bg-orange-600" : "bg-gray-300"}`}
        style={{ height: 22, width: 40 }}>
        <span className="absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all" style={{ left: checked ? 20 : 2 }} />
      </button>
    </div>
  )
}

/* ─── Shell de drawer lateral reutilizable ─── */
function DrawerShell({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[500] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-[460px] max-w-[95vw] h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
