import type { Paquete } from "../lib/client"
import { formatMXN } from "../lib/format"
import { Package, List } from "lucide-react"

interface GridPaquetesProps {
  paquetes: Paquete[]
  aplicados: Set<string>          // paquete_id ya en el carrito
  aplicando: string | null        // paquete_id que se está aplicando
  onAplicar: (p: Paquete) => void
  onVerDesglose: (p: Paquete) => void
}

/**
 * Grid de paquetes en el panel de venta. Aparece arriba de los productos cuando
 * la búsqueda coincide con el nombre de un paquete. Al pulsar el área de la
 * tarjeta se valida stock y se agrega como paquete al carrito; el botón de lista
 * abre el modal de desglose (artículos, precios, ahorro).
 */
export function GridPaquetes({ paquetes, aplicados, aplicando, onAplicar, onVerDesglose }: GridPaquetesProps) {
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
            <div
              key={p.id}
              className={`tarjeta-paquete${yaEsta ? " en-carrito" : ""}${yaEsta || cargando ? " tarjeta-paquete--off" : ""}`}
              role="button"
              tabIndex={yaEsta || cargando ? -1 : 0}
              onClick={() => !yaEsta && !cargando && onAplicar(p)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !yaEsta && !cargando) { e.preventDefault(); onAplicar(p) } }}
              title={yaEsta ? "Ya está en el carrito" : "Agregar paquete al carrito"}
            >
              <div className="tarjeta-paquete-img">
                {p.imagenes?.[0] ? <img src={p.imagenes[0]} alt={p.nombre} loading="lazy" /> : <Package size={28} />}
                <span className="tarjeta-paquete-badge">PAQUETE</span>
                {/* Botón de desglose: no propaga el clic para no agregar al carrito */}
                <button
                  type="button"
                  className="tarjeta-paquete-desglose"
                  onClick={(e) => { e.stopPropagation(); onVerDesglose(p) }}
                  title="Ver desglose del paquete"
                >
                  <List size={15} /> Desglose
                </button>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
