import { useEffect, useMemo, useState } from "react"
import { usePOS } from "../lib/pos-store"
import { listarPaquetes, type Paquete } from "../lib/client"
import { paquetesSugeridos, prepararLineasPaquete } from "../lib/paquetes"
import { formatMXN } from "../lib/format"
import { Package, X } from "lucide-react"

/**
 * Tarjeta de sugerencia de paquete en el panel de venta. Cuando el carrito
 * contiene un artículo que es componente de algún paquete (y ese paquete no
 * está aplicado), ofrece "Completar paquete": valida existencia de todos los
 * componentes, los agrega prorrateados y los marca como paquete.
 *
 * Se monta dentro del Carrito. Carga los paquetes una vez al montar.
 */
export function SugerenciaPaquete() {
  const { state, dispatch } = usePOS()
  const { items } = state

  const [paquetes, setPaquetes] = useState<Paquete[]>([])
  const [descartados, setDescartados] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Cargar paquetes una vez (la tienda no tiene tantos; basta al montar).
  useEffect(() => {
    let on = true
    listarPaquetes()
      .then((p) => { if (on) setPaquetes(p) })
      .catch(() => { if (on) setPaquetes([]) })
    return () => { on = false }
  }, [])

  const skusEnCarrito = useMemo(() => new Set(items.map((i) => i.sku)), [items])
  const paquetesAplicados = useMemo(
    () => new Set(items.map((i) => i.paquete_id).filter(Boolean) as string[]),
    [items]
  )

  // Primer paquete sugerible no descartado.
  const sugeridos = useMemo(
    () => paquetesSugeridos(skusEnCarrito, paquetesAplicados, paquetes).filter((p) => !descartados.has(p.id)),
    [skusEnCarrito, paquetesAplicados, paquetes, descartados]
  )
  const paquete = sugeridos[0] ?? null

  if (!paquete) return null

  // Cuántos componentes ya están en el carrito (para el texto).
  const faltantes = paquete.componentes.filter((c) => !skusEnCarrito.has(c.sku))

  async function aplicar(p: Paquete) {
    setAplicando(p.id)
    setAviso(null)
    try {
      const res = await prepararLineasPaquete(p)
      if (!res.ok) {
        setAviso(res.motivo === "sin_stock"
          ? `No se puede armar "${p.nombre}": sin existencia de ${res.faltantes.join(", ")}.`
          : "No se pudo verificar el inventario del paquete.")
        return
      }
      dispatch({ type: "ADD_PAQUETE", paqueteId: p.id, paqueteNombre: p.nombre, lineas: res.lineas })
    } finally {
      setAplicando(null)
    }
  }

  // Ahorro estimado mostrado (por piezas P1 vs precio del paquete).
  return (
    <div className="sug-paquete">
      <div className="sug-paquete-icon">
        {paquete.imagenes?.[0] ? <img src={paquete.imagenes[0]} alt="" className="sug-paquete-img" /> : <Package size={18} />}
      </div>
      <div className="sug-paquete-body">
        <p className="sug-paquete-titulo">¿Completar el paquete «{paquete.nombre}»?</p>
        <p className="sug-paquete-detalle">
          {faltantes.length > 0
            ? <>Agrega {faltantes.map((c) => c.descripcion).join(" + ")} y aplica <b>{formatMXN(paquete.precio_paquete)}</b>.</>
            : <>Aplica el precio de paquete <b>{formatMXN(paquete.precio_paquete)}</b> a estas piezas.</>}
        </p>
        {aviso && <p className="sug-paquete-aviso">{aviso}</p>}
      </div>
      <div className="sug-paquete-acciones">
        <button
          className="sug-paquete-btn"
          onClick={() => aplicar(paquete)}
          disabled={aplicando === paquete.id}
        >
          {aplicando === paquete.id ? "…" : "Completar paquete"}
        </button>
        <button
          className="sug-paquete-x"
          onClick={() => setDescartados((prev) => new Set(prev).add(paquete.id))}
          title="Ignorar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
