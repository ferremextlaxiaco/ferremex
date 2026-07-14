import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { pesosAAmount } from "../../../lib/precio"
import * as fs from "fs"
import * as path from "path"

/**
 * Configuración del SERVICIO DE FLETE (un solo servicio global, por ahora).
 *
 * El flete dejó de vivir como sub-objeto de la ficha de entrega; ahora es un
 * SERVICIO FACTURABLE que entra a la venta como una LÍNEA más (aparece en el
 * ticket y lo mapea el resolver fiscal como cualquier producto con claveSat).
 *
 * Esta config guarda los datos del servicio en JSON y, al guardar, crea/actualiza
 * un PRODUCTO Medusa oculto (SKU `SERVICIO-FLETE`, sin inventario) para que:
 *  - el flete pueda agregarse al carrito como item normal (Fase 2), y
 *  - el resolver fiscal (lib/facturable-resolver) lo resuelva por SKU→metadata,
 *    haciéndolo facturable sin tocar el pipeline de facturación.
 *
 * Las reglas de aviso (cobrar flete si peso/cantidad/monto < X) se diseñan luego.
 */

const CONFIG_FILE = path.join(__dirname, "../../../../data/flete-config.json")

// SKU fijo del producto-servicio. El POS lo usa para agregar la línea de flete y
// el resolver fiscal para mapear su clave SAT. NO cambiar sin migrar ventas.
export const SKU_FLETE = "SERVICIO-FLETE"

export interface FleteConfig {
  // Nombre visible del servicio (aparece en el ticket y la factura).
  nombre: string
  // Clave ProdServ del SAT. Servicios de mensajería (paquetería) = 78102203.
  claveSat: string
  // Clave de unidad SAT. Unidad de servicio = E48.
  unidadSat: string
  // Precio base sugerido (SIN IVA). El vendedor lo puede ajustar al cobrar.
  precioBase: number
  // Si el flete lleva IVA 16% (un servicio de flete normalmente sí).
  aplicaIva: boolean
  // SKU del producto-servicio (fijo). Se expone para el front.
  sku: string
}

const DEFAULT_CONFIG: FleteConfig = {
  nombre: "Servicio de flete",
  claveSat: "78102203",
  unidadSat: "E48",
  precioBase: 50,
  aplicaIva: true,
  sku: SKU_FLETE,
}

function cargarConfig(): FleteConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    guardarConfigJson(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as Partial<FleteConfig>
    // Merge con default para tolerar campos nuevos / archivos viejos.
    return { ...DEFAULT_CONFIG, ...raw, sku: SKU_FLETE }
  } catch {
    return DEFAULT_CONFIG
  }
}

function guardarConfigJson(config: FleteConfig) {
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
}

/**
 * Crea (o actualiza) el producto Medusa oculto que representa el servicio de
 * flete. SKU fijo `SERVICIO-FLETE`, `manage_inventory: false` (no descuenta stock
 * ni bloquea), status DRAFT para que no aparezca en catálogos públicos. Guarda en
 * metadata la clave SAT / unidad / IVA para que el resolver fiscal lo mapee.
 *
 * Idempotente: si el producto ya existe (por su variant sku), solo actualiza
 * metadata + título + precio; si no, lo crea.
 */
