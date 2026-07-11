import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  obtenerTicketConfig,
  guardarTicketConfig,
  migrarTicketConfig,
  obtenerFolioContador,
  reiniciarFolioContador,
  type TicketConfig,
  type FormatoDoc,
} from "../lib/client"
import { usePOS } from "../lib/pos-store"

type TipoTicket = keyof TicketConfig["tipos"]
// El preview admite además los dos comprobantes de entrega (venta contra entrega),
// que NO viven en config.tipos sino en config.formatos. Se editan en el módulo de
// Formatos; aquí solo se previsualizan junto a los tickets normales.
type PreviewTab = TipoTicket | "entrega_cliente" | "entrega_repartidor"

const TIPOS: { key: TipoTicket; label: string }[] = [
  { key: "venta", label: "Venta" },
  { key: "cotizacion", label: "Cotización" },
  { key: "cancelacion", label: "Cancelación" },
  { key: "nota_credito", label: "Nota de crédito" },
]

const ITEMS_EJEMPLO = [
  { descripcion: 'Tornillo 1/4" x 1" zincado', sku: "TOR-001", cantidad: 3, precio_unitario: 4.5, subtotal: 13.5 },
  { descripcion: "Cable THW calibre 12 negro", sku: "CAB-012", cantidad: 1, precio_unitario: 85.0, subtotal: 85.0 },
  { descripcion: "Foco LED 9W luz blanca", sku: "FOC-009", cantidad: 2, precio_unitario: 45.0, subtotal: 90.0 },
]

const DEFAULT_CONFIG: TicketConfig = {
  encabezado: {
    logo: null,
    nombre: "FERREMEX",
    direccion: "Av. Independencia 145, Tlaxiaco, Oaxaca",
    telefono: "(953) 555-0000",
    email: "",
    rfc: "",
  },
  pie: ["¡Gracias por su compra!", "Conserve su ticket"],
  opciones: { mostrar_sku: false, mostrar_cajero: true, mostrar_turno: false },
  tipos: {
    venta: { titulo: "COMPROBANTE DE VENTA", activo: true },
    cotizacion: { titulo: "COTIZACIÓN", activo: true },
    cancelacion: { titulo: "CANCELACIÓN", activo: true },
    nota_credito: { titulo: "NOTA DE CRÉDITO", activo: true },
  },
  formato_folio: { modo: "fecha", prefijo: "", digitos: 4 },
}

