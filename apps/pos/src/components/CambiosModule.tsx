import { useEffect, useState } from "react"
import { ArrowRightLeft, X, Ban, Loader2, AlertCircle, Printer } from "lucide-react"
import { listarCambiosAPI, obtenerCambioAPI, cancelarCambioAPI, type Cambio } from "../lib/client"
import { formatMXN as fmt } from "../lib/format"
import { usePOS } from "../lib/pos-store"
import { ComprobanteCambio } from "./ComprobanteCambio"

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

function CambioPreview({ cambio, onClose, onCancelado }: { cambio: Cambio; onClose: () => void; onCancelado: (c: Cambio) => void }) {
  const { state } = usePOS()
  const [motivo, setMotivo] = useState("")
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)

  async function confirmarCancelacion() {
    if (!motivo.trim()) return
    setCancelando(true)
    setError(null)
    try {
      const actualizado = await cancelarCambioAPI(cambio.id, motivo.trim())
      onCancelado(actualizado)
      setConfirmando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar el cambio")
    } finally {
      setCancelando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border-t-4 border-orange-500 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 font-mono">
            <ArrowRightLeft size={18} className="text-orange-600" /> {cambio.folio_cambio}
          </h2>
          <button onClick={onClose} className="w-8 h-8 p-0 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="text-xs text-gray-500 mb-4 space-y-1">
          <div>Venta original: <span className="font-mono text-gray-700">{cambio.venta_origen_folio}</span></div>
          <div>{fmtFecha(cambio.fecha)} · {cambio.cajero}</div>
          <div>Cliente: {cambio.cliente_nombre || "Público en general"}</div>
          {cambio.estado === "cancelado" && (
            <div className="text-red-600 font-medium">Cancelado{cambio.motivo_cancelacion ? `: ${cambio.motivo_cancelacion}` : ""}</div>
          )}
        </div>

        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Devuelto</div>
          <div className="space-y-1">
            {(cambio.lineasDevueltas ?? []).map((l) => (
              <div key={l.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{l.cantidad}× {l.descripcion}</span>
                <span className="text-gray-500">{fmt(l.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Nuevo</div>
          {(cambio.lineasNuevas ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin artículo nuevo — solo devolución.</p>
          ) : (
            <div className="space-y-1">
              {cambio.lineasNuevas.map((l) => (
                <div key={l.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{l.cantidad}× {l.descripcion}</span>
                  <span className="text-gray-500">{fmt(l.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-3 space-y-1 text-sm mb-4">
          <div className="flex justify-between"><span className="text-gray-500">Valor devuelto</span><span>{fmt(cambio.valor_devuelto)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Valor nuevo</span><span>{fmt(cambio.valor_nuevo)}</span></div>
          {cambio.diferencia_cobrada > 0 && (
            <div className="flex justify-between font-semibold text-orange-600">
              <span>Diferencia cobrada {cambio.venta_diferencia_folio ? `(${cambio.venta_diferencia_folio})` : ""}</span>
              <span>{fmt(cambio.diferencia_cobrada)}</span>
            </div>
          )}
          {cambio.saldo_generado > 0 && (
            <div className="flex justify-between font-semibold text-green-600">
              <span>Saldo a favor generado</span>
              <span>{fmt(cambio.saldo_generado)}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <button
          onClick={() => setImprimiendo(true)}
          className="w-full mb-3 px-4 py-2 text-sm font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 inline-flex items-center justify-center gap-1.5"
        >
          <Printer size={14} /> Imprimir comprobante
        </button>

        {imprimiendo && (
          <ComprobanteCambio
            cambio={cambio}
            negocio={{
              nombre: state.ticketConfig?.encabezado?.nombre ?? "FERREMEX",
              direccion: state.ticketConfig?.encabezado?.direccion ?? "",
              telefono: state.ticketConfig?.encabezado?.telefono ?? "",
              rfc: state.ticketConfig?.encabezado?.rfc ?? "",
            }}
            titulo={state.ticketConfig?.formatos?.cambio_devolucion?.titulo}
            onCerrar={() => setImprimiendo(false)}
          />
        )}

        {cambio.estado === "completado" && (
          confirmando ? (
            <div className="space-y-2">
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo de la cancelación…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmando(false)} className="px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
                <button
                  onClick={confirmarCancelacion}
                  disabled={!motivo.trim() || cancelando}
                  className="px-3 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {cancelando ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                  Confirmar cancelación
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmando(true)}
              className="w-full px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 inline-flex items-center justify-center gap-1.5"
            >
              <Ban size={14} /> Cancelar este cambio
            </button>
          )
        )}
      </div>
    </div>
  )
}

export function CambiosModule() {
  const [cambios, setCambios] = useState<Cambio[]>([]);
  const [loading, setLoading] = useState(true)
  const [seleccionado, setSeleccionado] = useState<Cambio | null>(null)
  // El listado (GET /caja/cambios) NO trae lineasDevueltas/lineasNuevas — solo
  // el detalle (GET /caja/cambios/:id) las incluye. Se piden al abrir.
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null)

  function cargar() {
    setLoading(true)
    listarCambiosAPI()
      .then(setCambios)
      .catch(() => setCambios([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  function abrirDetalle(id: string) {
    setCargandoDetalle(id)
    obtenerCambioAPI(id)
      .then(setSeleccionado)
      .catch(() => { /* deja la tabla sin abrir; el cajero puede reintentar */ })
      .finally(() => setCargandoDetalle(null))
  }

  function onCancelado(actualizado: Cambio) {
    setCambios((prev) => prev.map((c) => (c.id === actualizado.id ? actualizado : c)))
    setSeleccionado(actualizado)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cambios de artículo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Devoluciones con cambio de mercancía. {cambios.length} registrado{cambios.length !== 1 ? "s" : ""}.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
      ) : cambios.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No hay cambios registrados. Se inician desde el detalle de una venta en "Consulta de ventas".</p>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-base">
            <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-5 py-3">Folio</th>
                <th className="text-left px-5 py-3">Fecha</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-right px-5 py-3">Saldo/Diferencia</th>
                <th className="text-left px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cambios.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => abrirDetalle(c.id)}
                  className={`cursor-pointer hover:bg-gray-50 ${cargandoDetalle === c.id ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3 font-mono text-sm">{c.folio_cambio}</td>
                  <td className="px-5 py-3 text-gray-500 text-sm">{fmtFecha(c.fecha)}</td>
                  <td className="px-5 py-3 flex items-center gap-1.5">
                    {c.cliente_nombre || "Público en general"}
                    {cargandoDetalle === c.id && <Loader2 size={14} className="animate-spin text-gray-400" />}
                  </td>
                  <td className={`px-5 py-3 text-right font-medium ${c.diferencia > 0 ? "text-orange-600" : c.diferencia < 0 ? "text-green-600" : "text-gray-500"}`}>
                    {c.diferencia === 0 ? "—" : (
                      <>
                        {fmt(Math.abs(c.diferencia))}
                        <span className="block text-xs font-normal text-gray-400">
                          {c.diferencia > 0 ? "Diferencia" : "Saldo a favor"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${c.estado === "cancelado" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {c.estado === "cancelado" ? "Cancelado" : "Completado"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seleccionado && (
        <CambioPreview
          cambio={seleccionado}
          onClose={() => setSeleccionado(null)}
          onCancelado={onCancelado}
        />
      )}
    </div>
  )
}
