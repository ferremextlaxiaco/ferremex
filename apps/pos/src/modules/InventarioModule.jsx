import { useState, useRef, useMemo } from "react"
import { Trash2 } from "lucide-react"
import { listarArticulos, listarArticulosDeCatalogo, ajustarInventario } from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import { formatMXN } from "../lib/format"
import { DataTable } from "../components/DataTable"
import { InventarioToolbar } from "../components/InventarioToolbar"

/**
 * Ajuste masivo de inventario por SKU — módulo React (reemplaza el viejo iframe).
 *
 * Dueño del estado. Dos vías para cargar artículos: buscador (uno por uno, con
 * auto-agregar en match exacto) o filtros de taxonomía (por lote/categoría).
 * Tabla rica (TanStack/DataTable): Localización, Stock, Nueva cantidad editable,
 * Diferencia (color), Monto $ (diferencia × precioCompra). Barra de resumen abajo.
 * Confirma vía ajustarInventario() con advertencia de cantidades negativas.
 *
 * Cumple el Contrato de Conexión: datos por client.ts, taxonomía por
 * listarCatalogos (dentro del toolbar), feedback con useToasts, formatMXN.
 */
export function InventarioModule() {
  const { toasts, push } = useToasts()
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [cargandoLote, setCargandoLote] = useState(false)
  const [mostrarResultados, setMostrarResultados] = useState(false)
  const [terminoBuscado, setTerminoBuscado] = useState("")
  // Filas de ajuste: { clave, descripcion, localizacion, existencia, precioCompra, nueva }
  const [filas, setFilas] = useState([])
  const [filtroTabla, setFiltroTabla] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // ── Helpers de filas ────────────────────────────────────────────────────────
  function filaDeArticulo(a) {
    return {
      clave: a.clave,
      descripcion: a.descripcion,
      localizacion: a.localizacion || "",
      existencia: a.existencia ?? 0,
      precioCompra: a.precioCompra ?? 0,
      nueva: String(a.existencia ?? 0),
    }
  }

  function agregar(art) {
    if (!art.clave) { push("El artículo no tiene clave/SKU", "error"); return }
    let yaEstaba = false
    setFilas((prev) => {
      if (prev.some((f) => f.clave === art.clave)) { yaEstaba = true; return prev }
      return [...prev, filaDeArticulo(art)]
    })
    if (yaEstaba) push(`${art.clave} ya está en el ajuste`, "info")
    cerrarResultados()
  }

  /** Agrega varios a la vez (carga por lote), sin duplicar. */
  function agregarVarios(arts) {
    let agregados = 0
    setFilas((prev) => {
      const claves = new Set(prev.map((f) => f.clave))
      const nuevas = arts
        .filter((a) => a.clave && !claves.has(a.clave))
        .map(filaDeArticulo)
      agregados = nuevas.length
      return [...prev, ...nuevas]
    })
    return agregados
  }

  function setNueva(clave, valor) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, nueva: valor } : f)))
  }
  function quitar(clave) {
    setFilas((prev) => prev.filter((f) => f.clave !== clave))
  }
  function limpiarTodo() {
    setFilas([]); setFiltroTabla(""); cerrarResultados()
  }
  function cerrarResultados() {
    setResultados([]); setMostrarResultados(false)
  }

  // ── Búsqueda (uno por uno) ────────────────────────────────────────────────────
  async function onBuscar(term) {
    setBuscando(true)
    setTerminoBuscado(term)
    try {
      const arts = await listarArticulos(term)
      // Auto-agregar si hay UN match exacto por clave (flujo de escáner).
      const exacto = arts.find((a) => a.clave?.toLowerCase() === term.toLowerCase())
      if (exacto && arts.length === 1) { agregar(exacto); return }
      setResultados(arts.slice(0, 50))
      setMostrarResultados(true)
    } catch (e) {
      push(`Error al buscar: ${e instanceof Error ? e.message : "desconocido"}`, "error")
    } finally {
      setBuscando(false)
    }
  }

  // ── Carga por lote (taxonomía) ────────────────────────────────────────────────
  async function onCargarLote({ departamento, categoria, marca }) {
    setCargandoLote(true)
    try {
      let arts = await listarArticulosDeCatalogo(departamento, categoria)
      if (marca) arts = arts.filter((a) => a.marca === marca)
      if (arts.length === 0) { push("No se encontraron artículos en esa categoría", "info"); return }
      const n = agregarVarios(arts)
      push(n > 0 ? `${n} artículo(s) agregados al ajuste` : "Todos ya estaban en el ajuste",
        n > 0 ? "success" : "info")
    } catch (e) {
      push(`Error al cargar la categoría: ${e instanceof Error ? e.message : "desconocido"}`, "error")
    } finally {
      setCargandoLote(false)
    }
  }

  // ── Derivados ────────────────────────────────────────────────────────────────
  const filasValidas = filas.filter((f) => f.nueva !== "" && !isNaN(Number(f.nueva)))
  const conCambio = filasValidas.filter((f) => Number(f.nueva) !== f.existencia)
  const hayNegativos = filasValidas.some((f) => Number(f.nueva) < 0)
  const hayCambios = conCambio.length > 0

  const resumen = useMemo(() => {
    let incremento = 0, decremento = 0, montoNeto = 0
    for (const f of conCambio) {
      const dif = Number(f.nueva) - f.existencia
      if (dif > 0) incremento += dif
      else decremento += -dif
      montoNeto += dif * (f.precioCompra || 0)
    }
    return { incremento, decremento, montoNeto }
  }, [conCambio])

  // ── Columnas de la tabla (DataTable / TanStack) ───────────────────────────────
  const columnas = useMemo(() => [
    {
      accessorKey: "clave",
      header: "Clave",
      cell: ({ getValue }) => <span className="font-mono text-xs text-gray-500">{getValue()}</span>,
    },
    { accessorKey: "descripcion", header: "Descripción" },
    {
      accessorKey: "localizacion",
      header: "Localización",
      cell: ({ getValue }) => <span className="text-gray-600">{getValue() || "—"}</span>,
    },
    {
      accessorKey: "existencia",
      header: "Stock actual",
      cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
    },
    {
      accessorKey: "nueva",
      header: "Nueva cantidad",
      sortingFn: (a, b) => Number(a.original.nueva) - Number(b.original.nueva),
      cell: ({ row }) => {
        const f = row.original
        const n = Number(f.nueva)
        const invalido = f.nueva === "" || isNaN(n)
        const negativo = !invalido && n < 0
        return (
          <input
            type="number"
            value={f.nueva}
            onChange={(e) => setNueva(f.clave, e.target.value)}
            className={`w-24 text-right font-bold rounded px-2 py-1.5 text-sm border focus:outline-none focus:ring-1 focus:ring-orange-400
              ${negativo || invalido ? "border-red-500" : "border-gray-300"}`}
          />
        )
      },
    },
    {
      id: "diferencia",
      header: "Diferencia",
      accessorFn: (f) => Number(f.nueva) - f.existencia,
      cell: ({ row }) => {
        const f = row.original
        if (f.nueva === "" || isNaN(Number(f.nueva))) return <span className="text-gray-300">—</span>
        const dif = Number(f.nueva) - f.existencia
        if (dif === 0) return <span className="text-gray-400 tabular-nums">0</span>
        return (
          <span className={`tabular-nums font-medium ${dif > 0 ? "text-green-600" : "text-red-600"}`}>
            {dif > 0 ? `+${dif}` : dif}
          </span>
        )
      },
    },
    {
      id: "monto",
      header: "Monto $",
      accessorFn: (f) => (Number(f.nueva) - f.existencia) * (f.precioCompra || 0),
      cell: ({ row }) => {
        const f = row.original
        if (f.nueva === "" || isNaN(Number(f.nueva))) return <span className="text-gray-300">—</span>
        const monto = (Number(f.nueva) - f.existencia) * (f.precioCompra || 0)
        if (monto === 0) return <span className="text-gray-400">—</span>
        return (
          <span className={`tabular-nums ${monto > 0 ? "text-green-600" : "text-red-600"}`}>
            {monto > 0 ? "+" : "−"}{formatMXN(Math.abs(monto))}
          </span>
        )
      },
    },
    {
      id: "acciones",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <button onClick={() => quitar(row.original.clave)} title="Quitar"
          className="text-gray-400 hover:text-red-600 p-1">
          <Trash2 size={16} />
        </button>
      ),
    },
  ], [])

  // ── Confirmar ────────────────────────────────────────────────────────────────
  function pedirConfirmar() {
    if (!hayCambios) { push("No hay cambios que aplicar", "error"); return }
    setConfirmando(true)
  }
  async function confirmar() {
    setConfirmando(false)
    setGuardando(true)
    try {
      const ajustes = conCambio.map((f) => ({ sku: f.clave, nueva_cantidad: Number(f.nueva) }))
      await ajustarInventario(ajustes)
      push(`Inventario ajustado: ${ajustes.length} artículo(s)`, "success")
      setFilas([])
    } catch (e) {
      push(`Error al guardar: ${e instanceof Error ? e.message : "desconocido"}`, "error")
    } finally {
      setGuardando(false)
    }
  }

  const stockBadge = (n) => {
    if (n < 0) return "bg-red-100 text-red-700"
    if (n === 0) return "bg-gray-100 text-gray-500"
    return "bg-green-100 text-green-700"
  }

  return (
    <div className="flex flex-col h-full p-5 gap-4 box-border bg-gray-50">
      {/* Toolbar (buscador + filtros taxonomía + confirmar) */}
      <div className="relative">
        <InventarioToolbar
          buscando={buscando}
          cargandoLote={cargandoLote}
          numCambios={conCambio.length}
          hayCambios={hayCambios}
          guardando={guardando}
          onBuscar={onBuscar}
          onCargarLote={onCargarLote}
          onConfirmar={pedirConfirmar}
          onLimpiar={limpiarTodo}
        />

        {/* Popup de resultados de búsqueda */}
        {mostrarResultados && (
          <div className="absolute top-[calc(100%+4px)] left-0 z-20 w-[28rem] max-w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {buscando ? "Buscando…" : `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}`}
              </span>
              <button onClick={cerrarResultados} className="text-gray-400 hover:text-gray-600 p-0.5" title="Cerrar">✕</button>
            </div>
            <div className="overflow-y-auto">
              {!buscando && resultados.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">Sin resultados para "{terminoBuscado}"</p>
              ) : (
                resultados.map((a) => {
                  const yaEsta = filas.some((f) => f.clave === a.clave)
                  const stock = a.existencia ?? 0
                  return (
                    <button key={a.id} onClick={() => agregar(a)} disabled={yaEsta}
                      className={`flex items-center gap-2.5 w-full px-3 py-2 border-b border-gray-50 text-left hover:bg-orange-50 ${yaEsta ? "opacity-40 pointer-events-none" : ""}`}>
                      <span className="font-mono text-xs text-gray-500 w-20 flex-shrink-0">{a.clave || "—"}</span>
                      <span className="flex-1 text-sm truncate">{a.descripcion}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${stockBadge(stock)}`}>
                        {yaEsta ? "Agregado" : stock}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filtro de la tabla de ajuste */}
      {filas.length > 0 && (
        <input
          type="text"
          placeholder="Filtrar la lista de ajuste…"
          value={filtroTabla}
          onChange={(e) => setFiltroTabla(e.target.value)}
          className="max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
        />
      )}

      {/* Tabla de ajuste */}
      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-white">
        {filas.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-sm font-medium text-gray-500">Ningún artículo seleccionado</p>
            <p className="text-sm mt-1">Usa el buscador o los filtros de categoría para agregar artículos al ajuste.</p>
          </div>
        ) : (
          <DataTable
            columns={columnas}
            data={filas}
            globalFilter={filtroTabla}
            emptyMessage="Ningún artículo coincide con el filtro."
            rowClassName={(f) => {
              const n = Number(f.nueva)
              const cambia = f.nueva !== "" && !isNaN(n) && n !== f.existencia
              return cambia ? "bg-orange-50/60" : ""
            }}
          />
        )}
      </div>

      {/* Barra de resumen */}
      {filas.length > 0 && (
        <div className="flex items-center gap-6 flex-wrap bg-white border border-gray-200 rounded-lg px-5 py-3 text-sm">
          <Resumen label="Artículos" valor={filas.length} />
          <Resumen label="Con cambio" valor={conCambio.length} />
          <Resumen label="Incremento" valor={`+${resumen.incremento}`} clase="text-green-600" />
          <Resumen label="Decremento" valor={`−${resumen.decremento}`} clase="text-red-600" />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Monto neto</span>
            <span className={`text-base font-bold tabular-nums ${resumen.montoNeto > 0 ? "text-green-600" : resumen.montoNeto < 0 ? "text-red-600" : "text-gray-700"}`}>
              {resumen.montoNeto > 0 ? "+" : resumen.montoNeto < 0 ? "−" : ""}{formatMXN(Math.abs(resumen.montoNeto))}
            </span>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmando(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Confirmar ajuste de inventario</h3>
            <p className="text-sm text-gray-600 mb-2">
              Se actualizará el stock de <strong>{conCambio.length}</strong> artículo(s).
              Monto neto: <strong>{resumen.montoNeto >= 0 ? "+" : "−"}{formatMXN(Math.abs(resumen.montoNeto))}</strong>.
            </p>
            {hayNegativos && (
              <p className="text-sm text-red-600 font-semibold mb-2 flex items-center gap-1.5">
                ⚠️ Hay cantidades negativas. ¿Seguro que deseas continuar?
              </p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setConfirmando(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmar}
                className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[100]">
        {toasts.map((t) => (
          <div key={t.id}
            className={`px-4 py-2.5 rounded-lg text-white text-sm font-medium shadow-lg
              ${t.type === "error" ? "bg-red-600" : t.type === "success" ? "bg-green-600" : "bg-gray-700"}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

function Resumen({ label, valor, clase = "text-gray-900" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-base font-bold tabular-nums ${clase}`}>{valor}</span>
    </div>
  )
}
