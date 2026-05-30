import { useState } from "react"
import {
  hayDatosLocalesSinMigrar,
  loadClientesLocal,
  loadGruposLocal,
  loadCarteraLocal,
  marcarMigrado,
} from "../lib/clientes"
import { migrarLocalStorageAPI, type MigracionResumen } from "../lib/client"

/**
 * Banner one-shot "Migrar a la nube".
 *
 * Solo aparece si esta terminal tiene datos viejos en localStorage
 * (pos_clientes/pos_cartera) que aún no se han migrado a la BD. Al confirmar,
 * sube el dump a /caja/migrar-localstorage (idempotente) y marca la terminal
 * como migrada (`pos_migrado_v1`). NO borra los datos viejos: red de seguridad
 * para rollback manual. El banner desaparece tras una migración exitosa.
 */
export function MigracionNube() {
  // Estado calculado una sola vez al montar: ¿hay datos pendientes?
  const [visible, setVisible] = useState(() => {
    try { return hayDatosLocalesSinMigrar() } catch { return false }
  })
  const [estado, setEstado] = useState<"idle" | "migrando" | "ok" | "error">("idle")
  const [resumen, setResumen] = useState<MigracionResumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!visible) return null

  async function migrar() {
    setEstado("migrando")
    setError(null)
    try {
      const dump = {
        clientes: loadClientesLocal(),
        grupos: loadGruposLocal(),
        cartera: loadCarteraLocal(),
      }
      const r = await migrarLocalStorageAPI(dump)
      setResumen(r.resumen)
      marcarMigrado()
      setEstado("ok")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
      setEstado("error")
    }
  }

  const nClientes = (() => { try { return loadClientesLocal().length } catch { return 0 } })()
  const nCarteras = (() => { try { return Object.keys(loadCarteraLocal()).length } catch { return 0 } })()

  return (
    <div
      style={{
        width: "100%", maxWidth: 720, margin: "0 auto 16px", padding: "14px 18px",
        background: "var(--at-bg-panel)", border: "1px solid var(--at-orange)",
        borderRadius: 10, boxShadow: "0 2px 12px rgba(249,99,2,0.08)",
      }}
    >
      {estado === "ok" && resumen ? (
        <div>
          <p style={{ fontWeight: 700, color: "var(--at-text)", marginBottom: 6 }}>
            ✅ Migración completada
          </p>
          <p style={{ fontSize: 13, color: "var(--at-text-soft)", lineHeight: 1.5 }}>
            {resumen.clientes_creados} cliente(s) creados · {resumen.clientes_omitidos} ya existían ·{" "}
            {resumen.carteras_migradas} cartera(s) migradas · {resumen.movimientos} movimiento(s).
            {resumen.huerfanos.length > 0 && (
              <> {resumen.huerfanos.length} entrada(s) de cartera sin cliente (omitidas).</>
            )}
          </p>
          <p style={{ fontSize: 12, color: "var(--at-text-muted)", marginTop: 6 }}>
            Los datos locales se conservan como respaldo. Puedes cerrar este aviso.
          </p>
          <button
            onClick={() => setVisible(false)}
            style={{
              marginTop: 10, padding: "7px 16px", background: "var(--at-orange)", color: "#fff",
              border: "none", borderRadius: 7, fontWeight: 600, cursor: "pointer",
            }}
          >
            Entendido
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 28 }}>☁️</span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p style={{ fontWeight: 700, color: "var(--at-text)", marginBottom: 2 }}>
              Migrar clientes y cartera a la nube
            </p>
            <p style={{ fontSize: 13, color: "var(--at-text-soft)", lineHeight: 1.4 }}>
              Esta terminal tiene {nClientes} cliente(s) y {nCarteras} cartera(s) guardados solo en este
              navegador. Súbelos a la base de datos para compartirlos entre todas las terminales.
            </p>
            {estado === "error" && error && (
              <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>Error: {error}</p>
            )}
          </div>
          <button
            onClick={migrar}
            disabled={estado === "migrando"}
            style={{
              padding: "9px 18px", background: "var(--at-orange)", color: "#fff", border: "none",
              borderRadius: 7, fontWeight: 600, cursor: estado === "migrando" ? "default" : "pointer",
              opacity: estado === "migrando" ? 0.7 : 1, whiteSpace: "nowrap",
            }}
          >
            {estado === "migrando" ? "Migrando…" : "Migrar a la nube"}
          </button>
        </div>
      )}
    </div>
  )
}
