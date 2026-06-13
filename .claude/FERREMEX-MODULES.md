# FERREMEX-MODULES.md — Mapa de módulos y conexiones

> Mapa completo de los módulos del POS: propósito, datos que tocan, conexiones actuales y **pendientes**.
> Derivado del código real (`apps/pos/src/`, `packages/api/src/api/caja/`). Última actualización: 2026-06-12.
>
> Leyenda de persistencia: 🟢 BD Medusa · 🟡 JSON (`packages/api/data/`) · 🔴 localStorage (navegador).

---

## Pantalla de Venta (flujo principal)

| Componente | Archivo | Propósito |
|---|---|---|
| Venta (página) | `pages/Venta.tsx` | Orquesta búsqueda + carrito (drawer) + cobro + ticket. Estado `carritoAbierto`, FAB 🛒. |
| Buscador | `components/Buscador.tsx` | Input + FiltroBar + GridProductos + ProductoDetalle |
| FiltroBar | `components/FiltroBar.tsx` | Cascada Dept→Cat→Marca (chips) + filtro de stock |
| GridProductos | `components/GridProductos.tsx` | Grid expandido (230px cols ≈6 por fila), thumbnail, +/- al carrito, modal desglose paquete |
| ProductoDetalle | `components/ProductoDetalle.tsx` | Vista expandida, precio según `num_precio`, validación de cantidad |
| Carrito | `components/Carrito.tsx` | Drawer deslizable (esquina inferior derecha), items con cantidad editable, cierra con Escape/overlay |
| ModalCobro | `components/ModalCobro.tsx` | Pago split (efectivo/transferencia/crédito), cambio, registra venta. Cargo a crédito vía `/caja/cartera` (BD) |
| Ticket | `components/Ticket.tsx` | Impresión ESC/POS directa |
| SelectorCliente | `components/SelectorCliente.tsx` | Dropdown de clientes vía `/caja/clientes` (BD) → `clienteActivo` |
| DesglosePaqueteModal | `components/DesglosePaqueteModal.tsx` | Modal de desglose: artículos del paquete, cantidad, precio prorrateo, ahorro $/%., renderizado vía createPortal |

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
| Consulta de ventas | `pages/AdminConsultaVentas.tsx` | `modules/SalesHistory.jsx` (fat module) | Historial: filtros por rango, KPIs, doble vista, CSV, cancelación 2 pasos. Ahora con filtro `pago_tarjeta` + columna en CSV | 🟡 `ventas-pos.json` |
| Caja / Movimientos | `pages/AdminCaja.tsx` | `modules/CashMovementsModule.jsx` | Movimientos de caja por CAJA (no cajero/turno), resumen diario. Periodo continuo desde último corte cerrado. Ahora con `caja_id`, `periodo_desde`, `franja_id`. | 🟡 ventas + 🔴 `pos_movimientos_caja_*` |
| Empleados / Usuarios | `pages/AdminEmpleados.tsx` (`/admin/usuarios` → redirect aquí) | `modules/EmployeesModule.jsx` | CRUD cajeros, roles/permisos, asignación de cajas + tab "Cajas y horario" (PosUsuario.horario). Botón "Turnos" en toolbar abre `TurnosConfigModal` (modo día/turnos + editor de franjas → `/caja/turnos-config`). Usa `obtenerUsuarios(true)` (con pin) | 🟡 `usuarios-pos.json` + 🟡 `turnos-config.json` + 🟢 cajas (BD) |
| Clientes | `pages/AdminClientes.tsx` (landing), `pages/AdminClientesLista.tsx` (CRUD) | — | CRUD clientes (Customers Medusa), grupos (customer_groups). | 🟢 Customer + customer_group |
| Cartera de crédito | `pages/CarteraCredito.jsx` (`/admin/cartera-credito`) | — | Saldos FIFO (EXCLUYEN cancelados), semáforo, notas, historial de límite. Botón "Cancelar abono" en DetalleAbonoModal, badge "Cancelado" en lista. | 🟢 módulo ferremex_cartera |
| Monedero Electrónico | `pages/AdminMonedero.tsx` (`/admin/monedero`) | `modules/MonederoModule.jsx` (4 tabs: Clientes/Reglas/Niveles/Config; drawers de inscripción/regla/nivel; ConfirmDialog para reset/baja) | Programa de lealtad por puntos: devengo por línea (según marca/categoría/departamento REALES del producto), canje, niveles/tiers con multiplicador. Devengo + canje transaccionales en POST `/caja/ventas` (cap server-side). Cancelación reversible de venta anula/reembolsa puntos. | 🟢 módulo ferremex_monedero (ConfigMonedero, ReglaPuntos, NivelMonedero, MovimientoMonedero) |
| Proveedores | `pages/AdminProveedores.tsx` | — | Gestión de proveedores + facturas a crédito | 🟢 módulo ferremex_proveedores |
| Compras | `pages/AdminCompras.jsx`, `AdminComprasNueva.jsx`, `AdminConsultarCompras.jsx` | `components/ComprasModule.jsx`, `modules/ConsultarCompras.jsx` (+ `ComprasTable`, `ComprasDetailPanel`, `OC*`) | Alta + historial de compras, generación OC PDF | 🟢 módulo ferremex_compras |
| Pedidos | `pages/AdminPedidos.jsx` | `components/PedidosModule.jsx` (+ `PedidosTabla`, `PedidosPreview`, `PedidosFiltros`, `ConfirmDialog`) | Pedidos a proveedor desde faltantes. **Backend en `/caja/pedidos`** (folio server-side); espera/draft 🔴 | 🟡 `pedidos-pos.json` + 🔴 espera/draft |
| Tickets / Formatos | `pages/AdminTickets.tsx`, `pages/FormatoConfig.tsx` | — | Config de encabezado/pie/folio. Multi-formato (Nota de venta / Factura / Cupón) con preview en vivo | 🟡 `ticket-config.json` |
| Periféricos | `pages/AdminPerifericos.tsx` | — | Config impresora/huella/escáner (Web Serial) + toggle confirmación de puntos + toggle monedero confirmación | navegador |
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
- **`ferremex_cartera`** — módulo custom de Medusa. Entidades: `CarteraCliente` (raíz única por customer_id), `MovimientoCartera` (compra/pago transaccional, `cancelado`, `motivo_cancelacion`, `fecha_cancelacion`), `NotaCartera` (registros textuales), `HistorialLimite` (auditoría de cambios de límite). Registrado en `medusa-config.ts` y migración aplicada. Consumido por rutas `/caja/cartera/*`.
- **`ferremex_monedero`** — módulo custom de Medusa (Fase 3 continuación). Entidades: `ConfigMonedero` (singleton: `valor_punto`, `tasa_base`, `max_canje_pct`, `min_puntos_canje`, `vencimiento_meses`, `confirmar_huella`, `confirmar_codigo`, `redondeo`, `periodo_nivel_meses`), `ReglaPuntos` (ámbito marca/departamento/categoría + ref + tasa%; tasa 0 = excluido), `NivelMonedero` (tiers: nombre, orden, umbral_periodo, multiplicador, valor_punto_bonus, nivel_precio, color), `MovimientoMonedero` (customer_id, tipo ganado/canjeado/ajuste/vencido/reset, puntos, folio, soft-cancel auditable). Registrado en `medusa-config.ts` y migraciones aplicadas. **GOTCHA:** pluralizador runtime genera "…Monederos" (un -s), pero codegen sugiere "…Monederoes" (mismatch resuelto con interface merge en service.ts). El nivel del cliente se DERIVA (no almacena) del período de compras vía `/caja/monedero/_nivel.ts`. Consumido por rutas `/caja/monedero/*` y transaccional en `/caja/ventas` (devengo + canje).

