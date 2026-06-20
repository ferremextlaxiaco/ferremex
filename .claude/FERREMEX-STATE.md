# FERREMEX-STATE.md — Estado vivo de desarrollo

> Capa de "estado de desarrollo activo" (colas de trabajo, notas de ejecución). Complementa —no duplica—
> `MEMORIA_INSTALACIÓN.md` (estado por fases/infra, mantenido por el skill `actualizador`).
> **Actualiza este archivo al cierre de cada sesión** (regla abajo). Convierte fechas relativas a absolutas.
>
> Última actualización: **2026-06-19**

---

## Purpose

POS de mostrador para Ferremex (ferretería, Tlaxiaco, Oaxaca) sobre Medusa 2.x + Mercur, monorepo bun/turborepo,
React 18/TS en el frontend POS. Objetivo de la fase actual: completar el POS de mostrador (Fase 2) y preparar
la migración de datos locales (clientes, cartera) a la BD (Fase 3).

---

## Current Truth

- **Rama default:** `master`.
- **Fase activa:** Fase 2 (POS de mostrador) — mayormente completa. Fases 0–1 y Fase 3 (Clientes/Cartera BD) completadas.
- **Backend:** Medusa `2.13.4` + Mercur `2.0.1`, puerto 9000. Rutas POS en `/caja/*`.
- **POS:** React 18 + Vite, puerto 7002 (`base: /pos`). Montado como módulo `vendor-ui`.
- **Servicios (PM2):** `ferremex-admin` (7000), `ferremex-pos` (7002), `ferremex-api` (9000). Redis (Docker) 6379, PostgreSQL 16 (5432).
- **Últimos commits:**
  - `97d7e19` Facturación CFDI vía Facturama: centro de control, doble inventario fiscal, global del día, historial, cancelación reversible, VisorComprobante reutilizable (2026-06-19)
  - `a85b733` Precios: precisión factor 10000 (diezmilésimas) para exactitud con IVA; migración one-shot y lib/precio.ts centralizado (2026-06-19)
  - `[SESIÓN 2026-06-12]` Sistema de TURNOS/CORTES refactorizado (Fases 1-3) + ModalCobro v2 (Tailwind/lucide, canje puntos, método Tarjeta) + monedero motor con taxonomía REAL (2026-06-12)
  - `[TBD]` Monedero Electrónico: programa de lealtad por puntos (2026-06-08)
  - `f2d8aac` Cartera: cancelar (anular) abonos con devolución a la deuda (2026-06-01)
  - `44035bd` Clientes: quitar banner de migración a la nube (2026-06-01)
  - `075d182` POS venta: modal de desglose de paquete + carrito como drawer + grid (2026-06-01)
  - `6d97adf` Búsqueda de venta: relevancia literal + fusión SKU-parcial con nombre (2026-06-01)

---

## Current Constraints

- **Persistencia correcta:** BD Medusa > JSON > localStorage (orden de preferencia). Clientes + Cartera ya migrados a BD (Fase 3). No agregar nuevos datos a localStorage salvo lo explícitamente provisional de fase (borradores PedidosModule, movimientos caja diarios, etc.).
- **Análisis de impacto cruzado obligatorio** antes de tocar sistemas compartidos (ver `CLAUDE.md` § Análisis de impacto cruzado).
- **Sin tocar** Starter Contract Surfaces (medusa-config.ts, vite.config.ts, blocks.json, `@acme/api/_generated`) sin justificarlo.
- **Web Serial = Chrome**: cualquier feature de impresora/cajón asume Chrome en las terminales.
- **n8n producción (VPS)**: no activar workflows sin probar local.

---

## Active Queues

### Pendientes de producto (priorizados)
1. **PDF/Imprimir compras:** los botones "Imprimir" / "Ver PDF" en ConsultarCompras son placeholders ("Función disponible próximamente").
2. **Pedidos por proveedor en AdminProveedores:** ya hay "compras por proveedor"; podría añadirse análogo para pedidos (mejora, no urgente).

