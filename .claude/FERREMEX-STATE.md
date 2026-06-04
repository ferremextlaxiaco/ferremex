# FERREMEX-STATE.md — Estado vivo de desarrollo

> Capa de "estado de desarrollo activo" (colas de trabajo, notas de ejecución). Complementa —no duplica—
> `MEMORIA_INSTALACIÓN.md` (estado por fases/infra, mantenido por el skill `actualizador`).
> **Actualiza este archivo al cierre de cada sesión** (regla abajo). Convierte fechas relativas a absolutas.
>
> Última actualización: **2026-06-01**

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

- **2026-06-04 (Feature: Cotizaciones):** Apartado completo de cotizaciones. **Backend:** `/caja/cotizaciones` (JSON `cotizaciones-pos.json`, folio `COT-YYYYMMDD-xx`, GET con filtros desde/hasta/estado, POST guarda con snapshot de precios, NO descuenta inventario) + `/caja/cotizaciones/[folio]` (GET detalle, PATCH marcar `convertida` + enlace a `folio_venta`, idempotente). **client.ts:** tipos `Cotizacion`/`ItemCotizacion` + `listarCotizaciones`/`obtenerCotizacion`/`crearCotizacion`/`marcarCotizacionConvertida`. **pos-store:** estado `modoCotizacion`/`cotizacionCargadaFolio` + acciones `SET_MODO_COTIZACION`/`CARGAR_COTIZACION` (CLEAR los resetea). **Carrito:** toggle "Convertir a cotización ↔ Convertir a venta"; botón principal cambia COBRAR ↔ "Imprimir cotización"; banner "Modo cotización — no descuenta inventario". **Venta:** botón "Cargar cotización" sobre el buscador → `CargarCotizacionPopup` (cristal `.pk-sel-popup`) con lista + buscador; al elegir compara precios actuales vs cotizados y, si difieren, modal de comparación (conservar vs usar actuales); handler `imprimirCotizacion` (guarda + imprime vía `Ticket esCotizacion`); deep-link `?cotizacion=folio` desde admin. **ModalCobro:** al vender una cotización cargada la marca convertida (best-effort). **Ticket:** prop `esCotizacion` (título COTIZACIÓN, oculta pago/cambio y facturación). **Admin:** módulo `CotizacionesModule` (KPIs + filtros + tabla + drawer + "Cargar en venta") en `/admin/cotizaciones` + item sidebar (FileSignature). Verificado: tsc 0 (POS+backend); smoke curl del CRUD completo (crear/listar/obtener/filtrar/convertir) OK; revisión React aplicó 5 fixes (race al cerrar popup durante comparación de precios → openRef guard; mutación searchParams → objeto nuevo; keys de tablas). Datos de prueba limpiados.
- **2026-06-02 (Feature: Empleados/Cajas ↔ Corte):** Vinculada la caja física al corte de turno (pendiente de producto #1, ahora cerrado). El `Cajero` (pos-store) hereda `caja_id`/`caja_nombre` al iniciar sesión: `Login.tsx` carga `listarCajasAPI()` en el `useEffect` inicial (mapa caja_id→nombre en un `useRef` para evitar stale closure si las cajas cargan durante la validación de PIN) y `/caja/login` propaga `caja_id` del usuario (interfaz local `PosUsuario` += `caja_id`). En `/caja/corte`: `calcularResumen(cajero, turno_id, caja_id?)` ahora **filtra los MOVIMIENTOS manuales por caja** — incluye los de esa caja MÁS los `cajaId == null` (históricos/sin caja), sin perder efectivo; las VENTAS siguen por cajero (hoy no llevan `cajaId`). `CorteCerrado` += `caja_id`/`caja_name` (persistidos en POST); GET acepta `?caja_id=`. `CorteModule.jsx` pasa `cajero.caja_id` a obtenerCorte/cerrarCorte y muestra la caja en el header y en el ticket de corte cerrado. Verificado end-to-end vía curl: corte sin filtro suma todo (1100), corte filtrado separa por caja correctamente (800, ignora caja ajena, conserva movimientos sin caja); cierre persiste caja_id/caja_name; retrocompat con cortes legacy OK. 0 errores tsc (POS y backend). Reviews TS+React: APPROVE (2 fixes MEDIUM aplicados: tipos de `Movimiento.cajaId` en corte, y useRef en Login). Datos de prueba limpiados.
- **2026-06-01 (Feature: Cancelación de abonos + UI venta):** **Cartera:** módulo ferremex_cartera ganó 3 columnas nuevas (`cancelado`, `motivo_cancelacion`, `fecha_cancelacion`) en MovimientoCartera. Ruta NUEVA: `PATCH /caja/cartera/[customerId]/movimientos/[movId]` (motivo obligatorio). Frontend: `anularMovimientoCarteraAPI()` en client.ts, `anularAbono()` en clientes.ts. Los movimientos cancelados EXCLUYEN de FIFO/semáforo → monto regresa a deuda. DetalleAbonoModal con botón "Cancelar abono" + badge "Cancelado" en lista. **Clientes:** quitado banner MigracionNube (Fase 3 ya completa). **POS venta:** componente NUEVO `DesglosePaqueteModal.tsx` (desglose interactivo de artículos de paquete con prorrateo). Carrito convertido a drawer deslizable (FAB 🛒 en esquina inferior derecha, cierra con Escape/overlay). Grid expandido (230px cols ≈6 por fila). **Búsqueda:** `/caja/productos` arreglado — match parcial de SKU ahora se FUSIONA con fonética (antes cortocircuitaba). Scoring literal antes de desempate por stock ("PVC" pasó de 15 a 626 resultados, incluye tubos). Verificado end-to-end: anular/restaurar abonos OK, carrito drawer usable, búsqueda precisa. 0 errores tsc nuevos.
- **2026-05-31 (Etapa 3 — deudas):** **Historial de compras migrado a BD** (módulo custom `ferremex_compras`: Compra + ArticuloCompra anidado). Rutas `/caja/compras` (GET `?proveedor_id`, POST, PATCH cancelar). `ComprasModule` escribe a BD, `ConsultarCompras` lee/cancela de BD (async). Migrador one-shot extendido con `compras[]` (idempotente por folio, remapea proveedorId por nombre). **Deuda #2:** validación `fecha_emision` YYYY-MM-DD (helper `esFechaISO` en lib/text) en POST/PUT de facturas + saneo en migrador. **Deuda #3:** sección "Compras a este proveedor" en AdminProveedores (vía `?proveedor_id`). Verificado end-to-end (crear/listar/filtrar/cancelar vía curl). 0 errores tsc nuevos (POS 15, backend 13). BD limpia tras pruebas.
- **2026-05-31 (Etapa 2):** **Compras/Pedidos enlazados al proveedor por ID real.** Eliminado `PROVEEDOR_SEED` ficticio de `ComprasModule`; el selector de Compras (`ComprasTable`) y Pedidos (`PedidosModule`) ahora cargan el catálogo async desde la BD (`loadProveedores()`), con ids reales. `registroCompra` persiste `proveedorId`; `crearPedido` ya enviaba `proveedorId` y el backend `/caja/pedidos` ya lo persistía (shape preexistente). La factura por pagar de una compra a crédito usa el id real del proveedor. OC (`OcDocument`) sin cambios (usa el objeto proveedor recibido). Verificado end-to-end: pedido creado con `proveedorId` real persiste OK. 0 errores tsc nuevos (POS baseline 15). Solo pedidos/compras NUEVOS llevan ID (históricos conservan solo el nombre, como se acordó).
- **2026-05-31:** Migración de **Proveedores + Cajas a BD Medusa** (continuación de Fase 3). Módulos custom nuevos `ferremex_proveedores` (Proveedor + FacturaProveedor, facturas como subrecurso) y `ferremex_cajas` (Caja). Rutas `/caja/proveedores/*`, `/caja/cajas`, `/caja/migrar-proveedores-cajas`. `/caja/usuarios` extendido con `caja_id` (asignación caja↔empleado; reemplaza `pos_cajas_asignaciones`). `proveedores.ts` → fachada async (espejo de `clientes.ts`). Refactor de `AdminProveedores`, `CashMovementsModule`, `EmployeesModule`, `ComprasModule`. Componente `MigracionProveedoresCajas.tsx` montado en AdminProveedores. Verificado en runtime (CRUD completo de cajas y proveedores+facturas vía curl, cascada de borrado OK). 0 errores tsc nuevos (POS baseline 15 intacto).
- **2026-05-29/30:** Fase 3 (Clientes + Cartera BD) + Fase 2 (Formatos + Inventario) completadas. Módulo ferremex_cartera en BD (CarteraCliente/Movimiento/Nota/HistorialLimite); rutas `/caja/clientes/*`, `/caja/grupos/*`, `/caja/cartera/*`, `/caja/migrar-localstorage` implementadas. Frontend refactorizado a async. FormatoConfig.tsx permite config multi-formato (Nota/Factura/Cupón). InventarioModule.jsx reemplaza iframe. Commits fda641d + 8194566.
- **2026-05-29:** Construcción del harness de contexto inspirado en ECC. Reestructurado `CLAUDE.md` (conservando taxonomía, protocolo de impacto cruzado y gotchas). Creados `.claude/{ECC-SELECTION,FERREMEX-STATE,FERREMEX-MODULES,FERREMEX-PREFERENCES,FERREMEX-SCHEMA,HARNESS-SUMMARY}.md`, contextos `dev/research/review`, 7 agentes y hooks de memoria de sesión. Backup del CLAUDE.md previo en `CLAUDE.md.bak-2026-05-29`.
