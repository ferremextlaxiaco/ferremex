/**
 * Lógica de la FACTURA GLOBAL del día (público en general) — PURA, sin I/O.
 *
 * Agrupa las ventas de público en general de un período en líneas por SKU y las
 * clasifica en tres grupos según el "doble inventario fiscal" (saldo facturable):
 *
 *  - ENTRAN     → el depto es facturable Y hay saldo facturable suficiente (o el
 *                 artículo es "ilimitado": sin fila de saldo y depto facturable).
 *  - EXCLUIDAS  → el depto NO es facturable, o el saldo es insuficiente.
 *  - SIN CLAVE  → el artículo no tiene clave SAT → BLOQUEANTE (rompería el
 *                 timbrado de toda la global). Se reporta aparte.
 *
 * El usuario puede FORZAR incluir las excluidas por saldo (decisión: "excluir +
 * permitir forzar con advertencia"); las de depto-no-facturable y las sin clave
 * SAT nunca se fuerzan desde aquí (depto = decisión fiscal; sin clave = imposible).
 *
 * La ruta es quien resuelve depto/clave SAT (resolver fiscal) y el saldo facturable
 * (módulo ferremex_facturable) y se los pasa a estas funciones ya resueltos.
 */

/** Una venta del POS, reducida a lo que la global necesita. */
export interface VentaGlobalIn {
  folio: string
  fecha: string
  estado?: string
  cliente_id?: string | null
  /** Si la venta ya tiene factura nominativa, NO entra a la global. */
  factura?: { cfdi_id?: string } | null
  /** Si ya fue incluida en una global previa, NO se reprocesa. */
  global_uuid?: string | null
  items?: { sku?: string; descripcion?: string; cantidad: number; precio_unitario: number }[]
}

/** Línea agregada por SKU para la global. */
export interface LineaGlobal {
  sku: string
  descripcion: string
  cantidad: number          // suma de cantidades del período
  importe: number           // suma de importes cobrados (con IVA si aplica)
  claveSat: string          // "" si no tiene (bloqueante)
  departamento: string
  deptoFacturable: boolean
  /** Saldo facturable disponible del SKU. null = ilimitado (no maneja saldo). */
  saldoDisponible: number | null
  /** Motivo de exclusión, si aplica. */
  motivoExclusion?: "depto_no_facturable" | "saldo_insuficiente" | "sin_clave_sat"
}

/** Resultado de clasificar las ventas del período. */
export interface PreviewGlobal {
  /** Folios de las ventas candidatas (público sin factura nominativa ni global previa). */
  foliosCandidatos: string[]
  entran: LineaGlobal[]
  excluidas: LineaGlobal[]      // por depto o por saldo (forzables solo las de saldo)
  sinClaveSat: LineaGlobal[]    // bloqueante
  totales: {
    ventasCandidatas: number
    importeTotal: number
    importeEntran: number
    importeExcluido: number
    hayBloqueante: boolean      // sí hay artículos sin clave SAT
  }
}

/** Datos por SKU que la ruta resuelve y pasa al builder. */
export interface DatosSku {
  claveSat: string
  departamento: string
  descripcion?: string
  deptoFacturable: boolean
  /** Saldo facturable; null si el SKU no maneja saldo (ilimitado). */
  saldo: number | null
}

export type ResolverSku = (sku: string) => DatosSku

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** ¿Esta venta es candidata a la global? (público, vigente, sin factura propia.) */
export function esCandidataGlobal(v: VentaGlobalIn): boolean {
  if (v.estado === "cancelada") return false
  if (v.factura?.cfdi_id) return false   // ya tiene nominativa
  if (v.global_uuid) return false         // ya incluida en otra global
  // Público en general = sin cliente nominativo. (Una venta con cliente_id pudo
  // no haberse facturado; aun así, la global es para público. Si el cliente no
  // pidió factura, su venta cuenta como público.)
  if (!v.items?.length) return false
  return true
}

/**
 * Agrupa las ventas candidatas del período en líneas por SKU y las clasifica.
 * `forzarSaldo`: si true, las líneas excluidas SOLO por saldo insuficiente se
 * mueven a "entran" (decisión del usuario, con advertencia en la UI).
 */
export function construirPreviewGlobal(
  ventas: VentaGlobalIn[],
  resolver: ResolverSku,
  opts: { forzarSaldo?: boolean } = {}
): PreviewGlobal {
  const candidatas = ventas.filter(esCandidataGlobal)
  const foliosCandidatos = candidatas.map((v) => v.folio)

  // Agregar por SKU.
  const acc = new Map<string, { descripcion: string; cantidad: number; importe: number }>()
  for (const v of candidatas) {
    for (const it of v.items ?? []) {
      const sku = (it.sku ?? "").trim()
      if (!sku) continue
      const prev = acc.get(sku) ?? { descripcion: it.descripcion ?? "", cantidad: 0, importe: 0 }
      prev.cantidad += Number(it.cantidad) || 0
      prev.importe += (Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)
      if (!prev.descripcion && it.descripcion) prev.descripcion = it.descripcion
      acc.set(sku, prev)
    }
  }

  const entran: LineaGlobal[] = []
  const excluidas: LineaGlobal[] = []
  const sinClaveSat: LineaGlobal[] = []

  for (const [sku, ag] of acc) {
    const d = resolver(sku)
    const claveSat = (d.claveSat ?? "").trim()
    const linea: LineaGlobal = {
      sku,
      descripcion: ag.descripcion || d.descripcion || sku,
      cantidad: ag.cantidad,
      importe: r2(ag.importe),
      claveSat,
      departamento: d.departamento ?? "",
      deptoFacturable: d.deptoFacturable,
      saldoDisponible: d.saldo,
    }

    // 1) Sin clave SAT → bloqueante (no se puede timbrar la global).
    if (!claveSat) {
      sinClaveSat.push({ ...linea, motivoExclusion: "sin_clave_sat" })
      continue
    }
    // 2) Depto no facturable → excluida (no forzable).
    if (!d.deptoFacturable) {
      excluidas.push({ ...linea, motivoExclusion: "depto_no_facturable" })
      continue
    }
    // 3) Saldo: null = ilimitado (entra). Si hay saldo y es < cantidad → insuficiente.
    const saldoOk = d.saldo == null || d.saldo >= ag.cantidad
    if (saldoOk) {
      entran.push(linea)
    } else if (opts.forzarSaldo) {
      // Forzado: entra de todos modos (sobregiro permitido, saldo quedará negativo).
      entran.push(linea)
    } else {
      excluidas.push({ ...linea, motivoExclusion: "saldo_insuficiente" })
    }
  }

  const importeEntran = r2(entran.reduce((s, l) => s + l.importe, 0))
  const importeExcluido = r2([...excluidas, ...sinClaveSat].reduce((s, l) => s + l.importe, 0))

  return {
    foliosCandidatos,
    entran: ordenar(entran),
    excluidas: ordenar(excluidas),
    sinClaveSat: ordenar(sinClaveSat),
    totales: {
      ventasCandidatas: candidatas.length,
      importeTotal: r2(importeEntran + importeExcluido),
      importeEntran,
      importeExcluido,
      hayBloqueante: sinClaveSat.length > 0,
    },
  }
}

function ordenar(lineas: LineaGlobal[]): LineaGlobal[] {
  return [...lineas].sort((a, b) => b.importe - a.importe)
}
