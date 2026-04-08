import { useRef, useState } from "react"
import { buscarProductos, type ProductoPOS } from "../lib/client"
import { usePOS } from "../lib/pos-store"

export function Buscador() {
  const [query, setQuery] = useState("")
  const [resultados, setResultados] = useState<ProductoPOS[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { dispatch } = usePOS()
  const inputRef = useRef<HTMLInputElement>(null)

  async function buscar(q: string) {
    const texto = q.trim()
    if (!texto) return
    setBuscando(true)
    setError(null)
    try {
      const res = await buscarProductos(texto)
      setResultados(res)
      if (res.length === 1 && res[0]) {
        // Un único resultado: agregar automáticamente al carrito
        agregarAlCarrito(res[0])
        setQuery("")
        setResultados([])
      }
    } catch {
      setError("Error al buscar. Verifica la conexión con el servidor.")
    } finally {
      setBuscando(false)
    }
  }

  function agregarAlCarrito(p: ProductoPOS) {
    dispatch({ type: "ADD_ITEM", item: { sku: p.sku, descripcion: p.descripcion, precio: p.precio } })
    setResultados([])
    setQuery("")
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") buscar(query)
    if (e.key === "Escape") {
      setResultados([])
      setQuery("")
    }
  }

  return (
    <div className="buscador">
      <div className="buscador-input-row">
        <input
          ref={inputRef}
          autoFocus
          type="text"
          className="buscador-input"
          placeholder="🔍  Buscar producto o código de barras…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn-primary"
          onClick={() => buscar(query)}
          disabled={buscando}
        >
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {resultados.length > 0 && (
        <ul className="resultados-lista">
          {resultados.map((p) => (
            <li key={p.sku} className="resultado-item">
              <div className="resultado-info">
                <span className="resultado-desc">{p.descripcion}</span>
                <span className="resultado-sku">{p.sku}</span>
              </div>
              <div className="resultado-derecha">
                <span className="resultado-precio">${p.precio.toFixed(2)}</span>
                <span className="resultado-stock">Stock: {p.existencia}</span>
                <button
                  className="btn-agregar"
                  onClick={() => agregarAlCarrito(p)}
                  disabled={p.existencia <= 0}
                >
                  + Agregar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resultados.length === 0 && query && !buscando && (
        <p className="sin-resultados">Sin resultados para "{query}"</p>
      )}
    </div>
  )
}
