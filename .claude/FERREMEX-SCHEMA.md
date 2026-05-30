# FERREMEX-SCHEMA.md — Esquema real de datos

> Entidades de BD (Medusa), archivos JSON y claves localStorage que toca el código.
> Derivado de `packages/api/src/api/caja/*` y `apps/pos/src/lib/*`. Última actualización: 2026-05-29.
> **Medusa no tiene modelos custom propios de Ferremex** — usa módulos nativos + `metadata` en producto.

---

## 1. Entidades Medusa (PostgreSQL) tocadas por el código

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| Product | `product` | `id`, `title`, `handle`, `status`, `thumbnail`, `weight`, **`metadata` (JSONB)** | El POS guarda casi todo en `metadata` (ver §2) |
| ProductVariant | `product_variant` | `id`, `product_id`, `sku`, `barcode`, `title`, `manage_inventory` | 1 variante por producto. SKU = clave del artículo |
| ProductCategory | `product_category` | `id`, `name`, `is_active`, `rank` | M2M con product. `cats[].medusaId` = este `id` |
| ProductImage | `product_image` | `id`, `product_id`, `url` | Imágenes nativas (preferir sobre metadata) |
| InventoryItem | `inventory_item` | `id`, `sku` | 1:1 con variante (vía link) |
| InventoryLevel | `inventory_level` | `id`, `inventory_item_id`, `location_id`, `stocked_quantity`, `reserved_quantity` | Stock real. Se descuenta en venta |
| StockLocation | `stock_location` | `id`, `name` | Almacén principal |
| PriceSet | `price_set` | `id` | Vinculado a variante (link) |
| Price | `price` | `id`, `price_set_id`, `currency_code`, `amount` | MXN, en **centavos** (entero) |
| File | `file` | `id`, `filename`, `mime_type`, `url` | Imágenes subidas vía `/caja/imagen` |
| Store / SalesChannel / Region / Tax | — | — | Config base (seed). Región México, MXN |
| Seller (Mercur) | `seller` | `id`, `name`, … | Marketplace; no central al POS |

### Relaciones (links Medusa 2.x)
```
product (1) ──< product_variant (N)
product (M) >──< product_category (N)           [join]
product_variant (1) ── price_set (1)            [link → prices]
product_variant (1) ── inventory_item (1)       [link]
inventory_item (1) ──< inventory_level (N) ── stock_location
```

> Recordatorio (gotcha): precios NO son relación directa de la variante → usar `query.graph`
> (`entity: "product_variant"`, fields `price_set.prices.amount`). Filtrar por categoría = patrón de dos pasos.

---

## 2. `product.metadata` (JSONB) — campos del POS

El shape `ArticuloPOS` se mapea principalmente a `metadata`:
```jsonc
{
  "departamento": "Herramientas",      // taxonomía nivel 1 (no es categoría Medusa)
  "marca": "Truper",                   // taxonomía nivel 3
  "especificaciones": [{ "clave": "material", "valor": "acero" }],
  "impuesto": true,                    // aplica IVA
  "precio_compra": 25.50,
  "precio2": 40.50, "precio3": 38.00, "precio4": 35.50,  // precio1 = price_set base
  "mayoreoActivo": true, "mayoreoMin": 10,
  "granel": false, "precioNeto": false,
  "claveSat": "01010101", "claveAlterna": "GR6X1ALT",
  "proveedor": "Distribuidora ABC",
  "inventarioMin": 5, "inventarioMax": 100,
  "localizacion": "Pasillo 3, Repisa 2",
  "unidadCompra": "Caja", "unidadVenta": "Pieza", "factor": 12
}
```
- **Precios:** `precio1` vive en el price_set (BD); `precio2-4` en metadata. Nivel elegido por venta según `clienteActivo.num_precio` (1–4): Mostrador / Cliente / Distribuidor / Especial.
- **Taxonomía:** `departamento` y `marca` son metadata; `categoria` es una `product_category` real de Medusa.

---

## 3. Archivos JSON (`packages/api/data/`) — git-ignored

> Todos se escriben vía `lib/json-store` (escritura atómica tmp+rename + mutex por archivo). Ver "Seguridad" abajo.

