# FERREMEX-SCHEMA.md — Esquema real de datos

> Entidades de BD (Medusa), archivos JSON y claves localStorage que toca el código.
> Derivado de `packages/api/src/api/caja/*` y `apps/pos/src/lib/*`. Última actualización: 2026-06-19.
> **Medusa:** módulos nativos + `metadata` en producto + **módulos custom ferremex_cartera + ferremex_monedero + ferremex_facturable** (Fase 3).

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
| Price | `price` | `id`, `price_set_id`, `currency_code`, `amount` | MXN, en **diezmilésimas** (factor 10000, 4 decimales para exactitud con IVA) |
| File | `file` | `id`, `filename`, `mime_type`, `url` | Imágenes subidas vía `/caja/imagen` |
| **Customer** | **`customer`** | `id`, `email`, `first_name`, `last_name`, `phone`, **`metadata` (JSONB)** | **Ahora guarda clientes POS en metadata** (Fase 3). `metadata.pos_cliente = true` marca cliente POS |
| **CustomerGroup** | **`customer_group`** | `id`, `name`, **`metadata` (JSONB)** | Grupos de clientes. `metadata.pos_grupo = true` marca grupo POS |
| Store / SalesChannel / Region / Tax | — | — | Config base (seed). Región México, MXN |
| Seller (Mercur) | `seller` | `id`, `name`, … | Marketplace; no central al POS |

### Módulo custom: `ferremex_cartera` (Fase 3)

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| **CarteraCliente** | `cartera_cliente` | `id` (PK uuid), `customer_id` (UK, FK), `limite_credito`, `creado_en`, `actualizado_en` | Raíz única por customer. Holds movimientos/notas/historial |
| **MovimientoCartera** | `movimiento_cartera` | `id`, `cartera_cliente_id` (FK), `tipo` ("compra" / "pago"), `monto` (centavos), `fecha`, `folio_venta?`, `plazo?`, `descripcion`, `nota?`, **`cancelado`** (bool, default false), **`motivo_cancelacion`** (text nullable), **`fecha_cancelacion`** (timestamp ISO nullable) | Transaccional. Compras al registrar venta; pagos manuales. Soft-cancel de abonos (restituye deuda vía FIFO al excluirlo del cálculo). |
| **NotaCartera** | `nota_cartera` | `id`, `cartera_cliente_id` (FK), `fecha`, `hora`, `autor`, `texto` | Auditoría textual |
| **HistorialLimite** | `historial_limite` | `id`, `cartera_cliente_id` (FK), `fecha`, `usuario`, `anterior`, `nuevo`, `nota` | Auditoría de cambios de límite |

### Módulo custom: `ferremex_monedero` (Fase 3 continuación)

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| **ConfigMonedero** | `config_monedero` | `id` (PK uuid, singleton), `valor_punto` (decimal), `tasa_base` (%), `max_canje_pct` (%), `min_puntos_canje`, `vencimiento_meses`, `confirmar_huella` (bool), `confirmar_codigo` (bool), `redondeo` ("ninguno" / "entero" / "decimas" / "centesimas"), `periodo_nivel_meses` | Datos de configuración global. Un único registro activo (singleton vía `id`). |
| **ReglaPuntos** | `regla_puntos` | `id`, `ambito` ("marca" / "departamento" / "categoria"), `ref` (nombre), `tasa` (%), `activa` (bool) | Tasas por taxonomía. Tasa 0 = excluye la línea. Resolución: marca → categoría → departamento → tasa_base. |
| **NivelMonedero** | `nivel_monedero` | `id`, `nombre`, `orden`, `umbral_periodo` (pesos acumulados en período), `multiplicador` (tasa), `valor_punto_bonus` (decimal), `nivel_precio` (1-4), `color` (hex) | Tiers de lealtad. El nivel se DERIVA en cliente (no almacena). Multiplicador aplica a puntos ganados. |
| **MovimientoMonedero** | `movimiento_monedero` | `id`, `customer_id` (FK), `tipo` ("ganado" / "canjeado" / "ajuste" / "vencido" / "reset"), `puntos` (int), `fecha`, `folio_venta?`, `motivo?`, `cancelado` (bool), `motivo_cancelacion` (text) | Auditable. Devengo + canje transaccionales en POST `/caja/ventas` dentro del lock. Cancelación de venta marca soft-cancel el devengo. |