### Deuda técnica abierta
- **Race condition en venta:** `/caja/ventas` POST valida stock y luego descuenta sin transacción atómica (check→decrement). Riesgo de sobreventa concurrente.
- **Sin auth/RBAC en `/caja/*`:** las rutas confían en token POS; los permisos de usuario se cargan pero no se validan server-side para operaciones específicas.
- **Sin auditoría de cambios:** no se registra quién editó qué (artículos, precios, taxonomía, límites de crédito).
- **localStorage por terminal (residual):** solo quedan movimientos manuales de caja diarios y borradores de PedidosModule. Proveedores, cajas, clientes y cartera ya migrados a BD.

### Calidad del harness
- Hooks de memoria de sesión instalados (session-start/end). Pendiente opcional: hooks de calidad (typecheck/format/config-protection) — documentados en `HARNESS-SUMMARY.md`.

---

## Interfaces (dónde vive la verdad)

- **Estado por fases / infra / credenciales:** `MEMORIA_INSTALACIÓN.md` (lo mantiene `actualizador`).
- **Negocio + reglas n8n:** `CLAUDE CONTEXTO FERREMEX.md`.
- **Reglas y arquitectura:** `CLAUDE.md`.
- **Mapa de módulos:** `.claude/FERREMEX-MODULES.md`. **Esquema de datos:** `.claude/FERREMEX-SCHEMA.md`. **Patrones:** `.claude/FERREMEX-PREFERENCES.md`.
- **Resúmenes de sesión:** `.claude/sessions/*.md` (generados por hooks, git-ignored).

---

## Update Rule

Al cerrar una sesión de trabajo significativa:
1. Actualiza **Current Truth** (fase, commits, trabajo en progreso).
2. Mueve items completados fuera de **Active Queues**; añade nuevos pendientes detectados.
3. Añade una línea a **Latest Execution Notes** con fecha absoluta.
4. Archiva notas que ya no estén moldeando la ejecución (más de ~4 semanas e irrelevantes).
El agente `doc-updater` puede ayudar a refrescar este archivo.

---

## Latest Execution Notes

- **2026-06-19 (Feature: Facturación CFDI + Precisión de precios):**
  - **Módulo de Facturación (CFDI vía Facturama):** 3 tabs (`FacturaGlobalPanel`, `ComprobantesPanel`, `FacturacionConfigPanel`). **Global:** factura diaria de público en general (CFDI 4.0) con preview que clasifica artículos por estado respecto al saldo facturable (depto facturable, desglose ENTRAN/EXCLUYEN/SIN_CLAVE SAT). Modal de confirmación con "switch" de forzado (sobregiro). Filtra por depto facturable. **Comprobantes:** historial de CFDIs desde Facturama (1 clic = selecciona, doble clic = abre), filtros fecha/tipo/estado/texto. Descarga lote a carpeta (File System Access API, PDF+XML individuales). Cancelación con motivo SAT 01-04 + reversa de saldo. Reenvío por email. **Config:** serie (nominativa/global), periodicidad global, correo contador. Ruta `/admin/facturacion` (module mount en sidebar). Backend: `/caja/facturama/*` (global/preview POST, global POST timbra, comprobantes GET+PATCH cancelar+POST reenviar, config GET/PUT, archivos GET).
  - **Librerías de soporte:** `lib/global-builder.ts` (lógica pura de agrupación/clasificación), `cfdi-mapper.ts` (mapeo de líneas a CFDI global), `facturable-resolver.ts` (depto/descripcion por SKU), `facturama.ts` mejorado (listarCfdis con filtros, manejo "sin conexión"). Módulo `ferremex_facturable` (BD Medusa): ConfigFacturable + ConsumoFacturable (auditable).
  - **Frontend:** `client.ts` extendido con 9 funciones Facturama + tipos (LineaGlobal, PreviewGlobalData, GlobalRegistro, ComprobanteCFDI, ConfigFacturacion). `VisorComprobante.jsx` componente reutilizable (PDF pantalla completa + panel detalles, backdrop-filter blur), montado en ComprobantesPanel + FacturarBoton (ticket post-venta). `apiFetch` ahora extrae `{error}` del backend.
  - **Datos:** nuevos JSONs: `globales-pos.json` (registro de globales timbradas), `facturacion-config.json`. `ventas-pos.json` += `global_uuid`, `global_cfdi_id` (marca de inclusión en global).
  - **Fixes:** atribución cliente venta→ticket→factura (memoiza clienteFactura en Ticket), régimen Facturama cambiado a 621 (RIF, del perfil TaxEntity, no .env).