---

## Conexiones ACTUALES (quién llama a quién)

```
Buscador ──buscarProductos() con departamento+categoria──► /caja/productos ──► ProductoPOS (+ depto/cat/marca) → carrito
GridPaquetes ──DesglosePaqueteModal──► cargarDesglosePaquete() ──► componentes+prorrateo+thumbnails
Carrito ──drawer FAB──► Venta state `carritoAbierto`, cierra Escape/overlay
ModalCobro ──registrarVenta()──► /caja/ventas ──► descuenta inventario + puntos monedero (devengo+canje transaccionales) + ventas-pos.json + caja_id/vendedor/pago_tarjeta
ModalCobro ──método "Crédito"──► /caja/cartera (BD) [si crédito]
ModalCobro ──método "Tarjeta"──► /caja/ventas (pago_tarjeta, NO entra en efectivo esperado)
ModalCobro ──método "Puntos" (si inscrito+saldo)──► canje de puntos + preview en UI + /caja/ventas pago_puntos
ModalCobro ──abrirCajon()──► serial.ts [si efectivo]
SelectorVendedor ──set vendedorVenta en pos-store──► Venta (atribución, no afecta corte)
CambiarUsuarioModal ──re-login preservando caja/turno──► Login flow (sin cerrar corte)
Venta ──preview puntos + depto/cat real──► lib/monedero.ts (calcularPuntosGanados con tasaDeLinea REAL + cap)
CarteraCredito ──anularAbono()──► PATCH /caja/cartera/[customerId]/movimientos/[movId] ──► devolución a deuda
MonederoModule ──listarClientesMonederoAPI, reglas, niveles, config──► /caja/monedero/* (4 tabs + CRUD)
MonederoModule ──listarCatalogos()──► ReglaDrawer (resolver marca→cat→depto)
SelectorCliente ──muestra saldo de puntos + precarga monedero──► lib/monedero.ts (cache 60s) + /caja/monedero/[customerId]
CorteModule ──obtenerCorte(caja_id), cerrarCorte, listarCortesPendientes──► /caja/corte, /caja/cortes-pendientes
CorteModule ──cargar cajas + turnos-config──► /caja/cajas, /caja/turnos-config
ArticlesModule / PedidosFiltros / FiltroBar / CatalogosModule ──listarCatalogos() (TTL 5min)──► /caja/catalogos
SalesHistory ──listarVentas(), cancelarVenta()──► /caja/ventas (ahora con pago_tarjeta, caja_id, vendedor)
CashMovementsModule ──listarVentas(), obtenerCorte(caja_id)──► /caja/ventas, /caja/corte (por CAJA, no cajero/turno)
PedidosModule ──listarFaltantes()──► /caja/articulos?faltantes=1
EmployeesModule ──obtener/crear/actualizar/eliminarUsuario()──► /caja/usuarios (+ caja_id, horario)
EmployeesModule ──listarCajasAPI(), crearCajaAPI, actualizarCajaAPI──► /caja/cajas (BD)
EmployeesModule ──TurnosConfigModal (modo/franjas)──► /caja/turnos-config (GET/PUT)
ComprasModule ──generarOCPdf()──► /caja/generar-oc (PDF)
Login ──obtenerConfigTurnos() + buildTurnoId(cfg)──► turno_id por modo (día: YYYY-MM-DD; turnos: -franjaId)
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
| MonederoModule | `/caja/catalogos` (en ReglaDrawer) | resolver tasa por marca→cat→depto | 🟢 implementado |
| ModalCobro | `lib/monedero.ts` (calcularPuntosGanados) | preview "ganarás X puntos" antes de cobro | 🟢 implementado |
| SelectorCliente | `/caja/monedero/[customerId]` | mostrar saldo de puntos del cliente | 🟢 implementado |
| Ticket | `puntos_ganados`, `pago_puntos` de venta | imprimir resumen de puntos | 🟢 implementado |
| SalesHistory | `/caja/ventas` (incluye reversión de puntos al cancelar) | auditoría de puntos ganados/canjeados | 🟢 transaccional en POST, reversión en PATCH cancelar |
| CarteraCredito | `/caja/ventas` (consulta) | auditoría: cargos vía venta ↔ movimiento cartera | 🟢 ahora transaccional en `/caja/ventas` |
| SalesHistory | inventario + cartera | cancelar venta devolviendo stock y crédito | 🟢 reintegro de stock OK, reversión cartera en desarrollo |
| CashMovementsModule | `/caja/corte` | cuadrar movimientos contra cierre de turno | 🔴 cierre de turno no cableado con caja/asignación |
| EmployeesModule | `/caja/corte` | reportar ventas por cajero/caja | 🔴 separado, sin integración |
