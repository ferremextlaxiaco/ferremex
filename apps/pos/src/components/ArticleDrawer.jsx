import { useState, useEffect, useRef, useMemo } from "react"
import { UNIDADES_SAT, abreviaturaUnidad } from "../lib/unidades-sat"
import { subirImagenArticulo, actualizarCatalogo } from "../lib/client"
import { crearProveedor } from "../lib/proveedores"
import { SelectConOpcion } from "./SelectConOpcion"
import { ProveedorDrawer } from "./ProveedorDrawer"
import ConfirmDialog from "./ConfirmDialog"

function round2(n) { return Math.round(n * 100) / 100 }
// El precio SIN IVA se guarda con 4 decimales para que el CON IVA cierre exacto
// (65/1.16 = 56.0345 → ×1.16 = 65.00). La BD lo soporta (price set en diezmilésimas).
function round4(n) { return Math.round(n * 10000) / 10000 }

function calcCostos(form) {
  const base   = Number(form.precioCompra) || 0
  const factor = Number(form.factor) || 1
  let costoSinIva, costoConIva
  if (form.precioNeto && form.aplicarIva) {
    costoConIva = base
    costoSinIva = round2(base / 1.16)
  } else {
    costoSinIva = base
    costoConIva = form.aplicarIva ? round2(base * 1.16) : base
  }
  const costoCalc = round2(costoSinIva / factor)
  const precio4   = form.aplicarIva ? round2(costoCalc * 1.16) : costoCalc
  return { costoSinIva, costoConIva, costoCalc, precio4 }
}

// El VALOR GUARDADO (`value`) es el precio SIN IVA (base), igual que el Precio de
// Compra. El input MUESTRA el precio CON IVA cuando el artículo aplica IVA (×1.16),
// y al escribir lo convierte de vuelta a s/IVA para guardar. Así el toggle "Aplicar
// IVA" se comporta como el de compra: activado muestra c/IVA, apagado muestra s/IVA.
//
// Separador: type="text" (no "number") porque en number el navegador impone el
// separador del SO (coma en es-MX) y no se puede forzar punto. Con text controlamos
// el formato → siempre PUNTO.
function PrecioRow({ label, required, value, onChange, readOnly, costoCalc, aplicarIva, error }) {
  const sinIva = Number(value) || 0
  // Precio mostrado: con IVA si aplica.
  const conIva = aplicarIva ? round2(sinIva * 1.16) : sinIva
  // Margen sobre el precio s/IVA vs costo s/IVA (sin error de redondeo).
  const margen = readOnly ? 0
    : sinIva > 0 && costoCalc > 0
      ? round2(((sinIva - costoCalc) / sinIva) * 100) : null
  // Estado local del texto mientras se escribe (permite "65", "65.", "65.5").
  const [texto, setTexto] = useState(null)
  const valorMostrado = texto !== null ? texto : (conIva ? String(conIva) : "")
  return (
    <>
      <span className="ar-pr-label">{label}{required ? " *" : ""}</span>
      <input
        type="text" inputMode="decimal" placeholder="0.00"
        className={`ar-input${readOnly ? " ar-input-ro" : ""}${error ? " error" : ""}`}
        value={readOnly ? (conIva ? String(conIva) : "") : valorMostrado}
        readOnly={readOnly} tabIndex={readOnly ? -1 : 0}
        onChange={readOnly ? undefined : (e) => {
          // Limpiar a dígitos + un punto (acepta coma, normaliza a punto).
          let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
          const i = raw.indexOf(".")
          if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
          setTexto(raw)
          // El usuario teclea el precio CON IVA → guardamos SIN IVA con 4 decimales
          // (así el CON IVA reconstruido cierra exacto: 65 → 56.0345 → 65.00).
          const v = Number(raw) || 0
          onChange(raw === "" ? "" : (aplicarIva ? round4(v / 1.16) : round4(v)))
        }}
        onBlur={readOnly ? undefined : () => setTexto(null)}  // re-formatea desde value
      />
      <span className={`ar-pr-pct${margen !== null && margen < 0 ? " neg" : ""}`}>
        {margen !== null ? `${margen.toFixed(1)}%` : "—"}
        {readOnly && <span className="ar-pr-eq">equilibrio</span>}
      </span>
      {error && <p className="ar-error" style={{ gridColumn: "1/-1", margin: 0 }}>{error}</p>}
    </>
  )
}

function UnidadSatSelect({ value, onChange }) {
  return (
    <select
      className="ar-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {UNIDADES_SAT.map((u) => (
        <option key={u.clave} value={u.clave}>
          {u.clave} — {u.nombre}
        </option>
      ))}
    </select>
  )
}

