import { useEffect, useState } from "react"
import { obtenerTicketConfig, guardarTicketConfig, type TicketConfig } from "../lib/client"
import { usePOS } from "../lib/pos-store"

type TipoTicket = keyof TicketConfig["tipos"]

const TIPOS: { key: TipoTicket; label: string }[] = [
  { key: "venta", label: "Venta" },
  { key: "cotizacion", label: "Cotización" },
  { key: "cancelacion", label: "Cancelación" },
  { key: "nota_credito", label: "Nota de crédito" },
]

const ITEMS_EJEMPLO = [
  { descripcion: "Tornillo 1/4\" x 1\" zincado", sku: "TOR-001", cantidad: 3, precio_unitario: 4.50, subtotal: 13.50 },
  { descripcion: "Cable THW calibre 12 negro", sku: "CAB-012", cantidad: 1, precio_unitario: 85.00, subtotal: 85.00 },
  { descripcion: "Foco LED 9W luz blanca", sku: "FOC-009", cantidad: 2, precio_unitario: 45.00, subtotal: 90.00 },
]

const DEFAULT_CONFIG: TicketConfig = {
  encabezado: { nombre: "FERREMEX", linea2: "Tlaxiaco, Oaxaca", linea3: "Tel: (953) 555-0000", rfc: "" },
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
  const [config, setConfig] = useState<TicketConfig>(DEFAULT_CONFIG)
  const [tipoActivo, setTipoActivo] = useState<TipoTicket>("venta")
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerTicketConfig().then(setConfig).catch(() => {})
  }, [])

  function setEncabezado(campo: keyof TicketConfig["encabezado"], valor: string) {
    setConfig((c) => ({ ...c, encabezado: { ...c.encabezado, [campo]: valor } }))
  }

  function setPie(idx: number, valor: string) {
    setConfig((c) => {
      const pie = [...c.pie]
      pie[idx] = valor
      return { ...c, pie }
    })
  }

  function agregarLineaPie() {
    if (config.pie.length >= 4) return
    setConfig((c) => ({ ...c, pie: [...c.pie, ""] }))
  }

  function quitarLineaPie(idx: number) {
    setConfig((c) => ({ ...c, pie: c.pie.filter((_, i) => i !== idx) }))
  }

  function setOpcion(campo: keyof TicketConfig["opciones"], valor: boolean) {
    setConfig((c) => ({ ...c, opciones: { ...c.opciones, [campo]: valor } }))
  }

  function setTipoTitulo(tipo: TipoTicket, titulo: string) {
    setConfig((c) => ({
      ...c,
      tipos: { ...c.tipos, [tipo]: { ...c.tipos[tipo], titulo } },
    }))
  }

  function setTipoActivo2(tipo: TipoTicket, activo: boolean) {
    setConfig((c) => ({
      ...c,
      tipos: { ...c.tipos, [tipo]: { ...c.tipos[tipo], activo } },
    }))
  }

  async function handleGuardar() {
    setGuardando(true)
    setError(null)
    try {
      const saved = await guardarTicketConfig(config)
      setConfig(saved)
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

  return (
    <div className="admin-tickets">
      <div className="admin-tickets-editor">
        <h2 className="admin-seccion-titulo">Configuración de tickets</h2>

        {/* Encabezado */}
        <section className="admin-grupo">
          <h3 className="admin-grupo-titulo">Encabezado</h3>
          <div className="admin-campo">
            <label>Nombre del negocio</label>
            <input value={config.encabezado.nombre} onChange={(e) => setEncabezado("nombre", e.target.value)} />
          </div>
          <div className="admin-campo">
            <label>Segunda línea (dirección)</label>
            <input value={config.encabezado.linea2} onChange={(e) => setEncabezado("linea2", e.target.value)} />
          </div>
          <div className="admin-campo">
            <label>Tercera línea (teléfono / email)</label>
            <input value={config.encabezado.linea3} onChange={(e) => setEncabezado("linea3", e.target.value)} />
          </div>
          <div className="admin-campo">
            <label>RFC (opcional)</label>
            <input value={config.encabezado.rfc} onChange={(e) => setEncabezado("rfc", e.target.value)} placeholder="Dejar vacío si no aplica" />
          </div>
        </section>

        {/* Pie de página */}
        <section className="admin-grupo">
          <h3 className="admin-grupo-titulo">Pie de página</h3>
          {config.pie.map((linea, i) => (
            <div key={i} className="admin-campo admin-campo-row">
              <input value={linea} onChange={(e) => setPie(i, e.target.value)} placeholder={`Línea ${i + 1}`} />
              <button className="btn-icono-danger" onClick={() => quitarLineaPie(i)} title="Eliminar línea">✕</button>
            </div>
          ))}
          {config.pie.length < 4 && (
            <button className="btn-ghost btn-sm" onClick={agregarLineaPie}>+ Agregar línea</button>
          )}
        </section>

        {/* Opciones */}
        <section className="admin-grupo">
          <h3 className="admin-grupo-titulo">Opciones</h3>
          {([
            ["mostrar_cajero", "Mostrar nombre del cajero"],
            ["mostrar_sku", "Mostrar código SKU de productos"],
            ["mostrar_turno", "Mostrar ID de turno"],
          ] as [keyof TicketConfig["opciones"], string][]).map(([campo, label]) => (
            <label key={campo} className="admin-toggle">
              <input type="checkbox" checked={config.opciones[campo]} onChange={(e) => setOpcion(campo, e.target.checked)} />
              <span>{label}</span>
            </label>
          ))}
        </section>

        {/* Tipos de ticket */}
        <section className="admin-grupo">
          <h3 className="admin-grupo-titulo">Tipos de ticket</h3>
          {TIPOS.map(({ key, label }) => (
            <div key={key} className="admin-tipo-fila">
              <label className="admin-toggle">
                <input type="checkbox" checked={config.tipos[key].activo} onChange={(e) => setTipoActivo2(key, e.target.checked)} />
                <span>{label}</span>
              </label>
              <input
                className="admin-tipo-titulo-input"
                value={config.tipos[key].titulo}
                onChange={(e) => setTipoTitulo(key, e.target.value)}
                disabled={!config.tipos[key].activo}
                placeholder="Título en el ticket"
              />
            </div>
          ))}
        </section>

        {error && <p className="error-text">{error}</p>}

        <button
          className="btn-confirmar"
          onClick={handleGuardar}
          disabled={guardando}
          style={{ width: "100%", marginTop: 8 }}
        >
          {guardado ? "✓ Guardado" : guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>

      {/* Vista previa */}
      <div className="admin-tickets-preview">
        <h2 className="admin-seccion-titulo">Vista previa</h2>

        <div className="preview-tipo-tabs">
          {TIPOS.filter((t) => config.tipos[t.key].activo).map(({ key, label }) => (
            <button
              key={key}
              className={`preview-tipo-tab ${tipoActivo === key ? "preview-tipo-activo" : ""}`}
              onClick={() => setTipoActivo(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ticket ticket-preview-standalone">
          <div className="ticket-header">
            <p className="ticket-negocio">{config.encabezado.nombre || "NEGOCIO"}</p>
            {config.encabezado.linea2 && <p className="ticket-sub">{config.encabezado.linea2}</p>}
            {config.encabezado.linea3 && <p className="ticket-sub">{config.encabezado.linea3}</p>}
            {config.encabezado.rfc && <p className="ticket-sub">RFC: {config.encabezado.rfc}</p>}
          </div>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta" style={{ textAlign: "center", fontWeight: "bold" }}>
            {tipo.titulo || tipoActivo.toUpperCase()}
          </p>

          <div className="ticket-separador">————————————————</div>

          <p className="ticket-meta">Folio: POS-20260408-DEMO</p>
          <p className="ticket-meta">Fecha: 08/04/2026 10:32 a.m.</p>
          {config.opciones.mostrar_cajero && <p className="ticket-meta">Cajero: André</p>}
          {config.opciones.mostrar_turno && <p className="ticket-meta">Turno: 2026-04-08-m</p>}

          <div className="ticket-separador">————————————————</div>

          <table className="ticket-tabla">
            <thead>
              <tr>
                <th className="ticket-col-desc">Artículo</th>
                <th className="ticket-col-num">Cant</th>
                <th className="ticket-col-num">P.U.</th>
                <th className="ticket-col-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS_EJEMPLO.map((item, i) => (
                <tr key={i}>
                  <td className="ticket-col-desc">
                    {item.descripcion}
                    {config.opciones.mostrar_sku && (
                      <div style={{ fontSize: "8pt", color: "#666" }}>{item.sku}</div>
                    )}
                  </td>
                  <td className="ticket-col-num">{item.cantidad}</td>
                  <td className="ticket-col-num">${item.precio_unitario.toFixed(2)}</td>
                  <td className="ticket-col-num">${item.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ticket-separador">————————————————</div>

          <div className="ticket-fila-resumen"><span>TOTAL</span><span>${total.toFixed(2)}</span></div>
          <div className="ticket-fila-resumen"><span>Efectivo</span><span>$300.00</span></div>
          <div className="ticket-fila-resumen ticket-cambio"><span>Cambio</span><span>${(300 - total).toFixed(2)}</span></div>

          <div className="ticket-separador">————————————————</div>

          {config.pie.filter(Boolean).map((linea, i) => (
            <p key={i} className="ticket-gracias">{linea}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
