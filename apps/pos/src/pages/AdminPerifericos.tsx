import { useState } from "react"

/* ── Periph types ───────────────────────────────────────────────── */
interface PeriphPrinter {
  connected: boolean; tipo: string; puerto: string
  copias: number; imprimirLogo: boolean; corteAuto: boolean
}
interface PeriphFingerprint {
  connected: boolean; modelo: string; sensibilidad: number
  usos: { descuentos: boolean; apertura: boolean; gerencial: boolean; puntos: boolean }
  intentosMax: number
}
interface PeriphBarcode {
  connected: boolean; tipoConexion: string; puertoId: string
  symbologias: { ean13: boolean; code128: boolean; qr: boolean; datamatrix: boolean; pdf417: boolean }
  sonido: boolean; prefijo: string; scanInput: string; lastScan: string
}
interface PeriphState { printer: PeriphPrinter; fingerprint: PeriphFingerprint; barcode: PeriphBarcode }

const defaultPeriph: PeriphState = {
  printer: { connected: false, tipo: "Térmica 80mm", puerto: "COM3", copias: 1, imprimirLogo: true, corteAuto: true },
  fingerprint: {
    connected: false, modelo: "ZKTeco ZK4500", sensibilidad: 3,
    usos: { descuentos: true, apertura: true, gerencial: false, puntos: false }, intentosMax: 3,
  },
  barcode: {
    connected: false, tipoConexion: "USB HID", puertoId: "USB-HID-01",
    symbologias: { ean13: true, code128: true, qr: true, datamatrix: false, pdf417: false },
    sonido: true, prefijo: "", scanInput: "", lastScan: "",
  },
}

/* ── Helper sub-components ──────────────────────────────────────── */
function PSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{
      width: 36, height: 20, borderRadius: 10, cursor: "pointer", flexShrink: 0,
      background: checked ? "var(--orange, #f96302)" : "var(--at-border, #d1d5db)",
      position: "relative", transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </div>
  )
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <PSwitch checked={checked} onChange={onChange} />
    </div>
  )
}

function PeriphField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tg-field">
      <label className="tg-label">{label}</label>
      {children}
    </div>
  )
}

function PeriphSection({ icon, title, connected, onToggle, statusOn, statusOff, children }: {
  icon: string; title: string; connected: boolean
  onToggle: (v: boolean) => void; statusOn: string; statusOff: string
  children: React.ReactNode
}) {
  return (
    <div className="tg-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="tg-section-title" style={{ margin: 0 }}>{icon} {title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
            background: connected ? "#dcfce7" : "#f3f4f6",
            color: connected ? "#16a34a" : "#6b7280",
            border: `1px solid ${connected ? "#bbf7d0" : "#e5e7eb"}`,
          }}>
            {connected ? statusOn : statusOff}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "var(--at-text-soft)" }}>Simular conexión</span>
            <PSwitch checked={connected} onChange={onToggle} />
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

