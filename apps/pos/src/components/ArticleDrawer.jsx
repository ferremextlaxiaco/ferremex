import { useState, useEffect, useRef, useMemo } from "react"
import { UNIDADES_SAT } from "../lib/unidades-sat"
import { subirImagenArticulo, actualizarCatalogo } from "../lib/client"
import { crearProveedor } from "../lib/proveedores"
import { SelectConOpcion } from "./SelectConOpcion"
import { ProveedorDrawer } from "./ProveedorDrawer"
import { validarCadena, factorABase } from "../lib/niveles"

function round2(n) { return Math.round(n * 100) / 100 }
// El precio SIN IVA se guarda con 4 decimales para que el CON IVA cierre exacto
// (65/1.16 = 56.0345 → ×1.16 = 65.00). La BD lo soporta (price set en diezmilésimas).
function round4(n) { return Math.round(n * 10000) / 10000 }

// "Precio de Compra" se captura en la unidad del nivel MÁS ALTO de la cadena
// (ej. Bolsa/Caja — lo que el proveedor factura). El "factor" para desglosar
// el costo por unidad base (Pieza) es el producto de los factorDesdeAnterior
// de todos los niveles por encima de la base.
function factorNivelMasAlto(niveles) {
  if (!niveles?.length) return 1
  let f = 1
  for (let i = 1; i < niveles.length; i++) f *= Number(niveles[i].factorDesdeAnterior) || 1
  return f || 1
}

function calcCostos(form) {
  const base   = Number(form.precioCompra) || 0
  const factor = factorNivelMasAlto(form.niveles)
  let costoSinIva, costoConIva
  if (form.precioNeto && form.aplicarIva) {
    costoConIva = base
    costoSinIva = round2(base / 1.16)
  } else {
    costoSinIva = base
    costoConIva = form.aplicarIva ? round2(base * 1.16) : base
  }
  // "Por unidad base" es solo informativo (costo de compra ÷ factor acumulado
  // hasta el nivel más alto de la cadena).
  const costoCalc = round2(costoSinIva / factor)
  const precio4   = costoSinIva
  return { costoSinIva, costoConIva, costoCalc, precio4 }
}

