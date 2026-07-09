import * as path from "path"
import * as crypto from "crypto"
import { readJson, writeJsonAtomic, updateJson } from "./json-store"

/**
 * Helper compartido de "venta por encargo" (Fase 3): al cobrar una línea sin
 * stock, se agrega al PEDIDO ABIERTO del proveedor correspondiente.
 *
 * Regla de agrupación: hay UN pedido abierto por proveedor (status "encargo",
 * esEncargo=true). Los encargos nuevos de ese proveedor se acumulan ahí (sumando
 * cantidad si el mismo SKU ya estaba). Si el producto no tiene proveedor, se usa
 * el grupo especial "Sin proveedor asignado" (proveedorId = SIN_PROVEEDOR).
 *
 * Se usa desde el POST de /caja/ventas (dentro de su flujo transaccional). Toma
 * su propio lock de PEDIDOS_FILE, por lo que NO debe llamarse mientras se tiene
 * ya ese lock (ventas usa el lock de VENTAS_FILE, distinto → sin deadlock).
 */

const PEDIDOS_FILE = path.join(__dirname, "../../data/pedidos-pos.json")
const COUNTER_FILE = path.join(__dirname, "../../data/pedido-counter.json")

/** Marcador de proveedorId para encargos sin proveedor asignado. */
export const SIN_PROVEEDOR = "__sin_proveedor__"

export interface EncargoLinea {
  sku: string
  clave: string
  descripcion: string
  cantidad: number
  proveedor_id?: string | null
  proveedor?: string | null
  origen_venta: string // folio de la venta que originó el encargo
}

interface PedidoArticulo {
  clave?: string
  descripcion?: string
  cantidad: number
  sku?: string
  origen_venta?: string
}

interface Pedido {
  id: string
  folio: string
  fecha: string
  proveedor?: string | null
  proveedorId?: string | null
  status: string
  esEncargo?: boolean
  articulos: PedidoArticulo[]
  [k: string]: unknown
}

function generarFolioPedido(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const n = readJson<{ contador: number }>(COUNTER_FILE, { contador: 0 }).contador + 1
  writeJsonAtomic(COUNTER_FILE, { contador: n })
  return `PED-${ymd}-${String(n).padStart(3, "0")}`
}

/** Clave de agrupación de un proveedor (id real o marcador sin-proveedor). */
function claveProveedor(proveedor_id?: string | null): string {
  return proveedor_id && proveedor_id.trim() ? proveedor_id.trim() : SIN_PROVEEDOR
}

/**
 * Agrega una o varias líneas de encargo a los pedidos abiertos por proveedor.
 * Agrupa por proveedor: un pedido abierto (status "encargo") por proveedor. Si no
 * existe, lo crea. Devuelve los folios de pedido afectados/creados.
 */
export async function agregarEncargosAPedidos(lineas: EncargoLinea[]): Promise<string[]> {
  if (!lineas.length) return []
  const foliosAfectados = new Set<string>()

  await updateJson<Pedido[]>(PEDIDOS_FILE, [], (pedidos) => {
    const copia = [...pedidos]

    // Agrupar las líneas entrantes por proveedor.
    const porProveedor = new Map<string, EncargoLinea[]>()
    for (const l of lineas) {
      const k = claveProveedor(l.proveedor_id)
      if (!porProveedor.has(k)) porProveedor.set(k, [])
      porProveedor.get(k)!.push(l)
    }

    for (const [clave, grupo] of porProveedor) {
      const sinProv = clave === SIN_PROVEEDOR
      // Buscar el pedido ABIERTO de encargos de este proveedor.
      let idx = copia.findIndex(
        (p) =>
          p.esEncargo === true &&
          p.status === "encargo" &&
          claveProveedor(p.proveedorId) === clave
      )

      if (idx === -1) {
        // Crear el pedido abierto de este proveedor.
        const primera = grupo[0]
        const nuevo: Pedido = {
          id: crypto.randomBytes(6).toString("hex"),
          folio: generarFolioPedido(),
          fecha: new Date().toISOString().slice(0, 10),
          proveedor: sinProv ? "Sin proveedor asignado" : (primera.proveedor ?? null),
          proveedorId: sinProv ? null : (primera.proveedor_id ?? null),
          status: "encargo",
          esEncargo: true,
          articulos: [],
        }
        copia.unshift(nuevo)
        idx = 0
      }

      const pedido = copia[idx]
      for (const l of grupo) {
        // Si el mismo SKU ya está en el pedido, sumar cantidad; si no, agregar.
        const artIdx = pedido.articulos.findIndex((a) => a.sku === l.sku)
        if (artIdx >= 0) {
          pedido.articulos[artIdx].cantidad += l.cantidad
        } else {
          pedido.articulos.push({
            clave: l.clave,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            sku: l.sku,
            origen_venta: l.origen_venta,
          })
        }
      }
      foliosAfectados.add(pedido.folio)
    }

    return copia
  })

  return [...foliosAfectados]
}
