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
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: conectado ? "#22c55e" : "#ef4444",
          flexShrink: 0,
        }}
      />
      {conectado ? (
        <span style={{ fontSize: 12, color: "#666" }}>Impresora conectada</span>
      ) : (
        <button onClick={handleConectar} className="btn-secondary btn-sm">
          Conectar impresora / cajón
        </button>
      )}
      {error && <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>}
    </div>
  )
}
