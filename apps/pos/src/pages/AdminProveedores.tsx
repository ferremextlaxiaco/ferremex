import { useState, useEffect, useRef } from "react"
import {
  type Proveedor,
  type FacturaCredito,
  type EstadoFactura,
  loadProveedores,
  siguienteNumProveedorAsync,
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
  agregarFactura,
  actualizarFactura,
  eliminarFactura,
  diasRestantes,
  estadoFactura as calcEstado,
  fechaVencimientoISO,
  fmtFecha,
} from "../lib/proveedores"
import { MigracionProveedoresCajas } from "../components/MigracionProveedoresCajas"
import { ProveedorDrawer, type ProvForm } from "../components/ProveedorDrawer"
import { listarComprasAPI, type CompraAPI } from "../lib/client"

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
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<"add" | "edit">("add")
  const [defaultNum, setDefaultNum] = useState("")
  const [facturaModal, setFacturaModal] = useState<{ factura: FacturaCredito | null } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ mensaje: string; onAceptar: () => void } | null>(null)
  const [search, setSearch] = useState("")
  const [compras, setCompras] = useState<CompraAPI[]>([])
  const [comprasLoading, setComprasLoading] = useState(false)

  const selected = proveedores.find((p) => p.id === selectedId) ?? null

  // Compras del proveedor seleccionado (módulo ferremex_compras, filtrado por id).
  useEffect(() => {
    if (!selectedId) { setCompras([]); return }
    let activo = true
    setComprasLoading(true)
    listarComprasAPI(selectedId)
      .then((lista) => { if (activo) setCompras(lista) })
      .catch(() => { if (activo) setCompras([]) })
      .finally(() => { if (activo) setComprasLoading(false) })
    return () => { activo = false }
  }, [selectedId])

  // Carga inicial desde la BD.
  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const lista = await loadProveedores()
        if (activo) setProveedores(lista)
      } catch (e) {
        console.error("[AdminProveedores] carga inicial:", e)
      } finally {
        if (activo) setLoading(false)
      }
    })()
    return () => { activo = false }
  }, [])

  /** Recarga la lista completa desde la BD (la verdad vive en el servidor). */
  async function refrescar() {
    try {
      setProveedores(await loadProveedores())
    } catch (e) {
      console.error("[AdminProveedores] refrescar:", e)
    }
  }

  const filtrados = search.trim()
    ? proveedores.filter(
        (p) =>
          p.nombre.toLowerCase().includes(search.toLowerCase()) ||
          p.contacto.toLowerCase().includes(search.toLowerCase()) ||
          p.num_proveedor.includes(search)
      )
    : proveedores

  // ── CRUD proveedores ──────────────────────────────────────────────────────

  async function abrirNuevo() {
    try {
      setDefaultNum(await siguienteNumProveedorAsync())
    } catch {
      setDefaultNum("")
    }
    setDrawerMode("add")
    setDrawerOpen(true)
  }

  function abrirEditar() {
    setDrawerMode("edit")
    setDrawerOpen(true)
  }

  async function handleSaveProveedor(data: ProvForm & { id?: string }) {
    try {
      if (data.id) {
        const { id, ...rest } = data
        await actualizarProveedor(id, rest)
        await refrescar()
      } else {
        const creado = await crearProveedor(data)
        await refrescar()
        setSelectedId(creado.id)
      }
      setDrawerOpen(false)
    } catch (e) {
      console.error("[AdminProveedores] guardar proveedor:", e)
      alert("No se pudo guardar el proveedor. Revisa los datos e inténtalo de nuevo.")
    }
  }

  function handleEliminar() {
    if (!selected) return
    const id = selected.id
    setConfirmModal({
      mensaje: `¿Eliminar al proveedor "${selected.nombre}"? Esta acción no se puede deshacer.`,
      onAceptar: async () => {
        try {
          await eliminarProveedor(id)
          setSelectedId(null)
          await refrescar()
        } catch (e) {
          console.error("[AdminProveedores] eliminar proveedor:", e)
          alert("No se pudo eliminar el proveedor.")
        }
      },
    })
  }

  // ── CRUD facturas ─────────────────────────────────────────────────────────

  async function handleSaveFactura(data: Omit<FacturaCredito, "id"> & { id?: string }) {
    if (!selected) return
    try {
      if (data.id) {
        const { id, ...rest } = data
        await actualizarFactura(selected.id, id, rest)
      } else {
        await agregarFactura(selected.id, data)
      }
      await refrescar()
      setFacturaModal(null)
    } catch (e) {
      console.error("[AdminProveedores] guardar factura:", e)
      alert("No se pudo guardar la factura.")
    }
  }

  function handleEliminarFactura(facturaId: string) {
    if (!selected) return
    const provId = selected.id
    setConfirmModal({
      mensaje: "¿Eliminar esta factura a crédito? Esta acción no se puede deshacer.",
      onAceptar: async () => {
        try {
          await eliminarFactura(provId, facturaId)
          await refrescar()
        } catch (e) {
          console.error("[AdminProveedores] eliminar factura:", e)
          alert("No se pudo eliminar la factura.")
        }
      },
    })
  }

  async function handleMarcarPagada(facturaId: string) {
    if (!selected) return
    try {
      await actualizarFactura(selected.id, facturaId, { pagada: true })
      await refrescar()
    } catch (e) {
      console.error("[AdminProveedores] marcar pagada:", e)
      alert("No se pudo marcar la factura como pagada.")
    }
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

      {/* Modal de confirmación con estilo POS */}
      {confirmModal && (
        <div className="cpx-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="cpx-modal cpx-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cpx-modal-header">
              <span className="cpx-modal-titulo">Confirmar acción</span>
              <button className="cpx-modal-close" onClick={() => setConfirmModal(null)}>✕</button>
            </div>
            <div className="cpx-confirm-body">
              <p className="cpx-confirm-msg">{confirmModal.mensaje}</p>
              <div className="cpx-confirm-btns">
                <button className="ar-btn-action" onClick={() => setConfirmModal(null)}>
                  Cancelar
                </button>
                <button className="ar-btn-action ar-btn-danger" onClick={() => {
                  confirmModal.onAceptar()
                  setConfirmModal(null)
                }}>
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="apv-root">
        {/* Banner de migración one-shot proveedores+cajas → BD (solo si hay datos locales) */}
        <MigracionProveedoresCajas />

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
            {loading ? (
              <p className="apv-empty">Cargando proveedores…</p>
            ) : filtrados.length === 0 ? (
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

                {/* Sección de compras a este proveedor (módulo ferremex_compras) */}
                <div className="apv-facturas-header" style={{ marginTop: 20 }}>
                  <p className="apv-facturas-title">Compras a este proveedor</p>
                  {compras.length > 0 && (
                    <span style={{ fontSize: 12, color: "var(--at-text-soft)" }}>
                      {compras.length} compra{compras.length !== 1 ? "s" : ""} ·{" "}
                      ${compras
                        .filter((c) => c.estado !== "Cancelada")
                        .reduce((s, c) => s + c.total, 0)
                        .toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                {comprasLoading ? (
                  <p className="apv-facturas-empty">Cargando compras…</p>
                ) : compras.length === 0 ? (
                  <p className="apv-facturas-empty">
                    No hay compras registradas a este proveedor.
                  </p>
                ) : (
                  <div className="apv-facturas-list">
                    {compras.slice(0, 10).map((c) => (
                      <div
                        key={c.id}
                        className={`apv-factura-row${c.estado === "Cancelada" ? " pagada" : ""}`}
                      >
                        <div className="apv-factura-main">
                          <div className="apv-factura-num">
                            {c.folio}
                            {c.estado === "Cancelada" && (
                              <span className="apv-estado-badge vencida" style={{ marginLeft: 8 }}>
                                Cancelada
                              </span>
                            )}
                          </div>
                          <div className="apv-factura-fechas">
                            <span>{fmtFecha(c.fecha)}</span>
                            <span>{c.tipo}</span>
                            <span>{c.articulos.length} artículo{c.articulos.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <div className="apv-factura-right">
                          <div className="apv-factura-monto">
                            ${c.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))}
                    {compras.length > 10 && (
                      <p className="apv-facturas-empty" style={{ textAlign: "center" }}>
                        Mostrando las 10 compras más recientes de {compras.length}. Ve todas en
                        Consultar Compras.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
