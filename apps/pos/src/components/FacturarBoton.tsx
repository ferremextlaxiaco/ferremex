import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { FileText, X, CheckCircle2, AlertTriangle, Clock } from "lucide-react"
import { camposFiscalesFaltantes, type Cliente } from "../lib/clientes"

/**
 * Gancho de facturación (CFDI 4.0 vía Facturama) — STUB HONESTO.
 *
 * La integración con Facturama todavía NO existe (es el siguiente módulo). En
 * vez de un botón muerto, este componente abre un panel que explica el estado
 * real y valida por adelantado si el cliente tiene datos fiscales completos —
 * así, cuando cableemos `emitirFacturaAPI()`, este botón ya tiene el lugar y la
 * validación listos: solo se reemplaza el cuerpo del botón "Timbrar CFDI".
 *
 * Reusado en: Ticket (venta recién emitida) y SalesHistory (ventas previas).
 */

interface FacturarBotonProps {
  /** Folio de la venta a facturar. */
  folio: string
  /** Cliente de la venta (si lo hay). Público en general no se puede facturar nominativo. */
  cliente?: Cliente | null
  /** Estilo del trigger: botón ancho (footer) o compacto (fila de acciones). */
  variant?: "full" | "compact"
}

export function FacturarBoton({ folio, cliente, variant = "full" }: FacturarBotonProps) {
  const [abierto, setAbierto] = useState(false)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Mueve el foco al panel al abrirlo + cierra con Escape.
  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(() => cerrarRef.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false) }
    window.addEventListener("keydown", onKey)
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [abierto])

  // Misma regla fiscal que el chip "Puede facturar" de la pantalla de venta.
  const faltan = camposFiscalesFaltantes(cliente)
  const listoFiscal = faltan.length === 0

  return (
    <>
      <button
        type="button"
        className={variant === "full" ? "facturar-btn facturar-btn--full" : "facturar-btn facturar-btn--compact"}
        onClick={() => setAbierto(true)}
        title="Facturar esta venta (CFDI)"
      >
        <FileText size={variant === "full" ? 16 : 14} /> Facturar
      </button>

      {abierto &&
        createPortal(
          <div className="facturar-overlay" onClick={() => setAbierto(false)}>
            <div
              className="facturar-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`Facturar venta ${folio}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="facturar-panel-head">
                <span className="facturar-panel-titulo">
                  <FileText size={18} /> Facturar venta {folio}
                </span>
                <button className="facturar-panel-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">
                  <X size={18} />
                </button>
              </div>

              {/* Estado de la integración: honesto, no un botón muerto. */}
              <div className="facturar-aviso">
                <Clock size={16} />
                <span>
                  La emisión de CFDI con <b>Facturama</b> está en preparación. Aquí podrás timbrar la
                  factura en cuanto se conecte la integración.
                </span>
              </div>

              {/* Pre-validación fiscal del cliente — lo que ya podemos verificar hoy. */}
              <div className="facturar-seccion">
                <div className="facturar-seccion-titulo">Datos fiscales del receptor</div>
                {!cliente ? (
                  <div className="facturar-check facturar-check--warn">
                    <AlertTriangle size={15} />
                    <span>Venta a <b>público en general</b>. Asigna un cliente con RFC para facturar nominativo.</span>
                  </div>
                ) : listoFiscal ? (
                  <div className="facturar-check facturar-check--ok">
                    <CheckCircle2 size={15} />
                    <span>El cliente tiene los datos fiscales completos. Listo para timbrar.</span>
                  </div>
                ) : (
                  <div className="facturar-check facturar-check--warn">
                    <AlertTriangle size={15} />
                    <span>Faltan datos fiscales del cliente: <b>{faltan.join(", ")}</b>.</span>
                  </div>
                )}
              </div>

              <div className="facturar-panel-acciones">
                <button ref={cerrarRef} className="btn-secondary" onClick={() => setAbierto(false)}>
                  Entendido
                </button>
                {/* Botón de timbrado: deshabilitado hasta cablear Facturama. */}
                <button
                  className="btn-confirmar"
                  disabled
                  title="Disponible al conectar Facturama"
                >
                  Timbrar CFDI
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