export function AdminTickets() {
  const { dispatch } = usePOS()
  const navigate = useNavigate()
  const [config, setConfig] = useState<TicketConfig>(DEFAULT_CONFIG)
  const [tipoActivo, setTipoActivo] = useState<PreviewTab>("venta")
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contador, setContador] = useState<number | null>(null)
  const [reseteando, setReseteando] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obtenerTicketConfig()
      .then((raw) => setConfig(migrarTicketConfig(raw)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (config.formato_folio?.modo === "secuencial") {
      obtenerFolioContador().then(setContador).catch(() => setContador(0))
    }
  }, [config.formato_folio?.modo])

  /* ── Logo ──────────────────────────────────────────────────────── */
  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () =>
      setEnc("logo", reader.result as string)
    reader.readAsDataURL(f)
  }

  /* ── Encabezado ────────────────────────────────────────────────── */
  function setEnc<K extends keyof TicketConfig["encabezado"]>(campo: K, valor: TicketConfig["encabezado"][K]) {
    setConfig((c) => ({ ...c, encabezado: { ...c.encabezado, [campo]: valor } }))
  }

  /* ── Pie ───────────────────────────────────────────────────────── */
  function setPie(idx: number, valor: string) {
    setConfig((c) => { const pie = [...c.pie]; pie[idx] = valor; return { ...c, pie } })
  }
  function agregarLineaPie() {
    if (config.pie.length >= 4) return
    setConfig((c) => ({ ...c, pie: [...c.pie, ""] }))
  }
  function quitarLineaPie(idx: number) {
    setConfig((c) => ({ ...c, pie: c.pie.filter((_, i) => i !== idx) }))
  }

  /* ── Opciones ──────────────────────────────────────────────────── */
  function setOpcion(campo: keyof TicketConfig["opciones"], valor: boolean) {
    setConfig((c) => ({ ...c, opciones: { ...c.opciones, [campo]: valor } }))
  }

  /* ── Formato folio ─────────────────────────────────────────────── */
  function setFormatoFolio<K extends keyof NonNullable<TicketConfig["formato_folio"]>>(
    campo: K, valor: NonNullable<TicketConfig["formato_folio"]>[K]
  ) {
    setConfig((c) => ({
      ...c,
      formato_folio: { ...(c.formato_folio ?? DEFAULT_CONFIG.formato_folio!), [campo]: valor },
    }))
  }

  async function handleResetContador() {
    setReseteando(true)
    try {
      await reiniciarFolioContador()
      setContador(0)
      setResetConfirm(false)
    } catch { /* noop */ } finally {
      setReseteando(false)
    }
  }

  /* ── Tipos ─────────────────────────────────────────────────────── */
  function setTipoTitulo(tipo: TipoTicket, titulo: string) {
    setConfig((c) => ({ ...c, tipos: { ...c.tipos, [tipo]: { ...c.tipos[tipo], titulo } } }))
  }
  function setTipoHabilitado(tipo: TipoTicket, activo: boolean) {
    setConfig((c) => ({ ...c, tipos: { ...c.tipos, [tipo]: { ...c.tipos[tipo], activo } } }))
  }

  /* ── Guardar ───────────────────────────────────────────────────── */
  async function handleGuardar() {
    setGuardando(true)
    setError(null)
    try {
      const saved = await guardarTicketConfig(config)
      setConfig(migrarTicketConfig(saved))
      dispatch({ type: "SET_TICKET_CONFIG", config: saved })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } catch {
      setError("Error al guardar la configuración")
    } finally {
      setGuardando(false)
    }
  }

  const total = ITEMS_EJEMPLO.reduce((s, i) => s + i.subtotal, 0)
  const esEntrega = tipoActivo === "entrega_cliente" || tipoActivo === "entrega_repartidor"
  const docEntrega = esEntrega ? config.formatos?.[tipoActivo] : undefined
  // Título mostrado en el encabezado del preview (tipos normales vs. formatos de entrega).
  const tituloPreview = esEntrega
    ? (docEntrega?.titulo || (tipoActivo === "entrega_cliente" ? "PAGO CONTRA ENTREGA" : "HOJA DE ENTREGA"))
    : config.tipos[tipoActivo as TipoTicket].titulo
  const enc = config.encabezado
  const fmt = config.formato_folio ?? DEFAULT_CONFIG.formato_folio!
  const previewFolio = fmt.modo === "secuencial"
    ? `${fmt.prefijo}${((contador ?? 0) + 1).toString().padStart(fmt.digitos, "0")}`
    : "POS-20260502-DEMO"

  return (
    <div className="at-root">
      {/* ── Columna izquierda: configuración ─────────────────────── */}
      <div className="at-col at-form-col">
        <div className="at-col-header">
          <h2 className="at-col-title">Configuración de tickets</h2>
          <p className="at-col-subtitle">Define qué se imprime en cada comprobante</p>
        </div>

        {/* Logo */}
        <div className="at-group">
          <div className="at-group-label">Logo del negocio</div>
          <div className="at-logo-row">
            <div className="at-logo-preview">
              {enc.logo
                ? <img src={enc.logo} alt="logo" />
                : <div className="at-logo-empty"><span>🏪</span>Sin logo</div>}
            </div>
            <div className="at-logo-actions">
              <p className="at-logo-help">PNG o JPG, máx 120px de ancho en el ticket impreso.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="at-btn-upload" onClick={() => fileRef.current?.click()}>📤 Subir logo</button>
                {enc.logo && (
                  <button className="at-btn-link" onClick={() => setEnc("logo", null)}>Quitar</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoFile} />
            </div>
          </div>
        </div>

        {/* Datos del negocio */}
        <div className="at-group">
          <div className="at-group-label">Datos del negocio</div>
          <div className="at-field">
            <label className="at-label">Nombre del negocio</label>
            <input className="at-input" value={enc.nombre} onChange={(e) => setEnc("nombre", e.target.value)} />
          </div>
          <div className="at-field">
            <label className="at-label">Dirección</label>
            <input className="at-input" value={enc.direccion} onChange={(e) => setEnc("direccion", e.target.value)} />
          </div>
          <div className="at-grid-2">
            <div className="at-field">
              <label className="at-label">Teléfono</label>
              <input className="at-input" value={enc.telefono} onChange={(e) => setEnc("telefono", e.target.value)} />
            </div>
            <div className="at-field">
              <label className="at-label">RFC (opcional)</label>
              <input className="at-input" value={enc.rfc} placeholder="Dejar vacío si no aplica" onChange={(e) => setEnc("rfc", e.target.value)} />
            </div>
          </div>
          <div className="at-field">
            <label className="at-label">Email (opcional)</label>
            <input className="at-input" value={enc.email} placeholder="ventas@ferremex.com" onChange={(e) => setEnc("email", e.target.value)} />
          </div>
        </div>

        {/* Pie de página */}
        <div className="at-group">
          <div className="at-group-label">Pie de página</div>
          {config.pie.map((linea, i) => (
            <div key={i} className="at-field">
              <div className="at-input-row">
                <input className="at-input" value={linea} placeholder={`Línea ${i + 1}`} onChange={(e) => setPie(i, e.target.value)} />
                <button className="at-btn-remove" onClick={() => quitarLineaPie(i)}>✕</button>
              </div>
            </div>
          ))}
          {config.pie.length < 4 && (
            <button className="at-btn-add" onClick={agregarLineaPie}>+ Agregar línea</button>
          )}
        </div>

        {/* Opciones */}
        <div className="at-group">
          <div className="at-group-label">Opciones</div>
          {([
            ["mostrar_cajero", "Mostrar nombre del cajero"],
            ["mostrar_sku", "Mostrar código SKU de productos"],
            ["mostrar_turno", "Mostrar ID de turno"],
          ] as [keyof TicketConfig["opciones"], string][]).map(([campo, label]) => (
            <label key={campo} className="at-check-row">
              <span className={`at-check ${config.opciones[campo] ? "at-checked" : ""}`} />
              <input
                type="checkbox"
                checked={config.opciones[campo]}
                onChange={(e) => setOpcion(campo, e.target.checked)}
                style={{ display: "none" }}
              />
              {label}
            </label>
          ))}
        </div>

        {/* Tipos de ticket */}
        <div className="at-group">
          <div className="at-group-label">Tipos de ticket</div>
          {TIPOS.map(({ key, label }) => (
            <div key={key} className="at-tipo-row">
              <label className="at-check-row" style={{ minWidth: 140 }}>
                <span className={`at-check ${config.tipos[key].activo ? "at-checked" : ""}`} />
                <input
                  type="checkbox"
                  checked={config.tipos[key].activo}
                  onChange={(e) => setTipoHabilitado(key, e.target.checked)}
                  style={{ display: "none" }}
                />
                {label}
              </label>
              <input
                className="at-input"
                value={config.tipos[key].titulo}
                disabled={!config.tipos[key].activo}
                onChange={(e) => setTipoTitulo(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        {/* Numeración de tickets */}
        <div className="at-group">
          <div className="at-group-label">Numeración de tickets</div>

          {/* Selector de modo */}
          <div style={{ display: "flex", gap: 0, marginBottom: 14, border: "1px solid var(--border, #e4e4e7)", borderRadius: 7, overflow: "hidden" }}>
            {([["fecha", "Folio con fecha"], ["secuencial", "Secuencial"]] as const).map(([modo, label]) => (
              <button
                key={modo}
                onClick={() => setFormatoFolio("modo", modo)}
                style={{
                  flex: 1, padding: "7px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: fmt.modo === modo ? 700 : 400,
                  background: fmt.modo === modo ? "var(--orange, #F96302)" : "transparent",
                  color: fmt.modo === modo ? "#fff" : "var(--text, #18181b)",
                  transition: "background 0.15s, color 0.15s",
                }}
              >{label}</button>
            ))}
          </div>

          {fmt.modo === "fecha" ? (
            <p className="at-col-subtitle" style={{ margin: 0 }}>
              Ejemplo: <strong>POS-20260525-A3F2</strong> — incluye fecha y código aleatorio.
            </p>
          ) : (
            <>
              <div className="at-grid-2">
                <div className="at-field">
                  <label className="at-label">Prefijo (opcional)</label>
                  <input
                    className="at-input"
                    value={fmt.prefijo}
                    placeholder='Ej: TCK, T-, ""'
                    maxLength={10}
                    onChange={(e) => setFormatoFolio("prefijo", e.target.value)}
                  />
                </div>
                <div className="at-field">
                  <label className="at-label">Dígitos del número</label>
                  <div style={{ display: "flex", gap: 0, border: "1px solid var(--border, #e4e4e7)", borderRadius: 7, overflow: "hidden" }}>
                    {([2, 3, 4, 5] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setFormatoFolio("digitos", d)}
                        style={{
                          flex: 1, padding: "7px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: fmt.digitos === d ? 700 : 400,
                          background: fmt.digitos === d ? "var(--orange, #F96302)" : "transparent",
                          color: fmt.digitos === d ? "#fff" : "var(--text, #18181b)",
                          transition: "background 0.15s, color 0.15s",
                        }}
                      >{d}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--panel-bg, #f4f4f5)", borderRadius: 7, padding: "10px 14px", marginBottom: 10 }}>
                <p className="at-label" style={{ marginBottom: 4 }}>Vista previa del próximo folio</p>
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1, color: "var(--orange, #F96302)" }}>
                  {previewFolio}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="at-col-subtitle" style={{ margin: 0 }}>
                  Contador actual: <strong>{contador ?? "…"}</strong>
                </span>
                {resetConfirm ? (
                  <>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>¿Reiniciar a 0?</span>
                    <button
                      className="at-btn-link"
                      style={{ color: "#dc2626", fontWeight: 700 }}
                      onClick={handleResetContador}
                      disabled={reseteando}
                    >{reseteando ? "Reiniciando…" : "Sí, reiniciar"}</button>
                    <button className="at-btn-link" onClick={() => setResetConfirm(false)}>Cancelar</button>
                  </>
                ) : (
                  <button className="at-btn-link" onClick={() => setResetConfirm(true)}>
                    Reiniciar contador
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Generador de tickets */}
        <div className="at-group at-generador-cta">
          <div className="at-group-label">Generador de tickets</div>
          <p className="at-col-subtitle" style={{ marginBottom: 10 }}>
            Genera tickets personalizados con productos, impuestos y métodos de pago.
          </p>
          <button className="at-btn-generador" onClick={() => navigate("/admin/generador")}>
            🧾 Abrir generador de tickets
          </button>
        </div>

        {error && <p className="at-error">{error}</p>}

        <button className="at-btn-guardar" onClick={handleGuardar} disabled={guardando}>
          {guardado ? "✓ Guardado" : guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {/* ── Columna derecha: vista previa ─────────────────────────── */}
      <div className="at-col at-preview-col">
        <div className="at-col-header">
          <h2 className="at-col-title">Vista previa</h2>
          <p className="at-col-subtitle">Así se verá el ticket impreso (80mm)</p>
        </div>

        <div className="at-preview-tabs">
          {TIPOS.filter((t) => config.tipos[t.key].activo).map(({ key, label }) => (
            <button
              key={key}
              className={`at-preview-tab ${tipoActivo === key ? "at-tab-active" : ""}`}
              onClick={() => setTipoActivo(key)}
            >
              {label}
            </button>
          ))}
          {/* Comprobantes de venta contra entrega (se editan en el módulo Formatos) */}
          {([
            ["entrega_cliente", "Entrega · Cliente"],
            ["entrega_repartidor", "Entrega · Repartidor"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={`at-preview-tab ${tipoActivo === key ? "at-tab-active" : ""}`}
              onClick={() => setTipoActivo(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="at-ticket-doctype">{tituloPreview}</div>

        <div className="at-preview-stage">
          {esEntrega && docEntrega ? (
            <PreviewEntrega
              tab={tipoActivo as "entrega_cliente" | "entrega_repartidor"}
              doc={docEntrega}
              nombre={enc.nombre}
              logo={enc.logo}
              folio={previewFolio}
              total={total}
              items={ITEMS_EJEMPLO}
            />
          ) : (
          <div className="at-ticket">
            {/* Logo */}
            <div className="at-tk-logo">
              {enc.logo
                ? <img src={enc.logo} alt="logo" style={{ maxWidth: 120, maxHeight: 60 }} />
                : <div className="at-tk-logo-placeholder">[ LOGO ]</div>}
            </div>

            <div className="at-tk-center at-tk-bold at-tk-business">{enc.nombre || "NEGOCIO"}</div>
            {enc.direccion && <div className="at-tk-center at-tk-meta">{enc.direccion}</div>}
            {enc.telefono && <div className="at-tk-center at-tk-meta">Tel: {enc.telefono}</div>}
            {enc.email && <div className="at-tk-center at-tk-meta">{enc.email}</div>}
            {enc.rfc && <div className="at-tk-center at-tk-meta">RFC: {enc.rfc}</div>}

            <hr className="at-tk-sep" />
            <div className="at-tk-center at-tk-bold">{tituloPreview || tipoActivo.toUpperCase()}</div>
            <hr className="at-tk-sep-thin" />

            <div className="at-tk-meta">Folio: {previewFolio}</div>
            <div className="at-tk-meta">Fecha: 02/05/2026 10:32 a.m.</div>
            {config.opciones.mostrar_cajero && <div className="at-tk-meta">Cajero: Andrés</div>}
            {config.opciones.mostrar_turno && <div className="at-tk-meta">Turno: 2026-05-02-m</div>}

            <hr className="at-tk-sep" />

            <table className="at-tk-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className="num">Cant.</th>
                  <th className="num">P.U.</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS_EJEMPLO.map((item, i) => (
                  <tr key={i}>
                    <td>
                      {item.descripcion}
                      {config.opciones.mostrar_sku && (
                        <div className="at-tk-sku">{item.sku}</div>
                      )}
                    </td>
                    <td className="num">{item.cantidad}</td>
                    <td className="num">${item.precio_unitario.toFixed(2)}</td>
                    <td className="num">${item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="at-tk-sep" />

            <div className="at-tk-totales">
              <div className="at-tk-row at-tk-total"><span>TOTAL</span><span>${total.toFixed(2)}</span></div>
              <div className="at-tk-row"><span>Efectivo</span><span>$300.00</span></div>
              <div className="at-tk-row"><span>Cambio</span><span>${(300 - total).toFixed(2)}</span></div>
            </div>

            <hr className="at-tk-sep" />

            {config.pie.filter(Boolean).map((linea, i) => (
              <div key={i} className="at-tk-footer">{linea}</div>
            ))}
          </div>
          )}
        </div>

        {esEntrega && (
          <p className="at-col-subtitle" style={{ marginTop: 10 }}>
            Este formato se edita en <strong>Formatos → {tipoActivo === "entrega_cliente" ? "Entrega · Cliente" : "Entrega · Repartidor"}</strong>. Aquí solo se previsualiza.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Preview de los comprobantes de venta contra entrega (cliente / repartidor).
 * Refleja lo que imprime TicketsEntrega, con datos de ejemplo. El repartidor
 * muestra la ficha de entrega (si mostrar_ficha) y casillas ☐ por artículo (si
 * mostrar_casillas); el cliente muestra el detalle con total y el sello del pie.
 */
function PreviewEntrega({
  tab, doc, nombre, logo, folio, total, items,
}: {
  tab: "entrega_cliente" | "entrega_repartidor"
  doc: FormatoDoc
  nombre: string
  logo: string | null
  folio: string
  total: number
  items: { descripcion: string; sku: string; cantidad: number; precio_unitario: number; subtotal: number }[]
}) {
  const esRepartidor = tab === "entrega_repartidor"
  const extras = (doc.encabezado ?? []).slice(1) // la 1ª línea = nombre del negocio
  const conFicha = esRepartidor && doc.mostrar_ficha !== false
  const conCasillas = esRepartidor && doc.mostrar_casillas !== false

  return (
    <div className="at-ticket">
      {/* Logo */}
      <div className="at-tk-logo">
        {logo
          ? <img src={logo} alt="logo" style={{ maxWidth: 120, maxHeight: 60 }} />
          : <div className="at-tk-logo-placeholder">[ LOGO ]</div>}
      </div>

      <div className="at-tk-center at-tk-bold at-tk-business">{nombre || "NEGOCIO"}</div>
      {extras.map((l, i) => <div key={i} className="at-tk-center at-tk-meta">{l}</div>)}

      <hr className="at-tk-sep" />
      <div className="at-tk-center at-tk-bold">{doc.titulo || (esRepartidor ? "HOJA DE ENTREGA" : "PAGO CONTRA ENTREGA")}</div>
      {/* Etiqueta de a quién pertenece la copia. */}
      <div className="at-tk-center at-tk-meta">{esRepartidor ? "REPARTIDOR" : "CLIENTE"}</div>
      <hr className="at-tk-sep-thin" />

      <div className="at-tk-meta">Folio: {folio}</div>
      <div className="at-tk-meta">Fecha: 02/05/2026 10:32 a.m.</div>

      {/* CLIENTE: quién paga. REPARTIDOR: ficha de entrega completa. */}
      {!esRepartidor && <div className="at-tk-meta">Paga: El maistro</div>}
      {conFicha && (
        <>
          <hr className="at-tk-sep" />
          <div className="at-tk-bold">ENTREGA</div>
          <div className="at-tk-meta">Dirección: Privada las golondrinas</div>
          <div className="at-tk-meta">Recibe: El maistro · 953 123 4567</div>
          <div className="at-tk-meta">Paga: El maistro · 953 123 4567</div>
          <div className="at-tk-meta">Ref: Casa de un piso, portón azul</div>
        </>
      )}

      <hr className="at-tk-sep" />

      {esRepartidor ? (
        /* Lista de artículos con casillas, sin precios */
        <>
          <div className="at-tk-bold" style={{ marginBottom: 4 }}>ARTÍCULOS A ENTREGAR</div>
          {items.map((item, i) => (
            <div key={i} className="at-tk-meta">
              {conCasillas ? "☐ " : ""}{item.cantidad} × {item.descripcion}
            </div>
          ))}
        </>
      ) : (
        /* Tabla de detalle con precios */
        <table className="at-tk-table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="num">Cant.</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{item.descripcion}</td>
                <td className="num">{item.cantidad}</td>
                <td className="num">${item.subtotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <hr className="at-tk-sep" />

      <div className="at-tk-totales">
        <div className="at-tk-row at-tk-total">
          <span>{esRepartidor ? "COBRAR" : "TOTAL A PAGAR"}</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      <hr className="at-tk-sep" />

      {/* Firmas solo en la hoja del repartidor */}
      {esRepartidor && (
        <>
          <div className="at-tk-meta">Recibí conforme:</div>
          <div className="at-tk-meta">_______________________</div>
          <div className="at-tk-meta" style={{ marginTop: 6 }}>Pagó:</div>
          <div className="at-tk-meta">_______________________</div>
          <hr className="at-tk-sep" />
        </>
      )}

      {(doc.pie ?? []).filter(Boolean).map((linea, i) => (
        <div key={i} className="at-tk-footer">{linea}</div>
      ))}
    </div>
  )
}