### Módulo custom: `ferremex_facturable` (Fase 3 continuación — Facturación CFDI)

| Entidad | Tabla | Campos clave | Notas |
|---|---|---|---|
| **SaldoFacturable** | `saldo_facturable` | `id` (PK), `sku` (unique), `saldo` (number, default 0, PUEDE ser negativo = sobregiro), `clave_sat` (nullable), `descripcion` (nullable), `departamento` (nullable), `actualizado_el` (ISO) | Piezas con respaldo fiscal por artículo (independiente del stock físico). Sube al recibir compra "Con Factura"; baja solo al FACTURAR (consumo). |
| **MovimientoFacturable** | `movimiento_facturable` | `id` (PK), `sku`, `tipo` ("recarga"/"consumo"/"ajuste"), `cantidad` (con signo), `folio_ref` (nullable), `cfdi_ref` (nullable, para reversa al cancelar global), `motivo` (nullable), `fecha` (ISO) | Bitácora auditable; el saldo = suma de movimientos del SKU. Pluralización inglesa: listMovimientoFacturables. |
| **DeptoFacturable** | `depto_facturable` | `id` (PK), `departamento` (unique), `facturable` (bool, default true), `actualizado_el` (ISO) | Marca qué departamentos son facturables (depto define, artículo limita). |

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
  "categoria": "Clavos",               // nivel 2 (puede ser string o UUID de product_category)
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
  "unidadCompra": "Caja", "unidadVenta": "Pieza", "factor": 12,
  "facturable": true                   // NUEVO: marcado en depto facturable (CFDI global)
}
```
- **Precios:** `precio1` vive en el price_set (BD, en **diezmilésimas** factor 10000); `precio2-4` en metadata. Nivel elegido por venta según `clienteActivo.num_precio` (1–4): Mostrador / Cliente / Distribuidor / Especial. Helper central: `lib/precio.ts` `pesosAAmount()` / `amountAPesos()`. Convención: guardados SIN IVA, devueltos a venta YA CON IVA (×1.16).
- **Taxonomía:** `departamento`, `categoria`, `marca` son metadata. Ahora `/caja/productos` expone `departamento` y `categoria` en respuesta para cálculo de puntos REAL (no derivado de marca). El motor `lib/monedero.ts` `tasaDeLinea()` recibe `LineaPuntos` con campos `departamento?`, `categoria?`, `marca?` y resuelve por orden: marca → categoría → departamento → tasa_base.

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
- **Monedero:** el saldo de puntos del cliente vive en la tabla `movimiento_monedero` (se calcula en tiempo real), no en metadata de customer. El nivel del cliente se DERIVA (no almacena) en tiempo de lectura vía `/caja/monedero/_nivel.ts` (helper server-side) usando período de compras desde `ventas-pos.json`.
- **Inscripción:** cada cliente puede inscribirse/darse de baja en monedero vía `/caja/monedero/inscribir` POST e `/caja/monedero/[customerId]` DELETE.

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
| `ventas-pos.json` | `{ folio, fecha, cajero, turno_id, caja_id?, caja_name?, vendedor?, cliente_id?, cliente_nombre?, plazo?, items[{sku, descripcion, cantidad, precio_unitario, subtotal, marca?, departamento?, categoria?}], total, pago_efectivo, pago_transferencia, pago_credito, pago_tarjeta?, pago_puntos?, cambio, puntos_ganados?, puntos_canjeados?, estado?, motivo_cancelacion?, fecha_cancelacion?, global_uuid?, global_cfdi_id? }[]` | `/caja/ventas` POST (con devengo/canje transaccional en monedero, depto/cat reales de producto), PATCH `/caja/ventas/:folio` (cancelación revierte puntos). **NUEVO:** `global_uuid`, `global_cfdi_id` marcan inclusión en factura global. |
| `globales-pos.json` | `{ uuid, fecha, serie, folio, cfdi_id, estado, monto_total, articulos_incluidos, consumo_saldo, timbrado_en }[]` | `/caja/facturama/global` POST (timbra) + PATCH (cancelación reversible) |
| `facturacion-config.json` | `{ serie_nominativa: string, serie_global: string, periodicidad_global: "diaria"|"manual", correo_contador: string }` | `/caja/facturama/config` GET/PUT |
| `pedidos-pos.json` | `{ id, folio, fecha, proveedor?, proveedorId?, status, articulos[{clave?, descripcion?, cantidad}], ... }[]` | `/caja/pedidos` |
| `pedido-counter.json` | `{ contador: number }` | `/caja/pedidos` POST (folio secuencial) |
| `cortes-pos.json` | `{ caja_id, periodo_desde, franja_id?, cerrado_en, franja_dia?, ventas_total, ventas_efectivo, ventas_transferencia, ventas_credito, ventas_tarjeta?, movimientos_total, movimientos_entrada, movimientos_salida, ... }[]` | `/caja/corte` POST (por CAJA, periodo continuo desde último cierre, no por cajero/turno) |
| `turnos-config.json` | `{ modo: "dia"|"turnos", franjas: [{id, nombre, desde, hasta}] }` | `/caja/turnos-config` GET/PUT |
| `usuarios-pos.json` | `{ id, nombre, alias?, pin, rol, activo, caja_id?, horario?: {dias, entrada, salida, turno_id}, permisos{} }[]` | `/caja/usuarios` (+ caja_id, horario) |
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
          grupo, rfc, razon_social, regimen_fiscal, cfdi, calle, numero, colonia, ciudad, estado, cp }
Movimiento { id, tipo: "compra"|"pago", monto, fecha, folio?, plazo?, descripcion, nota?, 
             cancelado?: boolean, motivo_cancelacion?: string, fecha_cancelacion?: string }
NotaCartera { id, fecha, hora, autor, texto }
HistorialLimite { id, fecha, usuario, anterior, nuevo, nota }
CartEntrada { movimientos: Movimiento[], notas: NotaCartera[], historialLimite: HistorialLimite[] }
```
- **Saldos:** `calcularSaldos()` aplica pagos FIFO (compra más antigua primero). **EXCLUYE movimientos con `cancelado=true`** (devolución a deuda). Estado: `pagado`/`parcial`/`pendiente`.
- **Semáforo:** azul (al día) · verde (≥7d) · amarillo (1–7d) · naranja (1–30d vencido) · rojo (30–60d) · rojo_oscuro (60+d).
- **Cancelación de abono:** soft-cancel vía `PATCH /caja/cartera/[customerId]/movimientos/[movId]` con motivo obligatorio. Auditable (fecha_cancelacion persiste ISO). No se borra, se marca como inválido para cálculos.

