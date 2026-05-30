# FERREMEX-SCHEMA.md — Esquema real de datos

> Entidades de BD (Medusa), archivos JSON y claves localStorage que toca el código.
> Derivado de `packages/api/src/api/caja/*` y `apps/pos/src/lib/*`. Última actualización: 2026-05-30.
> **Medusa:** módulos nativos + `metadata` en producto + **módulo custom ferremex_cartera** (Fase 3).

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
| **Customer** | **`customer`** | `id`, `email`, `first_name`, `last_name`, `phone`, **`metadata` (JSONB)** | **Ahora guarda clientes POS en metadata** (Fase 3). `metadata.pos_cliente = true` marca cliente POS |
| **CustomerGroup** | **`customer_group`** | `id`, `name`, **`metadata` (JSONB)** | Grupos de clientes. `metadata.pos_grupo = true` marca grupo POS |
| Store / SalesChannel / Region / Tax | — | — | Config base (seed). Región México, MXN |
| Seller (Mercur) | `seller` | `id`, `name`, … | Marketplace; no central al POS |

### Módulo custom: `ferremex_cartera` (Fase 3)

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| **CarteraCliente** | `cartera_cliente` | `id` (PK uuid), `customer_id` (UK, FK), `limite_credito`, `creado_en`, `actualizado_en` | Raíz única por customer. Holds movimientos/notas/historial |
| **MovimientoCartera** | `movimiento_cartera` | `id`, `cartera_cliente_id` (FK), `tipo` ("compra" / "pago"), `monto` (centavos), `fecha`, `folio_venta?`, `plazo?`, `descripcion`, `nota?` | Transaccional. Compras al registrar venta; pagos manuales |
| **NotaCartera** | `nota_cartera` | `id`, `cartera_cliente_id` (FK), `fecha`, `hora`, `autor`, `texto` | Auditoría textual |
| **HistorialLimite** | `historial_limite` | `id`, `cartera_cliente_id` (FK), `fecha`, `usuario`, `anterior`, `nuevo`, `nota` | Auditoría de cambios de límite |

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

## 2. `product.metadata` (JSONB) — campos POS de artículo

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

## 2b. `customer.metadata` (JSONB) — Cliente POS (Fase 3)

Mapeo `Cliente ↔ Customer` en `_mapper.ts`:
```jsonc
{
  "pos_cliente": true,           // marca este customer como cliente POS
  "num_cliente": 101,            // ID secuencial único en Ferremex
  "num_precio": 1,               // nivel de precio (1-4)
  "dias_credito": 30,            // plazo estándar
  "limite_credito": 5000.00,     // en MXN
  "grupo": "Cliente",            // nombre del grupo (referencia)
  "monedero": 0.00,              // saldo monedero (reservado)
  "rfc": "ABC123456XYZ",
  "razon_social": "Empresa ABC",
  "regimen_fiscal": "601",       // CFDI
  "cfdi": "G01",                 // uso de CFDI
  "calle": "Calle Principal",
  "numero": "123",
  "colonia": "Centro",
  "ciudad": "Tlaxiaco",
  "estado": "Oaxaca",
  "cp": "69600"
}
```
- **Mapeo:** `first_name` ← `nombre`; `phone` ← `telefono`.
- **ID único:** `num_cliente` es secuencial incremental por Ferremex (no UUID). Generado server-side en `POST /caja/clientes` con query `?siguiente-num=1`.

## 2c. `customer_group.metadata` (JSONB) — Grupo POS (Fase 3)

```jsonc
{
  "pos_grupo": true              // marca grupo POS
}
```
- **Nombres de grupos:** "Familia", "Empresa", "Gobierno", "Constructor", "Distribuidor" (categorizados, no libres).

---

## 3. Archivos JSON (`packages/api/data/`) — git-ignored

> Todos se escriben vía `lib/json-store` (escritura atómica tmp+rename + mutex por archivo). Ver "Seguridad" abajo.

| Archivo | Forma | Escrito por |
|---|---|---|
| `ventas-pos.json` | `{ folio, fecha, cajero, turno_id, cliente_id?, cliente_nombre?, plazo?, items[{sku, descripcion, cantidad, precio_unitario, subtotal}], total, pago_*, cambio, estado?, motivo_cancelacion?, fecha_cancelacion? }[]` | `/caja/ventas` POST (con crédito transaccional), PATCH `/caja/ventas/:folio` |
| `pedidos-pos.json` | `{ id, folio, fecha, proveedor?, proveedorId?, status, articulos[{clave?, descripcion?, cantidad}], ... }[]` | `/caja/pedidos` |
| `pedido-counter.json` | `{ contador: number }` | `/caja/pedidos` POST (folio secuencial) |
| `cortes-pos.json` | `{ cajero, turno_id, cerrado_en }[]` | `/caja/corte` POST |
| `usuarios-pos.json` | `{ id, nombre, alias?, pin, rol, activo, permisos{} }[]` | `/caja/usuarios` |
| `ticket-config.json` | `{ encabezado{}, pie[], opciones{}, tipos{}, formato_folio{}, formatos{} }` | `/caja/ticket-config` PUT |
| `folio-counter.json` | `{ contador: number }` | `/caja/ventas` (secuencial), `/caja/folio-contador` |
| `marcas-extra.json` | `{ nombre, cat_nombre, dep_nombre }[]` | `/caja/catalogos` PATCH (create_marca) |

