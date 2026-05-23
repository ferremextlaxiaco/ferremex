import { useState, useEffect } from "react"

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
import { useSearchParams } from "react-router-dom"
import {
  type Cliente,
  loadClientes,
  saveClientes,
  loadGrupos,
  saveGrupos,
  siguienteNumCliente,
} from "../lib/clientes"

const CLIENTE_VACIO: Omit<Cliente, "id"> = {
  num_cliente: "",
  nombre: "",
  telefono: "",
  num_precio: 1,
  dias_credito: 0,
  limite_credito: 0,
  grupo: "",
  monedero: false,
  rfc: "",
  razon_social: "",
  regimen_fiscal: "",
  cfdi: "",
  calle: "",
  numero: "",
  colonia: "",
  ciudad: "",
  estado: "",
  cp: "",
}

export function AdminClientesLista() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [clientes, setClientes] = useState<Cliente[]>(loadClientes)
  const [grupos, setGrupos] = useState<string[]>(loadGrupos)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [esNuevo, setEsNuevo] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [nuevoGrupo, setNuevoGrupo] = useState<string | null>(null)
  const [creditoHabilitado, setCreditoHabilitado] = useState(false)

  function tieneCredito(c: Cliente) {
    return (c.limite_credito ?? 0) > 0 || (c.dias_credito ?? 0) > 0
  }

  useEffect(() => {
    const editarId = searchParams.get("editar")
    const nuevo = searchParams.get("nuevo")
    if (!editarId && nuevo !== "1") return

    const todos = loadClientes()
    if (editarId) {
      const c = todos.find((c) => c.id === editarId)
      if (c) { setEditando({ ...c }); setEsNuevo(false); setCreditoHabilitado(tieneCredito(c)) }
    } else {
      setEditando({ id: uuid(), ...CLIENTE_VACIO, num_cliente: siguienteNumCliente(todos) })
      setEsNuevo(true)
      setCreditoHabilitado(false)
    }
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function recargar(lista: Cliente[]) {
    saveClientes(lista)
    setClientes(lista)
  }

  function abrirNuevo() {
    setEditando({ id: uuid(), ...CLIENTE_VACIO, num_cliente: siguienteNumCliente(clientes) })
    setEsNuevo(true)
    setFormError(null)
    setNuevoGrupo(null)
    setCreditoHabilitado(false)
  }

  function abrirEditar(cliente?: Cliente) {
    const c = cliente ?? clientes.find((c) => c.id === seleccionado)
    if (!c) return
    setEditando({ ...c })
    setEsNuevo(false)
    setFormError(null)
    setNuevoGrupo(null)
    setCreditoHabilitado(tieneCredito(c))
  }

  function cerrar() {
    setEditando(null)
    setFormError(null)
    setNuevoGrupo(null)
    setCreditoHabilitado(false)
  }

  function toggleCredito() {
    if (creditoHabilitado) {
      setField("dias_credito", 0)
      setField("limite_credito", 0)
    }
    setCreditoHabilitado(v => !v)
  }

  function eliminar() {
    const c = clientes.find((c) => c.id === seleccionado)
    if (!c) return
    if (!confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)) return
    recargar(clientes.filter((x) => x.id !== seleccionado))
    setSeleccionado(null)
  }

  function setField<K extends keyof Cliente>(k: K, v: Cliente[K]) {
    setEditando((prev) => (prev ? { ...prev, [k]: v } : prev))
  }

  function crearGrupo() {
    if (nuevoGrupo === null || !nuevoGrupo.trim()) return
    const nombre = nuevoGrupo.trim()
    if (!grupos.includes(nombre)) {
      const nuevos = [...grupos, nombre].sort()
      saveGrupos(nuevos)
      setGrupos(nuevos)
    }
    setField("grupo", nombre)
    setNuevoGrupo(null)
  }

  function guardar() {
    if (!editando) return
    if (!editando.nombre.trim()) { setFormError("El nombre es requerido"); return }
    const lista = esNuevo
      ? [...clientes, editando]
      : clientes.map((c) => (c.id === editando.id ? editando : c))
    recargar(lista)
    setEditando(null)
  }

  if (editando) {
    return (
      <div className="ac-editor">
        <div className="ac-editor-header">
          <h2 className="ac-editor-title">
            {esNuevo ? "Nuevo cliente" : `Editar — ${editando.nombre || "cliente"}`}
          </h2>
          <div className="ac-editor-actions">
            <button className="ac-btn-cancel" onClick={cerrar}>Cancelar</button>
            <button className="ac-btn-save" onClick={guardar} disabled={!editando.nombre.trim()}>Guardar</button>
          </div>
        </div>

        {formError && <p className="at-error">{formError}</p>}

        <div className="ac-sections">
          <div className="ac-section">
            <h3 className="ac-section-title">Datos generales</h3>
            <div className="ac-grid-3">
              <div className="ac-field">
                <label className="ac-label">Número de cliente</label>
                <input className="ac-input" value={editando.num_cliente} onChange={(e) => setField("num_cliente", e.target.value)} placeholder="001" />
              </div>
              <div className="ac-field" style={{ gridColumn: "span 2" }}>
                <label className="ac-label">Nombre o representante</label>
                <input className="ac-input" value={editando.nombre} onChange={(e) => setField("nombre", e.target.value)} placeholder="Nombre completo" autoFocus />
              </div>
            </div>
            <div className="ac-grid-3" style={{ marginTop: 10 }}>
              <div className="ac-field">
                <label className="ac-label">Teléfono</label>
                <input className="ac-input" value={editando.telefono} onChange={(e) => setField("telefono", e.target.value)} placeholder="953 000 0000" />
              </div>
              <div className="ac-field">
                <label className="ac-label">Número de precio asignado</label>
                <select className="ac-input" value={editando.num_precio} onChange={(e) => setField("num_precio", Number(e.target.value))}>
                  <option value={1}>1 — Precio mostrador</option>
                  <option value={2}>2 — Precio cliente</option>
                  <option value={3}>3 — Precio distribuidor</option>
                  <option value={4}>4 — Precio especial</option>
                </select>
              </div>
              <div className="ac-field">
                <label className="ac-label">Grupo</label>
                <div className="ac-grupo-row">
                  <select className="ac-input" value={editando.grupo} onChange={(e) => setField("grupo", e.target.value)}>
                    <option value="">Sin grupo</option>
                    {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <button className="ac-btn-add-grupo" type="button" title="Crear nuevo grupo" onClick={() => setNuevoGrupo(nuevoGrupo === null ? "" : null)}>+</button>
                </div>
                {nuevoGrupo !== null && (
                  <div className="ac-nuevo-grupo">
                    <input className="ac-input" value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Nombre del grupo…" autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") crearGrupo(); if (e.key === "Escape") setNuevoGrupo(null) }} />
                    <button className="ac-btn-crear-grupo" disabled={!nuevoGrupo.trim()} onClick={crearGrupo}>Crear</button>
                    <button className="ac-btn-cancel-grupo" onClick={() => setNuevoGrupo(null)}>✕</button>
                  </div>
                )}
              </div>
            </div>
            <div className="ac-grid-2" style={{ marginTop: 10 }}>
              <div className="ac-field">
                <label className="ac-label">Crédito</label>
                <div className="ac-credito-toggle-row">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={creditoHabilitado}
                    className={`ac-toggle${creditoHabilitado ? " on" : ""}`}
                    onClick={toggleCredito}
                  />
                  <span className={`ac-toggle-label${creditoHabilitado ? " on" : ""}`}>
                    {creditoHabilitado ? "Habilitado" : "Sin crédito"}
                  </span>
                </div>
              </div>
              <div className="ac-field">
                <label className="ac-label">Monedero electrónico</label>
                <select className="ac-input" value={editando.monedero ? "si" : "no"} onChange={(e) => setField("monedero", e.target.value === "si")}>
                  <option value="no">No</option>
                  <option value="si">Sí</option>
                </select>
              </div>
            </div>

            {creditoHabilitado && (
              <div className="ac-credito-panel">
                <div className="ac-grid-2">
                  <div className="ac-field">
                    <label className="ac-label">Días de crédito</label>
                    <input
                      className="ac-input"
                      type="number"
                      min={1}
                      value={editando.dias_credito || ""}
                      onChange={(e) => setField("dias_credito", Number(e.target.value))}
                      placeholder="30"
                      autoFocus
                    />
                  </div>
                  <div className="ac-field">
                    <label className="ac-label">Límite de crédito ($)</label>
                    <input
                      className="ac-input"
                      type="number"
                      min={1}
                      step={100}
                      value={editando.limite_credito || ""}
                      onChange={(e) => setField("limite_credito", Number(e.target.value))}
                      placeholder="5000"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="ac-section">
            <h3 className="ac-section-title">Datos de facturación</h3>
            <div className="ac-grid-3">
              <div className="ac-field">
                <label className="ac-label">RFC</label>
                <input className="ac-input" value={editando.rfc} onChange={(e) => setField("rfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" maxLength={13} />
              </div>
              <div className="ac-field" style={{ gridColumn: "span 2" }}>
                <label className="ac-label">Razón social</label>
                <input className="ac-input" value={editando.razon_social} onChange={(e) => setField("razon_social", e.target.value)} placeholder="Nombre fiscal completo" />
              </div>
            </div>
            <div className="ac-grid-2" style={{ marginTop: 10 }}>
              <div className="ac-field">
                <label className="ac-label">Régimen fiscal</label>
                <select className="ac-input" value={editando.regimen_fiscal} onChange={(e) => setField("regimen_fiscal", e.target.value)}>
                  <option value="">Seleccionar…</option>
                  <option value="601">601 – General de Ley Personas Morales</option>
                  <option value="612">612 – Personas Físicas con Actividades Empresariales</option>
                  <option value="616">616 – Sin obligaciones fiscales</option>
                  <option value="621">621 – Incorporación Fiscal</option>
                  <option value="626">626 – Régimen Simplificado de Confianza</option>
                </select>
              </div>
              <div className="ac-field">
                <label className="ac-label">Uso de CFDI</label>
                <select className="ac-input" value={editando.cfdi} onChange={(e) => setField("cfdi", e.target.value)}>
                  <option value="">Seleccionar…</option>
                  <option value="G01">G01 – Adquisición de mercancias</option>
                  <option value="G03">G03 – Gastos en general</option>
                  <option value="S01">S01 – Sin efectos fiscales</option>
                  <option value="CP01">CP01 – Pagos</option>
                </select>
              </div>
            </div>
            <h4 className="ac-subsection-title">Dirección fiscal</h4>
            <div className="ac-grid-3">
              <div className="ac-field" style={{ gridColumn: "span 2" }}>
                <label className="ac-label">Calle</label>
                <input className="ac-input" value={editando.calle} onChange={(e) => setField("calle", e.target.value)} />
              </div>
              <div className="ac-field">
                <label className="ac-label">Número</label>
                <input className="ac-input" value={editando.numero} onChange={(e) => setField("numero", e.target.value)} />
              </div>
            </div>
            <div className="ac-grid-3" style={{ marginTop: 10 }}>
              <div className="ac-field">
                <label className="ac-label">Colonia</label>
                <input className="ac-input" value={editando.colonia} onChange={(e) => setField("colonia", e.target.value)} />
              </div>
              <div className="ac-field">
                <label className="ac-label">Ciudad</label>
                <input className="ac-input" value={editando.ciudad} onChange={(e) => setField("ciudad", e.target.value)} />
              </div>
              <div className="ac-field">
                <label className="ac-label">Estado</label>
                <input className="ac-input" value={editando.estado} onChange={(e) => setField("estado", e.target.value)} />
              </div>
            </div>
            <div className="ac-grid-3" style={{ marginTop: 10 }}>
              <div className="ac-field">
                <label className="ac-label">Código postal</label>
                <input className="ac-input" value={editando.cp} onChange={(e) => setField("cp", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="00000" maxLength={5} />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ac-root">
      <div className="ac-header">
        <h2 className="admin-seccion-titulo">Clientes</h2>
        <div className="ac-header-actions">
          <button className="ac-btn-action ac-btn-new" onClick={abrirNuevo}>+ Nuevo cliente</button>
          <button className="ac-btn-action" onClick={() => abrirEditar()} disabled={!seleccionado}>Editar</button>
          <button className="ac-btn-action ac-btn-danger" onClick={eliminar} disabled={!seleccionado}>Eliminar cliente</button>
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="ac-vacio">No hay clientes registrados. Haz clic en "Nuevo cliente" para agregar uno.</p>
      ) : (
        <table className="admin-tabla">
          <thead>
            <tr>
              <th>Núm. cliente</th>
              <th>Nombre</th>
              <th>Núm. de precio</th>
              <th>Monedero electrónico</th>
              <th>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}
                className={seleccionado === c.id ? "ac-fila-seleccionada" : ""}
                onClick={() => setSeleccionado(c.id === seleccionado ? null : c.id)}
                onDoubleClick={() => abrirEditar(c)}
                style={{ cursor: "pointer" }}
              >
                <td>{c.num_cliente || "—"}</td>
                <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                <td>{c.num_precio}</td>
                <td>{c.monedero ? "Sí" : "No"}</td>
                <td>{c.telefono || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
