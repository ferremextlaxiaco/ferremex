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