- **2026-06-19 (Feature: Precisión de precios × 10000):**
  - **Cambio de factor de precios:** Price amount = DIEZMILÉSIMAS (factor 10000, 4 decimales) en lugar de CENTAVOS (factor 100, 2 decimales). Permite exactitud en precios con IVA cerrados (ej. $65 en lugar de 64.99).
  - **Centralización:** `lib/precio.ts` nuevo con `pesosAAmount(pesos)`, `amountAPesos(amount)`, constante `PRECIO_FACTOR = 10000`. Consumido por: rutas articulos (POST+PUT+3 GET), productos, promociones/precios, scripts import/asignar.
  - **Convención:** precio1..4 guardados SIN IVA en BD; `/caja/productos` los devuelve YA CON IVA (×1.16) a la venta. Drawer muestra con IVA, guarda sin IVA. Separador decimal: punto, no coma del locale.
  - **Migración:** script `migrar-precios-decimales.ts` (×100 a amounts existentes, control `MIGRAR_APLICAR=1`). Ya aplicada: 19986 precios.
- **2026-06-12 (Feature: Sistema de TURNOS/CORTES, ModalCobro v2, monedero con taxonomía real):**
  - **TURNOS/CORTES refactorizado (Fases 1-3):** Cambio arquitectónico mayor. Antes: corte por `cajero` exacto + `turno_id` exacto (formato YYYY-MM-DD-m/t, corte rígido a 14h). Ahora: corte por CAJA con período continuo desde último corte cerrado.
    - **Fase 1 — Corte por caja:** `/caja/ventas` persiste `caja_id` + `caja_name` (de cajero logueado) + `vendedor`. `corte/route.ts`: `calcularResumen(caja_id, desde, filtroFranja)` filtra por caja (no cajero/turno) en período continuo. `CorteCerrado` identifica por `(caja_id, periodo_desde)` no `(cajero, turno_id)`. Tiene `periodo_desde`, `franja_id`, `franja_dia`. GET `/caja/corte?caja_id=` sin cajero/turno obligatorios. NUEVA ruta `/caja/cortes-pendientes` (banner en CorteModule).
    - **Fase 2 — Vendedor + cambio de usuario:** pos-store `vendedorVenta: {id,nombre}|null` (reset en CLEAR/SET_CAJERO). Component `SelectorVendedor.tsx` en header Venta. Component `CambiarUsuarioModal.tsx`: re-loguea preservando caja/turno de terminal.
    - **Fase 3 — Toggle día/turnos + horarios:** NUEVA ruta `/caja/turnos-config` (GET/PUT) → `turnos-config.json`: `{ modo: "dia"|"turnos", franjas: [{id,nombre,desde,hasta}] }`. Helper backend `lib/turnos.ts` (`leerTurnosConfig`, `franjaDeTimestamp`). PosUsuario += `horario?: {dias,entrada,salida,turno_id}`. UI: tab "Cajas y horario" + modal `TurnosConfigModal`. `buildTurnoId(cfg?)` respeta modo: día → `YYYY-MM-DD`, turnos → `YYYY-MM-DD-<franjaId>` según hora.
  - **ModalCobro rediseñado (Tailwind v4 + lucide-react):** Métodos como tarjetas seleccionables. Nuevo método "Tarjeta" (pago TPV, distinto de "Crédito" fiado). Inputs `type="text"` + `saneaMonto()` (coma→punto). NUEVA sección canje de puntos (cliente tiene puntos canjeables), con campo parcial + "Usar todos". Conversión puntos↔pesos con `cfgMon.valor_punto` base (NO bonus nivel). Modal `max-w-2xl`. Campos VentaRequest/Response extendidos: `pago_tarjeta`, fin-a-fin en `/caja/ventas` + `corte/route.ts` (columna propia, NO entra al efectivo esperado) + Ticket.tsx + SalesHistory.jsx + CorteModule.jsx + CashMovementsModule.jsx.
  - **Monedero: motor usa taxonomía REAL + cache+precarga:** `lib/monedero.ts` `tasaDeLinea()` ahora resuelve tasa usando departamento+categoría REALES del producto (metadata), con fallback a marca→catálogo solo si faltan. `LineaPuntos` += `departamento?` + `categoria?`. `/caja/productos` expone `departamento` y `categoria` (metadata). `ProductoPOS` y `CartItem` llevan esos campos; Buscador/ProductoDetalle/DetallePromoModal los propagan. `client.ts` cachea: `listarCatalogos()` (TTL 5min, coalescing), config+reglas+detalle monedero (TTL 60s). Helper `precargarMonederoGlobal(customerId?)`. `SelectorCliente` dispara precarga. Mutaciones invalidan caches.
  - **Verificado:** tsc limpio backend+frontend. Smoke-test: corte sin filtro suma todo, por caja separa correctamente, legacy OK. ModalCobro workflow canje OK. Monedero: devengo/canje con taxonomía correcta, cancelación reversible OK. Todas las rutas `/caja/*` refactorizadas (tipos, respuestas). Impacto cruzado: `/caja/ventas`, `/caja/corte`, `/caja/turnos-config`, ModalCobro, client.ts, pos-store, SelectorCliente, Ticket, SalesHistory, CorteModule, CashMovementsModule, CambiarUsuarioModal, TurnosConfigModal. Sistemas compartidos listarCatalogos + monedero.ts sin rotura.

