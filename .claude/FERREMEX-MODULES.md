# FERREMEX-MODULES.md — Mapa de módulos y conexiones

> Mapa completo de los módulos del POS: propósito, datos que tocan, conexiones actuales y **pendientes**.
> Derivado del código real (`apps/pos/src/`, `packages/api/src/api/caja/`). Última actualización: 2026-05-30.
>
> Leyenda de persistencia: 🟢 BD Medusa · 🟡 JSON (`packages/api/data/`) · 🔴 localStorage (navegador).

---

## Pantalla de Venta (flujo principal)

| Componente | Archivo | Propósito |
|---|---|---|
| Venta (página) | `pages/Venta.tsx` | Orquesta búsqueda + carrito + cobro + ticket |
| Buscador | `components/Buscador.tsx` | Input + FiltroBar + GridProductos + ProductoDetalle |
| FiltroBar | `components/FiltroBar.tsx` | Cascada Dept→Cat→Marca (chips) + filtro de stock |
| GridProductos | `components/GridProductos.tsx` | Grid con thumbnail, +/- al carrito |
| ProductoDetalle | `components/ProductoDetalle.tsx` | Vista expandida, precio según `num_precio`, validación de cantidad |
| Carrito | `components/Carrito.tsx` | Items con cantidad editable (draft), badge mayoreo |
| ModalCobro | `components/ModalCobro.tsx` | Pago split (efectivo/transferencia/crédito), cambio, registra venta. Cargo a crédito vía `/caja/cartera` (BD) |
| Ticket | `components/Ticket.tsx` | Impresión ESC/POS directa |
| SelectorCliente | `components/SelectorCliente.tsx` | Dropdown de clientes vía `/caja/clientes` (BD) → `clienteActivo` |

**Datos:** productos/stock/precio 🟢 (vía `/caja/productos`); venta 🟡 (`ventas-pos.json`); cartera 🟢 (módulo ferremex_cartera BD); cliente 🟢 (Customer Medusa).
**Conexiones:** `buscarProductos()` → `pos-store` (carrito) → `registrarVenta()` (incluye cargo a cartera si crédito, transaccional) + `abrirCajon()` (si efectivo).

---

## Módulos Admin (patrón AdminXxx → XxxModule → sub-componentes)

> Nota: `Admin.tsx` es el **shell de navegación** (layout con sidebar + `<Outlet/>`), no la página de un módulo concreto.