// Costo de 1 unidad de `nivel` (para el % de margen mostrado en su propia
// fila): `costoSinIva` es el costo de 1 unidad de la BASE de inventario
// (Precio de Compra). 1 unidad de `nivel` equivale a `factorABase(nivel)`
// unidades de la base, así que su costo es ese mismo múltiplo. Sin esto, todo
// nivel no-base comparaba su precio contra el costo del nivel MÁS BAJO de la
// cadena (costoCalc) en vez del costo de sí mismo — inflando el margen
// mostrado en cualquier nivel intermedio o igual a la base.
function costoDeNivel(niveles, nivel, costoSinIva) {
  const factor = factorABase(niveles ?? [], nivel.id)
  if (!factor) return costoSinIva
  return round2(costoSinIva * factor)
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

// Fila de precio para la sección "Precios de Venta" (unidad de venta, ej. Metro).
// Muestra el MARGEN real (ganancia vs costo), igual criterio que PrecioRow —
// pero comparado contra `costoCalc` (costo de compra ya convertido a la unidad
// de VENTA, es decir costo de compra ÷ factor), no contra el costo de compra
// directo (que está en otra unidad y no es comparable).
function PrecioVentaRow({ n, value, onChange, aplicarIva, costoCalc, disabled }) {
  const sinIva = Number(value) || 0
  const conIva = aplicarIva ? round2(sinIva * 1.16) : sinIva
  const margen = sinIva > 0 && costoCalc > 0
    ? round2(((sinIva - costoCalc) / sinIva) * 100) : null
  const [texto, setTexto] = useState(null)
  const valorMostrado = texto !== null ? texto : (conIva ? String(conIva) : "")
  return (
    <>
      <span className="ar-pr-label">Precio {n}</span>
      <input
        type="text" inputMode="decimal" placeholder="0.00"
        className={`ar-input${disabled ? " ar-input-ro" : ""}`}
        value={disabled ? "" : valorMostrado}
        disabled={disabled}
        onChange={disabled ? undefined : (e) => {
          let raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "")
          const i = raw.indexOf(".")
          if (i !== -1) raw = raw.slice(0, i + 1) + raw.slice(i + 1).replace(/\./g, "")
          setTexto(raw)
          const v = Number(raw) || 0
          onChange(raw === "" ? "" : (aplicarIva ? round4(v / 1.16) : round4(v)))
        }}
        onBlur={disabled ? undefined : () => setTexto(null)}
      />
      <span className={`ar-pr-pct${margen !== null && margen < 0 ? " neg" : ""}`}>
        {disabled ? "—" : (margen !== null ? `${margen.toFixed(1)}%` : "—")}
      </span>
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
  aplicarIva: true,
  precioCompra: "", precioNeto: false,
  // Cadena de N niveles de unidad (Pieza→Bolsa→Caja…). Reemplaza los campos
  // planos unidadCompra/unidadVenta/factor/precioVenta1-4 — ver lib/niveles.ts.
  // Siempre ≥1 nivel; el primero (índice 0) es la hoja/base de inventario.
  // Se siembra en el useEffect de apertura (necesita un id fresco por instancia).
  niveles: [],
  claveSat: "",
  inventarioMin: "", inventarioMax: "",
  localizacion: "", peso: "",
  ventaGranel: false, imagenes: [],
  especificaciones: [],
  mayoreoActivo: false, mayoreoMin: "",
  // Inventario informativo (antes "artículo especial/granel"): el `agotado`
  // real vive por nivel dentro de `niveles`. `agotadoGlobal` apaga TODO el
  // artículo de un jalón. Ver sección "Unidades".
  inventarioInformativo: false, agotadoGlobal: false,
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
        // Cadena de niveles: usa la ya derivada por el backend (metadata real o
        // shim legacy) — precios ya vienen SIN IVA, como el resto del formulario;
        // PrecioRow los muestra c/IVA. Solo normalizamos null→"" para los inputs.
        niveles: Array.isArray(article.nivelesUnidad) && article.nivelesUnidad.length > 0
          ? article.nivelesUnidad.map((n) => ({
              ...n,
              precio1: n.precio1 ?? "", precio2: n.precio2 ?? "", precio3: n.precio3 ?? "", precio4: n.precio4 ?? "",
              mayoreoMin: n.mayoreoMin ?? "",
              factorDesdeAnterior: n.factorDesdeAnterior ?? null,
              agotado: !!n.agotado,
              esFraccionUnidadBase: !!n.esFraccionUnidadBase,
            }))
          : [nuevoNivel({ esBaseInventario: true, claveUnidadSat: article.unidadVenta || "H87" })],
      })
    } else {
      setForm({ ...EMPTY_FORM, niveles: [nuevoNivel({ esBaseInventario: true })] })
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
    const nivelBase = (form.niveles ?? []).find((n) => n.esBaseInventario)
    if (!nivelBase?.precio1 || Number(nivelBase.precio1) <= 0) {
      errs.precio1 = "El precio del nivel base debe ser mayor a 0"
    }
    const erroresCadena = validarCadena(
      (form.niveles ?? []).map((n) => ({ ...n, factorDesdeAnterior: n.factorDesdeAnterior === "" ? null : Number(n.factorDesdeAnterior) || null }))
    )
    if (erroresCadena.length > 0) errs.niveles = erroresCadena[0]
    return errs
  }

  // ── Cadena de N niveles de unidad (Pieza→Bolsa→Caja…, generaliza U.Compra/
  //    U.Venta/Factor) ─────────────────────────────────────────────────────────
  const MAX_NIVELES = 4

  // Inventario informativo (antes "artículo especial/granel", ej. Arena): el
  // nivel base deja de bloquear por stock real y cada nivel gana su propio
  // Disponible/Agotado manual. Sin confirmación al desactivar — el estado
  // `agotado` de cada nivel simplemente deja de tener efecto (no se borra).
  function toggleInformativo(v) {
    setForm((prev) => ({ ...prev, inventarioInformativo: v }))
  }

  function nuevoNivel(overrides = {}) {
    const rnd = Math.random().toString(36).slice(2, 8)
    return {
      id: `nv-${rnd}`, nombre: "", claveUnidadSat: "H87",
      precio1: "", precio2: "", precio3: "", precio4: "",
      mayoreoActivo: false, mayoreoMin: "",
      factorDesdeAnterior: null, esBaseInventario: false,
      esFraccionUnidadBase: false,
      ...overrides,
    }
  }

  // Agrega un nivel al final de la cadena (ej. de [Pieza,Bolsa] a
  // [Pieza,Bolsa,Caja]). Cuál es la unidad base (con inventario real) NO
  // depende de la posición — se elige aparte con "Usar como base" en cualquier
  // nivel, así que este nuevo nivel puede terminar siendo superior o inferior
  // a la base según el usuario la reasigne después. Precios 1-4 sugeridos =
  // factor × precio del nivel anterior (editables) — ahorra captura manual sin
  // imponer relación exacta.
  function agregarNivel() {
    setForm((prev) => {
      const niveles = prev.niveles ?? []
      if (niveles.length >= MAX_NIVELES) return prev
      const anterior = niveles[niveles.length - 1]
      const factorSugerido = 1
      const preciosSugeridos = {}
      for (const p of ["precio1", "precio2", "precio3", "precio4"]) {
        preciosSugeridos[p] = anterior ? round2((Number(anterior[p]) || 0) * factorSugerido) : ""
      }
      // La unidad SAT del nuevo nivel arranca en la primera que NO esté ya
      // usada en la cadena (evita que dos niveles queden con la misma unidad
      // por accidente cuando son unidades de EMPAQUE distintas — el caso
      // normal, ej. Pieza/Bolsa/Caja). Si el usuario está construyendo una
      // cadena de fracciones de la MISMA unidad real (ej. Arena: Bote/
      // Carretilla/m³, todos "m³"), puede repetirla a mano y marcar el
      // checkbox "Es fracción de la misma unidad" en la tarjeta del nivel.
      const usadas = new Set(niveles.map((n) => n.claveUnidadSat))
      const claveLibre = UNIDADES_SAT.find((u) => !usadas.has(u.clave))?.clave ?? "H87"
      return {
        ...prev,
        niveles: [
          ...niveles,
          nuevoNivel({
            claveUnidadSat: claveLibre,
            factorDesdeAnterior: factorSugerido,
            ...preciosSugeridos,
          }),
        ],
      }
    })
  }

  function actualizarNivel(id, campo, valor) {
    setForm((prev) => ({
      ...prev,
      niveles: (prev.niveles ?? []).map((n) => {
        if (n.id !== id) return n
        const actualizado = { ...n, [campo]: valor }
        // Sugerir precio1-4 al cambiar el factor (siempre que el usuario no los
        // haya tocado ya — heurística simple: cada vez que el factor cambia, se
        // recalculan los 4 en base al nivel inmediato inferior; el usuario puede
        // sobreescribir cualquiera después sin que se vuelva a pisar hasta que
        // el factor cambie de nuevo).
        if (campo === "factorDesdeAnterior") {
          const idx = (prev.niveles ?? []).findIndex((x) => x.id === id)
          const anterior = idx > 0 ? (prev.niveles ?? [])[idx - 1] : null
          if (anterior) {
            const f = Number(valor) || 0
            if (f > 0) {
              for (const p of ["precio1", "precio2", "precio3", "precio4"]) {
                actualizado[p] = round2((Number(anterior[p]) || 0) * f)
              }
            }
          }
        }
        return actualizado
      }),
    }))
  }

  // Marca `id` como el único nivel base de inventario (desmarca los demás).
  function marcarBaseInventario(id) {
    setForm((prev) => ({
      ...prev,
      niveles: (prev.niveles ?? []).map((n) => ({ ...n, esBaseInventario: n.id === id })),
    }))
  }

  function eliminarNivel(id) {
    setForm((prev) => {
      const niveles = (prev.niveles ?? []).filter((n) => n.id !== id)
      if (niveles.length === 0) return prev  // siempre ≥1 nivel
      // Si se eliminó el nivel base, la nueva hoja (índice 0) pasa a serlo.
      if (!niveles.some((n) => n.esBaseInventario)) niveles[0] = { ...niveles[0], esBaseInventario: true }
      // El primer nivel de la cadena nunca lleva factor (es la hoja).
      niveles[0] = { ...niveles[0], factorDesdeAnterior: null }
      return { ...prev, niveles }
    })
  }

  function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    // Normaliza la cadena a números reales (los inputs guardan "" mientras el
    // usuario captura). precio1-4 del nivel base se sobreescriben con el
    // break-even calculado (precio4) igual que el legacy — el resto tal cual.
    const { precio4 } = calcCostos(form)
    const nivelesNorm = (form.niveles ?? []).map((n) => ({
      id: n.id,
      nombre: (n.nombre || "").trim() || n.claveUnidadSat,
      claveUnidadSat: n.claveUnidadSat,
      precio1: Number(n.precio1) || 0,
      precio2: Number(n.precio2) || 0,
      precio3: Number(n.precio3) || 0,
      precio4: n.esBaseInventario ? precio4 : (Number(n.precio4) || 0),
      mayoreoActivo: !!n.mayoreoActivo,
      mayoreoMin: Number(n.mayoreoMin) || 0,
      factorDesdeAnterior: n.factorDesdeAnterior === "" || n.factorDesdeAnterior == null ? null : Number(n.factorDesdeAnterior),
      esBaseInventario: !!n.esBaseInventario,
      agotado: !!n.agotado,
      esFraccionUnidadBase: !!n.esFraccionUnidadBase,
    }))
    const idxBase = nivelesNorm.findIndex((n) => n.esBaseInventario)
    const nivelBase = nivelesNorm[idxBase] ?? nivelesNorm[0]
    // Dual-write de compatibilidad: los consumidores que aún leen los campos
    // legacy (unidadCompra/unidadVenta/factor/precioVenta1-4/precio1-4) siguen
    // funcionando cuando la cadena es EXACTAMENTE 2 niveles con la base en el
    // índice 0 (el caso legacy real) — igual forma que producía el formulario
    // anterior. Cadenas de 3+ niveles no tienen equivalente legacy exacto: los
    // campos quedan en 0/vacíos (nivelesUnidad es la fuente real para ellas).
    const esCasoLegacy2Niveles = nivelesNorm.length === 2 && idxBase === 0
    const nivelSuperior = esCasoLegacy2Niveles ? nivelesNorm[1] : null

    // eslint-disable-next-line no-unused-vars
    const { niveles: _formNiveles, ...formSinNiveles } = form
    onSave({
      ...formSinNiveles,
      clave: form.clave.trim(),
      descripcion: form.descripcion.trim(),
      nivelesUnidad: nivelesNorm,
      unidadVenta: nivelBase.claveUnidadSat,
      unidadCompra: nivelSuperior?.claveUnidadSat ?? nivelBase.claveUnidadSat,
      factor: nivelSuperior?.factorDesdeAnterior ?? 1,
      precioCompra: Number(form.precioCompra) || 0,
      precio1: nivelSuperior ? nivelSuperior.precio1 : nivelBase.precio1,
      precio2: nivelSuperior ? nivelSuperior.precio2 : nivelBase.precio2,
      precio3: nivelSuperior ? nivelSuperior.precio3 : nivelBase.precio3,
      precio4,
      precioVenta1: nivelSuperior ? nivelBase.precio1 : 0,
      precioVenta2: nivelSuperior ? nivelBase.precio2 : 0,
      precioVenta3: nivelSuperior ? nivelBase.precio3 : 0,
      precioVenta4: nivelSuperior ? nivelBase.precio4 : 0,
      margenVenta: 0,
      mayoreoActivo: form.mayoreoActivo,
      mayoreoMin: Number(form.mayoreoMin) || 0,
      inventarioMin: Number(form.inventarioMin) || 0,
      inventarioMax: Number(form.inventarioMax) || 0,
      peso: Number(form.peso) || 0,
      // Inventario informativo (antes "artículo especial/granel"): el `agotado`
      // real ya viaja por nivel dentro de nivelesUnidad (ver nivelesNorm arriba).
      inventarioInformativo: !!form.inventarioInformativo,
      agotadoGlobal: !!form.agotadoGlobal,
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

          {/* Inventario informativo (antes "artículo especial/granel") — aviso +
              disponibilidad global. Se muestra ARRIBA de todo porque el estado
              Disponible/Agotado es la decisión principal. La configuración por
              nivel vive en la sección "Unidades" más abajo. */}
          {form.inventarioInformativo && (
            <div className="ar-especial-box">
              <div className="ar-especial-head">
                <span className="ar-especial-badge">✦ Inventario informativo</span>
                <span className="ar-especial-hint">
                  Descuenta un estimado pero <b>nunca bloquea</b> la venta por número.
                  El bloqueo real es marcarlo <b>Agotado</b> (aquí o por nivel en Unidades).
                </span>
              </div>

              {/* Disponibilidad del artículo completo (apaga TODO de un jalón,
                  independiente del agotado de cada nivel). */}
              <div className="ar-especial-estado">
                <Toggle
                  id="ar-agotado-global"
                  checked={!form.agotadoGlobal}
                  onChange={(v) => f("agotadoGlobal", !v)}
                  label={form.agotadoGlobal ? "🔴 Agotado — no se puede vender" : "🟢 Disponible"}
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
            const factorTope = factorNivelMasAlto(form.niveles)
            if (!form.aplicarIva || !Number(form.precioCompra)) return null
            return (
              <div className="ar-costo-resumen">
                <span>Costo s/IVA: <strong>${c.costoSinIva.toFixed(2)}</strong></span>
                <span>Costo c/IVA: <strong>${c.costoConIva.toFixed(2)}</strong></span>
                {factorTope > 1 && (
                  <span>Por unidad base: <strong>${c.costoCalc.toFixed(2)}</strong></span>
                )}
              </div>
            )
          })()}

          {/* Unidades — cadena de N niveles (Pieza→Bolsa→Caja…). Cada escalón
              tiene su propio precio (Precio 1-4) y su factor respecto al nivel
              INMEDIATO inferior. Exactamente uno es la base de inventario real
              (candado 🔒) — el resto son solo precio + conversión de cantidad. */}
          <p className="ar-section-title">Unidades</p>

          <Toggle
            id="ar-inventario-informativo"
            checked={form.inventarioInformativo}
            onChange={toggleInformativo}
            label="Inventario informativo (ej. Arena: no bloquea por stock, Disponible/Agotado manual por nivel)"
          />

          {errors.niveles && <p className="ar-error" style={{ marginTop: 8, marginBottom: 8 }}>{errors.niveles}</p>}

          {(form.niveles ?? []).map((nivel, idx) => {
            const c = calcCostos(form)
            // Costo de ESTE nivel específico (no el del nivel más bajo de la
            // cadena) — así el % de margen mostrado es real en cada fila, sin
            // importar si el nivel es la base, uno superior o uno inferior.
            const costoEsteNivel = costoDeNivel(form.niveles, nivel, c.costoSinIva)
            const esBase = !!nivel.esBaseInventario
            const esHoja = idx === 0
            // ¿Algún OTRO nivel de la cadena ya usa esta misma unidad SAT? Solo
            // en ese caso mostramos el checkbox "Es fracción de la misma
            // unidad" — evita ensuciar la UI del caso normal (Pieza/Bolsa/Caja,
            // unidades siempre distintas).
            const unidadRepetida = (form.niveles ?? []).some(
              (o) => o.id !== nivel.id && o.claveUnidadSat === nivel.claveUnidadSat
            )
            return (
              <div key={nivel.id} className="ar-nivel-card" style={{
                border: "1px solid var(--border, #d1d5db)", borderRadius: 8,
                padding: "12px", marginBottom: 10,
                background: esBase ? "rgba(234,88,12,0.04)" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="ar-label" style={{ margin: 0, fontWeight: 600 }}>
                    Nivel {idx + 1}{esHoja ? " (unidad más chica de venta)" : ""}
                  </span>
                  {esBase && (
                    <span className="ar-iva-badge" title="Único nivel con inventario/stock real">
                      🔒 Base de inventario
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  {form.inventarioInformativo && (
                    <button
                      type="button"
                      className={`ar-pres-estado${nivel.agotado ? " off" : " on"}`}
                      title={nivel.agotado ? "Nivel agotado — reactivar" : "Disponible — marcar agotado"}
                      onClick={() => actualizarNivel(nivel.id, "agotado", !nivel.agotado)}
                    >
                      {nivel.agotado ? "Agotado" : "Disponible"}
                    </button>
                  )}
                  {!esBase && (
                    <button type="button" className="ar-btn-action"
                      onClick={() => marcarBaseInventario(nivel.id)}
                      title="Hacer de este el nivel con inventario real">
                      Usar como base
                    </button>
                  )}
                  {(form.niveles ?? []).length > 1 && (
                    <button type="button" className="ar-btn-action ar-btn-danger"
                      onClick={() => eliminarNivel(nivel.id)} title="Quitar este nivel">
                      Quitar
                    </button>
                  )}
                </div>

                <div className="ar-grid-2">
                  <Field label="Nombre / Unidad SAT">
                    <UnidadSatSelect
                      value={nivel.claveUnidadSat}
                      onChange={(v) => {
                        actualizarNivel(nivel.id, "claveUnidadSat", v)
                        if (!nivel.nombre?.trim()) actualizarNivel(nivel.id, "nombre", v)
                      }}
                    />
                  </Field>
                  {!esHoja ? (
                    <Field label={`Factor (× ${(form.niveles ?? [])[idx - 1]?.nombre || "nivel anterior"})`}
                      tooltip="Cuántas unidades del nivel anterior componen 1 de este. Ej: 1 Bolsa = 50 Piezas → 50">
                      <input type="number" min="0.001" step="any" className="ar-input"
                        value={nivel.factorDesdeAnterior ?? ""}
                        onChange={(e) => actualizarNivel(nivel.id, "factorDesdeAnterior", e.target.value)} />
                    </Field>
                  ) : <span />}
                </div>

                {/* Solo aparece si esta unidad SAT se repite en otro nivel de la
                    cadena — ej. Arena: Bote/Carretilla/m³ los tres "m³". Marca
                    que NO es un error de captura sino una fracción/múltiplo
                    intencional de la misma unidad real. */}
                {unidadRepetida && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5, color: "var(--muted, #6b7280)" }}>
                      <input
                        type="checkbox"
                        checked={!!nivel.esFraccionUnidadBase}
                        onChange={(e) => actualizarNivel(nivel.id, "esFraccionUnidadBase", e.target.checked)}
                      />
                      Es fracción de la misma unidad (no una unidad de empaque distinta)
                    </label>

                    {/* Como la unidad SAT ya no distingue el nivel (ej. los tres
                        son "m³"), el nombre visible en carrito/ticket/selector
                        necesita una etiqueta propia (ej. "Carretilla", "Bote"). */}
                    {nivel.esFraccionUnidadBase && (
                      <Field label="Etiqueta de este nivel" tooltip="Cómo se muestra en el carrito y el ticket (ej. Carretilla, Bote), ya que la unidad SAT es la misma para varios niveles.">
                        <input
                          type="text" className="ar-input"
                          value={nivel.nombre}
                          placeholder="Ej: Carretilla"
                          onChange={(e) => actualizarNivel(nivel.id, "nombre", e.target.value)}
                        />
                      </Field>
                    )}
                  </>
                )}

                <div className="ar-pr-rows" style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="ar-label" style={{ margin: 0 }}>Precios de Venta</span>
                    {form.aplicarIva && <span className="ar-iva-badge">c/IVA 16%</span>}
                  </div>
                  <span />
                  <span className="ar-margen-col-header">Margen</span>

                  {esBase ? (
                    <>
                      {[1, 2, 3].map((n) => (
                        <PrecioRow key={n}
                          label={`Precio ${n}`} required={n === 1}
                          value={nivel[`precio${n}`]}
                          onChange={(v) => actualizarNivel(nivel.id, `precio${n}`, v)}
                          costoCalc={costoEsteNivel}
                          aplicarIva={form.aplicarIva}
                          error={n === 1 ? errors.precio1 : undefined}
                        />
                      ))}
                      <PrecioRow key={4}
                        label="Precio 4" value={c.precio4}
                        readOnly costoCalc={costoEsteNivel} aplicarIva={form.aplicarIva}
                      />
                    </>
                  ) : (
                    [1, 2, 3, 4].map((n) => (
                      <PrecioRow key={n}
                        label={`Precio ${n}`} required={false}
                        value={nivel[`precio${n}`]}
                        onChange={(v) => actualizarNivel(nivel.id, `precio${n}`, v)}
                        costoCalc={costoEsteNivel}
                        aplicarIva={form.aplicarIva}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {(form.niveles ?? []).length < MAX_NIVELES && (
            <button type="button" className="ar-btn-action" onClick={agregarNivel} style={{ marginBottom: 12 }}>
              + Agregar nivel
            </button>
          )}

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
          {/* Activa/desactiva inventario informativo (antes "artículo especial").
              Vive junto a Cancelar/Guardar; revela el switch global de arriba y
              los botones Disponible/Agotado por nivel en "Unidades". */}
          <button
            type="button"
            className={`ar-btn-especial${form.inventarioInformativo ? " on" : ""}`}
            onClick={() => toggleInformativo(!form.inventarioInformativo)}
            title={form.inventarioInformativo
              ? "Volver a inventario real (bloquea por stock)"
              : "Activar inventario informativo: no bloquea por stock, cada nivel gana un Disponible/Agotado manual (ej. Arena, m³/carretilla/bote)"}
          >
            {form.inventarioInformativo ? "↩ Volver a inventario real" : "✦ Inventario informativo"}
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

    </>
  )
}
