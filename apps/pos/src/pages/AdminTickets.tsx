import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  obtenerTicketConfig,
  guardarTicketConfig,
  migrarTicketConfig,
  type TicketConfig,
} from "../lib/client"
import { usePOS } from "../lib/pos-store"

type TipoTicket = keyof TicketConfig["tipos"]

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
}

export function AdminTickets() {
  const { dispatch } = usePOS()
  const navigate = useNavigate()
  const [config, setConfig] = useState<TicketConfig>(DEFAULT_CONFIG)
  const [tipoActivo, setTipoActivo] = useState<TipoTicket>("venta")
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    obtenerTicketConfig()
      .then((raw) => setConfig(migrarTicketConfig(raw)))
      .catch(() => {})
  }, [])

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
  const tipo = config.tipos[tipoActivo]
  const enc = config.encabezado

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
        </div>

        <div className="at-ticket-doctype">{tipo.titulo}</div>

        <div className="at-preview-stage">
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
            <div className="at-tk-center at-tk-bold">{tipo.titulo || tipoActivo.toUpperCase()}</div>
            <hr className="at-tk-sep-thin" />

            <div className="at-tk-meta">Folio: POS-20260502-DEMO</div>
            <div className="at-tk-meta">Fecha: 02/05/2026 10:32 a.m.</div>
            {config.opciones.mostrar_cajero && <div className="at-tk-meta">Cajero: André</div>}
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
        </div>
      </div>
    </div>
  )
}
