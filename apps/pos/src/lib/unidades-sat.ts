export interface UnidadSat {
  clave: string
  nombre: string
}

export const UNIDADES_SAT: UnidadSat[] = [
  { clave: "H87", nombre: "Pieza"          },
  { clave: "EA",  nombre: "Elemento"       },
  { clave: "KGM", nombre: "Kilogramo"      },
  { clave: "GRM", nombre: "Gramo"          },
  { clave: "TNE", nombre: "Tonelada"       },
  { clave: "MTR", nombre: "Metro"          },
  { clave: "MTK", nombre: "Metro cuadrado" },
  { clave: "MTQ", nombre: "Metro cúbico"   },
  { clave: "LTR", nombre: "Litro"          },
  { clave: "MLT", nombre: "Mililitro"      },
  { clave: "XBX", nombre: "Caja"           },
  { clave: "XPK", nombre: "Paquete"        },
  { clave: "XBG", nombre: "Bolsa"          },
  { clave: "XRO", nombre: "Rollo"          },
  { clave: "DOZ", nombre: "Docena"         },
  { clave: "SET", nombre: "Juego"          },
  { clave: "PR",  nombre: "Par"            },
  { clave: "KT",  nombre: "Kit"            },
  { clave: "XST", nombre: "Hoja"           },
  { clave: "BO",  nombre: "Botella"        },
]

export function nombreUnidad(clave: string): string {
  return UNIDADES_SAT.find((u) => u.clave === clave)?.nombre ?? clave
}

/** Abreviatura compacta de la unidad para mostrar junto a la cantidad (ej. "kg", "m", "L"). */
const ABREVIATURA_UNIDAD: Record<string, string> = {
  KGM: "kg", GRM: "g", TNE: "t", MTR: "m", MTK: "m²", MTQ: "m³",
  LTR: "L", MLT: "ml", H87: "pz", EA: "pz", DOZ: "doc", PR: "par",
  XBX: "caja", XPK: "paq", XBG: "bolsa", XRO: "rollo", SET: "juego",
  KT: "kit", XST: "hoja", BO: "bot", TNE_: "t",
}

/**
 * Abreviatura de la unidad de venta, aceptando tanto el CÓDIGO SAT (ej. "KGM")
 * como el NOMBRE ("Kilogramo") — el catálogo mezcla ambos según cómo se cargó.
 * Cadena vacía / desconocida → "" (no se muestra nada).
 */
export function abreviaturaUnidad(valor: string): string {
  if (!valor) return ""
  // 1) ¿Es un código SAT con abreviatura conocida?
  if (ABREVIATURA_UNIDAD[valor]) return ABREVIATURA_UNIDAD[valor]
  // 2) ¿Es un nombre ("Kilogramo", "Pieza")? Resuelve la clave y reintenta.
  const porNombre = UNIDADES_SAT.find((u) => u.nombre.toLowerCase() === valor.toLowerCase())
  if (porNombre && ABREVIATURA_UNIDAD[porNombre.clave]) return ABREVIATURA_UNIDAD[porNombre.clave]
  // 3) Fallback: el propio valor (código no mapeado o nombre corto).
  return valor
}
