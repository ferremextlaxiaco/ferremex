import { model } from "@medusajs/framework/utils"

/**
 * Una promoción del POS: regla de descuento aplicable a uno o varios artículos
 * en el momento de la venta. Dato maestro compartido entre terminales (BD,
 * terminal-agnostic). Se crea/edita desde el módulo admin de Promociones o
 * desde la ficha del artículo, y se aplica en el carrito vía el motor
 * `calcularLineaConPromo` (apps/pos/src/lib/promociones.ts).
 *
 * El descuento se modela por LÍNEA del carrito (una sola promo por línea, gana
 * la de mayor prioridad). NxM y volumen dependen de la cantidad de la línea, por
 * eso no se expresan como un precio unitario uniforme.
 *
 * Los SKU viven en arrays JSON (no relación) porque son referencias a variantes
 * de producto de Medusa, que están en otro módulo: el enlace es por clave/SKU,
 * igual que las compras enlazan por proveedor_id sin FK dura.
 */
const Promocion = model.define("promocion", {
  id: model.id().primaryKey(),
  nombre: model.text(),
  // Interruptor maestro. Una promo inactiva nunca aplica, sin importar vigencia.
  activa: model.boolean().default(true),
  // Vigencia opcional (fecha ISO YYYY-MM-DD). Vacío = activa siempre hasta
  // desactivar. El estado derivado (Programada/Vencida) lo calcula el frontend.
  inicio: model.text().nullable(),
  fin: model.text().nullable(),
  // Desempate cuando varias promos aplican a la misma línea: mayor prioridad gana.
  prioridad: model.number().default(0),

  // Tipo de descuento. Determina qué campos se usan:
  //  - porcentaje   → `porcentaje` (% sobre el precio del nivel del cliente)
  //  - nivel_precio → `nivel_precio` (2|3|4: fuerza ese precio durante la promo)
  //  - nxm          → `nxm_lleva`/`nxm_paga` (lleva N, paga M)
  //  - volumen      → `volumen_min`/`volumen_desc`/`volumen_alcance`
  tipo: model.enum(["porcentaje", "nivel_precio", "nxm", "volumen"]),
  porcentaje: model.number().nullable(),
  nivel_precio: model.number().nullable(),
  nxm_lleva: model.number().nullable(),
  nxm_paga: model.number().nullable(),
  volumen_min: model.number().nullable(),
  volumen_desc: model.number().nullable(),
  // "todas" = el descuento aplica a todas las piezas si se alcanza el mínimo;
  // "excedente" = solo a las piezas que exceden el mínimo.
  volumen_alcance: model.enum(["todas", "excedente"]).nullable(),

  // Cómo se relacionan los artículos requeridos con los beneficiados:
  //  - "mismos"  → un solo conjunto: lo que se lleva ES lo que recibe el descuento
  //  - "cruzada" → requeridos (deben estar en el carrito) habilitan el descuento
  //    sobre los beneficiados (artículos distintos). Promo A→B.
  modo_articulos: model.enum(["mismos", "cruzada"]).default("mismos"),
  skus_requeridos: model.json(),   // string[] de SKUs que activan la promo
  skus_beneficiados: model.json(), // string[] de SKUs que reciben el descuento

  // Segmentación: a quién aplica la promo.
  //  - "todos"   → público general (siempre disponible)
  //  - "cliente" → solo si ese cliente está activo en la venta (cliente_id)
  //  - "grupo"   → solo si el cliente activo pertenece al grupo (grupo = id)
  segmento: model.enum(["todos", "cliente", "grupo"]).default("todos"),
  cliente_id: model.text().nullable(),
  grupo: model.text().nullable(),

  // Restricciones opcionales transversales.
  cantidad_minima: model.number().nullable(), // piezas mínimas para activar
  max_unidades: model.number().nullable(),    // tope de unidades con descuento
  // Etiqueta personalizable que se muestra en el carrito/ticket. Vacío = nombre.
  etiqueta: model.text().nullable(),
})

export default Promocion
