import { useState } from "react"
import { conectarImpresora, impresoraConectada, serialDisponible } from "../lib/serial"

export function ConectorImpresora() {
  const [conectado, setConectado] = useState(impresoraConectada())
  const [error, setError] = useState<string | null>(null)

  if (!serialDisponible()) return null

  async function handleConectar() {
    setError(null)
    try {
      await conectarImpresora()
      setConectado(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al conectar"
      if (!msg.includes("No port selected")) setError(msg)
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {conectado ? (
        <button className="btn-conectar-impresora conectada" disabled>
          <span style={{ fontSize: 9 }}>●</span> Impresora lista
        </button>
      ) : (
        <button className="btn-conectar-impresora" onClick={handleConectar}>
          <span style={{ fontSize: 9 }}>●</span> Conectar impresora / cajón
        </button>
      )}
      {error && <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
    </div>
  )
}
