import { useState, useEffect, useMemo } from "react"
import { X, Tag, Percent, Layers, Gift, Package, Plus, Trash2, Users, User, Globe, ImageOff, SlidersHorizontal } from "lucide-react"
import SelectorArticulosPopup from "./SelectorArticulosPopup"
import { buscarProductoPorSku } from "../lib/client"
import { formatMXN } from "../lib/format"

/**
 * Drawer de crear/editar una promoción del POS.
 *
 * Cumple el Contrato de Conexión: NO llama al backend directamente — recibe
 * `onGuardar(input)` del módulo (que usa crearPromocion/actualizarPromocion de
 * client.ts). La taxonomía llega por props (cargada con listarCatalogos por el
 * módulo) para alimentar el SelectorArticulosPopup; clientes/grupos para segmentar.
 *
 * Props:
 *   open, mode ("add"|"edit"), promo (registro a editar o null),
 *   onGuardar(input) → Promise, onCerrar(), guardando (bool),
 *   taxonomy, taxLoading, clientes [{id,nombre}], grupos [string], pushToast.
 */

const TIPOS = [
  { id: "porcentaje",    label: "Descuento %",     icon: Percent,    hint: "Un % de descuento sobre el precio." },
  { id: "nivel_precio",  label: "Nivel de precio", icon: Layers,     hint: "Forzar precio 2, 3 o 4 durante la promo." },
  { id: "nxm",           label: "NxM (2x1, 3x2…)", icon: Gift,       hint: "Lleva N, paga M. Las demás van gratis." },
  { id: "volumen",       label: "Por volumen",     icon: Package,    hint: "Descuento al llevar X o más piezas." },
  { id: "personalizado", label: "Personalizado",   icon: SlidersHorizontal, hint: "Cada artículo con su propio % o precio fijo." },
]

const NIVELES = [
  { v: 2, label: "Precio 2 (Cliente)" },
  { v: 3, label: "Precio 3 (Distribuidor)" },
  { v: 4, label: "Precio 4 (Especial)" },
]

/** Estado inicial del formulario a partir de una promo existente o vacío. */
function formInicial(promo) {
  return {
    nombre: promo?.nombre ?? "",
    activa: promo?.activa ?? true,
    inicio: promo?.inicio ?? "",
    fin: promo?.fin ?? "",
    prioridad: promo?.prioridad ?? 0,
    tipo: promo?.tipo ?? "porcentaje",
    porcentaje: promo?.porcentaje ?? "",
    nivel_precio: promo?.nivel_precio ?? 2,
    nxm_lleva: promo?.nxm_lleva ?? 2,
    nxm_paga: promo?.nxm_paga ?? 1,
    volumen_min: promo?.volumen_min ?? 3,
    volumen_desc: promo?.volumen_desc ?? "",
    volumen_alcance: promo?.volumen_alcance ?? "todas",
    modo_articulos: promo?.modo_articulos ?? "mismos",
    skus_requeridos: promo?.skus_requeridos ?? [],
    skus_beneficiados: promo?.skus_beneficiados ?? [],
    // Mapa sku → { tipo: "porcentaje"|"precio_fijo", valor } (tipo "personalizado").
    descuentos_articulo: promo?.descuentos_articulo ?? {},
    segmento: promo?.segmento ?? "todos",
    cliente_id: promo?.cliente_id ?? "",
    grupo: promo?.grupo ?? "",
    cantidad_minima: promo?.cantidad_minima ?? "",
    max_unidades: promo?.max_unidades ?? "",
    etiqueta: promo?.etiqueta ?? "",
  }
}