### Tipos del módulo Monedero — en `lib/monedero.ts` + `client.ts`
```ts
ConfigMonederoAPI { id, valor_punto, tasa_base, max_canje_pct, min_puntos_canje, 
                    vencimiento_meses, confirmar_huella, confirmar_codigo, 
                    redondeo: "ninguno"|"entero"|"decimas"|"centesimas", periodo_nivel_meses }
ReglaPuntosAPI { id, ambito: "marca"|"departamento"|"categoria", ref, tasa, activa }
NivelMonederoAPI { id, nombre, orden, umbral_periodo, multiplicador, valor_punto_bonus, nivel_precio, color }
MovimientoMonederoAPI { id, customer_id, tipo: "ganado"|"canjeado"|"ajuste"|"vencido"|"reset", 
                        puntos, fecha, folio_venta?, motivo?, cancelado, motivo_cancelacion }
ClienteMonederoFila { customer_id, nombre, saldo_puntos, nivel, valor_nivel, conteo_movimientos, ultima_actividad }
DetalleMonedero { saldo_puntos, nivel, multiplicador, valor_punto_bonus, movimientos: MovimientoMonederoAPI[], 
                  historial_movimientos: (tipo|fecha|puntos|detalle)[] }
LineaPuntos { subtotal: number, marca?: string | null, departamento?: string | null, categoria?: string | null }  /* para cálculo con taxonomía real */
```
- **Motor (`lib/monedero.ts`):** funciones `tasaDeLinea()` (recibe `LineaPuntos` completo, resuelve tasa por marca→categoría→departamento→base, fallback a catalogos si faltan), `redondearPuntos()` (aplica modo), `calcularPuntosGanados()` (línea por línea, cap servidor).
- **Taxonomía REAL:** `/caja/productos` ahora expone `departamento` y `categoria` (metadata del producto). El carrito (CartItem) propaga estos campos. El motor resuelve la tasa según taxonomía REAL, no derivada.
- **Cache:** `client.ts` cachea `listarCatalogos()` (TTL 5min, coalescing) y config+reglas monedero (TTL 60s). Helper `precargarMonederoGlobal(customerId?)` warm-up en `SelectorCliente` al elegir cliente.
- **Nivel derivado:** no se almacena en BD. Calculado en tiempo real vía `/caja/monedero/_nivel.ts` (helper server-side) usando compras del período desde `ventas-pos.json`.
- **VentaRequest/VentaResponse extendidos:** campos `pago_puntos`, `puntos_ganados`, `puntos_canjeados`, `pago_tarjeta` transaccionales dentro del lock de venta.