**Sección `formatos` en `ticket-config.json` (Fase 2):**
```jsonc
{
  "formatos": {
    "nota_venta": { "activo": true, "titulo": "Nota de Venta", "encabezado": [], "pie": [], "mostrar_precios": true, "mostrar_vigencia": false, "vigencia_dias": 0 },
    "factura": { "activo": false, "titulo": "Factura", "encabezado": [], "pie": [], "mostrar_precios": true, "mostrar_vigencia": false, "vigencia_dias": 0 },
    "cupon": { "activo": false, "titulo": "Cupón", "encabezado": [], "pie": [], "mostrar_precios": false, "mostrar_vigencia": true, "vigencia_dias": 7 }
  }
}
```
Configurado vía `FormatoConfig.tsx` con preview en vivo.

> **Nota items de venta:** desde la sesión 2026-05-29 cada item guarda su `sku` (necesario para reintegrar inventario al cancelar). Ventas previas sin `sku` se cancelan sin reintegro (se advierte en log). Desde 2026-05-30: `cliente_id`, `cliente_nombre`, `plazo` registran cartera transaccional.

**Permisos de usuario** (`usuarios-pos.json`): `puede_vender`, `puede_cotizar`, `puede_anular`, `puede_ver_corte`, `puede_ver_admin`.
Roles: `admin` (todo), `supervisor` (todo menos ver_admin), `cajero` (vender + ver_corte). La ruta exige ≥1 admin activo.
**`pin`:** el GET de listado lo omite; solo `?admin=1` + token admin lo devuelve. La validación del PIN es server-side (`POST /caja/login`).

### Seguridad y contratos del backend
- **Token POS** (`X-POS-Token` = env `POS_TOKEN`) exigido en métodos mutantes de `/caja/*` salvo `/caja/login`. Token admin (`POS_ADMIN_TOKEN`) para `GET /caja/usuarios?admin=1`. Cliente: `VITE_POS_TOKEN` / `VITE_POS_ADMIN_TOKEN`.
- **Divergencia `TicketConfig` frontend↔backend:** el frontend (`client.ts`) tiene `encabezado` con `logo, nombre, direccion, telefono, email, rfc`; el backend persiste `nombre, linea2, linea3, rfc`. `migrarTicketConfig()` (cliente) hace el puente al cargar.
- **`buscarProductos()` ignora `marca`:** `FiltrosBusqueda` tiene el campo `marca` pero la función solo envía `q`, `category_id`, `departamento` al backend.

---

## 4. localStorage (navegador) — provisional, por terminal

| Clave | Forma | Usado por | Notas |
|---|---|---|---|
| `pos_proveedores` | `Proveedor[]` (con `facturas: FacturaCredito[]`) | Proveedores | **Deuda Fase 3:** migrar a BD |
| `pos_cajas_catalogo` | cajas `{ id, nombre, activa }[]` | EmployeesModule | **Deuda Fase 3:** migrar a BD |
| `pos_cajas_asignaciones` | `{ cajero_id → caja_id }` | EmployeesModule | **Deuda Fase 3:** migrar a BD |
| `pos_sales_filters` | filtros persistidos | SalesHistory | Filtros de búsqueda, no datos críticos |
| `pos_movimientos_caja_YYYY-MM-DD` | movimientos manuales del día | CashMovementsModule | Borradores diarios, reset al cierre |
| `ferremex_pedidos_espera`, `ferremex_pedido_draft` | borradores locales de pedido | PedidosModule | Borradores locales, persistencia `/caja/pedidos` para historial |
| ~~`pos_clientes`~~ | **MIGRADO A BD** | **Retirado (Fase 3)** | Reemplazado por `/caja/clientes`, Customer Medusa |
| ~~`pos_grupos`~~ | **MIGRADO A BD** | **Retirado (Fase 3)** | Reemplazado por `/caja/grupos`, customer_group Medusa |
| ~~`pos_cartera`~~ | **MIGRADO A BD** | **Retirado (Fase 3)** | Reemplazado por `/caja/cartera`, módulo ferremex_cartera |
| `pos_migrado_v1` | flag booleano | MigracionNube.tsx | Red de seguridad: marca si se migró localStorage |

### Tipos conservados para API (ahora BD) — en `lib/clientes.ts`
```ts
Cliente { id?, num_cliente, nombre, telefono, num_precio (1-4), dias_credito, limite_credito,
          grupo, monedero, rfc, razon_social, regimen_fiscal, cfdi, calle, numero, colonia, ciudad, estado, cp }
Movimiento { id, tipo: "compra"|"pago", monto, fecha, folio?, plazo?, descripcion, nota? }
NotaCartera { id, fecha, hora, autor, texto }
HistorialLimite { id, fecha, usuario, anterior, nuevo, nota }
CartEntrada { movimientos: Movimiento[], notas: NotaCartera[], historialLimite: HistorialLimite[] }
```
- **Saldos:** `calcularSaldos()` aplica pagos FIFO (compra más antigua primero). Estado: `pagado`/`parcial`/`pendiente`.
- **Semáforo:** azul (al día) · verde (≥7d) · amarillo (1–7d) · naranja (1–30d vencido) · rojo (30–60d) · rojo_oscuro (60+d).

---

## 5. Migración Fase 3 — Completada (Clientes/Cartera) y Pendiente (Proveedores/Cajas)

### Completada (2026-05-29/30)
- **`pos_clientes`, `pos_grupos`, `pos_cartera`** → Medusa (Customer + customer_group + módulo ferremex_cartera).
- Rutas `/caja/clientes/*`, `/caja/grupos/*`, `/caja/cartera/*` implementadas.
- Frontend refactorizado a async en `lib/clientes.ts` (fachada sobre BD).
- Componente `MigracionNube.tsx` maneja migración idempotente de localStorage viejo.

### Pendiente
- **`pos_proveedores`** → modelo Proveedor (custom) o atributo de vendor.
- **`pos_cajas_catalogo`, `pos_cajas_asignaciones`** → entidad CajaPOS (custom) o campo en staff.
- Al migrar, actualizar consumidores en `CLAUDE.md` tabla de impacto cruzado.