| Módulo | Página | Componente principal | Propósito | Persistencia |
|---|---|---|---|---|
| Artículos | `pages/AdminArticulos.tsx` | `components/ArticlesModule.jsx` (+ `ArticleDrawer`, `ArticleDeleteModal`) | CRUD de artículos, búsqueda, paginación, cascada taxonomía. Errores vía toasts (`useToasts`) | 🟢 producto+precio+inventario |
| Catálogos | `pages/AdminCatalogos.jsx` | `CatalogosModule.jsx` (+ `CatalogosColumnas`, `CatalogosReasignacion`) | Árbol Dept→Cat→Marca, rename/move/reasignar | 🟢 (+ `marcas-extra.json` 🟡) |
| Inventario | `pages/AdminInventario.tsx` | `modules/InventarioModule.jsx` | Ajuste masivo de stock por SKU. Búsqueda + tabla + confirmar. React puro, sin iframe | 🟢 inventory_level |
| Consulta de ventas | `pages/AdminConsultaVentas.tsx` | `modules/SalesHistory.jsx` (fat module) | Historial: filtros por rango, KPIs, doble vista, CSV, cancelación 2 pasos (`cancelarVenta` → reintegra inventario) | 🟡 `ventas-pos.json` |
| Caja / Movimientos | `pages/AdminCaja.tsx` | `modules/CashMovementsModule.jsx` | Movimientos de caja, resumen diario/turno. Movimientos manuales 🔴 por día | 🟡 ventas + 🔴 `pos_movimientos_caja_*` |
| Empleados / Usuarios | `pages/AdminEmpleados.tsx` (`/admin/usuarios` → redirect aquí) | `modules/EmployeesModule.jsx` | CRUD cajeros, roles/permisos, asignación de cajas. Usa `obtenerUsuarios(true)` (con pin) | 🟡 `usuarios-pos.json` + 🔴 `pos_cajas_*` |
| Clientes | `pages/AdminClientes.tsx` (landing), `pages/AdminClientesLista.tsx` (CRUD) | — | CRUD clientes (Customers Medusa), grupos (customer_groups). Banner de migración de localStorage. | 🟢 Customer + customer_group |
| Cartera de crédito | `pages/CarteraCredito.jsx` (`/admin/cartera-credito`) | — | Saldos FIFO, semáforo, notas, historial de límite. Async desde módulo ferremex_cartera BD | 🟢 módulo ferremex_cartera |
| Proveedores | `pages/AdminProveedores.tsx` | — | Gestión de proveedores + facturas a crédito | 🔴 `pos_proveedores` |
| Compras | `pages/AdminCompras.jsx`, `AdminComprasNueva.jsx`, `AdminConsultarCompras.jsx` | `components/ComprasModule.jsx`, `modules/ConsultarCompras.jsx` (+ `ComprasTable`, `ComprasDetailPanel`, `OC*`) | Alta + historial de compras, generación OC PDF | 🟡/frontend (PDF vía `/caja/generar-oc`) |
| Pedidos | `pages/AdminPedidos.jsx` | `components/PedidosModule.jsx` (+ `PedidosTabla`, `PedidosPreview`, `PedidosFiltros`, `ConfirmDialog`) | Pedidos a proveedor desde faltantes. **Backend en `/caja/pedidos`** (folio server-side); espera/draft 🔴 | 🟡 `pedidos-pos.json` + 🔴 espera/draft |
| Tickets / Formatos | `pages/AdminTickets.tsx`, `pages/FormatoConfig.tsx` | — | Config de encabezado/pie/folio. Multi-formato (Nota de venta / Factura / Cupón) con preview en vivo | 🟡 `ticket-config.json` |
| Periféricos | `pages/AdminPerifericos.tsx` | — | Config impresora/huella/escáner (Web Serial) | navegador |
| Generador | `pages/GeneradorTickets.tsx` (`/admin/generador`, fuera del layout) | — | Probador de tickets/periféricos | — |

---

## Estado global y librerías compartidas

- **`lib/pos-store.ts`** — Context + useReducer. Estado: `cajero`, `items`, `ticketConfig`, `clienteActivo`. Helpers: `efectivoPrecio(item)` (aplica mayoreo), `buildTurnoId()`, `usePOS()` (devuelve `{state, dispatch, total}`).
- **`lib/client.ts`** — única puerta al backend `/caja/*`. **Sistema compartido crítico** (ver tabla de impacto cruzado en `CLAUDE.md`).
- **`lib/clientes.ts`** — **FACHADA ASYNC** sobre BD (clientes + cartera = `/caja/clientes/*` + `/caja/cartera/*`). Tipos preservados (Cliente, Movimiento, NotaCartera, HistorialLimite, CartEntrada). Funciones `*Local` solo para migración. **Sistema compartido** (CarteraCredito, ModalCobro, SelectorCliente, AdminClientesLista).
- **`lib/proveedores.ts`** — proveedores (localStorage) + estado de facturas.
- **`lib/serial.ts`** — Web Serial (Chrome). Consumido por Ticket, ModalCobro, Periféricos, Generador.
- **`lib/unidades-sat.ts`** — unidades SAT. Consumido por ArticleDrawer.
- **`lib/utils.ts`** — `uuid()` (id local para keys/borradores). Consumido por PedidosModule (y otros pendientes de migrar su `uuid` v4 local).
- **`lib/format.ts`** — `formatMXN` / `formatMXNAbs`. Consumido por SalesHistory, CashMovementsModule, CarteraCredito, ModalCobro.
- **`hooks/useToasts.ts`** — hook de toasts compartido `{ toasts, push }`. Consumido por SalesHistory, EmployeesModule, ArticlesModule.
- **`components/ConfirmDialog.jsx`** — diálogo de confirmación reutilizable (reemplaza `window.confirm`). Consumido por PedidosModule.

