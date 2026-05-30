/**
 * Mapeo entre el Customer nativo de Medusa y el shape `Cliente` que consume el
 * POS (lib/clientes.ts). Los campos generales y fiscales específicos del POS
 * viven en `customer.metadata`; nombre/teléfono/email mapean a campos nativos.
 *
 * El `grupo` NO se guarda aquí: se modela con customer_group nativo y se resuelve
 * por separado en las rutas (un cliente pertenece a 0..1 grupo POS).
 */

/** Shape POS — espejo de `Cliente` en apps/pos/src/lib/clientes.ts (sin `grupo`, que se inyecta aparte). */
export interface ClientePOS {
  id: string
  num_cliente: string
  nombre: string
  telefono: string
  num_precio: number
  dias_credito: number
  limite_credito: number
  grupo: string
  monedero: boolean
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cfdi: string
  calle: string
  numero: string
  colonia: string
  ciudad: string
  estado: string
  cp: string
}

type CustomerLike = {
  id: string
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  groups?: { name?: string | null }[] | null
}

const numMeta = (m: Record<string, unknown> | null | undefined, k: string, def = 0): number => {
  const v = m?.[k]
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
const strMeta = (m: Record<string, unknown> | null | undefined, k: string): string => {
  const v = m?.[k]
  return typeof v === "string" ? v : ""
}

/** Customer nativo → ClientePOS. `grupo` se toma del primer customer_group, si existe. */
export function customerAClientePOS(c: CustomerLike): ClientePOS {
  const m = c.metadata ?? {}
  const nombre =
    strMeta(m, "nombre") ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
  return {
    id: c.id,
    num_cliente: strMeta(m, "num_cliente"),
    nombre,
    telefono: c.phone ?? "",
    num_precio: Math.min(4, Math.max(1, numMeta(m, "num_precio", 1))),
    dias_credito: numMeta(m, "dias_credito", 0),
    limite_credito: numMeta(m, "limite_credito", 0),
    grupo: c.groups?.[0]?.name ?? strMeta(m, "grupo"),
    monedero: m["monedero"] === true || m["monedero"] === "true",
    rfc: strMeta(m, "rfc"),
    razon_social: strMeta(m, "razon_social"),
    regimen_fiscal: strMeta(m, "regimen_fiscal"),
    cfdi: strMeta(m, "cfdi"),
    calle: strMeta(m, "calle"),
    numero: strMeta(m, "numero"),
    colonia: strMeta(m, "colonia"),
    ciudad: strMeta(m, "ciudad"),
    estado: strMeta(m, "estado"),
    cp: strMeta(m, "cp"),
  }
}

/** ClientePOS (parcial) → campos nativos + metadata para crear/actualizar el Customer. */
export function clientePOSACustomer(c: Partial<ClientePOS>): {
  first_name?: string
  phone?: string
  metadata: Record<string, unknown>
} {
  const metadata: Record<string, unknown> = {}
  const setIf = (k: keyof ClientePOS, val: unknown) => {
    if (val !== undefined) metadata[k] = val
  }
  setIf("num_cliente", c.num_cliente)
  setIf("nombre", c.nombre)
  setIf("num_precio", c.num_precio)
  setIf("dias_credito", c.dias_credito)
  setIf("limite_credito", c.limite_credito)
  setIf("monedero", c.monedero)
  setIf("rfc", c.rfc)
  setIf("razon_social", c.razon_social)
  setIf("regimen_fiscal", c.regimen_fiscal)
  setIf("cfdi", c.cfdi)
  setIf("calle", c.calle)
  setIf("numero", c.numero)
  setIf("colonia", c.colonia)
  setIf("ciudad", c.ciudad)
  setIf("estado", c.estado)
  setIf("cp", c.cp)
  // grupo se guarda también en metadata como respaldo/búsqueda; la verdad es el customer_group.
  setIf("grupo", c.grupo)

  const out: { first_name?: string; phone?: string; metadata: Record<string, unknown> } = { metadata }
  if (c.nombre !== undefined) out.first_name = c.nombre
  if (c.telefono !== undefined) out.phone = c.telefono
  return out
}
