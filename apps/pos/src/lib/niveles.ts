// Motor de CADENA DE UNIDADES: generaliza el mecanismo de Unidad de Compra /
// Unidad de Venta (hoy fijo a 2 niveles con un solo `factor`) a N niveles
// ordenados de menor a mayor (ej. Pieza → Bolsa → Caja). Módulo puro, sin
// estado — lo consumen client.ts (tipos), Buscador (venta), pos-store
// (auto-consolidación del carrito) y ArticleDrawer (configuración).
//
// Retrocompatibilidad: todo artículo existente sigue teniendo únicamente los
// campos legacy (unidadVenta/unidadCompra/factor/precioVenta1-4/precio1-4).
// `nivelesDesdeLegacy` deriva de ahí la cadena de 2 niveles equivalente, sin
// que el artículo necesite guardarse de nuevo.

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
  /** Unidades del nivel INMEDIATO INFERIOR que componen 1 de este nivel.
   *  null únicamente en el nivel más bajo (la hoja de la cadena). */
  factorDesdeAnterior: number | null
  /** Exactamente un nivel de la cadena lo tiene en true: el único con
   *  inventory item real en Medusa (stock que bloquea la venta). */
  esBaseInventario: boolean
  /** Disponibilidad manual de ESTE nivel. Solo relevante cuando el artículo
   *  tiene `inventarioInformativo=true` (ver ArticuloPOS/ProductoPOS): el
   *  inventario real no bloquea (es un estimado), así que el vendedor marca a
   *  mano qué presentaciones siguen disponibles. Sin sentido/ignorado cuando
   *  el artículo usa inventario real (ese caso bloquea por stock, no por esto). */
  agotado?: boolean
  /** Declara explícitamente que `claveUnidadSat` de este nivel es la MISMA
   *  unidad real que otro nivel de la cadena (ej. Bote/Carretilla/m³ son los
   *  tres "m³", solo que en cantidades distintas), no una unidad de empaque
   *  distinta. Puramente informativo — el cálculo de factores es idéntico se
   *  repita o no la unidad SAT; solo habilita repetirla en la UI del drawer
   *  sin que se lea como un error de captura. */
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

/**
 * Deriva la cadena de 2 niveles equivalente al mecanismo legacy de Unidad de
 * Compra/Venta. Si el artículo no tiene unidad de compra propia (factor <= 1
 * o sin unidadCompra), devuelve un solo nivel (el de venta), que ya es la
 * base de inventario.
 */
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
      // La unidad de VENTA (Pieza) es la que tiene el inventory item real en
      // Medusa — Bolsa nunca tuvo contador propio, solo un factor de conversión
      // hacia piezas (ver /caja/ventas: unidad_compra_factor descuenta piezas).
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

/** Nivel marcado como base de inventario (único con stock real). */
export function nivelBase(niveles: NivelUnidad[]): NivelUnidad | null {
  return niveles.find((n) => n.esBaseInventario) ?? null
}

/**
 * Cuántas unidades del nivel BASE representa 1 unidad de `nivelId` (ej. 1
 * Bolsa = 50 Piezas → factorABase(Bolsa) = 50). Es el multiplicador que el
 * backend usa para descontar/validar contra el único inventory item real
 * (`unidad_compra_factor` generalizado). Devuelve 1 si el nivel ES la base.
 *
 * La cadena está ordenada de MENOR a MAYOR y `factorDesdeAnterior` siempre
 * expresa "unidades del nivel anterior que componen 1 de este". Para un nivel
 * por encima de la base, el factor a base es el producto acumulado de esos
 * factores desde el nivel siguiente a la base hasta `nivelId`. Un nivel por
 * DEBAJO de la base (ej. base configurada en un nivel intermedio) usa la
 * división recíproca — soporta el caso general donde `esBaseInventario` no
 * está necesariamente en el primer nivel de la cadena.
 */
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

/**
 * Existencia real (en la unidad BASE de inventario, ej. Bolsas) convertida a
 * la unidad MÁS PEQUEÑA de la cadena (ej. Piezas) — lo que debe mostrarse al
 * vendedor/admin como "stock", ya que es la unidad en que finalmente se
 * vende/cuenta el artículo. 1 Bolsa (base) = factorABase(base)=1, y
 * factorABase(nivelMásPequeño) expresa cuántas unidades base equivalen a 1
 * unidad más pequeña — la existencia en unidad más pequeña es entonces
 * `existenciaBase / factorABase(nivelMásPequeño)`.
 */
