import { useState, useEffect, useRef } from "react"

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
import {
  type Proveedor,
  type FacturaCredito,
  type EstadoFactura,
  loadProveedores,
  saveProveedores,
  siguienteNumProveedor,
  diasRestantes,
  estadoFactura as calcEstado,
  fechaVencimientoISO,
  fmtFecha,
} from "../lib/proveedores"

// ── Etiquetas de estado ───────────────────────────────────────────────────────

const ESTADO_LABEL: Record<EstadoFactura, string> = {
  pagada: "Pagada",
  vencida: "Vencida",
  urgente: "Urgente",
  proxima: "Próxima",
  ok: "Al día",
}

// ── Iconos ────────────────────────────────────────────────────────────────────

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Drawer: formulario de proveedor ──────────────────────────────────────────

type ProvForm = {
  num_proveedor: string
  nombre: string
  contacto: string
  telefono: string
  email: string
  dias_credito: number
  limite_credito: number
  rfc: string
  notas: string
}

const PROV_VACIO: ProvForm = {
  num_proveedor: "",
  nombre: "",
  contacto: "",
  telefono: "",
  email: "",
  dias_credito: 30,
  limite_credito: 0,
  rfc: "",
  notas: "",
}

function ProveedorDrawer({
  open,
  mode,
  proveedor,
  defaultNum,
  onSave,
  onClose,
}: {
  open: boolean
  mode: "add" | "edit"
  proveedor: Proveedor | null
  defaultNum: string
  onSave: (data: ProvForm & { id?: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<ProvForm>({ ...PROV_VACIO })
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (mode === "edit" && proveedor) {
      const { id: _id, facturas: _f, ...rest } = proveedor
      setForm(rest)
    } else {
      setForm({ ...PROV_VACIO, num_proveedor: defaultNum })
    }
  }, [open, mode, proveedor, defaultNum])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => firstRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [open, onClose])

  function f<K extends keyof ProvForm>(k: K, v: ProvForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    if (!form.nombre.trim()) return
    onSave(mode === "edit" && proveedor ? { ...form, id: proveedor.id } : form)
  }

  return (
    <>
      <div className={`apv-backdrop${open ? " open" : ""}`} onClick={onClose} />
      <div className={`apv-drawer${open ? " open" : ""}`}>
        <div className="apv-drawer-header">
          <span className="apv-drawer-title">
            {mode === "add" ? "Nuevo proveedor" : "Editar proveedor"}
          </span>
          <button type="button" className="apv-drawer-close" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <div className="apv-drawer-body">
          {/* Identificación */}
          <p className="apv-section-title">Identificación</p>
          <div className="ac-grid-3">
            <div className="ac-field">
              <label className="ac-label">Núm. proveedor</label>
              <input className="ac-input" value={form.num_proveedor}
                onChange={(e) => f("num_proveedor", e.target.value)} placeholder="001" />
            </div>
            <div className="ac-field" style={{ gridColumn: "span 2" }}>
              <label className="ac-label">Nombre / empresa *</label>
              <input ref={firstRef} className="ac-input" value={form.nombre}
                onChange={(e) => f("nombre", e.target.value)} placeholder="Nombre del proveedor" />
            </div>
          </div>

          <div className="ac-grid-2" style={{ marginTop: 10 }}>
            <div className="ac-field">
              <label className="ac-label">Contacto</label>
              <input className="ac-input" value={form.contacto}
                onChange={(e) => f("contacto", e.target.value)} placeholder="Lic. Juan García" />
            </div>
            <div className="ac-field">
              <label className="ac-label">Teléfono</label>
              <input className="ac-input" value={form.telefono}
                onChange={(e) => f("telefono", e.target.value)} placeholder="55 1234 5678" />
            </div>
          </div>

          <div className="ac-field" style={{ marginTop: 10 }}>
            <label className="ac-label">Correo electrónico</label>
            <input className="ac-input" type="email" value={form.email}
              onChange={(e) => f("email", e.target.value)} placeholder="ventas@proveedor.com" />
          </div>

          {/* Crédito */}
          <p className="apv-section-title">Crédito</p>
          <div className="ac-grid-2">
            <div className="ac-field">
              <label className="ac-label">Días de crédito</label>
              <input className="ac-input" type="number" min={0}
                value={form.dias_credito}
                onChange={(e) => f("dias_credito", Number(e.target.value))} />
            </div>
            <div className="ac-field">
              <label className="ac-label">Límite de crédito ($)</label>
              <input className="ac-input" type="number" min={0} step={100}
                value={form.limite_credito}
                onChange={(e) => f("limite_credito", Number(e.target.value))} />
            </div>
          </div>

          {/* Fiscal */}
          <p className="apv-section-title">Datos fiscales</p>
          <div className="ac-field">
            <label className="ac-label">RFC</label>
            <input className="ac-input" value={form.rfc}
              onChange={(e) => f("rfc", e.target.value.toUpperCase())}
              placeholder="XAXX010101000" maxLength={13} />
          </div>

          {/* Notas */}
          <p className="apv-section-title">Notas</p>
          <div className="ac-field">
            <textarea className="ac-input" style={{ minHeight: 72, resize: "vertical" }}
              value={form.notas}
              onChange={(e) => f("notas", e.target.value)}
              placeholder="Condiciones especiales, observaciones…" />
          </div>
        </div>

        <div className="apv-drawer-footer">
          <button type="button" className="ac-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ac-btn-save" onClick={handleSave}
            disabled={!form.nombre.trim()}>
            {mode === "add" ? "Agregar proveedor" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Modal: factura de crédito ─────────────────────────────────────────────────

type FacturaForm = {
  numero_factura: string
  fecha_emision: string
  dias_credito: number
  monto: string
  descripcion: string
  pagada: boolean
}

function facturaVacia(diasCred: number): FacturaForm {
  return {
    numero_factura: "",
    fecha_emision: new Date().toISOString().slice(0, 10),
    dias_credito: diasCred,
    monto: "",
    descripcion: "",
    pagada: false,
  }
}

function FacturaModal({
  open,
  provDiasCred,
  factura,
  onSave,
  onClose,
}: {
  open: boolean
  provDiasCred: number
  factura: FacturaCredito | null
  onSave: (data: Omit<FacturaCredito, "id"> & { id?: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FacturaForm>(facturaVacia(provDiasCred))
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setForm(
      factura
        ? {
            numero_factura: factura.numero_factura,
            fecha_emision: factura.fecha_emision,
            dias_credito: factura.dias_credito,
            monto: String(factura.monto),
            descripcion: factura.descripcion,
            pagada: factura.pagada,
          }
        : facturaVacia(provDiasCred)
    )
  }, [open, factura, provDiasCred])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => firstRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [open, onClose])

  function f(k: keyof FacturaForm, v: FacturaForm[keyof FacturaForm]) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    if (!form.numero_factura.trim() || !Number(form.monto)) return
    const data = {
      numero_factura: form.numero_factura.trim(),
      fecha_emision: form.fecha_emision,
      dias_credito: Number(form.dias_credito),
      monto: Number(form.monto),
      descripcion: form.descripcion.trim(),
      pagada: form.pagada,
    }
    onSave(factura ? { ...data, id: factura.id } : data)
  }

  if (!open) return null

  // Calcular fecha de vencimiento en tiempo real
  let fechaVence = "—"
  if (form.fecha_emision && form.dias_credito >= 0) {
    const d = new Date(form.fecha_emision + "T12:00:00")
    d.setDate(d.getDate() + Number(form.dias_credito))
    fechaVence = fmtFecha(d.toISOString().slice(0, 10))
  }

  return (
    <div className="apv-modal-overlay" onClick={onClose}>
      <div className="apv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="apv-modal-header">
          <span>{factura ? "Editar factura" : "Agregar factura a crédito"}</span>
          <button type="button" className="apv-modal-close" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="apv-modal-body">
          <div className="ac-grid-2">
            <div className="ac-field">
              <label className="ac-label">Número de factura *</label>
              <input ref={firstRef} className="ac-input" value={form.numero_factura}
                onChange={(e) => f("numero_factura", e.target.value)}
                placeholder="FAC-2025-0001" />
            </div>
            <div className="ac-field">
              <label className="ac-label">Monto ($) *</label>
              <input className="ac-input" type="number" min={0} step={0.01}
                value={form.monto}
                onChange={(e) => f("monto", e.target.value)}
                placeholder="0.00" />
            </div>
          </div>

          <div className="ac-grid-2" style={{ marginTop: 10 }}>
            <div className="ac-field">
              <label className="ac-label">Fecha de emisión</label>
              <input className="ac-input" type="date" value={form.fecha_emision}
                onChange={(e) => f("fecha_emision", e.target.value)} />
            </div>
            <div className="ac-field">
              <label className="ac-label">Días de crédito</label>
              <input className="ac-input" type="number" min={0}
                value={form.dias_credito}
                onChange={(e) => f("dias_credito", Number(e.target.value))} />
            </div>
          </div>

          <div className="apv-vence-preview">
            Fecha de vencimiento: <strong>{fechaVence}</strong>
          </div>

          <div className="ac-field" style={{ marginTop: 10 }}>
            <label className="ac-label">Descripción</label>
            <input className="ac-input" value={form.descripcion}
              onChange={(e) => f("descripcion", e.target.value)}
              placeholder="Artículos de la factura…" />
          </div>

          <label className="apv-check-row">
            <input type="checkbox" checked={form.pagada}
              onChange={(e) => f("pagada", e.target.checked)} />
            <span>Marcar como pagada</span>
          </label>
        </div>

        <div className="apv-modal-footer">
          <button type="button" className="ac-btn-cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="ac-btn-save" onClick={handleSave}
            disabled={!form.numero_factura.trim() || !Number(form.monto)}>
            {factura ? "Guardar cambios" : "Agregar factura"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function AdminProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>(loadProveedores)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add")
  const [defaultNum, setDefaultNum] = useState("")
  const [facturaModal, setFacturaModal] = useState<{ factura: FacturaCredito | null } | null>(null)
  const [search, setSearch] = useState("")

  const selected = proveedores.find((p) => p.id === selectedId) ?? null

  const filtrados = search.trim()
    ? proveedores.filter(
        (p) =>
          p.nombre.toLowerCase().includes(search.toLowerCase()) ||
          p.contacto.toLowerCase().includes(search.toLowerCase()) ||
          p.num_proveedor.includes(search)
      )
    : proveedores

  function guardar(lista: Proveedor[]) {
    saveProveedores(lista)
    setProveedores(lista)
  }

  // ── CRUD proveedores ──────────────────────────────────────────────────────

  function abrirNuevo() {
    setDefaultNum(siguienteNumProveedor(proveedores))
    setDrawerMode("add")
    setDrawerOpen(true)
  }

  function abrirEditar() {
    setDrawerMode("edit")
    setDrawerOpen(true)
  }

  function handleSaveProveedor(data: ProvForm & { id?: string }) {
    if (data.id) {
      guardar(proveedores.map((p) => (p.id === data.id ? { ...p, ...data } : p)))
    } else {
      const nuevo: Proveedor = { ...data, id: uuid(), facturas: [] }
      guardar(
        [...proveedores, nuevo].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        )
      )
      setSelectedId(nuevo.id)
    }
    setDrawerOpen(false)
  }

  function handleEliminar() {
    if (!selected) return
    if (!confirm(`¿Eliminar a ${selected.nombre}? Esta acción no se puede deshacer.`)) return
    guardar(proveedores.filter((p) => p.id !== selectedId))
    setSelectedId(null)
  }

  // ── CRUD facturas ─────────────────────────────────────────────────────────

  function handleSaveFactura(data: Omit<FacturaCredito, "id"> & { id?: string }) {
    if (!selected) return
    let nuevas: FacturaCredito[]
    if (data.id) {
      nuevas = selected.facturas.map((f) =>
        f.id === data.id ? { ...f, ...data } : f
      )
    } else {
      nuevas = [...selected.facturas, { ...data, id: uuid() }]
    }
    guardar(
      proveedores.map((p) =>
        p.id === selected.id ? { ...p, facturas: nuevas } : p
      )
    )
    setFacturaModal(null)
  }

  function handleEliminarFactura(facturaId: string) {
    if (!selected) return
    if (!confirm("¿Eliminar esta factura?")) return
    guardar(
      proveedores.map((p) =>
        p.id === selected.id
          ? { ...p, facturas: p.facturas.filter((f) => f.id !== facturaId) }
          : p
      )
    )
  }

  function handleMarcarPagada(facturaId: string) {
    if (!selected) return
    guardar(
      proveedores.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              facturas: p.facturas.map((f) =>
                f.id === facturaId ? { ...f, pagada: true } : f
              ),
            }
          : p
      )
    )
  }

  // ── Resumen saldo ─────────────────────────────────────────────────────────

  const pendiente = selected
    ? selected.facturas
        .filter((f) => !f.pagada)
        .reduce((s, f) => s + f.monto, 0)
    : 0

  const sobreLimite =
    selected &&
    selected.limite_credito > 0 &&
    pendiente > selected.limite_credito

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ProveedorDrawer
        open={drawerOpen}
        mode={drawerMode}
        proveedor={drawerMode === "edit" ? selected : null}
        defaultNum={defaultNum}
        onSave={handleSaveProveedor}
        onClose={() => setDrawerOpen(false)}
      />

      <FacturaModal
        open={facturaModal !== null}
        provDiasCred={selected?.dias_credito ?? 30}
        factura={facturaModal?.factura ?? null}
        onSave={handleSaveFactura}
        onClose={() => setFacturaModal(null)}
      />

      <div className="apv-root">
        {/* Header */}
        <div className="apv-header">
          <div>
            <p className="admin-seccion-titulo" style={{ marginBottom: 0 }}>Proveedores</p>
            <p className="apv-header-meta">
              {proveedores.length} proveedor{proveedores.length !== 1 ? "es" : ""}
            </p>
          </div>
          <div className="apv-header-actions">
            <button className="ac-btn-action ac-btn-new" onClick={abrirNuevo}>
              + Nuevo proveedor
            </button>
            <button className="ac-btn-action" disabled={!selectedId} onClick={abrirEditar}>
              Editar
            </button>
            <button className="ac-btn-action ac-btn-danger" disabled={!selectedId}
              onClick={handleEliminar}>
              Eliminar
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="apv-search-row">
          <input
            className="ac-input"
            placeholder="Buscar por nombre, contacto o número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 380 }}
          />
        </div>

        {/* Split panel */}
        <div className="apv-split">

          {/* Lista izquierda */}
          <div className="apv-list">
            {filtrados.length === 0 ? (
              <p className="apv-empty">
                {search
                  ? `Sin resultados para "${search}"`
                  : 'No hay proveedores. Haz clic en "+ Nuevo proveedor".'}
              </p>
            ) : (
              filtrados.map((p) => {
                const pend = p.facturas
                  .filter((f) => !f.pagada)
                  .reduce((s, f) => s + f.monto, 0)
                const tieneVencidas = p.facturas.some(
                  (f) => !f.pagada && calcEstado(f) === "vencida"
                )
                const tieneUrgentes = p.facturas.some(
                  (f) => !f.pagada && calcEstado(f) === "urgente"
                )
                return (
                  <div
                    key={p.id}
                    className={`apv-list-item${p.id === selectedId ? " selected" : ""}`}
                    onClick={() =>
                      setSelectedId((prev) => (prev === p.id ? null : p.id))
                    }
                  >
                    <div className="apv-list-avatar">
                      {p.nombre[0].toUpperCase()}
                    </div>
                    <div className="apv-list-info">
                      <div className="apv-list-nombre">
                        {p.nombre}
                        {tieneVencidas && (
                          <span className="apv-dot vencida" title="Facturas vencidas" />
                        )}
                        {!tieneVencidas && tieneUrgentes && (
                          <span className="apv-dot urgente" title="Facturas urgentes" />
                        )}
                      </div>
                      <div className="apv-list-meta">
                        {p.contacto || p.telefono || "—"}
                      </div>
                    </div>
                    <div className="apv-list-right">
                      <div className="apv-list-pendiente">
                        {pend > 0
                          ? `$${pend.toLocaleString("es-MX")}`
                          : <span style={{ opacity: 0.4 }}>—</span>}
                      </div>
                      <div className="apv-list-dias">{p.dias_credito}d crédito</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Panel derecho: detalle */}
          <div className="apv-detail">
            {!selected ? (
              <div className="apv-detail-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                  <line x1="12" y1="12" x2="12" y2="16" />
                  <line x1="10" y1="14" x2="14" y2="14" />
                </svg>
                <p>Selecciona un proveedor para ver sus detalles y facturas</p>
              </div>
            ) : (
              <div className="apv-detail-content">

                {/* Encabezado del proveedor */}
                <div className="apv-prov-head">
                  <div>
                    <p className="apv-prov-nombre">{selected.nombre}</p>
                    {selected.contacto && (
                      <p className="apv-prov-contacto">{selected.contacto}</p>
                    )}
                  </div>
                  <div className="apv-prov-head-right">
                    {selected.telefono && (
                      <a href={`tel:${selected.telefono.replace(/\s/g, "")}`}
                        className="apv-link-chip">
                        📞 {selected.telefono}
                      </a>
                    )}
                    {selected.email && (
                      <a href={`mailto:${selected.email}`} className="apv-link-chip">
                        ✉️ {selected.email}
                      </a>
                    )}
                  </div>
                </div>

                {/* Datos de crédito */}
                <div className="apv-datos-grid">
                  <div className="apv-dato">
                    <span className="apv-dato-label">Días de crédito</span>
                    <span className="apv-dato-val">{selected.dias_credito} días</span>
                  </div>
                  <div className="apv-dato">
                    <span className="apv-dato-label">Límite de crédito</span>
                    <span className="apv-dato-val">
                      ${selected.limite_credito.toLocaleString("es-MX")}
                    </span>
                  </div>
                  <div className="apv-dato">
                    <span className="apv-dato-label">Saldo pendiente</span>
                    <span className={`apv-dato-val${sobreLimite ? " over-limit" : ""}`}>
                      ${pendiente.toLocaleString("es-MX")}
                    </span>
                  </div>
                  {selected.rfc && (
                    <div className="apv-dato">
                      <span className="apv-dato-label">RFC</span>
                      <span className="apv-dato-val" style={{ fontFamily: "monospace" }}>
                        {selected.rfc}
                      </span>
                    </div>
                  )}
                </div>

                {sobreLimite && (
                  <div className="apv-alert-credito">
                    ⚠ Saldo pendiente excede el límite de crédito autorizado
                  </div>
                )}

                {selected.notas && (
                  <div className="apv-notas">
                    <span className="apv-notas-label">Notas:</span> {selected.notas}
                  </div>
                )}

                {/* Sección de facturas */}
                <div className="apv-facturas-header">
                  <p className="apv-facturas-title">Facturas a crédito</p>
                  <button
                    className="ac-btn-action ac-btn-new"
                    style={{ fontSize: 12, padding: "4px 12px" }}
                    onClick={() => setFacturaModal({ factura: null })}
                  >
                    + Agregar factura
                  </button>
                </div>

                {selected.facturas.length === 0 ? (
                  <p className="apv-facturas-empty">
                    No hay facturas registradas. Haz clic en "+ Agregar factura".
                  </p>
                ) : (
                  <>
                    <div className="apv-facturas-list">
                      {[...selected.facturas]
                        .sort((a, b) => {
                          // Pendientes primero, ordenadas por urgencia
                          if (a.pagada !== b.pagada) return a.pagada ? 1 : -1
                          return diasRestantes(a) - diasRestantes(b)
                        })
                        .map((f) => {
                          const estado = calcEstado(f)
                          const dias = diasRestantes(f)
                          return (
                            <div
                              key={f.id}
                              className={`apv-factura-row${f.pagada ? " pagada" : ""}`}
                            >
                              <div className="apv-factura-main">
                                <div className="apv-factura-num">{f.numero_factura}</div>
                                {f.descripcion && (
                                  <div className="apv-factura-desc">{f.descripcion}</div>
                                )}
                                <div className="apv-factura-fechas">
                                  <span>Emisión: {fmtFecha(f.fecha_emision)}</span>
                                  <span>Vence: {fmtFecha(fechaVencimientoISO(f))}</span>
                                </div>
                              </div>

                              <div className="apv-factura-right">
                                <div className="apv-factura-monto">
                                  ${f.monto.toLocaleString("es-MX", {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>

                                {!f.pagada && (
                                  <div className={`apv-dias-chip ${estado}`}>
                                    {dias < 0
                                      ? `Venció hace ${Math.abs(dias)}d`
                                      : dias === 0
                                      ? "Vence hoy"
                                      : `${dias}d restantes`}
                                  </div>
                                )}

                                <div className={`apv-estado-badge ${estado}`}>
                                  {ESTADO_LABEL[estado]}
                                </div>

                                <div className="apv-factura-acciones">
                                  {!f.pagada && (
                                    <button
                                      className="apv-btn-accion pagar"
                                      onClick={() => handleMarcarPagada(f.id)}
                                    >
                                      ✓ Pagar
                                    </button>
                                  )}
                                  <button
                                    className="apv-btn-accion edit"
                                    onClick={() => setFacturaModal({ factura: f })}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    className="apv-btn-accion del"
                                    onClick={() => handleEliminarFactura(f.id)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>

                    {/* Resumen total */}
                    {selected.facturas.some((f) => !f.pagada) && (
                      <div className="apv-resumen">
                        <span>
                          Total pendiente:{" "}
                          <strong>
                            $
                            {pendiente.toLocaleString("es-MX", {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </span>
                        {selected.limite_credito > 0 && (
                          <span>
                            Límite:{" "}
                            <strong>
                              ${selected.limite_credito.toLocaleString("es-MX")}
                            </strong>
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