async function upsertProductoServicioFlete(scope: any, config: FleteConfig): Promise<void> {
  const productModule = scope.resolve(Modules.PRODUCT)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  // ¿Ya existe la variante con nuestro SKU?
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "product_id", "price_set.id", "price_set.prices.id", "price_set.prices.currency_code"],
    filters: { sku: [config.sku] },
    pagination: { take: 1 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variant = (variants as any[])?.[0]

  const metadata = {
    es_servicio: true,        // marca de servicio (no producto físico)
    es_flete: true,           // específicamente el servicio de flete
    claveSat: config.claveSat,
    unidadVenta: config.unidadSat,
    unidadCompra: config.unidadSat,
    impuesto: config.aplicaIva,  // el resolver fiscal lee `impuesto` para el IVA
    departamento: "Servicios",
    marca: "",
  }

  // El precio base se guarda SIN IVA (igual que los artículos). El precio real de
  // la línea lo define el vendedor al cobrar; este es solo el default sugerido.
  const amount = pesosAAmount(config.precioBase)

  const pricingModule = scope.resolve(Modules.PRICING)
  const remoteLink = scope.resolve(ContainerRegistrationKeys.LINK)

  // Fija el precio MXN del variant: si ya tiene price set lo actualiza; si no,
  // crea uno y lo liga (patrón canónico de scripts/asignar-precios.ts, porque
  // `prices` inline en createProducts no siempre puebla el price set).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fijarPrecio(variantId: string, priceSet: any) {
    if (priceSet?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mxn = (priceSet.prices ?? []).find((p: any) => p.currency_code === "mxn")
      if (mxn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pricingModule as any).updatePrices([{ id: mxn.id, amount }])
      } else {
        await pricingModule.addPrices([{ priceSetId: priceSet.id, prices: [{ amount, currency_code: "mxn" }] }])
      }
      return
    }
    // Sin price set: crear + vincular.
    const [ps] = await pricingModule.createPriceSets([
      { prices: [{ amount, currency_code: "mxn" }] },
    ])
    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: variantId },
        [Modules.PRICING]: { price_set_id: ps.id },
      },
    ])
  }

  if (variant) {
    // Actualizar producto + variante + precio existentes.
    await productModule.updateProducts(variant.product_id, {
      title: config.nombre,
      metadata,
    })
    await productModule.updateProductVariants(variant.id, {
      title: config.nombre,
      manage_inventory: false,
    })
    await fijarPrecio(variant.id, variant.price_set)
    return
  }

  // Crear el producto-servicio desde cero. DRAFT = no aparece en catálogos públicos.
  // manage_inventory:false = nunca toca inventario ni bloquea la venta.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [creado] = await productModule.createProducts([
    {
      title: config.nombre,
      handle: "servicio-flete",
      status: ProductStatus.DRAFT,
      metadata,
      variants: [
        {
          title: config.nombre,
          sku: config.sku,
          manage_inventory: false,
          allow_backorder: true,
        },
      ],
    },
  ] as any)

  // Poblar el precio explícitamente (price set + link) sobre el variant recién creado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nuevaVar = (creado as any)?.variants?.[0]
  if (nuevaVar?.id) await fijarPrecio(nuevaVar.id, null)
}

/** GET /caja/flete-config */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json(cargarConfig())
}

/** PUT /caja/flete-config — guarda la config y sincroniza el producto-servicio. */
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : ""
  if (!nombre) {
    res.status(400).json({ error: "El nombre del servicio es obligatorio" })
    return
  }
  const precioBase = Number(body?.precioBase)
  if (isNaN(precioBase) || precioBase < 0) {
    res.status(400).json({ error: "El precio base no puede ser negativo" })
    return
  }

  const config: FleteConfig = {
    ...DEFAULT_CONFIG,
    ...body,
    nombre,
    claveSat: typeof body?.claveSat === "string" ? body.claveSat.trim() : DEFAULT_CONFIG.claveSat,
    unidadSat: typeof body?.unidadSat === "string" ? body.unidadSat.trim() : DEFAULT_CONFIG.unidadSat,
    precioBase,
    aplicaIva: body?.aplicaIva !== false,
    sku: SKU_FLETE,
  }

  // ORDEN IMPORTANTE: sincronizamos el producto-servicio de Medusa ANTES de
  // escribir el JSON. En dev, escribir en packages/api/data/*.json dispara el
  // watcher de Medusa, que REINICIA el dev server y abortaría las operaciones
  // async de Medusa (createPriceSets/link) a media petición. Haciendo el upsert
  // primero, el reinicio ocurre después de que el producto ya quedó completo.
  let warning: string | undefined
  try {
    await upsertProductoServicioFlete(req.scope, config)
  } catch (e) {
    console.error("[caja/flete-config] Falló el upsert del producto-servicio:", e)
    warning = "Config guardada; no se pudo sincronizar el producto de facturación."
  }

  guardarConfigJson(config)

  if (warning) {
    res.json({ ...config, _warning: warning })
    return
  }

  res.json(config)
}
