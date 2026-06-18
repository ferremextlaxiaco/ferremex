import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Search, RefreshCw, FileCheck2, AlertTriangle, Wallet, TriangleAlert,
  Pencil, Building2, Download, X, Check,
} from "lucide-react"
import {
  listarArticulos, listarArticulosDeCatalogo,
  listarFacturableAPI, ajustarSaldoFacturableAPI, marcarDeptoFacturableAPI,
} from "../lib/client"
import { formatMXN } from "../lib/format"

/**
 * Panel "Saldo Facturable" (tab dentro de Artículos).
 *
 * Doble inventario fiscal: muestra, para cada artículo, su STOCK FÍSICO vs su
 * SALDO FACTURABLE (piezas con respaldo de factura de compra + clave SAT). El
 * saldo sube al recibir compras "Con Factura" y baja solo al FACTURAR.
 *
 * Permite: ajustar el saldo manualmente (con motivo, auditado), marcar qué
 * DEPARTAMENTOS son facturables (depto define, artículo limita), y ver el estado
 * fiscal con semáforos. Cumple el Contrato de Conexión (todo vía client.ts).
 *
 * Reglas de estado por artículo:
 *  - Sin clave SAT            → ⚪ no facturable (no se puede dar saldo)
 *  - Depto no facturable      → ⚪ excluido por departamento
 *  - Saldo < 0 (sobregiro)    → 🔴 sobregirado (facturó más de lo respaldado)
 *  - Saldo < inventarioMin    → 🟡 saldo bajo (conviene comprar con factura)
 *  - Saldo > 0                → 🟢 facturable
 */
