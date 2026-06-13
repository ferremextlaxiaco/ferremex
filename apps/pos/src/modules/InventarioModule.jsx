import { useState, useRef, useMemo, useEffect } from "react"
import { Trash2 } from "lucide-react"
import { listarCatalogos, ajustarInventario } from "../lib/client"
import { useToasts } from "../hooks/useToasts"
import { formatMXN } from "../lib/format"
import { DataTable } from "../components/DataTable"
import { InventarioToolbar } from "../components/InventarioToolbar"
import SelectorArticulosPopup from "../components/SelectorArticulosPopup"

/**
 * Ajuste masivo de inventario por SKU — módulo React (reemplaza el viejo iframe).
 *
 * Dueño del estado. Los artículos se cargan vía el SELECTOR CRISTAL
 * (SelectorArticulosPopup, multiSelect): se abre al enfocar la barra, busca por
 * texto o taxonomía, se marcan varios y se agregan en lote. La pre-selección la
 * posee este módulo, así persiste al cerrar/reabrir el popup mientras el módulo
 * esté montado.
 * Tabla rica (TanStack/DataTable): Localización, Stock, Nueva cantidad editable,
 * Diferencia (color), Monto $ (diferencia × precioCompra). Barra de resumen abajo.
 * Confirma vía ajustarInventario() con advertencia de cantidades negativas.
 *
 * Cumple el Contrato de Conexión: datos por client.ts, taxonomía por
 * listarCatalogos, feedback con useToasts, formatMXN.
 */
export function InventarioModule() {
  const { toasts, push } = useToasts()
  // Filas de ajuste: { clave, descripcion, localizacion, existencia, precioCompra, nueva }
  const [filas, setFilas] = useState([])
  const [filtroTabla, setFiltroTabla] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // Selector cristal
  const [buscadorAbierto, setBuscadorAbierto] = useState(false)
  const [taxonomia, setTaxonomia] = useState({ depts: [], cats: [], marcas: [] })
  const [taxLoading, setTaxLoading] = useState(true)
  // Pre-selección del popup (persiste mientras el módulo esté montado):
  //   selSkus = Set de SKUs marcados; selArts = Map SKU→artículo (para agregar sin re-buscar)
  const [selSkus, setSelSkus] = useState(() => new Set())
  const selArts = useRef(new Map())

  // Cargar taxonomía una vez (única fuente: listarCatalogos).
  useEffect(() => {
    let on = true
    listarCatalogos()
      .then((d) => { if (on) setTaxonomia(d) })
      .catch(() => { /* sin taxonomía los filtros del popup quedan vacíos */ })
      .finally(() => { if (on) setTaxLoading(false) })
    return () => { on = false }
  }, [])

  // Escape cierra lo que esté abierto: primero el modal de confirmación, luego
  // el popup del buscador (igual que su clic-fuera).
  useEffect(() => {
    if (!confirmando && !buscadorAbierto) return
    const fn = (e) => {
      if (e.key !== "Escape") return
      if (confirmando) setConfirmando(false)
      else setBuscadorAbierto(false)
    }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [confirmando, buscadorAbierto])

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

  function setNueva(clave, valor) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, nueva: valor } : f)))
  }
  function quitar(clave) {
    setFilas((prev) => prev.filter((f) => f.clave !== clave))
  }
  function limpiarTodo() {
    setFilas([]); setFiltroTabla("")
    setSelSkus(new Set()); selArts.current.clear()
    setBuscadorAbierto(false)
  }

  // ── Selector cristal (multiSelect) ────────────────────────────────────────────
  // SKUs que ya están en la lista de ajuste (para deshabilitarlos en el popup).
  const skusEnLista = useMemo(() => new Set(filas.map((f) => f.clave)), [filas])

  /** Marca/desmarca un artículo en la pre-selección. */
  function toggleSeleccion(art) {
    const sku = art.clave || art.claveAlterna
    if (!sku) { push("El artículo no tiene clave/SKU", "error"); return }
    // El mapa de artículos (ref) se actualiza FUERA del updater de estado: el
    // updater debe ser puro (StrictMode lo ejecuta 2× en dev y un side-effect
    // ahí desincronizaría selArts del Set → "nada nuevo que agregar").
    const yaEstaba = selSkus.has(sku)
    if (yaEstaba) selArts.current.delete(sku)
    else selArts.current.set(sku, art)
    setSelSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  /** Vuelca toda la pre-selección a la lista de ajuste, sin duplicar. */
  function agregarSeleccionados() {
    const yaEnLista = new Set(filas.map((f) => f.clave))
    const nuevas = []
    for (const sku of selSkus) {
      if (yaEnLista.has(sku)) continue
      const art = selArts.current.get(sku)
      if (art) nuevas.push(filaDeArticulo(art))
    }
    if (nuevas.length > 0) setFilas((prev) => [...prev, ...nuevas])
    setSelSkus(new Set()); selArts.current.clear()
    setBuscadorAbierto(false)
    push(nuevas.length > 0 ? `${nuevas.length} artículo(s) agregados al ajuste` : "Nada nuevo que agregar",
      nuevas.length > 0 ? "success" : "info")
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

  return (
    <div className="flex flex-col h-full p-5 gap-4 box-border bg-gray-50">
      {/* Toolbar (la barra abre el selector cristal) + popup anclado debajo.
          Cuando el popup está abierto, este contenedor se eleva (z-[520]) por
          encima del overlay (z-500) para que sus clics (incluido "Agregar
          seleccionados") NO los intercepte el backdrop. */}
      <div className={`relative ${buscadorAbierto ? "z-[520]" : ""}`}>
        <InventarioToolbar
          numCambios={conCambio.length}
          hayCambios={hayCambios}
          guardando={guardando}
          buscadorAbierto={buscadorAbierto}
          onAbrirBuscador={() => setBuscadorAbierto(true)}
          onConfirmar={pedirConfirmar}
          onLimpiar={limpiarTodo}
        />

        {/* Backdrop con tinte sutil: da contraste para que el cristal luzca y
            cierra el popup al hacer clic fuera (la selección se conserva). */}
        {buscadorAbierto && (
          <div className="pk-sel-overlay" onClick={() => setBuscadorAbierto(false)} />
        )}

        {/* Selector cristal (multiSelect), anclado bajo la barra */}
        <SelectorArticulosPopup
          open={buscadorAbierto}
          anchorMode="inline"
          onClose={() => setBuscadorAbierto(false)}
          yaAgregados={skusEnLista}
          taxonomy={taxonomia}
          taxLoading={taxLoading}
          pushToast={push}
          titulo="Agregar artículos al ajuste"
          agregarTitulo="Marcar para agregar"
          multiSelect
          seleccionados={selSkus}
          onToggle={toggleSeleccion}
          onConfirmarSeleccion={agregarSeleccionados}
        />
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
