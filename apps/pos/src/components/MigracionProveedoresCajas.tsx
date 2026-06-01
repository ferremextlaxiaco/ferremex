import { useState } from "react"
import {
  hayProveedoresLocalesSinMigrar,
  loadProveedoresLocal,
  marcarMigradoProvCajas,
  STORAGE_KEY_MIGRADO_PROV_CAJAS,
} from "../lib/proveedores"
import { migrarProveedoresCajasAPI, type MigracionProvCajasResumen } from "../lib/client"

/**
 * Banner one-shot "Migrar proveedores y cajas a la nube".
 *
 * Aparece si esta terminal tiene proveedores, cajas o asignaciones en
 * localStorage (pos_proveedores / pos_cajas_catalogo / pos_cajas_asignaciones)
 * aún no migrados a la BD. Al confirmar, sube el dump a
 * /caja/migrar-proveedores-cajas (idempotente) y marca la terminal como migrada.
 * NO borra los datos viejos: red de seguridad para rollback manual.
 *
 * Espejo de MigracionNube (clientes/cartera).
 */

const LS_CAJAS = "pos_cajas_catalogo"
const LS_ASIGNACION = "pos_cajas_asignaciones"

function loadCajasLocal(): { id?: string | number; nombre: string; descripcion?: string; activa?: boolean }[] {
  try {
    const raw = localStorage.getItem(LS_CAJAS)
    return raw ? (JSON.parse(raw) as any[]) : []
  } catch {
    return []
  }
}

/** Record<usuarioId, nombreCaja> tal como lo guardaba EmployeesModule. */
function loadAsignacionesLocal(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_ASIGNACION)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** ¿Hay algo de proveedores/cajas/asignaciones sin migrar en esta terminal? */
function hayDatosProvCajasSinMigrar(): boolean {
  if (localStorage.getItem(STORAGE_KEY_MIGRADO_PROV_CAJAS) === "1") return false
  return (
    hayProveedoresLocalesSinMigrar() ||
    loadCajasLocal().length > 0 ||
    Object.keys(loadAsignacionesLocal()).length > 0
  )
}

export function MigracionProveedoresCajas() {
  const [visible, setVisible] = useState(() => {
    try { return hayDatosProvCajasSinMigrar() } catch { return false }
  })
  const [estado, setEstado] = useState<"idle" | "migrando" | "ok" | "error">("idle")
  const [resumen, setResumen] = useState<MigracionProvCajasResumen | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!visible) return null

  async function migrar() {
    setEstado("migrando")
    setError(null)
    try {
      const dump = {
        proveedores: loadProveedoresLocal(),
        cajas: loadCajasLocal().map((c) => ({
          id: c.id,
          nombre: c.nombre,
          descripcion: c.descripcion ?? null,
          activa: c.activa ?? true,
        })),
        asignaciones: loadAsignacionesLocal(),
      }
      const r = await migrarProveedoresCajasAPI(dump)
      setResumen(r.resumen)
      marcarMigradoProvCajas()
      setEstado("ok")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
      setEstado("error")
    }
  }

  const nProv = (() => { try { return loadProveedoresLocal().length } catch { return 0 } })()
  const nCajas = (() => { try { return loadCajasLocal().length } catch { return 0 } })()

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
            {resumen.proveedores_creados} proveedor(es) creados · {resumen.proveedores_omitidos} ya existían ·{" "}
            {resumen.facturas} factura(s) · {resumen.cajas_creadas} caja(s) creadas ·{" "}
            {resumen.asignaciones_aplicadas} asignación(es).
            {resumen.huerfanos.length > 0 && (
              <> {resumen.huerfanos.length} asignación(es) no aplicadas (omitidas).</>
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
              Migrar proveedores y cajas a la nube
            </p>
            <p style={{ fontSize: 13, color: "var(--at-text-soft)", lineHeight: 1.4 }}>
              Esta terminal tiene {nProv} proveedor(es) y {nCajas} caja(s) guardados solo en este
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