export function existenciaEnUnidadMenor(niveles: NivelUnidad[], existenciaBase: number): number {
  if (niveles.length === 0) return existenciaBase
  const factor = factorABase(niveles, niveles[0].id)
  if (!factor) return existenciaBase
  return Math.floor(existenciaBase / factor)
}

/**
 * Cuántas unidades del nivel MÁS PEQUEÑO de la cadena (índice 0, ej. Pieza)
 * componen 1 unidad de `nivelId` (ej. 1 Bolsa = 10 Piezas → factorDesdeMenor
 * (Bolsa) = 10). Es el factor correcto para convertir una existencia YA
 * expresada en la unidad más pequeña (ver `existenciaEnUnidadMenor`, lo que
 * el backend devuelve como `ProductoPOS.existencia`) al tope de cualquier
 * nivel de la cadena — a diferencia de `factorABase`, que sigue ligado a la
 * base de inventario real y se usa para el descuento en el backend.
 */
export function factorDesdeMenor(niveles: NivelUnidad[], nivelId: string): number {
  const idx = niveles.findIndex((n) => n.id === nivelId)
  if (idx <= 0) return 1
  let factor = 1
  for (let i = 1; i <= idx; i++) {
    const f = niveles[i].factorDesdeAnterior
    if (!f) return 1
    factor *= f
  }
  return factor
}

/** Valida la forma de la cadena: orden menor→mayor coherente con los
 *  factores, exactamente un nivel base, factorDesdeAnterior null solo en la
 *  hoja (índice 0). Devuelve la lista de errores (vacía = válida). */
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

// ── Auto-consolidación de carrito ───────────────────────────────────────────
//
// Forma mínima de una línea de carrito consolidable (duck-typing: pos-store.ts
// importa este módulo, así que CartItem no puede importarse aquí sin ciclo).
// Cualquier objeto con esta forma funciona; propiedades extra se preservan.
export interface LineaConsolidable {
  skuBase?: string
  nivelId?: string
  cadenaNiveles?: NivelUnidad[]
  /** Inventario informativo (ver ArticuloPOS.inventarioInformativo) NO impide
   *  la auto-consolidación: son conceptos independientes — que el stock real
   *  no bloquee la venta no implica que los factores de la cadena sean
   *  imprecisos. El usuario captura los factores (ej. 4 Botes = 1 Carretilla)
   *  con la misma exactitud que en un artículo de inventario real. */
  inventarioInformativo?: boolean
  cantidad: number
  precio: number
  [k: string]: unknown
}

/** Precio (con IVA, el que ya trae la línea) de `nivel` para el nivel de
 *  precio activo — usa siempre precio1 de cada nivel: el mayoreo/nivel de
 *  precio del cliente aplica sobre el nivel base como hoy (efectivoPrecio en
 *  pos-store), no dentro de la consolidación. */
function precioNivel(nivel: NivelUnidad): number {
  return nivel.precio1
}

/**
 * Recorre las líneas de un mismo artículo (agrupadas por `skuBase`) y aplica
 * la conversión automática: cuando la cantidad de un nivel alcanza el
 * `factorDesdeAnterior` del nivel INMEDIATO superior en la cadena, resta ese
 * múltiplo y lo suma (como 1+ unidades) a la línea del nivel superior — al
 * precio de ESE nivel, cambiando el total (comportamiento confirmado). Se
 * repite recursivamente hacia arriba mientras la cadena lo permita. También
 * corre tras un DECREMENTO: si al bajar cantidad una consolidación ya no
 * cuadra, no se re-parte automáticamente hacia abajo (solo se consolida hacia
 * arriba) — bajar cantidad de un nivel alto simplemente reduce esa línea; la
 * des-consolidación explícita hacia abajo no es necesaria porque el cajero
 * nunca pierde unidades, solo cambia de qué línea las resta.
 *
 * Líneas sin `cadenaNiveles`/`skuBase` (la inmensa mayoría: granel, flete,
 * paquete, libre, artículos normales) NO se tocan — se devuelven intactas.
 */