const EMPTY_FORM = {
  clave: "", claveAlterna: "", descripcion: "", marca: "",
  // Proveedor: guardamos AMBOS — el id del catálogo (ferremex_proveedores) para
  // vínculos firmes (pedidos automáticos) y el nombre para mostrar sin consultar.
  proveedor: "", proveedor_id: "",
  categoria: "", departamento: "",
  unidadCompra: "H87", unidadVenta: "H87", factor: 1,
  aplicarIva: true,
  precioCompra: "", precioNeto: false,
  precio1: "", precio2: "", precio3: "", precio4: "",
  claveSat: "",
  inventarioMin: "", inventarioMax: "",
  localizacion: "", peso: "",
  ventaGranel: false, imagenes: [],
  especificaciones: [],
  mayoreoActivo: false, mayoreoMin: "",
  // Artículo especial (a granel): inventario informativo + presentaciones
  // (padre→hijos) + disponibilidad manual. Ver sección "Artículo especial".
  esGranel: false, agotado: false, agotadoBase: false, unidadBase: "H87",
  presentaciones: [],
}

function Toggle({ id, checked, onChange, label }) {
  return (
    <label className="ar-toggle" htmlFor={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`ar-toggle-track${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked) } }}
      >
        <span className="ar-toggle-thumb" />
      </button>
      {label && <span className="ar-toggle-label">{label}</span>}
    </label>
  )
}

function Field({ label, error, children, tooltip }) {
  return (
    <div className="ar-field">
      <label className="ar-label">
        {label}
        {tooltip && (
          <span className="ar-tooltip-icon" title={tooltip}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </span>
        )}
      </label>
      {children}
      {error && <p className="ar-error">{error}</p>}
    </div>
  )
}

export default function ArticleDrawer({ open, mode, article, articles, taxonomy = { depts: [], cats: [], marcas: [] }, proveedores = [], onSave, onClose, getNextClave, saving = false, onCrearPromocion, onRecargarTaxonomia, onRecargarProveedores }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [uploading, setUploading] = useState(0)
  const [proveedorDrawerAbierto, setProveedorDrawerAbierto] = useState(false)
  // Confirmación (estilo POS) al volver un artículo especial a normal con
  // presentaciones cargadas — reemplaza el window.confirm nativo.
  const [confirmVolverNormal, setConfirmVolverNormal] = useState(false)
  const firstInputRef = useRef(null)
  const fileInputRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && article) {
      setForm({
        ...EMPTY_FORM, ...article,
        // precios se guardan s/IVA en DB — se cargan tal cual, PrecioRow convierte al mostrar
        imagenes: article.imagenes?.length > 0
          ? article.imagenes
          : article.thumbnail ? [article.thumbnail] : [],
        // Presentaciones: llegan con precio SIN IVA (como los niveles). El input
        // de precio en la sección granel muestra CON IVA, así que convertimos aquí
        // (×1.16 si aplica) para que al editar se vea el precio de venta real.
        presentaciones: Array.isArray(article.presentaciones)
          ? article.presentaciones.map((p) => ({
              id: p.id,
              nombre: p.nombre ?? "",
              precio: article.aplicarIva ? round2((Number(p.precio) || 0) * 1.16) : round2(Number(p.precio) || 0),
              factor: p.factor == null ? "" : p.factor,
              agotado: !!p.agotado,
            }))
          : [],
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setErrors({})
  }, [open, mode, article])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => firstInputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function f(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
    // Los precios se guardan SIN IVA (base). PrecioRow muestra con IVA cuando
    // aplica, recalculando solo (no hay que tocar los valores al cambiar toggles).
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  // ── Taxonomía Dept→Cat (patrón obligatorio: siempre de listarCatalogos) ──────
  // El form guarda `departamento` y `categoria` como NOMBRES (strings). Las
  // categorías se filtran por el departamento elegido (cats[].depId → depts[].id).
  const deptItem = useMemo(
    () => taxonomy.depts.find((d) => d.nombre === form.departamento) ?? null,
    [taxonomy.depts, form.departamento]
  )
  const catOpts = useMemo(
    () => (deptItem ? taxonomy.cats.filter((c) => c.depId === deptItem.id) : []),
    [taxonomy.cats, deptItem]
  )
  const catItem = useMemo(
    () => catOpts.find((c) => c.nombre === form.categoria) ?? null,
    [catOpts, form.categoria]
  )
  const marcaOpts = useMemo(
    () => (catItem ? taxonomy.marcas.filter((m) => m.catId === catItem.id) : []),
    [taxonomy.marcas, catItem]
  )

  // Al cambiar el departamento, si la categoría actual ya no pertenece a él, se
  // resetea (mismo comportamiento de cascada que FiltroBar/ArticlesModule).
  function cambiarDepartamento(nombreDepto) {
    const nuevoDept = taxonomy.depts.find((d) => d.nombre === nombreDepto) ?? null
    const catSiguePerteneciendo =
      nuevoDept && taxonomy.cats.some((c) => c.depId === nuevoDept.id && c.nombre === form.categoria)
    setForm((prev) => ({
      ...prev,
      departamento: nombreDepto,
      categoria: catSiguePerteneciendo ? prev.categoria : "",
      marca: catSiguePerteneciendo ? prev.marca : "",
    }))
    setErrors((prev) => ({ ...prev, departamento: undefined, categoria: undefined }))
  }

  // Al cambiar la categoría, si la marca actual ya no pertenece a ella, se resetea.
  function cambiarCategoria(nombreCat) {
    const nuevaCat = catOpts.find((c) => c.nombre === nombreCat) ?? null
    const marcaSiguePerteneciendo =
      nuevaCat && taxonomy.marcas.some((m) => m.catId === nuevaCat.id && m.nombre === form.marca)
    setForm((prev) => ({
      ...prev,
      categoria: nombreCat,
      marca: marcaSiguePerteneciendo ? prev.marca : "",
    }))
    setErrors((prev) => ({ ...prev, categoria: undefined }))
  }

  function handleGenerarClave() {
    f("clave", getNextClave(form.categoria, form.departamento))
  }

  function validate() {
    const errs = {}
    const clave = form.clave.trim()
    if (!clave) {
      errs.clave = "La clave es obligatoria"
    } else if (articles.some((a) => a.clave.toLowerCase() === clave.toLowerCase() && a.id !== article?.id)) {
      errs.clave = "Esta clave ya existe. Usa Generar Clave para crear una única."
    }
    if (!form.descripcion.trim()) errs.descripcion = "La descripción es obligatoria"
    // Artículo especial (a granel): el precio de venta lo dan las PRESENTACIONES,
    // así que no exigimos precio1 > 0; en su lugar exigimos ≥1 presentación con
    // nombre y precio válidos.
    if (form.esGranel) {
      const pres = (form.presentaciones ?? []).filter((p) => (p.nombre ?? "").trim() !== "")
      if (pres.length === 0) {
        errs.presentaciones = "Agrega al menos una forma de venta con nombre y precio"
      } else if (pres.some((p) => !(Number(p.precio) > 0))) {
        errs.presentaciones = "Cada forma de venta necesita un precio mayor a 0"
      }
    } else {
      if (!form.precio1 || Number(form.precio1) <= 0) errs.precio1 = "El precio debe ser mayor a 0"
    }
    if (!form.factor || Number(form.factor) <= 0) errs.factor = "El factor debe ser mayor a 0"
    return errs
  }

  // ── Artículo especial (a granel) ─────────────────────────────────────────────
  // Activa/desactiva el modo. Al desactivar con presentaciones cargadas, confirma
  // (con el diálogo estilo POS, no window.confirm) para no perderlas por accidente.
  function toggleEspecial() {
    if (form.esGranel) {
      if ((form.presentaciones?.length ?? 0) > 0) {
        setConfirmVolverNormal(true)   // pide confirmación
        return
      }
      volverANormal()
    } else {
      setForm((prev) => ({
        ...prev,
        esGranel: true,
        // Al convertir, si no hay presentaciones, sembramos una vacía para guiar.
        presentaciones: prev.presentaciones?.length ? prev.presentaciones : [nuevaPresentacion()],
      }))
    }
  }

  // Revierte a artículo normal (quita presentaciones y reactiva el control de stock).
  function volverANormal() {
    setForm((prev) => ({ ...prev, esGranel: false, agotado: false, presentaciones: [] }))
    setConfirmVolverNormal(false)
  }

  function nuevaPresentacion() {
    // id local para keys y para casar la presentación elegida en la venta.
    const rnd = Math.random().toString(36).slice(2, 8)
    return { id: `pr-${rnd}`, nombre: "", precio: "", factor: "", agotado: false }
  }

  function agregarPresentacion() {
    setForm((prev) => ({ ...prev, presentaciones: [...(prev.presentaciones ?? []), nuevaPresentacion()] }))
  }

  function actualizarPresentacion(id, campo, valor) {
    setForm((prev) => ({
      ...prev,
      presentaciones: (prev.presentaciones ?? []).map((p) => (p.id === id ? { ...p, [campo]: valor } : p)),
    }))
  }

  function eliminarPresentacion(id) {
    setForm((prev) => ({ ...prev, presentaciones: (prev.presentaciones ?? []).filter((p) => p.id !== id) }))
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    // Los precios se guardan SIN IVA (base), igual que como entran (PrecioRow ya
    // convirtió de c/IVA a s/IVA al teclear). precio4 = break-even s/IVA (costoCalc).
    const { costoCalc } = calcCostos(form)
    onSave({
      ...form,
      clave: form.clave.trim(),
      descripcion: form.descripcion.trim(),
      factor: Number(form.factor),
      precioCompra: Number(form.precioCompra) || 0,
      precio1: Number(form.precio1) || 0,
      precio2: Number(form.precio2) || 0,
      precio3: Number(form.precio3) || 0,
      precio4: costoCalc,   // break-even s/IVA (se muestra c/IVA en PrecioRow)
      inventarioMin: Number(form.inventarioMin) || 0,
      inventarioMax: Number(form.inventarioMax) || 0,
      peso: Number(form.peso) || 0,
      mayoreoActivo: form.mayoreoActivo,
      mayoreoMin: Number(form.mayoreoMin) || 0,
      // Artículo especial (a granel). Las presentaciones se guardan con precio
      // s/IVA (se muestran c/IVA en la venta) y factor numérico o null.
      esGranel: !!form.esGranel,
      agotado: !!form.agotado,
      agotadoBase: !!form.agotadoBase,
      unidadBase: form.unidadBase || "H87",
      presentaciones: (form.esGranel && Array.isArray(form.presentaciones))
        ? form.presentaciones
            .filter((p) => (p.nombre ?? "").trim() !== "")
            .map((p) => ({
              id: p.id,
              nombre: p.nombre.trim(),
              // Precio capturado CON IVA → guardar SIN IVA (×/1.16) con 4 decimales,
              // igual que los precios de nivel. La venta lo devuelve c/IVA.
              precio: form.aplicarIva ? round4((Number(p.precio) || 0) / 1.16) : round4(Number(p.precio) || 0),
              factor: (p.factor === "" || p.factor == null) ? null : (Number(p.factor) || 0),
              agotado: !!p.agotado,
            }))
        : [],
    })
  }

  return (
    <>
      <div className={`ar-backdrop${open ? " open" : ""}`} onClick={onClose} />

      <div className={`ar-drawer${open ? " open" : ""}`}>
        {/* Header */}
        <div className="ar-drawer-header">
          <span className="ar-drawer-title">
            {mode === "add" ? "Nuevo Artículo" : "Editar Artículo"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Atajo: crear una promoción para este artículo (solo si ya existe). */}
            {mode === "edit" && onCrearPromocion && (
              <button
                type="button"
                className="ar-btn-action"
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => onCrearPromocion({ sku: form.clave, descripcion: form.descripcion })}
                title="Crear una promoción para este artículo"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                Crear promoción
              </button>
            )}
            <button type="button" className="ar-drawer-close" onClick={onClose} aria-label="Cerrar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ar-drawer-body">

          {/* Artículo especial (a granel) — PARTE 1: aviso + disponibilidad.
              Se muestra ARRIBA de todo porque el estado Disponible/Agotado es la
              decisión principal. La configuración (unidad base + formas de venta)
              vive más abajo, entre Mayoreo y Especificaciones. */}
          {form.esGranel && (
            <div className="ar-especial-box">
              <div className="ar-especial-head">
                <span className="ar-especial-badge">✦ Artículo especial</span>
                <span className="ar-especial-hint">
                  Inventario informativo: descuenta un estimado pero <b>nunca bloquea</b> la venta por número.
                  El único bloqueo real es marcarlo <b>Agotado</b>.
                </span>
              </div>

              {/* Disponibilidad del artículo completo (padre). */}
              <div className="ar-especial-estado">
                <Toggle
                  id="ar-agotado"
                  checked={!form.agotado}
                  onChange={(v) => f("agotado", !v)}
                  label={form.agotado ? "🔴 Agotado — no se puede vender" : "🟢 Disponible"}
                />
              </div>
            </div>
          )}

          {/* Identificación */}
          <p className="ar-section-title">Identificación</p>

          <Field label="Descripción" error={errors.descripcion}>
            <input
              ref={firstInputRef}
              type="text" className={`ar-input${errors.descripcion ? " error" : ""}`}
              value={form.descripcion} onChange={(e) => f("descripcion", e.target.value)}
              placeholder="Nombre completo del artículo" />
          </Field>

          <div className="ar-grid-2">
            <Field label="Departamento">
              <SelectConOpcion
                value={form.departamento}
                onChange={cambiarDepartamento}
                options={taxonomy.depts}
                valorActualNoListado={
                  form.departamento && !taxonomy.depts.some((d) => d.nombre === form.departamento)
                    ? form.departamento : null
                }
                onCrear={async (nombre) => {
                  await actualizarCatalogo({ op: "create_dept", nombre })
                  await onRecargarTaxonomia?.()
                }}
              />
            </Field>
            <Field label="Categoría">
              <SelectConOpcion
                value={form.categoria}
                onChange={cambiarCategoria}
                options={catOpts}
                placeholder={form.departamento ? "— Selecciona —" : "Elige departamento primero"}
                disabled={!form.departamento}
                disabledTitle="Selecciona un departamento primero"
                valorActualNoListado={
                  form.categoria && !catOpts.some((c) => c.nombre === form.categoria)
                    ? form.categoria : null
                }
                onCrear={async (nombre) => {
                  await actualizarCatalogo({ op: "create_cat", nombre, dep_nombre: form.departamento })
                  await onRecargarTaxonomia?.()
                }}
              />
            </Field>
          </div>

          {/* Marca y Proveedor en una misma fila (mismo patrón que Depto/Categoría). */}
          <div className="ar-grid-2">
            <Field label="Marca">
              <SelectConOpcion
                value={form.marca}
                onChange={(v) => f("marca", v)}
                options={marcaOpts}
                placeholder={form.categoria ? "— Selecciona —" : "Elige categoría primero"}
                disabled={!form.categoria}
                disabledTitle="Selecciona una categoría primero"
                valorActualNoListado={
                  form.marca && !marcaOpts.some((m) => m.nombre === form.marca)
                    ? form.marca : null
                }
                onCrear={async (nombre) => {
                  await actualizarCatalogo({ op: "create_marca", nombre, cat_nombre: form.categoria, dep_nombre: form.departamento })
                  await onRecargarTaxonomia?.()
                }}
              />
            </Field>

            <Field label="Proveedor">
              <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <select
                  className="ar-input"
                  style={{ flex: 1, minWidth: 0 }}
                  /* El value es el ID del catálogo. Para artículos viejos que solo
                     tienen nombre (sin proveedor_id), caemos a un valor legacy para
                     no perder el dato mientras no se re-elija del catálogo. */
                  value={form.proveedor_id || (form.proveedor ? "__legacy__" : "")}
                  onChange={(e) => {
                    const id = e.target.value
                    if (id === "__legacy__") return // no cambia nada (opción informativa)
                    const prov = proveedores.find((p) => String(p.id) === id)
                    // Guardamos id + nombre a la vez (dual-write).
                    setForm((prev) => ({ ...prev, proveedor_id: id, proveedor: prov?.nombre ?? "" }))
                    setErrors((prev) => ({ ...prev, proveedor: undefined }))
                  }}
                >
                  <option value="">— Selecciona —</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                  {/* Artículo viejo con proveedor en texto libre y sin id: se muestra
                      como "(sin vincular)" hasta que se elija uno del catálogo. */}
                  {!form.proveedor_id && form.proveedor && (
                    <option value="__legacy__">{form.proveedor} (sin vincular)</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => setProveedorDrawerAbierto(true)}
                  title="Crear proveedor nuevo"
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 34, flexShrink: 0, borderRadius: 6, border: "1px solid var(--border, #d1d5db)",
                    background: "rgba(234,88,12,0.08)", color: "#ea580c", cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            </Field>
          </div>

          <Field label="Clave" error={errors.clave}>
            <div className="ar-clave-row">
              <input
                type="text"
                className={`ar-input${errors.clave ? " error" : ""}`}
                value={form.clave}
                onChange={(e) => f("clave", e.target.value)}
                placeholder="Ej: FT0001"
              />
              <button type="button" className="ar-btn-generar" onClick={handleGenerarClave}>
                Generar Clave
              </button>
            </div>
          </Field>

          <Field label="Clave Alterna">
            <input type="text" className="ar-input" value={form.claveAlterna}
              onChange={(e) => f("claveAlterna", e.target.value)}
              placeholder="Código de proveedor u otro" />
          </Field>

          {/* Unidades */}
          <p className="ar-section-title">Unidades</p>

          <div className="ar-grid-3">
            <Field label="U. Compra">
              <UnidadSatSelect value={form.unidadCompra} onChange={(v) => f("unidadCompra", v)} />
            </Field>
            <Field label="U. Venta">
              <UnidadSatSelect value={form.unidadVenta} onChange={(v) => f("unidadVenta", v)} />
            </Field>
            <Field
              label="Factor"
              error={errors.factor}
              tooltip="Unidades de venta por unidad de compra. Ej: 1 Rollo = 50 m"
            >
              <input type="number" min="0.001" step="any"
                className={`ar-input${errors.factor ? " error" : ""}`}
                value={form.factor} onChange={(e) => f("factor", e.target.value)} />
            </Field>
          </div>

          {/* Precios */}
          <p className="ar-section-title">Precios</p>

          {/* Precio de compra + toggles */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
            <div style={{ flex: "0 0 160px" }}>
              <Field label="Precio de Compra">
                {/* type="text" para forzar PUNTO decimal (en number el navegador
                    impone la coma del locale es-MX y no se puede cambiar). */}
                <input type="text" inputMode="decimal" className="ar-input"
                  value={form.precioCompra ?? ""}
                  onChange={(e) => {
                    let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                    const i = raw.indexOf(".")
                    if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
                    f("precioCompra", raw)
                  }}
                  placeholder="0.00" />
              </Field>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "2px" }}>
              <Toggle id="ar-iva" checked={form.aplicarIva} onChange={(v) => f("aplicarIva", v)} label="Aplicar IVA" />
              <Toggle id="ar-neto" checked={form.precioNeto} onChange={(v) => f("precioNeto", v)}
                label="Precio neto (incluye IVA)" />
            </div>
          </div>

          {/* Resumen de costos */}
          {(() => {
            const c = calcCostos(form)
            if (!form.aplicarIva || !Number(form.precioCompra)) return null
            return (
              <div className="ar-costo-resumen">
                <span>Costo s/IVA: <strong>${c.costoSinIva.toFixed(2)}</strong></span>
                <span>Costo c/IVA: <strong>${c.costoConIva.toFixed(2)}</strong></span>
                {Number(form.factor) > 1 && (
                  <span>Por unidad de venta: <strong>${c.costoCalc.toFixed(2)}</strong></span>
                )}
              </div>
            )
          })()}

          {/* Precios de venta */}
          {(() => {
            const c = calcCostos(form)
            return (
              // Un solo grid para header + filas — garantiza alineación perfecta de columnas
              <div className="ar-pr-rows">
                {/* Fila de cabecera dentro del mismo grid */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="ar-label" style={{ margin: 0 }}>Precios de Venta</span>
                  {form.aplicarIva && <span className="ar-iva-badge">c/IVA 16%</span>}
                </div>
                <span />
                <span className="ar-margen-col-header">Margen</span>

                {[1, 2, 3].map((n) => (
                  <PrecioRow key={n}
                    label={`Precio ${n}`} required={n === 1}
                    value={form[`precio${n}`]}
                    onChange={(v) => f(`precio${n}`, v)}
                    costoCalc={c.costoCalc}
                    aplicarIva={form.aplicarIva}
                    error={n === 1 ? errors.precio1 : undefined}
                  />
                ))}
                <PrecioRow key={4}
                  label="Precio 4" value={c.costoCalc}
                  readOnly costoCalc={c.costoCalc} aplicarIva={form.aplicarIva}
                />
              </div>
            )
          })()}

          {/* Fiscal */}
          <p className="ar-section-title">Fiscal</p>

          <Field label="Clave SAT">
            <input type="text" className="ar-input" value={form.claveSat}
              onChange={(e) => f("claveSat", e.target.value)} placeholder="Ej: 31161501" />
          </Field>

          {/* Catálogo */}
          <p className="ar-section-title">Catálogo</p>

          <div className="ar-grid-2">
            <Field label="Inventario Mínimo">
              <input type="number" min="0" className="ar-input" value={form.inventarioMin}
                onChange={(e) => f("inventarioMin", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Inventario Máximo">
              <input type="number" min="0" className="ar-input" value={form.inventarioMax}
                onChange={(e) => f("inventarioMax", e.target.value)} placeholder="0" />
            </Field>
          </div>

          <Field label="Localización">
            <input type="text" className="ar-input" value={form.localizacion}
              onChange={(e) => f("localizacion", e.target.value)} placeholder="Pasillo 3, Estante B" />
          </Field>

          <Field label="Peso (kg)">
            <input type="number" min="0" step="0.001" className="ar-input"
              value={form.peso} onChange={(e) => f("peso", e.target.value)} placeholder="0.000" />
          </Field>

          <Toggle id="ar-granel" checked={form.ventaGranel} onChange={(v) => f("ventaGranel", v)}
            label="Permite cantidades fraccionadas" />

          {/* Precio de mayoreo */}
          <p className="ar-section-title">Mayoreo</p>

          <Toggle id="ar-mayoreo" checked={form.mayoreoActivo} onChange={(v) => f("mayoreoActivo", v)}
            label="Activar precio de mayoreo (Precio 2 automático)" />

          {form.mayoreoActivo && (
            <Field
              label="Cantidad mínima para mayoreo"
              tooltip="A partir de esta cantidad se aplica Precio 2 automáticamente"
            >
              <input
                type="number" min="2" step="1" className="ar-input"
                value={form.mayoreoMin}
                onChange={(e) => f("mayoreoMin", e.target.value)}
                placeholder="Ej: 12"
              />
            </Field>
          )}

          {/* Artículo especial (a granel) — PARTE 2: configuración de venta.
              Unidad base + formas de venta. Vive aquí (entre Mayoreo y
              Especificaciones); el aviso + toggle Disponible/Agotado están arriba. */}
          {form.esGranel && (
            <div className="ar-especial-box">
              {/* Unidad base del inventario informativo. */}
              <Field label="Unidad base del inventario"
                tooltip="La unidad en la que llevas el estimado de existencia (ej. m³). El factor de cada forma de venta equivale a esta unidad.">
                <UnidadSatSelect value={form.unidadBase} onChange={(v) => f("unidadBase", v)} />
              </Field>

              {/* Formas de venta (padre → hijos). */}
              <div className="ar-especial-pres">
                <div className="ar-especial-pres-head">
                  <span className="ar-section-title" style={{ margin: 0 }}>Formas de venta</span>
                  <button type="button" className="ar-btn-action" onClick={agregarPresentacion}>+ Agregar</button>
                </div>

                {/* Forma de venta BASE (el propio artículo): se vende por su Unidad de
                    Venta al Precio 1. No se edita aquí (el precio vive en la sección
                    Precios); solo se puede marcar Agotada por separado. */}
                <div className={`ar-pres-row ar-pres-row--base${form.agotadoBase ? " agotado" : ""}`}>
                  <span className="ar-pres-base-nombre">
                    {abreviaturaUnidad(form.unidadVenta) || "Unidad"}
                    <span className="ar-pres-base-tag">unidad principal</span>
                  </span>
                  <span className="ar-pres-base-precio">
                    ${(() => {
                      const p1 = Number(form.precio1) || 0
                      return (form.aplicarIva ? round2(p1 * 1.16) : p1).toFixed(2)
                    })()}
                  </span>
                  <span className="ar-pres-base-factor">≈ 1 {abreviaturaUnidad(form.unidadBase)}</span>
                  <button
                    type="button"
                    className={`ar-pres-estado${form.agotadoBase ? " off" : " on"}`}
                    title={form.agotadoBase ? "Unidad principal agotada — reactivar" : "Disponible — marcar agotada"}
                    onClick={() => f("agotadoBase", !form.agotadoBase)}
                  >
                    {form.agotadoBase ? "Agotada" : "Disponible"}
                  </button>
                  <span className="ar-pres-del" style={{ visibility: "hidden" }} aria-hidden />
                </div>

                {(form.presentaciones?.length ?? 0) === 0 && (
                  <p className="ar-especial-empty">
                    Agrega otras formas de venta si aplica (ej. Carretilla, Bote).
                  </p>
                )}

                {errors.presentaciones && <p className="ar-error" style={{ margin: 0 }}>{errors.presentaciones}</p>}

                {(form.presentaciones ?? []).map((p) => (
                  <div key={p.id} className={`ar-pres-row${p.agotado ? " agotado" : ""}`}>
                    <input
                      type="text" className="ar-input ar-pres-nombre" placeholder="Nombre (ej. Carretilla)"
                      value={p.nombre} onChange={(e) => actualizarPresentacion(p.id, "nombre", e.target.value)}
                    />
                    <div className="ar-pres-precio">
                      <span className="ar-pres-prefix">$</span>
                      <input
                        type="text" inputMode="decimal" className="ar-input" placeholder="0.00"
                        value={p.precio}
                        onChange={(e) => {
                          let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                          const i = raw.indexOf(".")
                          if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
                          actualizarPresentacion(p.id, "precio", raw)
                        }}
                      />
                    </div>
                    <div className="ar-pres-factor">
                      <span className="ar-pres-approx">≈</span>
                      <input
                        type="text" inputMode="decimal" className="ar-input" placeholder="opcional"
                        title="Equivalencia en la unidad base para el descuento informativo del inventario. Déjalo vacío si no quieres que descuente."
                        value={p.factor}
                        onChange={(e) => {
                          let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
                          const i = raw.indexOf(".")
                          if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
                          actualizarPresentacion(p.id, "factor", raw)
                        }}
                      />
                      <span className="ar-pres-unidad">{abreviaturaUnidad(form.unidadBase)}</span>
                    </div>
                    <button
                      type="button"
                      className={`ar-pres-estado${p.agotado ? " off" : " on"}`}
                      title={p.agotado ? "Marcada como agotada — reactivar" : "Disponible — marcar agotada"}
                      onClick={() => actualizarPresentacion(p.id, "agotado", !p.agotado)}
                    >
                      {p.agotado ? "Agotada" : "Disponible"}
                    </button>
                    <button
                      type="button" className="ar-pres-del" title="Eliminar forma de venta"
                      onClick={() => eliminarPresentacion(p.id)}
                    >🗑</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Especificaciones */}
          <p className="ar-section-title">Especificaciones</p>

          <div className="ar-specs-list">
            {(form.especificaciones || []).map((esp, i) => (
              <div key={i} className="ar-spec-row">
                <input
                  type="text" className="ar-input ar-spec-key"
                  placeholder="Ej: Material"
                  value={esp.clave}
                  onChange={(e) => {
                    const next = [...form.especificaciones]
                    next[i] = { ...next[i], clave: e.target.value }
                    f("especificaciones", next)
                  }}
                />
                <input
                  type="text" className="ar-input ar-spec-val"
                  placeholder="Ej: Acero inoxidable"
                  value={esp.valor}
                  onChange={(e) => {
                    const next = [...form.especificaciones]
                    next[i] = { ...next[i], valor: e.target.value }
                    f("especificaciones", next)
                  }}
                />
                <button
                  type="button" className="ar-spec-remove"
                  onClick={() => f("especificaciones", form.especificaciones.filter((_, j) => j !== i))}
                  title="Quitar">✕</button>
              </div>
            ))}
            <button
              type="button" className="ar-spec-add"
              onClick={() => f("especificaciones", [...(form.especificaciones || []), { clave: "", valor: "" }])}>
              + Agregar especificación
            </button>
          </div>

          {/* Imágenes */}
          <p className="ar-section-title">Imágenes</p>

          <div className="ar-images-row">
            {form.imagenes.length === 0 && (
              <div className="ar-img-placeholder">Sin imagen</div>
            )}
            {form.imagenes.map((src, i) => (
              <div key={i} className="ar-img-thumb">
                <img src={src} alt="" />
                <button
                  type="button"
                  className="ar-img-remove"
                  title="Quitar imagen"
                  onClick={() => f("imagenes", form.imagenes.filter((_, j) => j !== i))}
                >✕</button>
              </div>
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                files.forEach((file) => {
                  setUploading((n) => n + 1)
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const img = new Image()
                    img.onload = () => {
                      // Comprimir con Canvas
                      const MAX = 1200
                      const canvas = document.createElement("canvas")
                      let w = img.width, h = img.height
                      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX } }
                      else       { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX } }
                      canvas.width = w; canvas.height = h
                      canvas.getContext("2d").drawImage(img, 0, 0, w, h)
                      const dataUrl = canvas.toDataURL("image/jpeg", 0.85)

                      // Mostrar preview local inmediatamente — sin esperar al servidor
                      setForm((prev) => ({
                        ...prev,
                        imagenes: [...(prev.imagenes || []), dataUrl],
                      }))

                      // Subir al servidor y reemplazar la preview con la URL real
                      subirImagenArticulo(dataUrl)
                        .then((url) => {
                          setForm((prev) => {
                            const idx = prev.imagenes.indexOf(dataUrl)
                            if (idx === -1) return prev
                            const next = [...prev.imagenes]
                            next[idx] = url
                            return { ...prev, imagenes: next }
                          })
                        })
                        .catch(() => { /* mantiene el base64 como preview */ })
                        .finally(() => setUploading((n) => n - 1))
                    }
                    img.src = ev.target.result
                  }
                  reader.readAsDataURL(file)
                })
                e.target.value = ""
              }}
            />
            <button
              type="button"
              className="ar-btn-add-img"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading > 0}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {uploading > 0 ? "Subiendo…" : "Agregar"}
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="ar-drawer-footer">
          {/* Convertir a / volver de artículo especial (a granel). Vive junto a
              Cancelar/Guardar. Al activar revela la sección de presentaciones. */}
          <button
            type="button"
            className={`ar-btn-especial${form.esGranel ? " on" : ""}`}
            onClick={toggleEspecial}
            title={form.esGranel
              ? "Volver a artículo normal (inventario controlado)"
              : "Convertir en artículo especial: inventario informativo + formas de venta (m³, carretilla, bote…)"}
          >
            {form.esGranel ? "↩ Volver a artículo normal" : "✦ Convertir a artículo especial"}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ar-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ar-btn-save" onClick={handleSave}
            disabled={saving || uploading > 0}
            style={(saving || uploading > 0) ? { opacity: 0.6, cursor: "not-allowed" } : {}}>
            {uploading > 0 ? "Subiendo imágenes…" : saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Alta rápida de proveedor desde el formulario de artículo. */}
      <ProveedorDrawer
        open={proveedorDrawerAbierto}
        mode="add"
        proveedor={null}
        defaultNum=""
        onClose={() => setProveedorDrawerAbierto(false)}
        onSave={async (data) => {
          try {
            const creado = await crearProveedor(data)
            await onRecargarProveedores?.()
            setForm((prev) => ({ ...prev, proveedor_id: creado.id, proveedor: creado.nombre }))
            setErrors((prev) => ({ ...prev, proveedor: undefined }))
            setProveedorDrawerAbierto(false)
          } catch (e) {
            console.error("[ArticleDrawer] crear proveedor:", e)
          }
        }}
      />

      {/* Confirmación (estilo POS) al volver de artículo especial a normal. */}
      <ConfirmDialog
        open={confirmVolverNormal}
        title="Volver a artículo normal"
        message="Se quitarán las formas de venta de este artículo y se reactivará el control de inventario. ¿Continuar?"
        confirmLabel="Volver a normal"
        cancelLabel="Cancelar"
        danger
        onConfirm={volverANormal}
        onClose={() => setConfirmVolverNormal(false)}
      />
    </>
  )
}
