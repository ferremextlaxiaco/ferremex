import * as path from "path"
import * as fs   from "fs"
import * as http from "http"
import * as https from "https"

// ---------------------------------------------------------------------------
// Script: generar-catalogo-sat.ts
//
// Descarga el catálogo oficial de productos/servicios del SAT (c_ClaveProdServ)
// y genera claves-sat.json en packages/api/static/ para que el POS lo cargue.
//
// El script intenta varias fuentes en orden hasta que una funcione.
// No requiere ningún archivo manual.
//
// Uso (desde packages/api):
//   bun run generar:catalogo-sat
// ---------------------------------------------------------------------------

const SALIDA = path.join(process.cwd(), "static", "claves-sat.json")

// Fuentes en orden de preferencia
const FUENTES = [
  // Archivo local (si el usuario lo descargó manualmente)
  { tipo: "local" as const, nombres: ["catCFDI.xlsx", "catCFDI.xls", "CatCFDI.xlsx", "CatCFDI.xls"] },
  // Descarga directa del SAT
  { tipo: "url" as const, url: "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xls",  nombre: "catCFDI_descargado.xls"  },
  { tipo: "url" as const, url: "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xlsx", nombre: "catCFDI_descargado.xlsx" },
]

const HOJA = "c_ClaveProdServ"
const RAIZ = path.join(process.cwd(), "../../")
const TMP  = path.join(process.cwd(), "../../_sat_tmp")

interface ClaveSat { clave: string; nombre: string }

function parseStr(val: unknown): string {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

function descargar(url: string, destino: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http
    console.log(`  Descargando: ${url}`)
    const archivo = fs.createWriteStream(destino)
    const req = protocolo.get(url, { timeout: 30000 }, (res) => {
      // Seguir redirecciones (301/302)
      if (res.statusCode === 301 || res.statusCode === 302) {
        archivo.close()
        fs.unlinkSync(destino)
        descargar(res.headers.location!, destino).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        archivo.close()
        fs.unlinkSync(destino)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(archivo)
      archivo.on("finish", () => { archivo.close(); resolve() })
      archivo.on("error", reject)
    })
    req.on("error", (e) => {
      archivo.close()
      if (fs.existsSync(destino)) fs.unlinkSync(destino)
      reject(e)
    })
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")) })
  })
}

function parsearXlsx(xlsxPath: string): ClaveSat[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx")
  const wb   = XLSX.readFile(xlsxPath, { type: "file" })

  const nombreHoja = wb.SheetNames.find(
    (n: string) => n.toLowerCase() === HOJA.toLowerCase()
  )
  if (!nombreHoja) {
    throw new Error(
      `Hoja "${HOJA}" no encontrada. Hojas disponibles: ${wb.SheetNames.join(", ")}`
    )
  }

  const ws   = wb.Sheets[nombreHoja]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][]

  // Fila 1 = encabezados; datos desde fila 2
  const catalog: ClaveSat[] = []
  for (const r of rows.slice(1)) {
    const clave  = parseStr(r[0])
    const nombre = parseStr(r[1])
    if (clave && nombre) catalog.push({ clave, nombre })
  }
  return catalog
}

async function main() {
  // Asegurar que exista el directorio static
  const staticDir = path.dirname(SALIDA)
  if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true })
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })

  let xlsxPath: string | null = null

  // ── 1. Intentar cada fuente en orden ──────────────────────────────────────

  for (const fuente of FUENTES) {
    if (fuente.tipo === "local") {
      for (const nombre of fuente.nombres) {
        const candidato = path.join(RAIZ, nombre)
        if (fs.existsSync(candidato)) {
          console.log(`✔  Archivo local encontrado: ${candidato}`)
          xlsxPath = candidato
          break
        }
      }
    } else {
      const destino = path.join(TMP, fuente.nombre)
      try {
        await descargar(fuente.url, destino)
        console.log(`✔  Descargado correctamente`)
        xlsxPath = destino
      } catch (e: unknown) {
        console.warn(`   Falló (${e instanceof Error ? e.message : String(e)}), intentando siguiente fuente...`)
      }
    }
    if (xlsxPath) break
  }

  if (!xlsxPath) {
    console.error("\n❌  No se pudo obtener el catálogo del SAT de ninguna fuente.")
    console.error("    Descárgalo manualmente desde:")
    console.error("    http://omawww.sat.gob.mx/tramitesyservicios/Paginas/catalogos_cfdi.htm")
    console.error(`    Guárdalo como: ${path.join(RAIZ, "catCFDI.xlsx")}`)
    console.error("    Y vuelve a ejecutar este script.\n")
    process.exit(1)
  }

  // ── 2. Parsear el Excel ───────────────────────────────────────────────────

  console.log("Procesando catálogo...")
  let catalog: ClaveSat[]
  try {
    catalog = parsearXlsx(xlsxPath)
  } catch (e: unknown) {
    console.error(`❌  Error al leer el archivo: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }

  if (catalog.length < 100) {
    console.error(`❌  El catálogo tiene solo ${catalog.length} entradas — parece incompleto.`)
    process.exit(1)
  }

  catalog.sort((a, b) => a.clave.localeCompare(b.clave))

  // ── 3. Guardar JSON ───────────────────────────────────────────────────────

  fs.writeFileSync(SALIDA, JSON.stringify(catalog), "utf-8")

  const kb = (fs.statSync(SALIDA).size / 1024).toFixed(1)
  console.log(`\n✔  Catálogo guardado: ${SALIDA}`)
  console.log(`   ${catalog.length.toLocaleString()} claves | ${kb} KB`)
  console.log("   El POS lo cargará desde /static/claves-sat.json\n")

  // Limpiar temporales
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true })
}

main().catch((e) => { console.error(e); process.exit(1) })
