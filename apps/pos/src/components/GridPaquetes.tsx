import type { Paquete } from "../lib/client"
import { formatMXN } from "../lib/format"
import { Package } from "lucide-react"

interface GridPaquetesProps {
  paquetes: Paquete[]
  aplicados: Set<string>          // paquete_id ya en el carrito
  aplicando: string | null        // paquete_id que se está aplicando
  onAplicar: (p: Paquete) => void
}

/**
 * Grid de paquetes en el panel de venta. Aparece arriba de los productos cuando
 * la búsqueda coincide con el nombre de un paquete. Al pulsar una tarjeta se
 * valida stock de los componentes y se agrega como paquete al carrito.
 */
export function GridPaquetes({ paquetes, aplicados, aplicando, onAplicar }: GridPaquetesProps) {
  if (paquetes.length === 0) return null

  return (
    <div className="grid-paquetes-wrap">
      <p className="resultados-conteo">
        📦 {paquetes.length} paquete{paquetes.length !== 1 ? "s" : ""} disponible{paquetes.length !== 1 ? "s" : ""}
      </p>
      <div className="grid-paquetes">
        {paquetes.map((p) => {
          const yaEsta = aplicados.has(p.id)
          const cargando = aplicando === p.id
          const piezas = p.componentes.reduce((s, c) => s + c.cantidad, 0)
          return (
            <button
              key={p.id}
              className={`tarjeta-paquete${yaEsta ? " en-carrito" : ""}`}
              onClick={() => !yaEsta && !cargando && onAplicar(p)}
              disabled={yaEsta || cargando}
              title={yaEsta ? "Ya está en el carrito" : "Agregar paquete al carrito"}
            >
              <div className="tarjeta-paquete-img">
                {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" /> : <Package size={28} />}
                <span className="tarjeta-paquete-badge">PAQUETE</span>
              </div>
              <div className="tarjeta-paquete-info">
                <p className="tarjeta-paquete-nombre">{p.nombre}</p>
                <p className="tarjeta-paquete-piezas">{piezas} pza{piezas !== 1 ? "s" : ""}</p>
                <div className="tarjeta-paquete-footer">
                  <span className="tarjeta-paquete-precio">{formatMXN(p.precio_paquete)}</span>
                  <span className="tarjeta-paquete-accion">
                    {yaEsta ? "✓ Agregado" : cargando ? "…" : "+ Agregar"}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