| Archivo | Forma | Escrito por |
|---|---|---|
| `ventas-pos.json` | `{ folio, fecha, cajero, turno_id, items[{sku, descripcion, cantidad, precio_unitario, subtotal}], total, pago_*, cambio, estado?, motivo_cancelacion?, fecha_cancelacion? }[]` | `/caja/ventas` POST, PATCH `/caja/ventas/:folio` |
| `pedidos-pos.json` | `{ id, folio, fecha, proveedor?, proveedorId?, status, articulos[{clave?, descripcion?, cantidad}], ... }[]` | `/caja/pedidos` |
| `pedido-counter.json` | `{ contador: number }` | `/caja/pedidos` POST (folio secuencial) |
| `cortes-pos.json` | `{ cajero, turno_id, cerrado_en }[]` | `/caja/corte` POST |
| `usuarios-pos.json` | `{ id, nombre, alias?, pin, rol, activo, permisos{} }[]` | `/caja/usuarios` |
| `ticket-config.json` | `{ encabezado{}, pie[], opciones{}, tipos{}, formato_folio{} }` | `/caja/ticket-config` PUT |
| `folio-counter.json` | `{ contador: number }` | `/caja/ventas` (secuencial), `/caja/folio-contador` |
| `marcas-extra.json` | `{ nombre, cat_nombre, dep_nombre }[]` | `/caja/catalogos` PATCH (create_marca) |

> **Nota items de venta:** desde la sesión 2026-05-29 cada item guarda su `sku` (necesario para reintegrar inventario al cancelar). Ventas previas sin `sku` se cancelan sin reintegro (se advierte en log).

**Permisos de usuario** (`usuarios-pos.json`): `puede_vender`, `puede_cotizar`, `puede_anular`, `puede_ver_corte`, `puede_ver_admin`.
Roles: `admin` (todo), `supervisor` (todo menos ver_admin), `cajero` (vender + ver_corte). La ruta exige ≥1 admin activo.
**`pin`:** el GET de listado lo omite; solo `?admin=1` + token admin lo devuelve. La validación del PIN es server-side (`POST /caja/login`).

### Seguridad y contratos del backend
- **Token POS** (`X-POS-Token` = env `POS_TOKEN`) exigido en métodos mutantes de `/caja/*` salvo `/caja/login`. Token admin (`POS_ADMIN_TOKEN`) para `GET /caja/usuarios?admin=1`. Cliente: `VITE_POS_TOKEN` / `VITE_POS_ADMIN_TOKEN`.
- **Divergencia `TicketConfig` frontend↔backend:** el frontend (`client.ts`) tiene `encabezado` con `logo, nombre, direccion, telefono, email, rfc`; el backend persiste `nombre, linea2, linea3, rfc`. `migrarTicketConfig()` (cliente) hace el puente al cargar.
- **`buscarProductos()` ignora `marca`:** `FiltrosBusqueda` tiene el campo `marca` pero la función solo envía `q`, `category_id`, `departamento` al backend.

---

## 4. localStorage (navegador) — provisional, por terminal

| Clave | Forma | Usado por |
|---|---|---|
| `pos_clientes` | `Cliente[]` | Clientes, SelectorCliente, ModalCobro |
| `pos_grupos` | `string[]` (Familia, Empresa, Gobierno, Constructor, Distribuidor) | Clientes |
| `pos_cartera` | `Record<clienteId, CartEntrada>` | CarteraCredito, ModalCobro |
| `pos_proveedores` | `Proveedor[]` (con `facturas: FacturaCredito[]`) | Proveedores |
| `pos_cajas_catalogo` | cajas `{ id, nombre, activa }[]` | EmployeesModule |
| `pos_cajas_asignaciones` | `{ cajero_id → caja_id }` | EmployeesModule |
| `pos_sales_filters` | filtros persistidos | SalesHistory |
| `pos_movimientos_caja_YYYY-MM-DD` | movimientos manuales del día | CashMovementsModule |
| `ferremex_pedidos_espera`, `ferremex_pedido_draft` | borradores locales de pedido | PedidosModule (lo demás va a `/caja/pedidos`) |

### Tipos de cartera (`lib/clientes.ts`)
```ts
Cliente { id, num_cliente, nombre, telefono, num_precio (1-4), dias_credito, limite_credito,
          grupo, monedero, rfc, razon_social, regimen_fiscal, cfdi, calle, numero, colonia, ciudad, estado, cp }
Movimiento { id, tipo: "compra"|"pago", monto, fecha, folio?, plazo?, descripcion, nota? }
NotaCartera { id, fecha, hora, autor, texto }
HistorialLimite { id, fecha, usuario, anterior, nuevo, nota }
CartEntrada { movimientos: Movimiento[], notas: NotaCartera[], historialLimite: HistorialLimite[] }
```
- **Saldos:** `calcularSaldos()` aplica pagos FIFO (compra más antigua primero). Estado: `pagado`/`parcial`/`pendiente`.
- **Semáforo:** azul (al día) · verde (≥7d) · amarillo (1–7d) · naranja (1–30d vencido) · rojo (30–60d) · rojo_oscuro (60+d).

---

## 5. Migración pendiente (Fase 3)

`pos_clientes`, `pos_cartera`, `pos_grupos`, `pos_proveedores` → módulos de Medusa (Customer / custom module).
Hoy aislados por navegador. Al migrar, los consumidores listados en la tabla de impacto cruzado de `CLAUDE.md` deben actualizarse en conjunto.
