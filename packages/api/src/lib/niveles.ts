// Motor de CADENA DE UNIDADES — copia del backend del módulo puro en
// apps/pos/src/lib/niveles.ts (no hay import cruzado entre apps/pos y
// packages/api en este monorepo; mismo patrón que lib/text.ts / lib/precio.ts).
// Mantener ambas copias en sync si se modifica la lógica.

export interface NivelUnidad {
  id: string
  nombre: string
  claveUnidadSat: string
  precio1: number
  precio2?: number
  precio3?: number
  precio4?: number
  mayoreoActivo?: boolean
  mayoreoMin?: number
  factorDesdeAnterior: number | null
  esBaseInventario: boolean
  /** Disponibilidad manual del nivel (solo relevante si el artículo tiene
   *  inventarioInformativo=true — ver nota en la copia del frontend). */
  agotado?: boolean
  /** Misma unidad SAT real que otro nivel de la cadena, en otra cantidad (ej.
   *  Bote/Carretilla/m³ son los tres "m³") — ver nota en la copia del frontend. */
  esFraccionUnidadBase?: boolean
}

interface ArticuloLegacy {
  unidadVenta?: string
  unidadCompra?: string
  factor?: number
  precioVenta1?: number
  precioVenta2?: number
  precioVenta3?: number
  precioVenta4?: number
  precio1?: number
  precio2?: number
  precio3?: number
  precio4?: number
  mayoreoActivo?: boolean
  mayoreoMin?: number
}

export const ID_NIVEL_VENTA_LEGACY = "__legacy_venta__"
export const ID_NIVEL_COMPRA_LEGACY = "__legacy_compra__"

export function nivelesDesdeLegacy(a: ArticuloLegacy): NivelUnidad[] {
  const factor = a.factor && a.factor > 1 ? a.factor : null
  const hayCompra = !!a.unidadCompra && !!factor

  if (!hayCompra) {
    return [{
      id: ID_NIVEL_VENTA_LEGACY,
      nombre: a.unidadVenta || "H87",
      claveUnidadSat: a.unidadVenta || "H87",
      precio1: a.precio1 ?? 0,
      precio2: a.precio2,
      precio3: a.precio3,
      precio4: a.precio4,
      mayoreoActivo: a.mayoreoActivo,
      mayoreoMin: a.mayoreoMin,
      factorDesdeAnterior: null,
      esBaseInventario: true,
    }]
  }

  return [
    {
      id: ID_NIVEL_VENTA_LEGACY,
      nombre: a.unidadVenta || "H87",
      claveUnidadSat: a.unidadVenta || "H87",
      precio1: a.precioVenta1 ?? 0,
      precio2: a.precioVenta2,
      precio3: a.precioVenta3,
      precio4: a.precioVenta4,
      factorDesdeAnterior: null,
      esBaseInventario: true,
    },
    {
      id: ID_NIVEL_COMPRA_LEGACY,
      nombre: a.unidadCompra || "XBG",
      claveUnidadSat: a.unidadCompra || "XBG",
      precio1: a.precio1 ?? 0,
      precio2: a.precio2,
      precio3: a.precio3,
      precio4: a.precio4,
      mayoreoActivo: a.mayoreoActivo,
      mayoreoMin: a.mayoreoMin,
      factorDesdeAnterior: factor,
      esBaseInventario: false,
    },
  ]
}

export function nivelBase(niveles: NivelUnidad[]): NivelUnidad | null {
  return niveles.find((n) => n.esBaseInventario) ?? null
}

export function factorABase(niveles: NivelUnidad[], nivelId: string): number {
  const idx = niveles.findIndex((n) => n.id === nivelId)
  const idxBase = niveles.findIndex((n) => n.esBaseInventario)
  if (idx === -1 || idxBase === -1) return 1
  if (idx === idxBase) return 1

  let factor = 1
  if (idx > idxBase) {
    for (let i = idxBase + 1; i <= idx; i++) {
      const f = niveles[i].factorDesdeAnterior
      if (!f) return 1
      factor *= f
    }
    return factor
  }
  for (let i = idx + 1; i <= idxBase; i++) {
    const f = niveles[i].factorDesdeAnterior
    if (!f) return 1
    factor *= f
  }
  return 1 / factor
}

/** Existencia real (unidad BASE de inventario) convertida a la unidad MÁS
 *  PEQUEÑA de la cadena — ver nota completa en la copia del frontend. */
export function existenciaEnUnidadMenor(niveles: NivelUnidad[], existenciaBase: number): number {
  if (niveles.length === 0) return existenciaBase
  const factor = factorABase(niveles, niveles[0].id)
  if (!factor) return existenciaBase
  return Math.floor(existenciaBase / factor)
}

export function validarCadena(niveles: NivelUnidad[]): string[] {
  const errores: string[] = []
  if (niveles.length === 0) {
    errores.push("La cadena debe tener al menos un nivel")
    return errores
  }
  const basesCount = niveles.filter((n) => n.esBaseInventario).length
  if (basesCount !== 1) {
    errores.push(`Debe haber exactamente un nivel marcado como base de inventario (hay ${basesCount})`)
  }
  niveles.forEach((n, i) => {
    if (i === 0 && n.factorDesdeAnterior !== null) {
      errores.push(`El primer nivel ("${n.nombre}") no debe tener factor (es la hoja de la cadena)`)
    }
    if (i > 0 && (!n.factorDesdeAnterior || n.factorDesdeAnterior <= 0)) {
      errores.push(`El nivel "${n.nombre}" necesita un factor mayor a 0`)
    }
    if (!n.nombre?.trim()) {
      errores.push(`El nivel #${i + 1} necesita un nombre`)
    }
  })
  return errores
}