---

## 4b. Rutas `/caja/*` nuevas y refactorizadas (Sesión 2026-06-12 y 2026-06-19)

| Método | Ruta | Cambio | Notas |
|--------|------|--------|-------|
| GET/POST | `/caja/corte` | Refactorizado por CAJA (no cajero/turno) | Ahora `calcularResumen(caja_id, desde, filtroFranja)`. Período continuo desde último corte cerrado. Respuesta += `caja_id`, `periodo_desde`, `franja_id`, `modo`. Query: `?caja_id=` (sin cajero/turno obligatorios). |
| GET | `/caja/cortes-pendientes` | **NUEVO** | Lista cajas con ventas posteriores a su último corte. Consumido por banner de CorteModule. |
| GET | `/caja/turnos-config` | **NUEVO** | Lee configuración de turnos: `{ modo: "dia"|"turnos", franjas: [{id,nombre,desde,hasta}] }`. |
| PUT | `/caja/turnos-config` | **NUEVO** | Guarda configuración de turnos. |
| POST | `/caja/ventas` | Extendido | Ahora persiste `caja_id`, `caja_name` (del cajero), `vendedor`, `pago_tarjeta`, `departamento`/`categoria` en items (desde producto). Devengo/canje monedero con taxonomía REAL. **NUEVO:** `global_uuid`, `global_cfdi_id` marca inclusión en factura global. |
| PATCH | `/caja/ventas/:folio` | Mejorado | Cancelación revierte `puntos_ganados`/`puntos_canjeados` (soft-cancel en BD). |
| GET/PUT/DELETE | `/caja/usuarios` | Extendido | PosUsuario += `caja_id`, `horario?: {dias,entrada,salida,turno_id}`. |
| **GET** | **`/caja/facturama/global/preview`** | **NUEVO** | Preview de factura global del día (clasificación por saldo). Query: `?depto_id=` (opcional, depto facturable), `?forzado=1` (sobregiro). Respuesta: LineaGlobal[], clasificadas. |
| **POST** | **`/caja/facturama/global`** | **NUEVO** | Timbra factura global en Facturama. Body: `{ articulos_id[], serie, forzado? }`. Devuelve uuid timbrado, marca ventas con `global_uuid`, consume saldo. |
| **GET** | **`/caja/facturama/comprobantes`** | **NUEVO** | Lista CFDIs desde Facturama (con filtros DateStart/DateEnd/Status/Page). Cruza con globales persisted. |
| **PATCH** | **`/caja/facturama/comprobantes/[cfdiId]`** | **NUEVO** | Cancela CFDI (motivo SAT 01-04, reversible). Body: `{ motivo }`. Revierte saldo si es global. |
| **POST** | **`/caja/facturama/comprobantes/[cfdiId]/reenviar`** | **NUEVO** | Reenvía CFDI por correo. Body: `{ email }`. |
| **GET** | **`/caja/facturama/comprobantes/[cfdiId]/archivo`** | **NUEVO** | Descarga PDF/XML de CFDI. Query: `?tipo=pdf|xml`. |
| **GET/PUT** | **`/caja/facturama/config`** | **NUEVO** | Lee/escribe configuración (serie, periodicidad, correo contador). |

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
