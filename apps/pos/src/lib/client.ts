// Todas las llamadas van al mismo origen en producción.
// En dev, Vite proxea /store → localhost:9000.

export interface ProductoPOS {
  sku: string
  descripcion: string
  precio: number // pesos
  existencia: number
}

export interface VentaRequest {
  cajero: string
  turno_id: string
  items: { sku: string; descripcion: string; cantidad: number; precio_unitario: number }[]
  pago_efectivo: number
}

export interface VentaResponse {
  folio: string
  fecha: string
  cajero: string
  items: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[]
  total: number
  pago_efectivo: number
  cambio: number
}

export interface VentaRegistro {
  folio: string
  fecha: string
  cajero: string
  turno_id: string
  total: number
}

export interface CorteResponse {
  cajero: string
  turno_id: string
  num_ventas: number
  total: number
  ventas: VentaRegistro[]
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function buscarProductos(q: string): Promise<ProductoPOS[]> {
  const params = new URLSearchParams({ q })
  return apiFetch<ProductoPOS[]>(`/caja/productos?${params}`)
}

export async function registrarVenta(venta: VentaRequest): Promise<VentaResponse> {
  return apiFetch<VentaResponse>("/caja/ventas", {
    method: "POST",
    body: JSON.stringify(venta),
  })
}

export async function obtenerCorte(cajero: string, turno_id: string): Promise<CorteResponse> {
  const params = new URLSearchParams({ cajero, turno_id })
  return apiFetch<CorteResponse>(`/caja/corte?${params}`)
}

export async function cerrarCorte(cajero: string, turno_id: string): Promise<void> {
  await apiFetch("/caja/corte", {
    method: "POST",
    body: JSON.stringify({ cajero, turno_id }),
  })
}