export default function PromocionDrawer({
  open, mode, promo, onGuardar, onCerrar, guardando,
  taxonomy, taxLoading, clientes, grupos, pushToast,
}) {
  const [form, setForm] = useState(() => formInicial(promo))
  const [error, setError] = useState("")
  // Qué caja de SKUs está eligiendo el popup: "requeridos" | "beneficiados" | null
  const [picker, setPicker] = useState(null)
  const [selTemp, setSelTemp] = useState(new Set())
  // Cache sku → { descripcion, thumbnail, precio, precio2, precio3, precio4 }
  // para mostrar las listas con imagen, descripción y el precio con/sin promo.
  // La promo solo persiste los SKUs; esto es solo para la UI.
  const [artInfo, setArtInfo] = useState({})

  // Reinicia el formulario cada vez que se abre (con la promo a editar o vacío).
  useEffect(() => {
    if (open) { setForm(formInicial(promo)); setError(""); setPicker(null) }
  }, [open, promo])

  // Hidrata desde /caja/productos (misma fuente que el carrito) la info de los
  // SKUs seleccionados a los que aún les falta el PRECIO en cache — para mostrar
  // imagen + descripción + precio original/con-promo. Corre al abrir (editar) y
  // cada vez que cambia la selección de SKUs (al elegir en el popup).
  const skusForm = `${form.skus_requeridos.join(",")}|${form.skus_beneficiados.join(",")}`
  useEffect(() => {
    if (!open) return
    let vivo = true
    const skus = [...new Set([...form.skus_requeridos, ...form.skus_beneficiados])]
    const faltan = skus.filter((s) => artInfo[s]?.precio === undefined)
    if (faltan.length === 0) return
    ;(async () => {
      const pares = await Promise.all(
        faltan.map(async (sku) => {
          try {
            const a = await buscarProductoPorSku(sku)  // ≈10ms, match exacto
            return a ? [sku, {
              descripcion: a.descripcion, thumbnail: a.thumbnail,
              precio: a.precio, precio2: a.precio2, precio3: a.precio3, precio4: a.precio4,
            }] : null
          } catch { return null }
        })
      )
      if (!vivo) return
      setArtInfo((prev) => {
        const next = { ...prev }
        for (const p of pares) if (p) next[p[0]] = { ...next[p[0]], ...p[1] }
        return next
      })
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skusForm])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const esCruzada = form.modo_articulos === "cruzada"

  // Resumen del costo de la promoción COMPLETA (todos sus artículos): suma
  // original vs suma con la promo aplicada + ahorro. Recalcula al cambiar SKUs,
  // tipo o parámetros (o al hidratarse los precios).
  const resumen = useMemo(
    () => resumenPromo(form, artInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skusForm, artInfo, form.tipo, form.porcentaje, form.nivel_precio, form.nxm_lleva, form.nxm_paga, form.volumen_min, form.volumen_desc, form.volumen_alcance, form.modo_articulos, form.descuentos_articulo]
  )

  // Regla de negocio: ningún artículo puede quedar por debajo de su precio 4
  // (precio especial / piso). Lista de artículos que la promo actual rebasaría.
  const violacionesPiso = useMemo(
    () => validarPiso4(form, artInfo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skusForm, artInfo, form.tipo, form.porcentaje, form.nivel_precio, form.nxm_lleva, form.nxm_paga, form.volumen_desc, form.modo_articulos, form.descuentos_articulo]
  )

  // ── Preview de ahorro en vivo sobre un ejemplo simple (precio $100, qty según tipo) ──
  // Solo depende de los campos que calcularPreview lee (no de todo el form).
  const preview = useMemo(
    () => calcularPreview(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.tipo, form.porcentaje, form.nivel_precio, form.nxm_lleva, form.nxm_paga, form.volumen_min, form.volumen_desc, form.volumen_alcance]
  )

  // ── SKU pickers (reusa SelectorArticulosPopup en modo multiSelect) ──
  function abrirPicker(cual) {
    const actuales = cual === "requeridos" ? form.skus_requeridos : form.skus_beneficiados
    setSelTemp(new Set(actuales))
    setPicker(cual)
  }
  function toggleSku(art) {
    const sku = art.clave || art.claveAlterna
    // Feedback instantáneo (descripción + imagen). Los PRECIOS se hidratan luego
    // desde /caja/productos (misma fuente que el carrito) en el efecto de abajo,
    // para no mezclar el shape de ArticuloPOS (precio1-4) con el de venta.
    setArtInfo((prev) => prev[sku] ? prev : { ...prev, [sku]: { descripcion: art.descripcion, thumbnail: art.thumbnail } })
    setSelTemp((prev) => {
      const next = new Set(prev)
      next.has(sku) ? next.delete(sku) : next.add(sku)
      return next
    })
  }
  function confirmarPicker() {
    const arr = [...selTemp]
    if (picker === "requeridos") {
      setForm((f) => {
        const reqSet = new Set(arr)
        // Mantén los beneficiados (y sus descuentos) que sigan siendo requeridos.
        const skus_beneficiados = f.skus_beneficiados.filter((s) => reqSet.has(s))
        const descuentos_articulo = {}
        for (const s of Object.keys(f.descuentos_articulo || {})) {
          if (reqSet.has(s)) descuentos_articulo[s] = f.descuentos_articulo[s]
        }
        return { ...f, skus_requeridos: arr, skus_beneficiados, descuentos_articulo }
      })
    } else {
      set("skus_beneficiados", arr)
    }
    setPicker(null)
  }
  function quitarSku(cual, sku) {
    setForm((f) => {
      const next = { ...f }
      if (cual === "requeridos") {
        next.skus_requeridos = f.skus_requeridos.filter((s) => s !== sku)
        // Al quitar un requerido, también deja de ser beneficiado (subconjunto).
        next.skus_beneficiados = f.skus_beneficiados.filter((s) => s !== sku)
      } else {
        next.skus_beneficiados = f.skus_beneficiados.filter((s) => s !== sku)
      }
      // Limpia su descuento/nivel individual si lo tenía.
      if (f.descuentos_articulo?.[sku]) {
        const d = { ...f.descuentos_articulo }
        delete d[sku]
        next.descuentos_articulo = d
      }
      return next
    })
  }

  // Fija/actualiza el descuento individual de un artículo (tipo personalizado).
  function setDescuentoArticulo(sku, patch) {
    setForm((f) => {
      const actual = f.descuentos_articulo?.[sku] ?? { tipo: "porcentaje", valor: "" }
      return { ...f, descuentos_articulo: { ...f.descuentos_articulo, [sku]: { ...actual, ...patch } } }
    })
  }

  // Marca/desmarca un artículo requerido como "con descuento" (solo cruzada).
  // Los beneficiados son SIEMPRE un subconjunto de los requeridos.
  function toggleBeneficiado(sku) {
    setForm((f) => {
      const yaEs = f.skus_beneficiados.includes(sku)
      const skus_beneficiados = yaEs
        ? f.skus_beneficiados.filter((s) => s !== sku)
        : [...f.skus_beneficiados, sku]
      // Al quitarlo del descuento, limpia su entrada personalizada/nivel.
      let descuentos_articulo = f.descuentos_articulo
      if (yaEs && descuentos_articulo?.[sku]) {
        descuentos_articulo = { ...descuentos_articulo }
        delete descuentos_articulo[sku]
      }
      return { ...f, skus_beneficiados, descuentos_articulo }
    })
  }

  // Fija el nivel de precio (2|3|4) de un artículo (nivel_precio + cruzada).
  function setNivelArticulo(sku, nivel) {
    setForm((f) => ({
      ...f,
      descuentos_articulo: { ...f.descuentos_articulo, [sku]: { tipo: "nivel_precio", valor: Number(nivel) } },
    }))
  }

  function validar() {
    if (!form.nombre.trim()) return "Ponle un nombre a la promoción."
    if (form.skus_requeridos.length === 0) return "Selecciona al menos un artículo."
    if (esCruzada && form.skus_beneficiados.length === 0) return "Elige los artículos que reciben el descuento."
    if (form.tipo === "porcentaje" && !(Number(form.porcentaje) > 0 && Number(form.porcentaje) <= 100))
      return "El porcentaje debe estar entre 1 y 100."
    if (form.tipo === "nxm" && !(Number(form.nxm_paga) < Number(form.nxm_lleva)))
      return "En NxM, 'paga' debe ser menor que 'lleva'."
    if (form.tipo === "volumen" && !(Number(form.volumen_desc) > 0 && Number(form.volumen_desc) <= 100))
      return "El descuento por volumen debe estar entre 1 y 100%."
    if (form.tipo === "personalizado") {
      const benes = esCruzada ? form.skus_beneficiados : form.skus_requeridos
      const conValor = benes.filter((s) => Number(form.descuentos_articulo?.[s]?.valor) > 0)
      if (conValor.length === 0) return "Define el descuento (% o precio) de al menos un artículo."
    }
    if (form.segmento === "cliente" && !form.cliente_id) return "Selecciona el cliente."
    if (form.segmento === "grupo" && !form.grupo) return "Selecciona el grupo."
    if (form.inicio && form.fin && form.fin < form.inicio) return "La fecha de fin no puede ser anterior al inicio."
    // Regla de piso: ningún artículo por debajo de su precio 4 (precio especial).
    if (violacionesPiso.length > 0) {
      const v = violacionesPiso[0]
      return violacionesPiso.length === 1
        ? `El descuento deja a ${v.sku} por debajo de su precio 4 ($${v.precio4.toFixed(2)}). Máximo permitido para ese artículo: ${v.descuentoMaxPct}%.`
        : `${violacionesPiso.length} artículos quedarían por debajo de su precio 4. Revisa los avisos en rojo y reduce el descuento.`
    }
    return ""
  }

  async function handleGuardar() {
    const err = validar()
    if (err) { setError(err); pushToast?.(err, "error"); return }
    setError("")
    // Construir el input limpio para client.ts (el backend revalida igualmente).
    const input = {
      nombre: form.nombre.trim(),
      activa: !!form.activa,
      inicio: form.inicio || null,
      fin: form.fin || null,
      prioridad: Number(form.prioridad) || 0,
      tipo: form.tipo,
      porcentaje: form.tipo === "porcentaje" ? Number(form.porcentaje) : null,
      nivel_precio: form.tipo === "nivel_precio" ? Number(form.nivel_precio) : null,
      nxm_lleva: form.tipo === "nxm" ? Number(form.nxm_lleva) : null,
      nxm_paga: form.tipo === "nxm" ? Number(form.nxm_paga) : null,
      volumen_min: form.tipo === "volumen" ? Number(form.volumen_min) : null,
      volumen_desc: form.tipo === "volumen" ? Number(form.volumen_desc) : null,
      volumen_alcance: form.tipo === "volumen" ? form.volumen_alcance : null,
      // Descuento por artículo (solo de los SKUs beneficiados):
      //  - tipo "personalizado": % o precio fijo por artículo.
      //  - tipo "nivel_precio" + cruzada: nivel 2/3/4 por artículo.
      descuentos_articulo: form.tipo === "personalizado"
        ? Object.fromEntries(
            (esCruzada ? form.skus_beneficiados : form.skus_requeridos)
              .filter((s) => form.descuentos_articulo?.[s])
              .map((s) => [s, {
                tipo: form.descuentos_articulo[s].tipo === "precio_fijo" ? "precio_fijo" : "porcentaje",
                valor: Number(form.descuentos_articulo[s].valor) || 0,
              }])
          )
        : (form.tipo === "nivel_precio" && esCruzada)
        ? Object.fromEntries(
            form.skus_beneficiados.map((s) => {
              const d = form.descuentos_articulo?.[s]
              const nv = d?.tipo === "nivel_precio" ? Number(d.valor) : Number(form.nivel_precio) || 2
              return [s, { tipo: "nivel_precio", valor: nv }]
            })
          )
        : null,
      modo_articulos: form.modo_articulos,
      skus_requeridos: form.skus_requeridos,
      skus_beneficiados: esCruzada ? form.skus_beneficiados : form.skus_requeridos,
      segmento: form.segmento,
      cliente_id: form.segmento === "cliente" ? form.cliente_id : null,
      grupo: form.segmento === "grupo" ? form.grupo : null,
      cantidad_minima: form.cantidad_minima ? Number(form.cantidad_minima) : null,
      max_unidades: form.max_unidades ? Number(form.max_unidades) : null,
      etiqueta: form.etiqueta.trim() || null,
    }
    await onGuardar(input)
  }

  if (!open) return null

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500"
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1"

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[400]" onClick={onCerrar} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-drawer-titulo"
        className="fixed top-0 right-0 h-full w-[min(560px,96vw)] bg-white shadow-2xl z-[401] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="promo-drawer-titulo" className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Tag size={18} className="text-orange-600" />
            {mode === "edit" ? "Editar promoción" : "Nueva promoción"}
          </h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Nombre + activa */}
          <div>
            <label className={labelCls}>Nombre de la promoción *</label>
            <input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)}
              placeholder="Ej. Liquidación martillos −20%" autoFocus />
          </div>

          {/* Tipo de promoción (tarjetas) */}
          <div>
            <label className={labelCls}>Tipo de descuento</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map((t) => {
                const Icon = t.icon
                const activo = form.tipo === t.id
                return (
                  <button key={t.id} type="button" onClick={() => set("tipo", t.id)}
                    className={`text-left p-3 rounded-lg border transition ${activo ? "border-orange-600 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <div className="flex items-center gap-2 font-medium text-sm text-gray-900">
                      <Icon size={16} className={activo ? "text-orange-600" : "text-gray-400"} /> {t.label}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 leading-tight">{t.hint}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Campos específicos del tipo */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            {form.tipo === "porcentaje" && (
              <div>
                <label className={labelCls}>Porcentaje de descuento *</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="100" className={inputCls + " max-w-[120px]"}
                    value={form.porcentaje} onChange={(e) => set("porcentaje", e.target.value)} placeholder="20" />
                  <span className="text-gray-500 text-sm">% sobre el precio del cliente</span>
                </div>
              </div>
            )}

            {form.tipo === "nivel_precio" && (
              <div>
                <label className={labelCls}>
                  {esCruzada ? "Nivel de precio por defecto *" : "Forzar nivel de precio *"}
                </label>
                <select className={inputCls} value={form.nivel_precio} onChange={(e) => set("nivel_precio", Number(e.target.value))}>
                  {NIVELES.map((n) => <option key={n.v} value={n.v}>{n.label}</option>)}
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  {esCruzada
                    ? "Nivel inicial de cada artículo con descuento. Puedes ajustarlo por artículo abajo."
                    : "Durante la promo el artículo se cobra a ese precio."}
                </p>
              </div>
            )}

            {form.tipo === "nxm" && (
              <div className="flex items-end gap-3">
                <div>
                  <label className={labelCls}>Lleva *</label>
                  <input type="number" min="2" className={inputCls + " w-20"}
                    value={form.nxm_lleva} onChange={(e) => set("nxm_lleva", e.target.value)} />
                </div>
                <span className="pb-2.5 text-lg font-bold text-gray-400">×</span>
                <div>
                  <label className={labelCls}>Paga *</label>
                  <input type="number" min="1" className={inputCls + " w-20"}
                    value={form.nxm_paga} onChange={(e) => set("nxm_paga", e.target.value)} />
                </div>
                <p className="pb-2.5 text-sm text-gray-500">
                  = <strong>{form.nxm_lleva || "?"}x{form.nxm_paga || "?"}</strong>
                </p>
              </div>
            )}

            {form.tipo === "volumen" && (
              <div className="space-y-3">
                <div className="flex items-end gap-3">
                  <div>
                    <label className={labelCls}>Piezas mínimas *</label>
                    <input type="number" min="2" className={inputCls + " w-24"}
                      value={form.volumen_min} onChange={(e) => set("volumen_min", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Descuento % *</label>
                    <input type="number" min="1" max="100" className={inputCls + " w-24"}
                      value={form.volumen_desc} onChange={(e) => set("volumen_desc", e.target.value)} placeholder="10" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Aplicar el descuento a…</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => set("volumen_alcance", "todas")}
                      className={`flex-1 py-2 text-sm rounded-lg border ${form.volumen_alcance === "todas" ? "border-orange-600 bg-orange-50 text-orange-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                      Todas las piezas
                    </button>
                    <button type="button" onClick={() => set("volumen_alcance", "excedente")}
                      className={`flex-1 py-2 text-sm rounded-lg border ${form.volumen_alcance === "excedente" ? "border-orange-600 bg-orange-50 text-orange-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                      Solo las excedentes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {form.tipo === "personalizado" && (
              <p className="text-xs text-gray-600 leading-relaxed">
                Define abajo el descuento de <strong>cada artículo</strong> por separado:
                un <strong>%</strong> o un <strong>precio fijo</strong>. Lo configuras en la lista
                de artículos.
              </p>
            )}

            {/* Preview de ahorro en vivo */}
            {preview && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">Ejemplo:</span> {preview}
              </div>
            )}
          </div>

          {/* Artículos: switch mismos / cruzada */}
          <div>
            <label className={labelCls}>¿A qué artículos aplica?</label>
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => set("modo_articulos", "mismos")}
                className={`flex-1 py-2 text-sm rounded-lg border ${!esCruzada ? "border-orange-600 bg-orange-50 text-orange-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                Los mismos artículos
              </button>
              <button type="button" onClick={() => set("modo_articulos", "cruzada")}
                className={`flex-1 py-2 text-sm rounded-lg border ${esCruzada ? "border-orange-600 bg-orange-50 text-orange-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                Promoción cruzada (A → B)
              </button>
            </div>

            {/* Caja única de artículos.
                - "mismos": todos reciben el descuento.
                - "cruzada": esta es la lista de REQUERIDOS; cada uno se marca
                  "con descuento" (toggle) para volverse beneficiado. Los
                  beneficiados son SIEMPRE un subconjunto de los requeridos. */}
            <CajaSkus
              titulo={esCruzada ? "Artículos requeridos (lo que debe llevar)" : "Artículos en promoción"}
              skus={form.skus_requeridos}
              artInfo={artInfo}
              form={form}
              conDescuento={!esCruzada}
              modoCruzada={esCruzada}
              beneficiados={form.skus_beneficiados}
              onAgregar={() => abrirPicker("requeridos")}
              onQuitar={(sku) => quitarSku("requeridos", sku)}
              onSetDescuento={setDescuentoArticulo}
              onToggleBeneficiado={toggleBeneficiado}
              onSetNivel={setNivelArticulo}
            />
            {esCruzada && (
              <p className="text-[11px] text-gray-500 mt-1">
                Marca <strong>“con descuento”</strong> los artículos que recibirán la promo
                (deben estar entre los requeridos). El resto solo se necesita en el carrito para activarla.
              </p>
            )}

            {/* Resumen de la promoción completa: desglose por artículo + total */}
            {resumen && (
              <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
                <div className="text-xs font-bold text-gray-700 mb-2">
                  Desglose de la promoción {esCruzada ? "(requeridos + descuento)" : "completa"}
                </div>

                {/* Línea por artículo: descripción · SKU · precio (nivel usado) */}
                <ul className="flex flex-col gap-1 mb-2.5">
                  {resumen.lineas.map((l) => (
                    <li key={l.sku} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-gray-700">
                        <span className="text-orange-600 font-semibold">{l.sku}</span> · {l.descripcion}
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className={l.conDescuento ? "font-bold text-green-600" : "text-gray-400"}>
                          {formatMXN(l.precioUnit)}
                        </span>
                        <span className="text-gray-400"> ({l.nivel})</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between text-sm border-t border-orange-200 pt-2">
                  <span className="text-gray-500">Precio normal</span>
                  <span className="text-gray-500 line-through">{formatMXN(resumen.original)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-0.5">
                  <span className="text-gray-700 font-medium">Con la promoción</span>
                  <span className="text-green-600 font-bold text-base">{formatMXN(resumen.conPromo)}</span>
                </div>
                {resumen.ahorro > 0.005 && (
                  <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-orange-200">
                    <span className="text-orange-700 font-semibold">Ahorro</span>
                    <span className="text-orange-700 font-bold">{formatMXN(resumen.ahorro)} ({resumen.pct}%)</span>
                  </div>
                )}
                {(!resumen.listo || resumen.asumeCantidad) && (
                  <p className="text-[10.5px] text-gray-400 mt-1.5 leading-tight">
                    {!resumen.listo && "Cargando precios de algunos artículos… "}
                    {resumen.asumeCantidad && "Cálculo sobre la cantidad mínima que activa la promo (NxM/volumen varían según las piezas que lleve el cliente)."}
                  </p>
                )}
              </div>
            )}

            {/* Aviso de regla de piso: artículos que quedarían por debajo de precio 4 */}
            {violacionesPiso.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3">
                <div className="text-xs font-bold text-red-700 mb-1.5">
                  ⚠️ El descuento es demasiado alto — no se puede vender por debajo del precio 4 (precio especial)
                </div>
                <ul className="flex flex-col gap-1">
                  {violacionesPiso.map((v) => (
                    <li key={v.sku} className="text-xs text-red-700 flex items-baseline justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{v.sku}</span> · {v.descripcion}
                      </span>
                      <span className="flex-shrink-0 font-semibold">
                        máx. {v.descuentoMaxPct}% (no menos de {formatMXN(v.precio4)})
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10.5px] text-red-500 mt-1.5 leading-tight">
                  Reduce el descuento (o cambia el tipo) para no rebasar el precio 4 de estos artículos.
                </p>
              </div>
            )}
          </div>

          {/* Segmentación */}
          <div>
            <label className={labelCls}>¿Para quién aplica?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "todos", label: "Todos", icon: Globe },
                { id: "cliente", label: "Un cliente", icon: User },
                { id: "grupo", label: "Un grupo", icon: Users },
              ].map((s) => {
                const Icon = s.icon
                const activo = form.segmento === s.id
                return (
                  <button key={s.id} type="button" onClick={() => set("segmento", s.id)}
                    className={`py-2 text-sm rounded-lg border flex items-center justify-center gap-1.5 ${activo ? "border-orange-600 bg-orange-50 text-orange-700 font-medium" : "border-gray-200 text-gray-600"}`}>
                    <Icon size={15} /> {s.label}
                  </button>
                )
              })}
            </div>
            {form.segmento === "cliente" && (
              <select className={inputCls + " mt-2"} value={form.cliente_id} onChange={(e) => set("cliente_id", e.target.value)}>
                <option value="">Selecciona un cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            {form.segmento === "grupo" && (
              <select className={inputCls + " mt-2"} value={form.grupo} onChange={(e) => set("grupo", e.target.value)}>
                <option value="">Selecciona un grupo…</option>
                {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </div>

          {/* Vigencia + límites (colapsable simple) */}
          <details className="border border-gray-200 rounded-lg">
            <summary className="px-3 py-2.5 text-sm font-medium text-gray-700 cursor-pointer select-none">
              Vigencia y límites (opcional)
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Inicia</label>
                  <input type="date" className={inputCls} value={form.inicio} onChange={(e) => set("inicio", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Termina</label>
                  <input type="date" className={inputCls} value={form.fin} onChange={(e) => set("fin", e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-1">Vacío = activa siempre, hasta que la desactives.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Piezas mínimas (activar)</label>
                  <input type="number" min="1" className={inputCls} value={form.cantidad_minima}
                    onChange={(e) => set("cantidad_minima", e.target.value)} placeholder="—" />
                </div>
                <div>
                  <label className={labelCls}>Tope de piezas con desc.</label>
                  <input type="number" min="1" className={inputCls} value={form.max_unidades}
                    onChange={(e) => set("max_unidades", e.target.value)} placeholder="—" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Prioridad</label>
                  <input type="number" className={inputCls} value={form.prioridad}
                    onChange={(e) => set("prioridad", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Etiqueta en ticket</label>
                  <input className={inputCls} value={form.etiqueta} onChange={(e) => set("etiqueta", e.target.value)}
                    placeholder="(usa el nombre)" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-1">Mayor prioridad gana cuando dos promos compiten por una línea.</p>
            </div>
          </details>

          {/* Estado activa */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.activa} onChange={(e) => set("activa", e.target.checked)}
              className="w-4 h-4 accent-orange-600" />
            Promoción activa
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer acciones */}
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onCerrar} disabled={guardando}
            className="bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando || violacionesPiso.length > 0}
            title={violacionesPiso.length > 0 ? "El descuento rebasa el precio 4 de uno o más artículos" : undefined}
            className="bg-orange-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-40">
            {guardando ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear promoción"}
          </button>
        </div>
      </aside>

      {/* Popup selector de artículos (glass), modo multiSelect. Usa el anclaje
          "drawer" (position:fixed a la IZQUIERDA del drawer de 560px) — es el
          mismo modo que Paquetes; el "inline" no sirve aquí porque se posiciona
          relativo a su offset parent y caía fuera de pantalla. */}
      {picker && (
        <>
          <div className="fixed inset-0 z-[490] bg-black/10" onClick={() => setPicker(null)} />
          <SelectorArticulosPopup
            open={true}
            onClose={() => setPicker(null)}
            anchorMode="drawer"
            multiSelect
            seleccionados={selTemp}
            onToggle={toggleSku}
            onConfirmarSeleccion={confirmarPicker}
            taxonomy={taxonomy}
            taxLoading={taxLoading}
            pushToast={pushToast}
            titulo="Elegir artículos de la promoción"
          />
        </>
      )}
    </>
  )
}

/**
 * Lista de artículos de la promoción.
 *  - `conDescuento` (modo "mismos"): todos reciben el descuento; se muestra el
 *    precio resultante o el control personalizado.
 *  - `modoCruzada`: la lista es de REQUERIDOS; cada artículo trae un toggle
 *    "con descuento" que lo marca como beneficiado (subconjunto). Solo los
 *    marcados muestran su control de descuento / nivel.
 * `artInfo` mapea sku → { descripcion, thumbnail, precio, precio2..4 }.
 */
function CajaSkus({
  titulo, skus, artInfo = {}, form, conDescuento, modoCruzada = false,
  beneficiados = [], onAgregar, onQuitar, onSetDescuento, onToggleBeneficiado, onSetNivel,
}) {
  const setBen = new Set(beneficiados)
  return (
    <div className="border border-gray-200 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">{titulo} · {skus.length}</span>
        <button type="button" onClick={onAgregar}
          className="text-orange-600 hover:text-orange-700 text-xs font-medium flex items-center gap-1">
          <Plus size={14} /> Agregar
        </button>
      </div>
      {skus.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">Ningún artículo seleccionado.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {skus.map((sku) => {
            const info = artInfo[sku]
            // ¿Este artículo recibe descuento? En "mismos" todos; en cruzada solo los marcados.
            const recibe = modoCruzada ? setBen.has(sku) : conDescuento
            const esPersonalizado = form?.tipo === "personalizado" && recibe
            const esNivelCruzada = form?.tipo === "nivel_precio" && modoCruzada && recibe
            const calc = recibe && !esPersonalizado && !esNivelCruzada && info?.precio !== undefined
              ? precioConPromo(info, form) : null
            const dArt = form?.descuentos_articulo?.[sku]
            return (
              <li key={sku} className={`rounded-lg px-2 py-1.5 ${recibe ? "bg-orange-50/70 border border-orange-200" : "bg-gray-50"}`}>
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 flex-shrink-0 rounded bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                    {info?.thumbnail
                      ? <img src={info.thumbnail} alt="" className="w-full h-full object-contain" loading="lazy" />
                      : <ImageOff size={16} className="text-gray-300" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-orange-600 truncate">{sku}</div>
                    <div className="text-xs text-gray-600 truncate">{info?.descripcion ?? "…"}</div>
                  </div>

                  {/* Toggle "con descuento" (solo cruzada) */}
                  {modoCruzada && (
                    <button type="button" onClick={() => onToggleBeneficiado?.(sku)}
                      className={`flex-shrink-0 text-[11px] font-semibold rounded-md px-2 py-1.5 border transition ${recibe ? "bg-orange-600 text-white border-orange-600" : "bg-white text-gray-500 border-gray-300 hover:border-orange-400"}`}>
                      {recibe ? "✓ Con descuento" : "Con descuento"}
                    </button>
                  )}

                  {/* Precio original → con promo (tipos globales que reciben descuento) */}
                  {recibe && !esPersonalizado && !esNivelCruzada && info?.precio !== undefined && (
                    <div className="flex-shrink-0 text-right">
                      {calc?.unidad != null ? (
                        <>
                          <div className="text-[11px] text-gray-400 line-through leading-tight">{formatMXN(info.precio)}</div>
                          <div className="text-xs font-bold text-green-600 leading-tight">{formatMXN(calc.unidad)}</div>
                        </>
                      ) : calc?.nota ? (
                        <>
                          <div className="text-[11px] text-gray-500 leading-tight">{formatMXN(info.precio)} c/u</div>
                          <div className="text-[11px] font-semibold text-orange-600 leading-tight">{calc.nota}</div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500">{formatMXN(info.precio)}</div>
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => onQuitar(sku)}
                    className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                    aria-label={`Quitar ${sku}`}>
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Control por artículo (tipo personalizado): % o precio fijo + resultado */}
                {esPersonalizado && (
                  <DescuentoArticuloControl
                    info={info}
                    descuento={dArt}
                    onSet={(patch) => onSetDescuento?.(sku, patch)}
                  />
                )}

                {/* Selector de nivel de precio por artículo (nivel_precio + cruzada) */}
                {esNivelCruzada && (
                  <NivelArticuloControl
                    info={info}
                    nivel={dArt?.tipo === "nivel_precio" ? Number(dArt.valor) : Number(form.nivel_precio) || 2}
                    onSet={(n) => onSetNivel?.(sku, n)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Selector de nivel de precio (2/3/4) por artículo + precio resultante. */
function NivelArticuloControl({ info, nivel, onSet }) {
  const base = Number(info?.precio) || 0
  const p = nivel === 2 ? info?.precio2 : nivel === 3 ? info?.precio3 : nivel === 4 ? info?.precio4 : undefined
  const resultante = Number(p) > 0 ? Math.round(Number(p) * 100) / 100 : null
  const btn = (n) =>
    `px-2.5 py-1.5 text-xs font-bold border-0 rounded-none transition ${nivel === n ? "bg-orange-600 text-white" : "bg-white text-gray-500"}`
  return (
    <div className="flex items-center gap-2 mt-1.5 pl-[46px]">
      <span className="text-[11px] text-gray-500">Nivel:</span>
      <div className="flex rounded-md overflow-hidden border border-gray-300">
        {[2, 3, 4].map((n) => (
          <button key={n} type="button" onClick={() => onSet(n)}
            className={`${btn(n)} ${n > 2 ? "border-l border-gray-300" : ""}`}>{n}</button>
        ))}
      </div>
      {resultante != null && base > 0 && (
        <span className="text-xs whitespace-nowrap">
          <span className="text-gray-400 line-through mr-1">{formatMXN(base)}</span>
          <span className="font-bold text-green-600">{formatMXN(resultante)}</span>
        </span>
      )}
    </div>
  )
}

/** Control por artículo: toggle %/$ + valor + precio resultante (tipo personalizado). */
function DescuentoArticuloControl({ info, descuento, onSet }) {
  const tipo = descuento?.tipo === "precio_fijo" ? "precio_fijo" : "porcentaje"
  const valor = descuento?.valor ?? ""
  const base = Number(info?.precio) || 0
  // Precio resultante según el tipo.
  let resultante = null
  const v = Number(valor)
  if (v > 0) {
    resultante = tipo === "precio_fijo" ? Math.round(v * 100) / 100 : Math.round(base * (1 - v / 100) * 100) / 100
  }
  const btn = "px-2.5 py-1.5 text-xs font-bold rounded-md border transition"
  return (
    <div className="flex items-center gap-2 mt-1.5 pl-[46px]">
      <div className="flex rounded-md overflow-hidden border border-gray-300">
        <button type="button" onClick={() => onSet({ tipo: "porcentaje" })}
          className={`${btn} border-0 rounded-none ${tipo === "porcentaje" ? "bg-orange-600 text-white" : "bg-white text-gray-500"}`}>%</button>
        <button type="button" onClick={() => onSet({ tipo: "precio_fijo" })}
          className={`${btn} border-0 rounded-none border-l border-gray-300 ${tipo === "precio_fijo" ? "bg-orange-600 text-white" : "bg-white text-gray-500"}`}>$</button>
      </div>
      <input
        type="number" min="0" step={tipo === "precio_fijo" ? "0.01" : "1"}
        className="w-24 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
        value={valor}
        onChange={(e) => onSet({ valor: e.target.value })}
        placeholder={tipo === "precio_fijo" ? "precio $" : "% desc."}
      />
      {resultante != null && base > 0 && (
        <span className="text-xs whitespace-nowrap">
          <span className="text-gray-400 line-through mr-1">{formatMXN(base)}</span>
          <span className="font-bold text-green-600">{formatMXN(resultante)}</span>
        </span>
      )}
    </div>
  )
}

/**
 * Precio de UN artículo bajo la promo configurada. Para % y nivel_precio devuelve
 * un precio unitario (`unidad`). Para NxM y volumen el precio depende de la
 * cantidad (no es uniforme), así que devuelve una `nota` explicativa.
 * Devuelve null si el tipo/parámetros aún no son válidos.
 */
function precioConPromo(info, form) {
  const base = Number(info.precio) || 0
  if (base <= 0) return null
  switch (form?.tipo) {
    case "porcentaje": {
      const pct = Number(form.porcentaje)
      if (!(pct > 0 && pct <= 100)) return null
      return { unidad: Math.round(base * (1 - pct / 100) * 100) / 100 }
    }
    case "nivel_precio": {
      const n = Number(form.nivel_precio)
      const p = n === 2 ? info.precio2 : n === 3 ? info.precio3 : n === 4 ? info.precio4 : undefined
      if (!(Number(p) > 0)) return null
      return { unidad: Math.round(Number(p) * 100) / 100 }
    }
    case "nxm": {
      const l = Number(form.nxm_lleva), pa = Number(form.nxm_paga)
      if (!(l >= 2 && pa >= 1 && pa < l)) return null
      // Precio efectivo por pieza al llevar exactamente "l": (pa/l) del precio.
      const efectivo = Math.round((base * pa / l) * 100) / 100
      return { nota: `${l}×${pa} → ${formatMXN(efectivo)} c/u efectivo` }
    }
    case "volumen": {
      const d = Number(form.volumen_desc), min = Number(form.volumen_min)
      if (!(d > 0 && d <= 100 && min >= 2)) return null
      const conDesc = Math.round(base * (1 - d / 100) * 100) / 100
      return {
        nota: form.volumen_alcance === "excedente"
          ? `desde la pza ${min + 1}: ${formatMXN(conDesc)}`
          : `al llevar ${min}+: ${formatMXN(conDesc)} c/u`,
      }
    }
    default:
      return null
  }
}

/**
 * Importe de UN artículo bajo la promo, asumiendo la CANTIDAD que activa la promo
 * (1 para % / nivel_precio; nxm_lleva para NxM; volumen_min para volumen). Devuelve
 * { original, conPromo, cant } o null si no hay precio/parámetros válidos.
 */
function importeArticuloPromo(info, form, sku) {
  const base = Number(info?.precio) || 0
  if (base <= 0) return null
  switch (form?.tipo) {
    case "porcentaje": {
      const pct = Number(form.porcentaje)
      if (!(pct > 0 && pct <= 100)) return null
      return { original: base, conPromo: Math.round(base * (1 - pct / 100) * 100) / 100, cant: 1 }
    }
    case "personalizado": {
      const d = form.descuentos_articulo?.[sku]
      const v = Number(d?.valor)
      if (!(v > 0)) return null
      const conPromo = d.tipo === "precio_fijo"
        ? Math.round(v * 100) / 100
        : Math.round(base * (1 - v / 100) * 100) / 100
      if (!(conPromo < base)) return null
      return { original: base, conPromo, cant: 1 }
    }
    case "nivel_precio": {
      const n = nivelPrecioDeArticulo(form, sku)
      const p = n === 2 ? info.precio2 : n === 3 ? info.precio3 : n === 4 ? info.precio4 : undefined
      if (!(Number(p) > 0)) return null
      return { original: base, conPromo: Math.round(Number(p) * 100) / 100, cant: 1 }
    }
    case "nxm": {
      const l = Number(form.nxm_lleva), pa = Number(form.nxm_paga)
      if (!(l >= 2 && pa >= 1 && pa < l)) return null
      // Al llevar exactamente "l": paga "pa" piezas a precio base.
      return { original: base * l, conPromo: Math.round(base * pa * 100) / 100, cant: l }
    }
    case "volumen": {
      const d = Number(form.volumen_desc), min = Number(form.volumen_min)
      if (!(d > 0 && d <= 100 && min >= 2)) return null
      const f = 1 - d / 100
      // Asume "min" piezas. "todas" → todas con descuento; "excedente" → solo la
      // que excede el mínimo (en el escenario mínimo: ninguna excede aún, mostramos min+1).
      const cant = form.volumen_alcance === "excedente" ? min + 1 : min
      const conDesc = form.volumen_alcance === "excedente"
        ? base * min + base * f * 1            // min a precio normal + 1 excedente con descuento
        : base * f * min                       // todas con descuento
      return { original: base * cant, conPromo: Math.round(conDesc * 100) / 100, cant }
    }
    default:
      return null
  }
}

/**
 * Precio EFECTIVO por pieza que la promo deja sobre un artículo, según el tipo
 * (misma lógica que el backend/motor). null si no aplica/datos insuficientes.
 */
function precioEfectivoPiezaUI(info, form, sku) {
  const base = Number(info?.precio) || 0
  if (base <= 0) return null
  switch (form?.tipo) {
    case "porcentaje": {
      const pct = Number(form.porcentaje)
      if (!(pct > 0)) return null
      return Math.round(base * (1 - pct / 100) * 100) / 100
    }
    case "personalizado": {
      const d = form.descuentos_articulo?.[sku]
      const v = Number(d?.valor)
      if (!(v > 0)) return null
      return d.tipo === "precio_fijo"
        ? Math.round(v * 100) / 100
        : Math.round(base * (1 - v / 100) * 100) / 100
    }
    case "nivel_precio": {
      const n = nivelPrecioDeArticulo(form, sku)
      const p = n === 2 ? info.precio2 : n === 3 ? info.precio3 : n === 4 ? info.precio4 : undefined
      return Number(p) > 0 ? Math.round(Number(p) * 100) / 100 : null
    }
    case "nxm": {
      const l = Number(form.nxm_lleva), pa = Number(form.nxm_paga)
      if (!(l >= 2 && pa >= 1 && pa < l)) return null
      return Math.round((base * pa / l) * 100) / 100
    }
    case "volumen": {
      const d = Number(form.volumen_desc)
      if (!(d > 0)) return null
      return Math.round(base * (1 - d / 100) * 100) / 100
    }
    default:
      return null
  }
}

/** Nivel de precio (2|3|4) que usa un artículo: override por SKU o el global. */
function nivelPrecioDeArticulo(form, sku) {
  const d = form?.descuentos_articulo?.[sku]
  if (d && d.tipo === "nivel_precio") return Number(d.valor) || 2
  return Number(form?.nivel_precio) || 2
}

/**
 * Artículos beneficiados cuya promo los deja por DEBAJO de su precio 4 (piso).
 * Devuelve [{ sku, descripcion, precio4, precioConPromo, descuentoMaxPct }].
 * Solo evalúa artículos con precio1 y precio4 conocidos (>0).
 */
function validarPiso4(form, artInfo) {
  if (!form) return []
  const esCruzada = form.modo_articulos === "cruzada"
  const skus = esCruzada ? (form.skus_beneficiados ?? []) : (form.skus_requeridos ?? [])
  const out = []
  for (const sku of skus) {
    const info = artInfo[sku]
    const base = Number(info?.precio) || 0
    const p4 = Number(info?.precio4) || 0
    if (!(base > 0 && p4 > 0)) continue
    const efectivo = precioEfectivoPiezaUI(info, form, sku)
    if (efectivo === null) continue
    if (efectivo < p4 - 0.01) {
      out.push({
        sku,
        descripcion: info.descripcion ?? sku,
        precio4: p4,
        precioConPromo: efectivo,
        descuentoMaxPct: Math.floor((1 - p4 / base) * 100),
      })
    }
  }
  return out
}

/** Etiqueta del nivel de precio que usa una línea (para el "(precio N)"). */
function nivelPrecioLabel(form, conDescuento, sku) {
  if (!conDescuento) return "precio 1"
  switch (form?.tipo) {
    case "porcentaje": return `precio 1 −${Number(form.porcentaje) || 0}%`
    case "nivel_precio": return `precio ${nivelPrecioDeArticulo(form, sku)}`
    case "nxm": return `${Number(form.nxm_lleva)}×${Number(form.nxm_paga)} (precio 1)`
    case "volumen": return `precio 1 −${Number(form.volumen_desc) || 0}%`
    case "personalizado": {
      const d = form.descuentos_articulo?.[sku]
      if (!d) return "precio 1"
      return d.tipo === "precio_fijo" ? "precio fijo" : `precio 1 −${Number(d.valor) || 0}%`
    }
    default: return "precio 1"
  }
}

/**
 * Resumen de la promoción COMPLETA: desglose por artículo + suma original vs con
 * promo + ahorro.
 *  - "mismos": todos los requeridos reciben el descuento.
 *  - "cruzada": requeridos a precio normal (1 c/u) + beneficiados con descuento.
 * Devuelve { lineas, original, conPromo, ahorro, pct, listo, asumeCantidad } o null.
 *   lineas[] = { sku, descripcion, precioUnit, original, nivel, conDescuento, cant }
 */
function resumenPromo(form, artInfo) {
  if (!form) return null
  const esCruzada = form.modo_articulos === "cruzada"
  const reqs = form.skus_requeridos ?? []
  const bens = esCruzada ? (form.skus_beneficiados ?? []) : reqs
  if (reqs.length === 0) return null

  // Cada artículo se cuenta UNA sola vez. Un SKU que esté en requeridos y también
  // en beneficiados (caso típico de cruzada) recibe el descuento (gana beneficiado).
  const setBen = new Set(bens)
  const skusUnicos = [...new Set([...reqs, ...bens])]

  const lineas = []
  let original = 0
  let conPromo = 0
  let listo = true            // ¿tenemos todos los precios + parámetros válidos?
  let asumeCantidad = false   // NxM/volumen asumen una cantidad de activación

  for (const sku of skusUnicos) {
    const info = artInfo[sku]
    if (!info || info.precio === undefined) { listo = false; continue }
    const recibeDescuento = setBen.has(sku)
    if (recibeDescuento) {
      const r = importeArticuloPromo(info, form, sku)
      if (!r) { listo = false; continue }
      if (r.cant > 1) asumeCantidad = true
      original += r.original
      conPromo += r.conPromo
      lineas.push({
        sku, descripcion: info.descripcion ?? sku,
        precioUnit: Math.round((r.conPromo / r.cant) * 100) / 100,
        original: Math.round((r.original / r.cant) * 100) / 100,
        nivel: nivelPrecioLabel(form, true, sku),
        conDescuento: true,
        cant: r.cant,
      })
    } else {
      // Solo requerido (no beneficiado): se cobra a precio normal.
      const base = Number(info.precio) || 0
      original += base
      conPromo += base
      lineas.push({
        sku, descripcion: info.descripcion ?? sku,
        precioUnit: base, original: base,
        nivel: "precio 1", conDescuento: false, cant: 1,
      })
    }
  }

  if (original <= 0) return null
  const ahorro = Math.round((original - conPromo) * 100) / 100
  return {
    lineas,
    original: Math.round(original * 100) / 100,
    conPromo: Math.round(conPromo * 100) / 100,
    ahorro,
    pct: original > 0 ? Math.round((ahorro / original) * 100) : 0,
    listo,
    asumeCantidad,
  }
}

/** Texto de ejemplo del ahorro, sobre un precio ficticio de $100. */
function calcularPreview(form) {
  const P = 100
  switch (form.tipo) {
    case "porcentaje": {
      const pct = Number(form.porcentaje)
      if (!pct) return null
      return `un artículo de ${formatMXN(P)} se vende en ${formatMXN(P * (1 - pct / 100))} (ahorras ${formatMXN(P * pct / 100)}).`
    }
    case "nivel_precio":
      return `el artículo se cobra al precio ${form.nivel_precio} en vez de su precio normal.`
    case "nxm": {
      const l = Number(form.nxm_lleva), p = Number(form.nxm_paga)
      if (!(p < l)) return null
      return `llevando ${l} pagas ${p}: ${l - p} gratis (a ${formatMXN(P)} c/u, ahorras ${formatMXN((l - p) * P)}).`
    }
    case "volumen": {
      const min = Number(form.volumen_min), d = Number(form.volumen_desc)
      if (!d) return null
      if (form.volumen_alcance === "excedente")
        return `a partir de la pieza ${min + 1}, cada una con ${d}% de descuento.`
      return `llevando ${min}+ piezas, todas con ${d}% de descuento.`
    }
    default:
      return null
  }
}
