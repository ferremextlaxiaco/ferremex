import {
  Document, Page, View, Text, Image, StyleSheet,
  Svg, Path,
} from "@react-pdf/renderer"

// ── Configuración de empresa (misma que la OC / factura) ──────────────────────
const FERREMEX = {
  nombre:    "FERREMEX",
  sub:       "Ferretería y Materiales para Construcción",
  rfc:       "FTL960101XXX",
  direccion: "Av. Independencia s/n, Centro, Tlaxiaco, Oaxaca 69800, México",
  telefono:  "(953) 552-0000",
  email:     "contacto@ferremex.mx",
}

const ORANGE = "#F96302"
const GRAY   = "#6b7280"
const BORDER = "#e5e7eb"
const BG_SUP = "#f9fafb"

// ── Estilos (clon de OcDocument, adaptado a nota de venta) ────────────────────
const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 9, color: "#111827", paddingTop: 36, paddingRight: 40, paddingBottom: 40, paddingLeft: 40 },

  // Zona 1: encabezado
  z1:          { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 10, borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: ORANGE },
  fmBox:       { width: 40, height: 40, backgroundColor: ORANGE, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  fmText:      { color: "white", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  companyBlock:{ marginLeft: 10, flexDirection: "column" },
  coName:      { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" },
  coSub:       { fontSize: 7.5, color: GRAY },
  coInfo:      { fontSize: 7.5, color: GRAY, marginTop: 1 },
  ocBlock:     { flexDirection: "column", alignItems: "flex-end" },
  ocTitle:     { fontSize: 14, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.5, color: ORANGE },
  ocNum:       { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 2 },
  ocMeta:      { flexDirection: "row", marginTop: 3 },
  ocMetaItem:  { flexDirection: "column", alignItems: "flex-end", marginLeft: 16 },
  ocLabel:     { fontSize: 7, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  ocVal:       { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },

  // Zona 2: barra de cliente
  z2:          { backgroundColor: BG_SUP, borderWidth: 1, borderStyle: "solid", borderColor: BORDER, borderRadius: 4, paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, marginBottom: 10, flexDirection: "row", flexWrap: "wrap" },
  supGroup:    { flexDirection: "column", marginRight: 18 },
  supLabel:    { fontSize: 6.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  supVal:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 1.5 },
  supValSm:    { fontSize: 8, color: "#374151", marginTop: 1.5 },

  // Zona 3: tabla
  tHead:       { flexDirection: "row", backgroundColor: ORANGE, paddingTop: 5, paddingBottom: 5, paddingLeft: 4, paddingRight: 4 },
  th:          { fontSize: 7, fontFamily: "Helvetica-Bold", color: "white", textTransform: "uppercase", letterSpacing: 0.5 },
  tRow:        { flexDirection: "row", paddingTop: 3, paddingBottom: 3, paddingLeft: 4, paddingRight: 4, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER, alignItems: "center", minHeight: 30 },
  tRowAlt:     { backgroundColor: "#fafafa" },
  td:          { fontSize: 8, color: "#111827" },
  tdMuted:     { fontSize: 7.5, color: GRAY },

  // Thumbnail / placeholder
  thumb:       { width: 30, height: 30, borderRadius: 3 },
  thumbBox:    { width: 30, height: 30, backgroundColor: "#e5e7eb", borderRadius: 3, alignItems: "center", justifyContent: "center" },

  // Zona 4: totales
  totalsWrap:  { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  totalsBox:   { width: 220 },
  totRow:      { flexDirection: "row", justifyContent: "space-between", paddingTop: 3, paddingBottom: 3 },
  totLbl:      { fontSize: 9, color: GRAY },
  totVal:      { fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" },
  totRowGrand: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, paddingBottom: 4, marginTop: 3, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: ORANGE },
  totGrandLbl: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#111827" },
  totGrandVal: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ORANGE },

  // Zona 5: notas + pie
  notasBox:    { marginTop: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#d1d5db", borderRadius: 4, paddingTop: 6, paddingBottom: 6, paddingLeft: 8, paddingRight: 8 },
  notasLbl:    { fontSize: 6.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  notasTxt:    { fontSize: 8.5, color: "#374151" },

  payRow:      { flexDirection: "row", marginTop: 14, flexWrap: "wrap" },
  payGroup:    { flexDirection: "column", marginRight: 22 },
  payLabel:    { fontSize: 6.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  payVal:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 1.5 },

  legal:       { fontSize: 7, color: "#9ca3af", textAlign: "center", marginTop: 18 },
  pgNum:       { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: "#9ca3af", textAlign: "center" },

  // Column widths — se recomponen según toggles.
  // Todas las columnas fijas usan flexGrow/flexShrink 0 + flexBasis explícito, y
  // SOLO la descripción crece (flexGrow 1, flexBasis 0). Así el header y las filas
  // reparten el espacio de forma IDÉNTICA y las columnas no se desfasan cuando una
  // descripción envuelve en varias líneas (bug de alineación con `width` + flexGrow).
  cNum:        { flexGrow: 0, flexShrink: 0, flexBasis: "5%" },
  cImg:        { flexGrow: 0, flexShrink: 0, flexBasis: "10%" },
  cSku:        { flexGrow: 0, flexShrink: 0, flexBasis: "14%" },
  cDesc:       { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cQty:        { flexGrow: 0, flexShrink: 0, flexBasis: "9%", textAlign: "right" },
  cPrice:      { flexGrow: 0, flexShrink: 0, flexBasis: "15%", textAlign: "right" },
  cSub:        { flexGrow: 0, flexShrink: 0, flexBasis: "16%", textAlign: "right" },
})

// ── Ícono llave (Lucide) para placeholder de imagen ───────────────────────────
function WrenchIcon({ size = 13 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="#9ca3af"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function money(n: number): string {
  return `$${(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface NotaVentaItem {
  sku: string
  descripcion: string
  cantidad: number
  precio_unitario: number // CON IVA (tal como se cobró)
  subtotal: number        // CON IVA
  impuesto: boolean       // ¿el producto causa IVA?
}

export interface NotaVentaOpts {
  imagen: boolean
  sku: boolean
  precio: boolean
  cliente: boolean
  vendedor: boolean
  notas: boolean
  notasTexto?: string
}

export interface NotaVentaProps {
  folio: string
  fecha: string          // legible (ya formateada)
  cajero: string
  vendedor?: string | null
  clienteNombre?: string | null
  clienteRfc?: string | null
  metodoPago?: string | null
  items: NotaVentaItem[]
  imageMap: Record<string, string> // sku → dataURI
  opts: NotaVentaOpts
}

// ── Encabezado ────────────────────────────────────────────────────────────────
function Header({ folio, fecha }: { folio: string; fecha: string }) {
  return (
    <View style={s.z1}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={s.fmBox}><Text style={s.fmText}>FM</Text></View>
        <View style={s.companyBlock}>
          <Text style={s.coName}>{FERREMEX.nombre}</Text>
          <Text style={s.coSub}>{FERREMEX.sub}</Text>
          <Text style={s.coInfo}>RFC: {FERREMEX.rfc}</Text>
          <Text style={s.coInfo}>{FERREMEX.direccion}</Text>
          <Text style={s.coInfo}>Tel: {FERREMEX.telefono}  ·  {FERREMEX.email}</Text>
        </View>
      </View>
      <View style={s.ocBlock}>
        <Text style={s.ocTitle}>Nota de Venta</Text>
        <Text style={s.ocNum}>{folio}</Text>
        <View style={s.ocMeta}>
          <View style={s.ocMetaItem}>
            <Text style={s.ocLabel}>Fecha</Text>
            <Text style={s.ocVal}>{fecha}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ── Barra de cliente ──────────────────────────────────────────────────────────
function ClienteBar({ nombre, rfc }: { nombre?: string | null; rfc?: string | null }) {
  const fields = [
    { label: "Cliente", val: nombre || "Público en general", bold: true },
    ...(rfc ? [{ label: "RFC", val: rfc, bold: false }] : []),
  ]
  return (
    <View style={s.z2}>
      {fields.map((f) => (
        <View key={f.label} style={s.supGroup}>
          <Text style={s.supLabel}>{f.label}</Text>
          <Text style={f.bold ? s.supVal : s.supValSm}>{f.val}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Encabezado de tabla ───────────────────────────────────────────────────────
function TableHeader({ opts }: { opts: NotaVentaOpts }) {
  return (
    <View style={s.tHead}>
      <Text style={[s.th, s.cNum]}>#</Text>
      {opts.imagen && <Text style={[s.th, s.cImg]}> </Text>}
      {opts.sku && <Text style={[s.th, s.cSku]}>SKU</Text>}
      <Text style={[s.th, s.cDesc]}>Descripción</Text>
      <Text style={[s.th, s.cQty]}>Cant.</Text>
      {opts.precio && <Text style={[s.th, s.cPrice]}>P. Unit.</Text>}
      {opts.precio && <Text style={[s.th, s.cSub]}>Importe</Text>}
    </View>
  )
}

// ── Fila de artículo ──────────────────────────────────────────────────────────
function ItemRow({ item, idx, imageMap, opts }: { item: NotaVentaItem; idx: number; imageMap: Record<string, string>; opts: NotaVentaOpts }) {
  const isAlt = idx % 2 === 1
  const img = opts.imagen ? imageMap[item.sku] : null
  // Precio SIN IVA para el desglose tipo factura (el guardado es con IVA si causa).
  const factor = item.impuesto ? 1.16 : 1
  const puSinIva = item.precio_unitario / factor
  const subSinIva = item.subtotal / factor
  return (
    <View style={[s.tRow, isAlt ? s.tRowAlt : {}]} wrap={false}>
      <Text style={[s.tdMuted, s.cNum]}>{idx + 1}</Text>
      {opts.imagen && (
        <View style={s.cImg}>
          {img
            ? <Image src={img} style={s.thumb} />
            : <View style={s.thumbBox}><WrenchIcon /></View>}
        </View>
      )}
      {opts.sku && <Text style={[s.tdMuted, s.cSku]}>{item.sku || "—"}</Text>}
      <Text style={[s.td, s.cDesc]}>{item.descripcion}</Text>
      <Text style={[s.td, s.cQty, { fontFamily: "Helvetica-Bold" }]}>{item.cantidad}</Text>
      {opts.precio && <Text style={[s.td, s.cPrice]}>{money(puSinIva)}</Text>}
      {opts.precio && <Text style={[s.td, s.cSub, { fontFamily: "Helvetica-Bold" }]}>{money(subSinIva)}</Text>}
    </View>
  )
}

// ── Totales (desglose Subtotal + IVA + Total) ─────────────────────────────────
function Totales({ subtotal, iva, total }: { subtotal: number; iva: number; total: number }) {
  return (
    <View style={s.totalsWrap}>
      <View style={s.totalsBox}>
        <View style={s.totRow}>
          <Text style={s.totLbl}>Subtotal</Text>
          <Text style={s.totVal}>{money(subtotal)}</Text>
        </View>
        <View style={s.totRow}>
          <Text style={s.totLbl}>IVA (16%)</Text>
          <Text style={s.totVal}>{money(iva)}</Text>
        </View>
        <View style={s.totRowGrand}>
          <Text style={s.totGrandLbl}>TOTAL</Text>
          <Text style={s.totGrandVal}>{money(total)}</Text>
        </View>
      </View>
    </View>
  )
}

// ── Documento ─────────────────────────────────────────────────────────────────
export function NotaVentaDocument({
  folio, fecha, cajero, vendedor, clienteNombre, clienteRfc, metodoPago,
  items, imageMap, opts,
}: NotaVentaProps) {
  // Totales: desglose hacia atrás por línea (respeta productos exentos de IVA).
  let subtotal = 0
  let iva = 0
  for (const it of items) {
    const factor = it.impuesto ? 1.16 : 1
    const base = it.subtotal / factor
    subtotal += base
    iva += it.subtotal - base
  }
  const total = subtotal + iva

  return (
    <Document title={`Nota de venta ${folio}`} author="Ferremex">
      <Page size="LETTER" style={s.page}>
        <Header folio={folio} fecha={fecha} />
        {opts.cliente && <ClienteBar nombre={clienteNombre} rfc={clienteRfc} />}
        <TableHeader opts={opts} />
        {items.map((item, i) => (
          <ItemRow key={item.sku + "_" + i} item={item} idx={i} imageMap={imageMap} opts={opts} />
        ))}
        {opts.precio && <Totales subtotal={subtotal} iva={iva} total={total} />}

        {opts.notas && !!opts.notasTexto?.trim() && (
          <View style={s.notasBox}>
            <Text style={s.notasLbl}>Notas / observaciones</Text>
            <Text style={s.notasTxt}>{opts.notasTexto}</Text>
          </View>
        )}

        <View style={s.payRow}>
          <View style={s.payGroup}>
            <Text style={s.payLabel}>Atendió</Text>
            <Text style={s.payVal}>{cajero}</Text>
          </View>
          {opts.vendedor && !!vendedor && vendedor !== cajero && (
            <View style={s.payGroup}>
              <Text style={s.payLabel}>Vendedor</Text>
              <Text style={s.payVal}>{vendedor}</Text>
            </View>
          )}
          {metodoPago && (
            <View style={s.payGroup}>
              <Text style={s.payLabel}>Forma de pago</Text>
              <Text style={s.payVal}>{metodoPago}</Text>
            </View>
          )}
        </View>

        <Text style={s.legal}>
          Este documento es una nota de venta y NO es un comprobante fiscal digital (CFDI).
        </Text>
        <Text style={s.pgNum} render={({ pageNumber, totalPages }) => (
          `${FERREMEX.nombre}  ·  Nota de venta ${folio}  ·  Página ${pageNumber} de ${totalPages}`
        )} fixed />
      </Page>
    </Document>
  )
}
