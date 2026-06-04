import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Bookmark, X, ShoppingCart, Trash2, RotateCcw, Save } from "lucide-react"
import { usePOS } from "../lib/pos-store"
import { formatMXN } from "../lib/format"
import { uuid } from "../lib/utils"
import {
  usePedidosEnEspera,
  guardarEnEspera,
  leerEspera,
  escribirEspera,
  type PedidoEspera,
} from "../lib/pedidos-espera"

/**
 * Panel de pedidos en espera / cotizaciones — guarda el carrito actual (con su
 * cliente) para atender a otra persona y retomarlo después. También sirve de
 * hub de cotización: un carrito guardado es una cotización viva.
 *
 * El estado/almacén vive en `lib/pedidos-espera.ts`; aquí solo la UI.
 */

interface PedidosEnEsperaProps {
  abierto: boolean
  onCerrar: () => void
  /** Notifica al padre que la lista cambió (para refrescar el badge). */
  onCambio: () => void
}

export function PedidosEnEspera({ abierto, onCerrar, onCambio }: PedidosEnEsperaProps) {
  const { state, dispatch, total } = usePOS()
  const { pedidos, refrescar } = usePedidosEnEspera()
  const [etiqueta, setEtiqueta] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Refresca la lista y mueve el foco al input cada vez que se abre el panel.
  useEffect(() => {
    if (abierto) {
      refrescar()
      setEtiqueta("")
      // Espera al render del portal antes de enfocar.
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [abierto, refrescar])

  // Cerrar con Escape.
  useEffect(() => {
    if (!abierto) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const carritoVacio = state.items.length === 0

  function guardarActual() {
    if (carritoVacio) return
    guardarEnEspera(state.items, state.clienteActivo, total, etiqueta)
    dispatch({ type: "CLEAR" })   // libera la caja para el siguiente cliente
    refrescar()
    onCambio()
    setEtiqueta("")
  }

  function retomar(p: PedidoEspera) {
    // Si hay un carrito en curso, guárdalo primero para no perderlo.
    if (state.items.length > 0) {
      const enCurso: PedidoEspera = {
        id: uuid(),
        nombre: state.clienteActivo?.nombre || "Pedido en curso",
        guardado_en: new Date().toISOString(),
        items: state.items,
        cliente: state.clienteActivo,
        total,
      }
      escribirEspera([enCurso, ...leerEspera().filter((x) => x.id !== p.id)])
    } else {
      escribirEspera(leerEspera().filter((x) => x.id !== p.id))
    }
    dispatch({ type: "RESTORE_CART", items: p.items, cliente: p.cliente })
    refrescar()
    onCambio()
    onCerrar()
  }

  function eliminar(id: string) {
    escribirEspera(leerEspera().filter((x) => x.id !== id))
    refrescar()
    onCambio()
  }

  return createPortal(
    <div className="espera-overlay" onClick={onCerrar}>
      <div
        className="espera-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Pedidos en espera"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="espera-head">
          <span className="espera-titulo">
            <Bookmark size={18} /> Pedidos en espera
          </span>
          <button className="espera-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Guardar el carrito actual */}
        <div className="espera-guardar">
          <div className="espera-guardar-info">
            <ShoppingCart size={15} />
            {carritoVacio ? (
              <span className="espera-guardar-vacio">El carrito está vacío</span>
            ) : (
              <span>
                Carrito actual: <b>{state.items.length}</b> producto(s) · <b>{formatMXN(total)}</b>
              </span>
            )}
          </div>
          <div className="espera-guardar-row">
            <input
              ref={inputRef}
              className="espera-input"
              placeholder="Etiqueta (opcional): Sr. López, Obra calle 5…"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              disabled={carritoVacio}
            />
            <button className="espera-btn-guardar" onClick={guardarActual} disabled={carritoVacio}>
              <Save size={15} /> Guardar y liberar caja
            </button>
          </div>
        </div>

        {/* Lista de pedidos guardados */}
        <div className="espera-lista">
          {pedidos.length === 0 ? (
            <div className="espera-lista-vacia">
              <Bookmark size={28} />
              <p>No hay pedidos en espera</p>
              <p className="espera-lista-vacia-hint">
                Guarda un carrito para atender a otro cliente y retómalo después.
              </p>
            </div>
          ) : (
            pedidos.map((p) => (
              <div key={p.id} className="espera-item">
                <div className="espera-item-info">
                  <span className="espera-item-nombre">{p.nombre}</span>
                  <span className="espera-item-meta">
                    {p.items.length} producto(s) · {formatMXN(p.total)}
                    {p.cliente ? ` · ${p.cliente.nombre}` : " · Público"}
                    {" · "}
                    {new Date(p.guardado_en).toLocaleString("es-MX", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="espera-item-acciones">
                  <button className="espera-item-retomar" onClick={() => retomar(p)} title="Retomar este pedido">
                    <RotateCcw size={14} /> Retomar
                  </button>
                  <button className="espera-item-eliminar" onClick={() => eliminar(p.id)} title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