/* ── Main panel ─────────────────────────────────────────────────── */
function PerifericosPanel() {
  const [periph, setPeriph] = useState<PeriphState>(defaultPeriph)
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string }>>([])
  const [fpScanning, setFpScanning] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  function addToast(msg: string) {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, msg }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }

  const setPrinter = (patch: Partial<PeriphPrinter>) =>
    setPeriph((prev) => ({ ...prev, printer: { ...prev.printer, ...patch } }))
  const setFp = (patch: Partial<PeriphFingerprint>) =>
    setPeriph((prev) => ({ ...prev, fingerprint: { ...prev.fingerprint, ...patch } }))
  const setBc = (patch: Partial<PeriphBarcode>) =>
    setPeriph((prev) => ({ ...prev, barcode: { ...prev.barcode, ...patch } }))

  function handlePrinterTest() { addToast("✓ Prueba enviada a impresora") }

  function handleFpTest() {
    setFpScanning(true)
    setTimeout(() => { setFpScanning(false); addToast("✓ Huella capturada correctamente") }, 2000)
  }

  function handleScan() {
    const code = periph.barcode.scanInput.trim()
    if (code) setBc({ lastScan: code, scanInput: "" })
  }

  function handleReset() {
    setPeriph(defaultPeriph)
    setShowResetConfirm(false)
    addToast("✓ Valores restaurados")
  }

  const p = periph.printer
  const fp = periph.fingerprint
  const bc = periph.barcode

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Toasts */}
      <div style={{ position: "fixed", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, pointerEvents: "none" }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: "#16a34a", color: "#fff", padding: "8px 14px", borderRadius: 6,
            fontSize: 13, fontWeight: 600, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>{t.msg}</div>
        ))}
      </div>

      {/* ── Impresora ── */}
      <PeriphSection icon="🖨️" title="Impresora de Tickets"
        connected={p.connected} statusOn="Conectada" statusOff="Sin conexión"
        onToggle={(v) => setPrinter({ connected: v })}>
        <PeriphField label="Tipo">
          <select className="tg-input" value={p.tipo} onChange={(e) => setPrinter({ tipo: e.target.value })}>
            {["Térmica 58mm", "Térmica 80mm", "Laser A4"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label="Nombre del puerto">
          <input className="tg-input" value={p.puerto} onChange={(e) => setPrinter({ puerto: e.target.value })} />
        </PeriphField>
        <PeriphField label="Copias por ticket">
          <input className="tg-input" type="number" min={1} max={5} value={p.copias}
            onChange={(e) => setPrinter({ copias: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })} />
        </PeriphField>
        <SwitchRow label="Imprimir logo" checked={p.imprimirLogo} onChange={(v) => setPrinter({ imprimirLogo: v })} />
        <SwitchRow label="Corte automático" checked={p.corteAuto} onChange={(v) => setPrinter({ corteAuto: v })} />
        <button className="tg-btn" style={{ marginTop: 10 }} onClick={handlePrinterTest}>
          🖨️ Prueba de impresión
        </button>
      </PeriphSection>

      {/* ── Huellas ── */}
      <PeriphSection icon="👆" title="Lector de Huellas Digitales"
        connected={fp.connected} statusOn="Listo" statusOff="No detectado"
        onToggle={(v) => setFp({ connected: v })}>
        <PeriphField label="Modelo">
          <select className="tg-input" value={fp.modelo} onChange={(e) => setFp({ modelo: e.target.value })}>
            {["ZKTeco ZK4500", "DigitalPersona 4500", "Futronic FS80"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label={`Sensibilidad: ${fp.sensibilidad}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--at-text-soft)" }}>Baja</span>
            <input type="range" min={1} max={5} value={fp.sensibilidad} style={{ flex: 1 }}
              onChange={(e) => setFp({ sensibilidad: parseInt(e.target.value) })} />
            <span style={{ fontSize: 11, color: "var(--at-text-soft)" }}>Alta</span>
          </div>
        </PeriphField>
        <div className="tg-field">
          <label className="tg-label">Usar para</label>
          {([["descuentos", "Autorizar descuentos"], ["apertura", "Apertura de caja"], ["gerencial", "Acceso gerencial"], ["puntos", "Confirmar uso de puntos (Monedero)"]] as [keyof typeof fp.usos, string][]).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={fp.usos[key]}
                onChange={(e) => setFp({ usos: { ...fp.usos, [key]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
        <PeriphField label="Intentos máximos">
          <input className="tg-input" type="number" min={1} max={5} value={fp.intentosMax}
            onChange={(e) => setFp({ intentosMax: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })} />
        </PeriphField>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 10 }}>
          {fpScanning && (
            <div style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 0 8px #f96302) drop-shadow(0 0 18px #f96302)" }}>
              👆
            </div>
          )}
          <button className="tg-btn" onClick={handleFpTest} disabled={fpScanning}>
            {fpScanning ? "⏳ Escaneando…" : "👆 Capturar huella de prueba"}
          </button>
        </div>
      </PeriphSection>

      {/* ── Código de barras ── */}
      <PeriphSection icon="📷" title="Lector de Código de Barras"
        connected={bc.connected} statusOn="Activo" statusOff="Desconectado"
        onToggle={(v) => setBc({ connected: v })}>
        <PeriphField label="Tipo de conexión">
          <select className="tg-input" value={bc.tipoConexion} onChange={(e) => setBc({ tipoConexion: e.target.value })}>
            {["USB HID", "Serial COM", "Bluetooth"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </PeriphField>
        <PeriphField label="Puerto / ID">
          <input className="tg-input" value={bc.puertoId} onChange={(e) => setBc({ puertoId: e.target.value })} />
        </PeriphField>
        <div className="tg-field">
          <label className="tg-label">Symbologías</label>
          {([["ean13", "EAN-13"], ["code128", "Code 128"], ["qr", "QR Code"], ["datamatrix", "DataMatrix"], ["pdf417", "PDF417"]] as [keyof typeof bc.symbologias, string][]).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={bc.symbologias[key]}
                onChange={(e) => setBc({ symbologias: { ...bc.symbologias, [key]: e.target.checked } })} />
              {label}
            </label>
          ))}
        </div>
        <SwitchRow label="Sonido al escanear" checked={bc.sonido} onChange={(v) => setBc({ sonido: v })} />
        <div style={{ fontSize: 11, color: "var(--at-text-soft)", padding: "4px 0 8px" }}>
          🪙 Este lector también identifica la tarjeta del Monedero (# de cliente) al canjear puntos.
          Activa la exigencia en <strong>Monedero → Configuración</strong>.
        </div>
        <PeriphField label="Prefijo de búsqueda">
          <input className="tg-input" placeholder="Opcional — ej: P-" value={bc.prefijo}
            onChange={(e) => setBc({ prefijo: e.target.value })} />
        </PeriphField>
        <div style={{ marginTop: 10, background: "var(--at-bg, #f5f5f7)", borderRadius: 6, padding: 10, border: "1px solid var(--at-border, #e5e7eb)" }}>
          <div className="tg-label" style={{ marginBottom: 6 }}>Simular escaneo (escribe o pega código)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="tg-input" placeholder="Ej: 7501030301321" value={bc.scanInput}
              onChange={(e) => setBc({ scanInput: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && handleScan()} />
            <button className="tg-btn" onClick={handleScan}>📷 Escanear</button>
          </div>
          {bc.lastScan && (
            <div style={{ marginTop: 8 }}>
              <div className="tg-label" style={{ marginBottom: 4 }}>Último código leído:</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input className="tg-input" readOnly value={bc.lastScan} style={{ flex: 1, background: "var(--at-bg-card, #fff)" }} />
                <button className="tg-btn" style={{ padding: "6px 10px", fontSize: 14 }} title="Copiar"
                  onClick={() => { try { navigator.clipboard.writeText(bc.lastScan) } catch { /* noop */ } }}>
                  📋
                </button>
              </div>
            </div>
          )}
        </div>
      </PeriphSection>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--at-border, #e5e7eb)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, marginTop: "auto" }}>
        <button className="tg-btn tg-btn-primary" onClick={() => addToast("✓ Configuración guardada")}>
          💾 Guardar configuración
        </button>
        {showResetConfirm ? (
          <>
            <span style={{ fontSize: 13, color: "var(--at-text-soft)" }}>¿Restaurar valores predeterminados?</span>
            <button className="tg-btn" style={{ background: "#dc2626", color: "#fff", border: "none" }} onClick={handleReset}>Sí</button>
            <button className="tg-btn" onClick={() => setShowResetConfirm(false)}>Cancelar</button>
          </>
        ) : (
          <button className="tg-btn" onClick={() => setShowResetConfirm(true)}>↺ Restaurar valores predeterminados</button>
        )}
      </div>
    </div>
  )
}

export function AdminPerifericos() {
  return <PerifericosPanel />
}
