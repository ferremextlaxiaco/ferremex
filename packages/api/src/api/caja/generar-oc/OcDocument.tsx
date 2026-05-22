import {
  Document, Page, View, Text, Image, StyleSheet,
  Svg, Path,
} from "@react-pdf/renderer"

// ── Configuración de empresa ──────────────────────────────────────────────────
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

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 9, color: "#111827", paddingTop: 36, paddingRight: 40, paddingBottom: 36, paddingLeft: 40 },
  z1:          { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 10, borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: ORANGE },
  fmBox:       { width: 40, height: 40, backgroundColor: ORANGE, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  fmText:      { color: "white", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  companyBlock:{ marginLeft: 10, flexDirection: "column" },
  coName:      { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" },
  coSub:       { fontSize: 7.5, color: GRAY },
  coInfo:      { fontSize: 7.5, color: GRAY, marginTop: 1 },
  ocBlock:     { flexDirection: "column", alignItems: "flex-end" },
  ocTitle:     { fontSize: 14, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.5, color: ORANGE },
  ocNum:       { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827" },
  ocMeta:      { flexDirection: "row", marginTop: 2 },
  ocMetaItem:  { flexDirection: "column", alignItems: "flex-end", marginLeft: 16 },
  ocLabel:     { fontSize: 7, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  ocVal:       { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
  z2:          { backgroundColor: BG_SUP, borderWidth: 1, borderStyle: "solid", borderColor: BORDER, borderRadius: 4, paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12, marginBottom: 10, flexDirection: "row", flexWrap: "wrap" },
  supGroup:    { flexDirection: "column", marginRight: 18 },
  supLabel:    { fontSize: 6.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  supVal:      { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
  supValSm:    { fontSize: 8, color: "#374151" },
  tHead:       { flexDirection: "row", backgroundColor: ORANGE, paddingTop: 5, paddingRight: 4, paddingBottom: 5, paddingLeft: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  th:          { fontSize: 7, fontFamily: "Helvetica-Bold", color: "white", textTransform: "uppercase", letterSpacing: 0.5 },
  tRow:        { flexDirection: "row", paddingTop: 3, paddingRight: 4, paddingBottom: 3, paddingLeft: 4, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: BORDER, alignItems: "center", minHeight: 38 },
  tRowAlt:     { backgroundColor: "#fafafa" },
  tRowFree:    { backgroundColor: "#fffbf7" },
  td:          { fontSize: 8, color: "#111827" },
  tdMuted:     { fontSize: 7.5, color: GRAY },
  freeBadge:   { fontSize: 6, fontFamily: "Helvetica-Bold", color: "#92400e", backgroundColor: "#fef3c7", paddingTop: 1, paddingRight: 4, paddingBottom: 1, paddingLeft: 4, borderRadius: 8, marginLeft: 4 },
  cNum:        { width: "4%" },
  cImg:        { width: "10%" },
  cSku:        { width: "11%" },
  cDesc:       { width: "33%" },
  cUm:         { width: "8%", textAlign: "center" },
  cQty:        { width: "8%", textAlign: "right" },
  cPrice:      { width: "12%", textAlign: "right" },
  cNotes:      { width: "14%" },
  thumb:       { width: 32, height: 32, borderRadius: 3 },
  thumbBox:    { width: 32, height: 32, backgroundColor: "#e5e7eb", borderRadius: 3, alignItems: "center", justifyContent: "center" },
  z4:          { flexDirection: "row", alignItems: "flex-end", borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: BORDER, paddingTop: 8, marginTop: 6 },
  notesBox:    { flex: 1, flexDirection: "column" },
  notesLbl:    { fontSize: 6.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.5 },
  notesBorder: { borderWidth: 1, borderStyle: "dashed", borderColor: "#d1d5db", borderRadius: 3, paddingTop: 4, paddingRight: 6, paddingBottom: 4, paddingLeft: 6, height: 36 },
  notesHint:   { fontSize: 7.5, color: "#d1d5db" },
  totalBox:    { alignItems: "center", minWidth: 80, marginLeft: 12 },
  totalNum:    { fontSize: 28, fontFamily: "Helvetica-Bold", color: ORANGE, lineHeight: 1 },
  totalLbl:    { fontSize: 7, color: GRAY, textAlign: "center", marginTop: 1 },
  sigBox:      { minWidth: 130, alignItems: "center", marginLeft: 12 },
  sigLine:     { width: 130, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#9ca3af" },
  sigLbl:      { fontSize: 7.5, color: GRAY, marginTop: 3 },
  pgNum:       { fontSize: 7, color: "#9ca3af", textAlign: "center", marginTop: 6 },
  cHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: ORANGE, paddingBottom: 5, marginBottom: 8 },
  cHLeft:      { flexDirection: "row", alignItems: "center" },
  cHFmBox:     { width: 24, height: 24, backgroundColor: ORANGE, borderRadius: 4, alignItems: "center", justifyContent: "center", marginRight: 6 },
  cHFmText:    { color: "white", fontSize: 9, fontFamily: "Helvetica-Bold" },
  cHTitle:     { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" },
  cHRight:     { flexDirection: "column", alignItems: "flex-end" },
  cHOc:        { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: ORANGE },
  cHLbl:       { fontSize: 7, color: GRAY },
} as any)

function WrenchIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="#9ca3af" strokeWidth={1.5} fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  )
}

function FullHeader({ ocNumber, fechaEmision }: { ocNumber: string; fechaEmision: string }) {
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
        <Text style={s.ocTitle}>Orden de Compra</Text>
        <Text style={s.ocNum}>{ocNumber}</Text>
        <View style={s.ocMeta}>
          <View style={s.ocMetaItem}>
            <Text style={s.ocLabel}>Fecha emisión</Text>
            <Text style={s.ocVal}>{fechaEmision}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function CompactHeader({ ocNumber, pageNum, totalPages }: { ocNumber: string; pageNum: number; totalPages: number }) {
  return (
    <View style={s.cHeader}>
      <View style={s.cHLeft}>
        <View style={s.cHFmBox}><Text style={s.cHFmText}>FM</Text></View>
        <Text style={s.cHTitle}>{FERREMEX.nombre} — Continuación</Text>
      </View>
      <View style={s.cHRight}>
        <Text style={s.cHOc}>{ocNumber}</Text>
        <Text style={s.cHLbl}>Página {pageNum} de {totalPages}</Text>
      </View>
    </View>
  )
}

function SupplierBar({ proveedor }: { proveedor: any }) {
  if (!proveedor) return null
  const fields = [
    { label: "Proveedor", val: proveedor.nombre,   bold: true },
    { label: "Dirección", val: proveedor.direccion },
    { label: "Teléfono",  val: proveedor.telefono },
    { label: "Email",     val: proveedor.email },
    { label: "Ejecutivo", val: proveedor.contacto },
  ].filter(f => f.val)
  return (
    <View style={s.z2}>
      {fields.map(f => (
        <View key={f.label} style={s.supGroup}>
          <Text style={s.supLabel}>{f.label}</Text>
          <Text style={f.bold ? s.supVal : s.supValSm}>{f.val}</Text>
        </View>
      ))}
    </View>
  )
}

function TableHeader({ mostrarPrecios, mostrarImagenes }: { mostrarPrecios: boolean; mostrarImagenes: boolean }) {
  return (
    <View style={s.tHead}>
      <Text style={[s.th, s.cNum]}>#</Text>
      {mostrarImagenes && <Text style={[s.th, s.cImg]}> </Text>}
      <Text style={[s.th, s.cSku]}>SKU</Text>
      <Text style={[s.th, s.cDesc]}>Descripción</Text>
      <Text style={[s.th, s.cUm]}>U.M.</Text>
      <Text style={[s.th, s.cQty]}>Cant.</Text>
      {mostrarPrecios && <Text style={[s.th, s.cPrice]}>P. Unit.</Text>}
      <Text style={[s.th, s.cNotes]}>Notas</Text>
    </View>
  )
}

function ItemRow({ item, globalIdx, imageMap, mostrarPrecios, mostrarImagenes }: {
  item: any; globalIdx: number; imageMap: Record<string, string>; mostrarPrecios: boolean; mostrarImagenes: boolean
}) {
  const isAlt  = globalIdx % 2 === 1
  const isFree = !!item._isFree
  const imgKey = item._id || item.articuloId
  const imgSrc = (imgKey && imageMap?.[imgKey]) ? imageMap[imgKey] : null

  return (
    <View style={[s.tRow, isAlt && s.tRowAlt, isFree && s.tRowFree]} wrap={false}>
      <Text style={[s.tdMuted, s.cNum]}>{globalIdx + 1}</Text>
      {mostrarImagenes && (
        <View style={s.cImg}>
          {imgSrc
            ? <Image src={imgSrc} style={s.thumb} />
            : <View style={s.thumbBox}><WrenchIcon /></View>
          }
        </View>
      )}
      <Text style={[s.tdMuted, s.cSku]}>{item.clave || "—"}</Text>
      <View style={[s.cDesc, { flexDirection: "row", alignItems: "center" }]}>
        <Text style={isFree ? [s.td, { fontFamily: "Helvetica-Bold" }] : s.td}>{item.descripcion}</Text>
        {isFree && <Text style={s.freeBadge}>LIBRE</Text>}
      </View>
      <Text style={[s.tdMuted, s.cUm]}>{item.unidad || "PZA"}</Text>
      <Text style={[s.td, s.cQty, { fontFamily: "Helvetica-Bold" }]}>{item.cantidad}</Text>
      {mostrarPrecios && (
        <Text style={[s.td, s.cPrice]}>
          {item.ultimoPrecioCompra > 0 ? `$${Number(item.ultimoPrecioCompra).toFixed(2)}` : "—"}
        </Text>
      )}
      <Text style={[s.tdMuted, s.cNotes]}>{item.notas || ""}</Text>
    </View>
  )
}

function Footer({ totalItems }: { totalItems: number }) {
  return (
    <View style={s.z4}>
      <View style={s.notesBox}>
        <Text style={s.notesLbl}>Notas generales</Text>
        <View style={s.notesBorder}>
          <Text style={s.notesHint}>Instrucciones especiales o comentarios sobre este pedido...</Text>
        </View>
      </View>
      <View style={s.totalBox}>
        <Text style={s.totalNum}>{totalItems}</Text>
        <Text style={s.totalLbl}>renglones en{"\n"}esta orden</Text>
      </View>
      <View style={s.sigBox}>
        <View style={s.sigLine} />
        <Text style={s.sigLbl}>Autorizado por:</Text>
      </View>
    </View>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

const ITEMS_P1 = 15
const ITEMS_PN = 20

export function OCDocument({
  rows           = [] as any[],
  freeItems      = [] as any[],
  imageMap       = {} as Record<string, string>,
  proveedor      = null as any,
  ocNumber       = "",
  fechaEmision   = "",
  mostrarPrecios  = true,
  mostrarImagenes = true,
}) {
  const all = [
    ...rows.map((r: any) => ({ ...r, _isFree: false })),
    ...freeItems.map((f: any) => ({ ...f, _isFree: true })),
  ]

  const pages: any[][] = []
  let i = 0
  do {
    const limit = pages.length === 0 ? ITEMS_P1 : ITEMS_PN
    pages.push(all.slice(i, i + limit))
    i += limit
  } while (i < all.length)
  if (pages.length === 0) pages.push([])

  const totalPages = pages.length
  const totalItems = all.length

  return (
    <Document title={`Orden de Compra ${ocNumber}`} author="Ferremex">
      {pages.map((pageItems, pIdx) => {
        const startIdx = pIdx === 0 ? 0 : ITEMS_P1 + (pIdx - 1) * ITEMS_PN
        return (
          <Page key={pIdx} size="LETTER" style={s.page}>
            {pIdx === 0
              ? <FullHeader ocNumber={ocNumber} fechaEmision={fechaEmision} />
              : <CompactHeader ocNumber={ocNumber} pageNum={pIdx + 1} totalPages={totalPages} />
            }
            {pIdx === 0 && <SupplierBar proveedor={proveedor} />}
            <TableHeader mostrarPrecios={mostrarPrecios} mostrarImagenes={mostrarImagenes} />
            {pageItems.map((item, rowIdx) => (
              <ItemRow
                key={item._id || (startIdx + rowIdx)}
                item={item}
                globalIdx={startIdx + rowIdx}
                imageMap={imageMap}
                mostrarPrecios={mostrarPrecios}
                mostrarImagenes={mostrarImagenes}
              />
            ))}
            {pIdx === totalPages - 1 && <Footer totalItems={totalItems} />}
            <Text style={s.pgNum}>
              {"Página " + (pIdx + 1) + " de " + totalPages + "  ·  " + ocNumber + "  ·  " + FERREMEX.nombre}
            </Text>
          </Page>
        )
      })}
    </Document>
  )
}
