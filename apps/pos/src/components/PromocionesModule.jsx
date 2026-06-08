import { useState, useEffect, useCallback, useMemo } from "react"
import { Tag, Plus, Pencil, Trash2, RefreshCw, Search, Power } from "lucide-react"
import {
  listarPromociones, crearPromocion, actualizarPromocion, eliminarPromocion, listarCatalogos,
} from "../lib/client"
import { loadClientes, loadGrupos } from "../lib/clientes"
import { promoVigente } from "../lib/promociones"
import { usePOS } from "../lib/pos-store"
import { useToasts } from "../hooks/useToasts"
import PromocionDrawer from "./PromocionDrawer"
import ConfirmDialog from "./ConfirmDialog"

const ETIQUETAS_TIPO = {
  porcentaje: (p) => `−${p.porcentaje}%`,
  nivel_precio: (p) => `Precio ${p.nivel_precio}`,
  nxm: (p) => `${p.nxm_lleva}x${p.nxm_paga}`,
  volumen: (p) => `${p.volumen_desc}% al llevar ${p.volumen_min}+`,
  personalizado: (p) => `Por artículo (${Object.keys(p.descuentos_articulo || {}).length})`,
}

const ETIQUETAS_SEGMENTO = {
  todos: "Todos",
  cliente: "Cliente",
  grupo: "Grupo",
}

/** Estado derivado de una promo para el badge: Activa / Programada / Vencida / Inactiva. */
function estadoPromo(p) {
  if (!p.activa) return { txt: "Inactiva", cls: "bg-gray-100 text-gray-500" }
  const hoy = new Date().toISOString().slice(0, 10)
  if (p.inicio && hoy < p.inicio) return { txt: "Programada", cls: "bg-blue-50 text-blue-600" }
  if (p.fin && hoy > p.fin) return { txt: "Vencida", cls: "bg-red-50 text-red-600" }
  return promoVigente(p, hoy)
    ? { txt: "Activa", cls: "bg-green-50 text-green-700" }
    : { txt: "Inactiva", cls: "bg-gray-100 text-gray-500" }
}

/**
 * Módulo admin de Promociones. Dueño del estado + datos (Contrato de Conexión):
 * datos vía client.ts (listarPromociones/crear/actualizar/eliminar), taxonomía
 * vía listarCatalogos, clientes/grupos vía lib/clientes, feedback vía useToasts.
 * Tras cada mutación refresca el catálogo de promos del carrito (refrescarPromos).
 *
 * Prop opcional `articuloInicial` ({ sku, descripcion }): si viene, abre el drawer
 * en "add" con ese SKU preseleccionado (acceso desde la ficha del artículo).
 */