export function consolidarCarrito<T extends LineaConsolidable>(items: T[]): T[] {
  const consolidables = items.filter((i) => i.cadenaNiveles && i.skuBase && i.nivelId)
  if (consolidables.length === 0) return items

  const gruposPorSku = new Map<string, T[]>()
  for (const item of consolidables) {
    const arr = gruposPorSku.get(item.skuBase!) ?? []
    arr.push(item)
    gruposPorSku.set(item.skuBase!, arr)
  }

  let resultado = items
  for (const [skuBase, lineasGrupo] of gruposPorSku) {
    const cadena = lineasGrupo[0].cadenaNiveles!
    // Cantidad actual por nivel (id → cantidad), inicializada desde las líneas
    // vivas de este artículo en el carrito.
    const cantidadPorNivel = new Map<string, number>()
    for (const n of cadena) cantidadPorNivel.set(n.id, 0)
    for (const l of lineasGrupo) cantidadPorNivel.set(l.nivelId!, (cantidadPorNivel.get(l.nivelId!) ?? 0) + l.cantidad)

    // Consolidar de abajo hacia arriba: si el nivel i alcanza el factor del
    // nivel i+1, mover el múltiplo completo hacia arriba. Si el nivel SUPERIOR
    // está marcado "Agotado" (Disponible/Agotado manual de inventario
    // informativo), no se consolida hacia él — el artículo dice explícitamente
    // que esa presentación no está disponible para vender, así que la
    // cantidad se queda acumulada en el nivel inferior en vez de generar una
    // línea de un nivel agotado.
    for (let i = 0; i < cadena.length - 1; i++) {
      const nivelSup = cadena[i + 1]
      if (nivelSup.agotado) continue
      const factor = nivelSup.factorDesdeAnterior
      if (!factor || factor <= 0) continue
      const cantidadActual = cantidadPorNivel.get(cadena[i].id) ?? 0
      const unidadesSup = Math.floor(cantidadActual / factor)
      if (unidadesSup <= 0) continue
      cantidadPorNivel.set(cadena[i].id, cantidadActual - unidadesSup * factor)
      cantidadPorNivel.set(nivelSup.id, (cantidadPorNivel.get(nivelSup.id) ?? 0) + unidadesSup)
    }

    // ¿Cambió algo respecto al estado actual? Si no, no tocar estas líneas
    // (evita crear/eliminar líneas en cada render sin motivo).
    const sinCambio = cadena.every((n) => {
      const actual = lineasGrupo.filter((l) => l.nivelId === n.id).reduce((s, l) => s + l.cantidad, 0)
      return actual === (cantidadPorNivel.get(n.id) ?? 0)
    })
    if (sinCambio) continue

    // Reconstruir: una línea por nivel con cantidad > 0, reutilizando el
    // objeto de una línea existente de ese nivel como plantilla (preserva
    // proveedor/marca/descripcion/etc.), o la primera línea del grupo si el
    // nivel es nuevo (nunca tuvo línea propia todavía).
    const plantillaPorNivel = new Map<string, T>()
    for (const l of lineasGrupo) if (!plantillaPorNivel.has(l.nivelId!)) plantillaPorNivel.set(l.nivelId!, l)

    const nuevasLineas: T[] = []
    for (const n of cadena) {
      const cantidad = cantidadPorNivel.get(n.id) ?? 0
      if (cantidad <= 0) continue
      const plantilla = plantillaPorNivel.get(n.id) ?? lineasGrupo[0]
      // El SKU de línea es compuesto `skuBase::nivelId` (ver Buscador.agregarPorNivel).
      // Cuando el nivel es NUEVO (nunca tuvo línea propia — ej. la primera vez
      // que la consolidación genera la línea del m³), la plantilla es la de
      // OTRO nivel (ej. Carretilla) y su `sku` no corresponde a `n`: hay que
      // regenerarlo, si no dos líneas de niveles distintos quedan con el mismo
      // SKU (rompe identificación de línea al cobrar/reportar).
      const sku = (plantilla as { sku?: string }).sku
      const skuRegenerado = sku ? `${skuBase}::${n.id}` : sku
      nuevasLineas.push({
        ...plantilla,
        sku: skuRegenerado,
        nivelId: n.id,
        cantidad,
        precio: precioNivel(n),
        descripcion: (plantilla as { descripcion?: string }).descripcion?.replace(
          / — .+$/, ` — ${n.nombre}`
        ) ?? plantilla.descripcion,
      })
    }

    // Reemplazar: quitar todas las líneas viejas de este skuBase y anexar las
    // nuevas, preservando la posición relativa (donde estaba la primera línea
    // vieja de este artículo).
    const idxPrimera = resultado.findIndex((l) => (l as LineaConsolidable).skuBase === skuBase)
    const sinEsteGrupo = resultado.filter((l) => (l as LineaConsolidable).skuBase !== skuBase)
    resultado = [
      ...sinEsteGrupo.slice(0, idxPrimera),
      ...nuevasLineas,
      ...sinEsteGrupo.slice(idxPrimera),
    ]
  }
  return resultado
}