- **2026-06-08 (Feature: Monedero Electrónico):** Programa completo de lealtad por puntos. **Backend:** módulo custom `ferremex_monedero` con entidades ConfigMonedero (singleton), ReglaPuntos (por marca/depto/cat), NivelMonedero (tiers con multiplicador), MovimientoMonedero (auditable). Rutas `/caja/monedero/*`: config GET/PUT, reglas CRUD, niveles CRUD, clientes (GET tabla con saldos+nivel+KPIs), [customerId] GET detalle / DELETE baja, inscribir POST, movimientos POST ajuste, reset POST. **/caja/ventas POST extendido** con devengo + canje transaccionales dentro del lock (campos `pago_puntos`, `puntos_ganados`, `puntos_canjeados`); validación de saldo ANTES + RE-VALIDACIÓN dentro del lock (anti-race); cap server-side de puntos_ganados. **/caja/ventas/[folio] PATCH cancelar** revierte puntos (soft-cancel devengo, reembolso mejor-esfuerzo de canje). **GOTCHA:** pluralizador Medusa runtime genera "Monederos" (un -s), pero codegen sugiere "Monederoes" → interface merge en service.ts. **El nivel del cliente se DERIVA** (no se almacena) del período de compras vía helper `_nivel.ts`. **Frontend:** `lib/monedero.ts` motor compartido (tasaDeLinea, redondearPuntos, calcularPuntosGanados con tope). `client.ts` extendido con *MonederoAPI (config, reglas, niveles, clientes, detalle, inscribir, baja, ajuste, reset) + tipos. `AdminMonedero.tsx` (wrapper) + `MonederoModule.jsx` (fat module, 4 tabs Tailwind v4: Clientes/Reglas/Niveles/Configuración; drawers de detalle/inscribir/regla/nivel; ConfirmDialog para reset/baja; useToasts). Ruta `/admin/monedero` + sidebar (icono Wallet). **ModalCobro.tsx:** método "Puntos" (si cliente inscrito + saldo ≥ mínimo) con tope, confirmación huella/código (simulada), preview "ganarás X puntos". **SelectorCliente.tsx:** muestra saldo de puntos del cliente activo. **Ticket.tsx:** línea de puntos ganados + línea de pago con puntos. **pos-store.ts:** CartItem.marca (opcional, nuevo) propagado por Buscador + ProductoDetalle. **AdminPerifericos.tsx:** toggle "Confirmar uso de puntos (Monedero)" en huella + nota en código de barras. Defaults: 1 punto=$1, tasa base 1%, tope canje 50%, mínimo 100 pts. Verificado: tsc limpio backend+frontend, smoke-test e2e (crear/listar/devengo/canje/cancelar venta con reversión) OK. Sistemas compartidos tocados: `/caja/ventas`, ModalCobro, client.ts, SelectorCliente, Ticket, pos-store/CartItem, AdminPerifericos, listarCatalogos (consumido por motor y ReglaDrawer).
- **2026-06-02 (Feature: Empleados/Cajas ↔ Corte):** Vinculada la caja física al corte de turno (pendiente de producto #1, ahora cerrado). El `Cajero` (pos-store) hereda `caja_id`/`caja_nombre` al iniciar sesión: `Login.tsx` carga `listarCajasAPI()` en el `useEffect` inicial (mapa caja_id→nombre en un `useRef` para evitar stale closure si las cajas cargan durante la validación de PIN) y `/caja/login` propaga `caja_id` del usuario (interfaz local `PosUsuario` += `caja_id`). En `/caja/corte`: `calcularResumen(cajero, turno_id, caja_id?)` ahora **filtra los MOVIMIENTOS manuales por caja** — incluye los de esa caja MÁS los `cajaId == null` (históricos/sin caja), sin perder efectivo; las VENTAS siguen por cajero (hoy no llevan `cajaId`). `CorteCerrado` += `caja_id`/`caja_name` (persistidos en POST); GET acepta `?caja_id=`. `CorteModule.jsx` pasa `cajero.caja_id` a obtenerCorte/cerrarCorte y muestra la caja en el header y en el ticket de corte cerrado. Verificado end-to-end vía curl: corte sin filtro suma todo (1100), corte filtrado separa por caja correctamente (800, ignora caja ajena, conserva movimientos sin caja); cierre persiste caja_id/caja_name; retrocompat con cortes legacy OK. 0 errores tsc (POS y backend). Reviews TS+React: APPROVE (2 fixes MEDIUM aplicados: tipos de `Movimiento.cajaId` en corte, y useRef en Login). Datos de prueba limpiados.
- **2026-06-01 (Feature: Cancelación de abonos + UI venta):** **Cartera:** módulo ferremex_cartera ganó 3 columnas nuevas (`cancelado`, `motivo_cancelacion`, `fecha_cancelacion`) en MovimientoCartera. Ruta NUEVA: `PATCH /caja/cartera/[customerId]/movimientos/[movId]` (motivo obligatorio). Frontend: `anularMovimientoCarteraAPI()` en client.ts, `anularAbono()` en clientes.ts. Los movimientos cancelados EXCLUYEN de FIFO/semáforo → monto regresa a deuda. DetalleAbonoModal con botón "Cancelar abono" + badge "Cancelado" en lista. **Clientes:** quitado banner MigracionNube (Fase 3 ya completa). **POS venta:** componente NUEVO `DesglosePaqueteModal.tsx` (desglose interactivo de artículos de paquete con prorrateo). Carrito convertido a drawer deslizable (FAB 🛒 en esquina inferior derecha, cierra con Escape/overlay). Grid expandido (230px cols ≈6 por fila). **Búsqueda:** `/caja/productos` arreglado — match parcial de SKU ahora se FUSIONA con fonética (antes cortocircuitaba). Scoring literal antes de desempate por stock ("PVC" pasó de 15 a 626 resultados, incluye tubos). Verificado end-to-end: anular/restaurar abonos OK, carrito drawer usable, búsqueda precisa. 0 errores tsc nuevos.
- **2026-05-31 (Etapa 3 — deudas):** **Historial de compras migrado a BD** (módulo custom `ferremex_compras`: Compra + ArticuloCompra anidado). Rutas `/caja/compras` (GET `?proveedor_id`, POST, PATCH cancelar). `ComprasModule` escribe a BD, `ConsultarCompras` lee/cancela de BD (async). Migrador one-shot extendido con `compras[]` (idempotente por folio, remapea proveedorId por nombre). **Deuda #2:** validación `fecha_emision` YYYY-MM-DD (helper `esFechaISO` en lib/text) en POST/PUT de facturas + saneo en migrador. **Deuda #3:** sección "Compras a este proveedor" en AdminProveedores (vía `?proveedor_id`). Verificado end-to-end (crear/listar/filtrar/cancelar vía curl). 0 errores tsc nuevos (POS 15, backend 13). BD limpia tras pruebas.
- **2026-05-31 (Etapa 2):** **Compras/Pedidos enlazados al proveedor por ID real.** Eliminado `PROVEEDOR_SEED` ficticio de `ComprasModule`; el selector de Compras (`ComprasTable`) y Pedidos (`PedidosModule`) ahora cargan el catálogo async desde la BD (`loadProveedores()`), con ids reales. `registroCompra` persiste `proveedorId`; `crearPedido` ya enviaba `proveedorId` y el backend `/caja/pedidos` ya lo persistía (shape preexistente). La factura por pagar de una compra a crédito usa el id real del proveedor. OC (`OcDocument`) sin cambios (usa el objeto proveedor recibido). Verificado end-to-end: pedido creado con `proveedorId` real persiste OK. 0 errores tsc nuevos (POS baseline 15). Solo pedidos/compras NUEVOS llevan ID (históricos conservan solo el nombre, como se acordó).
- **2026-05-31:** Migración de **Proveedores + Cajas a BD Medusa** (continuación de Fase 3). Módulos custom nuevos `ferremex_proveedores` (Proveedor + FacturaProveedor, facturas como subrecurso) y `ferremex_cajas` (Caja). Rutas `/caja/proveedores/*`, `/caja/cajas`, `/caja/migrar-proveedores-cajas`. `/caja/usuarios` extendido con `caja_id` (asignación caja↔empleado; reemplaza `pos_cajas_asignaciones`). `proveedores.ts` → fachada async (espejo de `clientes.ts`). Refactor de `AdminProveedores`, `CashMovementsModule`, `EmployeesModule`, `ComprasModule`. Componente `MigracionProveedoresCajas.tsx` montado en AdminProveedores. Verificado en runtime (CRUD completo de cajas y proveedores+facturas vía curl, cascada de borrado OK). 0 errores tsc nuevos (POS baseline 15 intacto).
- **2026-05-29/30:** Fase 3 (Clientes + Cartera BD) + Fase 2 (Formatos + Inventario) completadas. Módulo ferremex_cartera en BD (CarteraCliente/Movimiento/Nota/HistorialLimite); rutas `/caja/clientes/*`, `/caja/grupos/*`, `/caja/cartera/*`, `/caja/migrar-localstorage` implementadas. Frontend refactorizado a async. FormatoConfig.tsx permite config multi-formato (Nota/Factura/Cupón). InventarioModule.jsx reemplaza iframe. Commits fda641d + 8194566.
- **2026-05-29:** Construcción del harness de contexto inspirado en ECC. Reestructurado `CLAUDE.md` (conservando taxonomía, protocolo de impacto cruzado y gotchas). Creados `.claude/{ECC-SELECTION,FERREMEX-STATE,FERREMEX-MODULES,FERREMEX-PREFERENCES,FERREMEX-SCHEMA,HARNESS-SUMMARY}.md`, contextos `dev/research/review`, 7 agentes y hooks de memoria de sesión. Backup del CLAUDE.md previo en `CLAUDE.md.bak-2026-05-29`.