export default function FacturablePanel({ taxonomy, taxLoading, pushToast }) {
  const [articulos, setArticulos] = useState([])
  const [saldos, setSaldos] = useState({})     // { sku: SaldoFacturableAPI }
  const [deptos, setDeptos] = useState({})     // { nombreDepto: boolean }
  const [loading, setLoading] = useState(false)
  const [hasBuscado, setHasBuscado] = useState(false)
  const [search, setSearch] = useState("")
  const [filterDept, setFilterDept] = useState("")
  const [soloConSaldo, setSoloConSaldo] = useState(false)
  const [ajuste, setAjuste] = useState(null)   // artículo en edición de saldo
  const [deptoModal, setDeptoModal] = useState(false)

  // ── Carga de saldos + mapa de deptos (siempre, no depende de búsqueda) ──────
  const cargarFacturable = useCallback(async () => {
    try {
      const data = await listarFacturableAPI()
      const mapa = {}
      for (const s of data.saldos) mapa[s.sku] = s
      setSaldos(mapa)
      setDeptos(data.deptos ?? {})
    } catch {
      pushToast?.("No se pudo cargar el saldo facturable", "error")
    }
  }, [pushToast])

  useEffect(() => { cargarFacturable() }, [cargarFacturable])

  // ── Búsqueda de artículos (mismo motor que el tab Artículos) ────────────────
  const buscar = useCallback(async (q, deptNombre) => {
    if (!q?.trim() && !deptNombre) {
      // Sin criterio: si hay saldos cargados, muestra esos SKUs para no traer
      // todo el catálogo. Si no, pide al usuario filtrar.
      const skusConSaldo = Object.keys(saldos)
      if (skusConSaldo.length === 0) { setHasBuscado(true); setArticulos([]); return }
    }
    setLoading(true); setHasBuscado(true)
    try {
      let data
      if (q?.trim()) {
        data = await listarArticulos(q)
        if (deptNombre) data = data.filter((a) => a.departamento === deptNombre)
      } else if (deptNombre) {
        data = await listarArticulosDeCatalogo(deptNombre, "")
      } else {
        // Cargar solo los artículos que ya tienen saldo (enfoque fiscal).
        const todos = await listarArticulos("")
        const conSaldo = new Set(Object.keys(saldos))
        data = todos.filter((a) => conSaldo.has(a.clave) || conSaldo.has(a.claveAlterna))
      }
      setArticulos(data)
    } catch {
      pushToast?.("No se pudieron cargar los artículos", "error")
    } finally {
      setLoading(false)
    }
  }, [saldos, pushToast])

  const depNombre = useMemo(
    () => taxonomy.depts.find((d) => d.id === filterDept)?.nombre ?? "",
    [taxonomy, filterDept]
  )

  function handleBuscar() { buscar(search, depNombre) }

  // ── Merge artículo + saldo + estado fiscal ──────────────────────────────────
  const filas = useMemo(() => {
    return articulos.map((a) => {
      const s = saldos[a.clave] ?? saldos[a.claveAlterna]
      const saldo = s ? Number(s.saldo) || 0 : 0
      const deptoFacturable = !!deptos[a.departamento]
      const tieneClave = !!(a.claveSat && a.claveSat.trim())

      let estado, color
      if (!tieneClave) { estado = "Sin clave SAT"; color = "gris" }
      else if (!deptoFacturable) { estado = "Depto no facturable"; color = "gris" }
      else if (saldo < 0) { estado = "Sobregirado"; color = "rojo" }
      else if (a.inventarioMin > 0 && saldo < a.inventarioMin) { estado = "Saldo bajo"; color = "amarillo" }
      else if (saldo > 0) { estado = "Facturable"; color = "verde" }
      else { estado = "Sin saldo"; color = "gris" }

      return { ...a, saldo, deptoFacturable, tieneClave, estado, color }
    }).filter((f) => !soloConSaldo || f.saldo !== 0)
  }, [articulos, saldos, deptos, soloConSaldo])

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sumSaldo = Object.values(saldos).reduce((s, x) => s + (Number(x.saldo) || 0), 0)
    const sobregirados = Object.values(saldos).filter((x) => (Number(x.saldo) || 0) < 0).length
    const conSaldo = Object.values(saldos).filter((x) => (Number(x.saldo) || 0) > 0).length
    const deptosFacturables = Object.values(deptos).filter(Boolean).length
    return { sumSaldo, sobregirados, conSaldo, deptosFacturables }
  }, [saldos, deptos])

  // ── Acciones ─────────────────────────────────────────────────────────────────
  async function guardarAjuste(nuevoSaldo, motivo) {
    if (!ajuste) return
    try {
      await ajustarSaldoFacturableAPI({
        sku: ajuste.clave,
        nuevo_saldo: nuevoSaldo,
        motivo,
        clave_sat: ajuste.claveSat || null,
        descripcion: ajuste.descripcion || null,
        departamento: ajuste.departamento || null,
      })
      pushToast?.("Saldo facturable actualizado", "success")
      setAjuste(null)
      await cargarFacturable()
    } catch (e) {
      pushToast?.(String(e?.message ?? "").includes("clave SAT")
        ? "Asigna una clave SAT al artículo antes de darle saldo"
        : "No se pudo ajustar el saldo", "error")
    }
  }

  async function toggleDepto(nombre, facturable) {
    try {
      await marcarDeptoFacturableAPI(nombre, facturable)
      setDeptos((prev) => ({ ...prev, [nombre]: facturable }))
    } catch {
      pushToast?.("No se pudo actualizar el departamento", "error")
    }
  }

  function exportarCSV() {
    const headers = ["Clave", "Descripción", "Departamento", "Clave SAT", "Stock físico", "Saldo facturable", "Estado"]
    const lineas = filas.map((f) =>
      [f.clave, `"${(f.descripcion ?? "").replace(/"/g, '""')}"`, f.departamento, f.claveSat, f.existencia, f.saldo, f.estado].join(",")
    )
    const csv = [headers.join(","), ...lineas].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `saldo-facturable-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="ar-root">
      {/* Encabezado */}
      <div className="ar-header">
        <div>
          <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Saldo facturable</p>
          <p className="ar-header-meta">
            Piezas con respaldo de factura por artículo. Independiente del stock físico.
          </p>
        </div>
        <div className="ar-header-actions">
          <button className="ar-btn-action" onClick={() => setDeptoModal(true)}>
            <Building2 size={15} /> Departamentos
          </button>
          <button className="ar-btn-action" onClick={exportarCSV} disabled={filas.length === 0}>
            <Download size={15} /> Exportar
          </button>
          <button className="ar-btn-action" onClick={() => { cargarFacturable(); handleBuscar() }} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refrescar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard icon={<FileCheck2 size={18} />} label="Artículos con saldo" valor={kpis.conSaldo} />
        <KpiCard icon={<Wallet size={18} />} label="Piezas facturables" valor={kpis.sumSaldo.toLocaleString("es-MX")} />
        <KpiCard icon={<Building2 size={18} />} label="Deptos facturables" valor={kpis.deptosFacturables} />
        <KpiCard icon={<TriangleAlert size={18} />} label="Sobregirados" valor={kpis.sobregirados}
          alerta={kpis.sobregirados > 0} />
      </div>

      {/* Búsqueda + filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Buscar por clave o descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBuscar() }}
          />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          disabled={taxLoading}
        >
          <option value="">Todos los departamentos</option>
          {taxonomy.depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}{deptos[d.nombre] ? " ✓" : ""}
            </option>
          ))}
        </select>
        <button className="bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700" onClick={handleBuscar}>
          <Search size={15} className="inline -mt-0.5 mr-1" /> Buscar
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none ml-1">
          <input type="checkbox" checked={soloConSaldo} onChange={(e) => setSoloConSaldo(e.target.checked)} />
          Solo con saldo
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {!hasBuscado ? (
          <Vacio texto="Busca un artículo o filtra por departamento para ver su saldo facturable." />
        ) : loading ? (
          <Vacio texto="Cargando…" />
        ) : filas.length === 0 ? (
          <Vacio texto="Ningún artículo coincide. Si esperabas saldo, revisa que la compra se haya registrado 'Con factura'." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-semibold px-4 py-2.5">Artículo</th>
                  <th className="text-left font-semibold px-3 py-2.5">Depto</th>
                  <th className="text-left font-semibold px-3 py-2.5">Clave SAT</th>
                  <th className="text-right font-semibold px-3 py-2.5">Stock físico</th>
                  <th className="text-right font-semibold px-3 py-2.5">Saldo facturable</th>
                  <th className="text-left font-semibold px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{f.descripcion}</div>
                      <div className="text-xs text-gray-400 font-mono">{f.clave}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {f.departamento || "—"}{f.deptoFacturable && <span className="text-orange-600" title="Depto facturable"> ✓</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{f.claveSat || <span className="text-red-500">falta</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{f.existencia}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${f.saldo < 0 ? "text-red-600" : f.saldo > 0 ? "text-gray-900" : "text-gray-400"}`}>
                      {f.saldo}
                    </td>
                    <td className="px-3 py-2.5"><Semaforo color={f.color} texto={f.estado} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        className="text-gray-400 hover:text-orange-600 disabled:opacity-30 disabled:pointer-events-none"
                        title={f.tieneClave ? "Ajustar saldo facturable" : "Asigna clave SAT primero"}
                        disabled={!f.tieneClave}
                        onClick={() => setAjuste(f)}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ajuste && (
        <AjusteSaldoModal articulo={ajuste} onClose={() => setAjuste(null)} onGuardar={guardarAjuste} />
      )}
      {deptoModal && (
        <DeptosModal taxonomy={taxonomy} deptos={deptos} onToggle={toggleDepto} onClose={() => setDeptoModal(false)} />
      )}
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, valor, alerta }) {
  return (
    <div className={`bg-white border rounded-lg px-4 py-3 flex items-center gap-3 ${alerta ? "border-red-200" : "border-gray-200"}`}>
      <span className={alerta ? "text-red-500" : "text-orange-600"}>{icon}</span>
      <div>
        <div className={`text-lg font-bold tabular-nums ${alerta ? "text-red-600" : "text-gray-900"}`}>{valor}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}

function Semaforo({ color, texto }) {
  const map = {
    verde:    "bg-green-100 text-green-700",
    amarillo: "bg-amber-100 text-amber-700",
    rojo:     "bg-red-100 text-red-700",
    gris:     "bg-gray-100 text-gray-500",
  }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[color] ?? map.gris}`}>{texto}</span>
}

function Vacio({ texto }) {
  return <div className="py-14 text-center text-gray-400 text-sm px-6">{texto}</div>
}

/** Modal de ajuste manual del saldo de un artículo. */
function AjusteSaldoModal({ articulo, onClose, onGuardar }) {
  const [valor, setValor] = useState(String(articulo.saldo ?? 0))
  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  const num = Math.trunc(Number(valor))
  const valido = Number.isFinite(num) && motivo.trim().length >= 3

  async function submit() {
    if (!valido) return
    setGuardando(true)
    await onGuardar(num, motivo.trim())
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">Ajustar saldo facturable</h2>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="text-sm text-gray-600 mb-1 font-medium">{articulo.descripcion}</div>
        <div className="text-xs text-gray-400 font-mono mb-4">{articulo.clave} · SAT {articulo.claveSat}</div>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nuevo saldo (piezas con respaldo)</label>
        <input
          type="number" step="1" autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 mb-1"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <p className="text-xs text-gray-400 mb-4">Stock físico actual: {articulo.existencia} pieza(s). El saldo facturable es independiente.</p>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motivo del ajuste</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 mb-4"
          placeholder="Ej. Conteo físico de facturas de compra"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />

        <div className="flex justify-end gap-2">
          <button className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50" onClick={onClose}>Cancelar</button>
          <button
            className="bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-40 disabled:pointer-events-none"
            disabled={!valido || guardando}
            onClick={submit}
          >
            {guardando ? "Guardando…" : "Guardar ajuste"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Modal para marcar qué departamentos son facturables. */
function DeptosModal({ taxonomy, deptos, onToggle, onClose }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Building2 size={18} className="text-orange-600" /> Departamentos facturables</h2>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Marca los departamentos que SÍ pueden facturarse. Solo los artículos de un depto facturable (con clave SAT y saldo) entran a las facturas y a la global del día.
        </p>
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
          {taxonomy.depts.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">No hay departamentos en la taxonomía.</div>
          ) : taxonomy.depts.map((d) => {
            const on = !!deptos[d.nombre]
            return (
              <button
                key={d.id}
                onClick={() => onToggle(d.nombre, !on)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">{d.nombre}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${on ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-400"}`}>
                  {on ? <><Check size={13} /> Facturable</> : "No facturable"}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
