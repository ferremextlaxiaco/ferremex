/**
 * json-store — persistencia segura en archivos JSON para las rutas /caja/*.
 *
 * Resuelve dos problemas de concurrencia que tenían las rutas que hacían
 * `cargar → mutar → writeFileSync` directo:
 *   1. Race condition read-modify-write: dos requests concurrentes leían el
 *      mismo array y el último en escribir pisaba al primero (ventas perdidas).
 *   2. Escritura no atómica: un fallo a media escritura dejaba el JSON corrupto.
 *
 * Mecanismo:
 *   - Mutex en memoria por ruta de archivo (cola de promesas). Serializa los
 *     bloques read-modify-write *dentro del proceso único de Node* (la app corre
 *     como un solo proceso vía PM2). NO sobrevive multi-proceso — la solución
 *     estructural (BD de Medusa con transacciones) es deuda de Fase 3.
 *   - Escritura atómica: se escribe a `<file>.tmp` y se hace renameSync (atómico
 *     en el mismo filesystem), de modo que nunca queda un JSON a medias.
 *
 * Las rutas pasan la ruta absoluta del archivo ya resuelta (cada route.ts la
 * calcula con __dirname a su propia profundidad), este helper no la calcula.
 */
import * as fs from "fs"
import * as path from "path"

// Mutex por archivo: encadena las operaciones sobre la misma ruta.
const locks = new Map<string, Promise<unknown>>()

/**
 * Serializa `fn` respecto a otras llamadas withFileLock sobre el mismo `file`.
 * Las operaciones sobre archivos distintos corren en paralelo.
 */
export async function withFileLock<T>(file: string, fn: () => Promise<T> | T): Promise<T> {
  const previo = locks.get(file) ?? Promise.resolve()
  // Encadenamos tras el anterior sin propagar su posible error a este eslabón.
  const corrida = previo.catch(() => {}).then(fn)
  // El lock guarda una versión "silenciada" para que un fallo no rompa la cadena
  // de los que se encolen detrás.
  const silenciada = corrida.catch(() => {})
  locks.set(file, silenciada)
  try {
    return await corrida
  } finally {
    // Si nadie más se encoló mientras corríamos, liberamos la entrada del Map
    // para no acumular memoria por archivos que ya no se tocan.
    if (locks.get(file) === silenciada) locks.delete(file)
  }
}

/** Lee y parsea un JSON. Devuelve `fallback` si no existe o está corrupto (con log). */
export function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T
  } catch (err) {
    console.error(`[json-store] JSON corrupto en ${file}, usando fallback:`, err)
    return fallback
  }
}

/** Escribe `data` de forma atómica (tmp + rename). Crea el directorio si falta. */
export function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8")
  fs.renameSync(tmp, file)
}

/**
 * Atajo read-modify-write atómico y serializado: carga el JSON, aplica `mutator`,
 * y escribe el resultado de forma atómica, todo bajo el lock del archivo.
 * `mutator` recibe los datos actuales y devuelve los nuevos.
 */
export async function updateJson<T>(
  file: string,
  fallback: T,
  mutator: (actual: T) => T | Promise<T>
): Promise<T> {
  return withFileLock(file, async () => {
    const actual = readJson<T>(file, fallback)
    const nuevo = await mutator(actual)
    writeJsonAtomic(file, nuevo)
    return nuevo
  })
}