export default function PromocionesModule({ articuloInicial = null, onCerrarArticulo }) {
  const { toasts, push: pushToast } = useToasts()
  const { refrescarPromos } = usePOS()

  const [promos, setPromos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [busqueda, setBusqueda] = useState("")

  const [taxonomy, setTaxonomy] = useState({ depts: [], cats: [], marcas: [] })
  const [taxLoading, setTaxLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [grupos, setGrupos] = useState([])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState("add")
  const [promoEdit, setPromoEdit] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const [borrarId, setBorrarId] = useState(null)

  // `vivo` (opcional) corta los setState si el componente se desmontó antes de
  // que resuelva la promesa (StrictMode monta/desmonta/monta en dev).
  const cargar = useCallback(async (silencioso, vivo = { current: true }) => {
    if (silencioso) setRefrescando(true); else setCargando(true)
    try {
      const data = await listarPromociones()
      if (vivo.current) setPromos(data)
    } catch {
      if (vivo.current) pushToast("No se pudieron cargar las promociones", "error")
    } finally {
      if (vivo.current) { setCargando(false); setRefrescando(false) }
    }
  }, [pushToast])

  // Carga inicial: promos + taxonomía + clientes + grupos (para el drawer).
  useEffect(() => {
    const vivo = { current: true }
    cargar(false, vivo)
    listarCatalogos().then((d) => { if (vivo.current) setTaxonomy(d) }).catch(() => {}).finally(() => { if (vivo.current) setTaxLoading(false) })
    loadClientes().then((c) => { if (vivo.current) setClientes(c.map((x) => ({ id: x.id, nombre: x.nombre }))) }).catch(() => {})
    loadGrupos().then((g) => { if (vivo.current) setGrupos(g) }).catch(() => {})
    return () => { vivo.current = false }
  }, [cargar])

  // Acceso desde la ficha del artículo: abrir el drawer con ese SKU precargado.
  useEffect(() => {
    if (articuloInicial?.sku) {
      setDrawerMode("add")
      setPromoEdit({
        nombre: articuloInicial.descripcion ? `Promo ${articuloInicial.descripcion}`.slice(0, 60) : "",
        skus_requeridos: [articuloInicial.sku],
      })
      setDrawerOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloInicial?.sku])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return promos
    return promos.filter((p) =>
      p.nombre.toLowerCase().includes(q) ||
      p.skus_requeridos.some((s) => s.toLowerCase().includes(q)) ||
      p.skus_beneficiados.some((s) => s.toLowerCase().includes(q))
    )
  }, [promos, busqueda])

  function abrirNueva() {
    setDrawerMode("add"); setPromoEdit(null); setDrawerOpen(true)
  }
  function abrirEditar(p) {
    setDrawerMode("edit"); setPromoEdit(p); setDrawerOpen(true)
  }
  function cerrarDrawer() {
    setDrawerOpen(false); setPromoEdit(null)
    if (articuloInicial) onCerrarArticulo?.()
  }

  async function handleGuardar(input) {
    setGuardando(true)
    try {
      if (drawerMode === "edit" && promoEdit?.id) {
        await actualizarPromocion(promoEdit.id, input)
        pushToast("Promoción actualizada", "success")
      } else {
        await crearPromocion(input)
        pushToast("Promoción creada", "success")
      }
      await cargar(true)
      refrescarPromos()  // que el carrito de venta vea la nueva promo
      cerrarDrawer()
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "No se pudo guardar", "error")
    } finally {
      setGuardando(false)
    }
  }

  async function toggleActiva(p) {
    try {
      // Reenviamos todos los campos (PUT reemplaza) cambiando solo `activa`.
      await actualizarPromocion(p.id, { ...p, activa: !p.activa })
      await cargar(true)
      refrescarPromos()
      pushToast(p.activa ? "Promoción desactivada" : "Promoción activada", "success")
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "No se pudo cambiar el estado", "error")
    }
  }

  async function confirmarBorrar() {
    const id = borrarId
    setBorrarId(null)
    try {
      await eliminarPromocion(id)
      await cargar(true)
      refrescarPromos()
      pushToast("Promoción eliminada", "success")
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "No se pudo eliminar", "error")
    }
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Tag size={22} className="text-orange-600" /> Promociones
          </h1>
          <p className="text-sm text-gray-500">Descuentos por artículo: %, nivel de precio, NxM y por volumen.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => cargar(true)} disabled={refrescando}
            className="bg-white border border-gray-300 text-gray-600 px-3 py-2.5 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1.5">
            <RefreshCw size={15} className={refrescando ? "animate-spin" : ""} /> Actualizar
          </button>
          <button onClick={abrirNueva}
            className="bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 flex items-center gap-1.5">
            <Plus size={16} /> Nueva promoción
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o SKU…" />
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {cargando ? (
          <p className="p-8 text-center text-gray-400 text-sm">Cargando promociones…</p>
        ) : filtradas.length === 0 ? (
          <div className="p-10 text-center">
            <Tag size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{busqueda ? "Sin resultados." : "Aún no hay promociones."}</p>
            {!busqueda && (
              <button onClick={abrirNueva} className="mt-3 text-orange-600 text-sm font-medium hover:underline">
                Crear la primera
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-semibold">Promoción</th>
                <th className="text-left px-4 py-3 font-semibold">Descuento</th>
                <th className="text-left px-4 py-3 font-semibold">Artículos</th>
                <th className="text-left px-4 py-3 font-semibold">Para</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="text-right px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p) => {
                const est = estadoPromo(p)
                const nArts = p.modo_articulos === "cruzada"
                  ? `${p.skus_requeridos.length}→${p.skus_beneficiados.length}`
                  : String(p.skus_requeridos.length)
                return (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.nombre}</div>
                      {p.modo_articulos === "cruzada" && <span className="text-[11px] text-orange-600">Cruzada A→B</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{ETIQUETAS_TIPO[p.tipo]?.(p) ?? p.tipo}</td>
                    <td className="px-4 py-3 text-gray-500">{nArts}</td>
                    <td className="px-4 py-3 text-gray-500">{ETIQUETAS_SEGMENTO[p.segmento] ?? p.segmento}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${est.cls}`}>{est.txt}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => toggleActiva(p)} title={p.activa ? "Desactivar" : "Activar"}
                          aria-label={p.activa ? "Desactivar promoción" : "Activar promoción"}
                          className={`inline-flex items-center justify-center w-12 h-12 rounded-lg border transition ${p.activa ? "text-green-600 border-green-200 hover:bg-green-50" : "text-gray-400 border-gray-200 hover:bg-gray-50"}`}>
                          <Power size={22} />
                        </button>
                        <button onClick={() => abrirEditar(p)} title="Editar" aria-label="Editar promoción"
                          className="inline-flex items-center justify-center w-12 h-12 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"><Pencil size={22} /></button>
                        <button onClick={() => setBorrarId(p.id)} title="Eliminar" aria-label="Eliminar promoción"
                          className="inline-flex items-center justify-center w-12 h-12 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"><Trash2 size={22} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer crear/editar */}
      <PromocionDrawer
        open={drawerOpen}
        mode={drawerMode}
        promo={promoEdit}
        onGuardar={handleGuardar}
        onCerrar={cerrarDrawer}
        guardando={guardando}
        taxonomy={taxonomy}
        taxLoading={taxLoading}
        clientes={clientes}
        grupos={grupos}
        pushToast={pushToast}
      />

      {/* Confirmación de borrado */}
      <ConfirmDialog
        open={!!borrarId}
        title="Eliminar promoción"
        message="¿Eliminar esta promoción? Dejará de aplicarse en las ventas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmarBorrar}
        onClose={() => setBorrarId(null)}
      />

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[700] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2.5 rounded-lg text-sm text-white shadow-lg ${t.type === "error" ? "bg-red-600" : t.type === "success" ? "bg-green-600" : "bg-gray-800"}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
