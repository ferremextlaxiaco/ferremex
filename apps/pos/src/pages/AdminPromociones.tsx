import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import PromocionesModule from "../components/PromocionesModule"

/**
 * Página admin de Promociones — wrapper delgado. Soporta el deep-link
 * `?sku=…&desc=…` que llega desde la ficha del artículo ("Crear promoción"):
 * abre el módulo con ese artículo precargado en una promo nueva.
 */
export function AdminPromociones() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [articuloInicial, setArticuloInicial] = useState<{ sku: string; descripcion: string } | null>(null)

  // Depende de los VALORES extraídos, no del objeto searchParams (que cambia de
  // referencia al limpiar los params y re-dispararía el efecto en StrictMode).
  const sku = searchParams.get("sku")
  const desc = searchParams.get("desc")

  useEffect(() => {
    if (!sku) return
    setArticuloInicial({ sku, descripcion: desc ?? "" })
    // Limpiar los parámetros para no reabrir el drawer al recargar/navegar.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("sku")
      next.delete("desc")
      return next
    }, { replace: true })
    // setSearchParams es estable (contrato de React Router); desc se deriva del mismo sku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku])

  return (
    <PromocionesModule
      articuloInicial={articuloInicial}
      onCerrarArticulo={() => setArticuloInicial(null)}
    />
  )
}