### Backend — librerías compartidas (`packages/api/src/lib/`)
- **`json-store.ts`** — `readJson` / `writeJsonAtomic` (tmp+rename) / `withFileLock` (mutex en-memoria por archivo) / `updateJson`. Consumido por rutas `ventas`, `usuarios`, `folio-contador`, `pedidos`, `ventas/[folio]`.
- **`text.ts`** — `slugify(text, maxLen)` y `normalizarFonetico`. Consumido por rutas `articulos` (slug 100), `catalogos` (slug 80), `productos` (fonético).
- **`pos-auth.ts`** — `validarPosToken` / `validarPosAdminToken`. Consumido por `middlewares.ts` y `usuarios/route.ts`.

### Backend — módulos de negocio (`packages/api/src/modules/`)
- **`ferremex_cartera`** — módulo custom de Medusa. Entidades: `CarteraCliente` (raíz única por customer_id), `MovimientoCartera` (compra/pago transaccional), `NotaCartera` (registros textuales), `HistorialLimite` (auditoría de cambios de límite). Registrado en `medusa-config.ts` y migración aplicada. Consumido por rutas `/caja/cartera/*`.

---

## Conexiones ACTUALES (quién llama a quién)

```
Buscador ──buscarProductos()──► /caja/productos ──► Medusa (product+inventory+price)
ModalCobro ──registrarVenta()──► /caja/ventas ──► descuenta inventario + ventas-pos.json
ModalCobro ──agregarMovimientoCredito()──► pos_cartera (localStorage)   [si crédito]
ModalCobro ──abrirCajon()──► serial.ts                                   [si efectivo]
ArticlesModule / PedidosFiltros / FiltroBar / CatalogosModule ──listarCatalogos()──► /caja/catalogos
SalesHistory / CashMovementsModule ──listarVentas()──► /caja/ventas
PedidosModule ──listarFaltantes()──► /caja/articulos?faltantes=1
EmployeesModule ──obtener/crear/actualizar/eliminarUsuario()──► /caja/usuarios
ComprasModule ──generarOCPdf()──► /caja/generar-oc (PDF)
```

---

## Conexiones PENDIENTES (deberían existir y no están)

1. **Proveedores/Cajas → BD (Fase 3 continuación).** `pos_proveedores` y `pos_cajas_*` viven en localStorage. Deberían migrar a BD de Medusa como `Proveedor` + `CajaPOS` (custom) o vendedor/atributo de staff.
2. **Compras (recepción) ⇄ inventario.** Recibir una OC debería poder incrementar inventario vía `incrementarInventario()`; hoy no está cableado en ComprasModule.
3. **Empleados/Cajas ⇄ Corte.** Las asignaciones de caja (`pos_cajas_*`, localStorage) no se cruzan con el cierre de turno (`/caja/corte`). Corte debería validar contra cajas asignadas.
4. **Cartera ↔ Ventas (reconciliación).** Aunque ahora transaccional (cargo en `/caja/ventas` incluye movimiento de cartera), la reconciliación de pagos contra cargos requiere consultas cruzadas.

---

## Datos que cada módulo podría necesitar de otros

| Módulo | Podría necesitar de… | Para… | Estado |
|---|---|---|---|
| PedidosModule | `/caja/articulos?faltantes=1`, proveedores BD | armar pedido real con proveedor y costos | 🟡 faltantes funciona, proveedores aún localStorage |
| ComprasModule | `/caja/inventario` (incrementarInventario) | recibir mercancía y subir stock | 🔴 no cableado |
| CarteraCredito | `/caja/ventas` (consulta) | auditoría: cargos vía venta ↔ movimiento cartera | 🟢 ahora transaccional en `/caja/ventas` |
| SalesHistory | inventario + cartera | cancelar venta devolviendo stock y crédito | 🟢 reintegro de stock OK, reversión cartera en desarrollo |
| CashMovementsModule | `/caja/corte` | cuadrar movimientos contra cierre de turno | 🔴 cierre de turno no cableado con caja/asignación |
| EmployeesModule | `/caja/corte` | reportar ventas por cajero/caja | 🔴 separado, sin integración |
