# FERREMEX-STATE.md — Estado vivo de desarrollo

> Capa de "estado de desarrollo activo" (colas de trabajo, notas de ejecución). Complementa —no duplica—
> `MEMORIA_INSTALACIÓN.md` (estado por fases/infra, mantenido por el skill `actualizador`).
> **Actualiza este archivo al cierre de cada sesión** (regla abajo). Convierte fechas relativas a absolutas.
>
> Última actualización: **2026-05-29**

---

## Purpose

POS de mostrador para Ferremex (ferretería, Tlaxiaco, Oaxaca) sobre Medusa 2.x + Mercur, monorepo bun/turborepo,
React 18/TS en el frontend POS. Objetivo de la fase actual: completar el POS de mostrador (Fase 2) y preparar
la migración de datos locales (clientes, cartera) a la BD (Fase 3).

---

## Current Truth

- **Rama default:** `master`.
- **Fase activa:** Fase 2 (POS de mostrador) — en progreso. Fases 0–1 completas.
- **Backend:** Medusa `2.13.4` + Mercur `2.0.1`, puerto 9000. Rutas POS en `/caja/*`.
- **POS:** React 18 + Vite, puerto 7002 (`base: /pos`). Montado como módulo `vendor-ui`.
- **Servicios (PM2):** `ferremex-admin` (7000), `ferremex-pos` (7002), `ferremex-api` (9000). Redis (Docker) 6379, PostgreSQL 16 (5432).
- **Últimos commits:**
  - `98e16bf` Mayoreo + búsqueda SKU case-insensitive + fixes de precios (2026-05-27)
  - `8148c8a` Cobro split-payment + botón Panel ventas + toggle crédito clientes (2026-05-23)
  - `a764ee8` Cartera de Crédito + mejoras Pedidos + landing Clientes (2026-05-22)
- **Trabajo reciente sin commitear (al 2026-05-29):** nuevos módulos POS (CashMovementsModule, EmployeesModule, SalesHistory), páginas Admin* (Caja, ConsultaVentas, Empleados, Formatos, Perifericos), ruta backend `/caja/folio-contador` y `/caja/ventas/[folio]`.

---

## Current Constraints

- **Persistencia correcta:** preferir BD Medusa > JSON > localStorage. No agregar nuevos datos a localStorage salvo que sea explícitamente provisional de fase.
- **Análisis de impacto cruzado obligatorio** antes de tocar sistemas compartidos (ver `CLAUDE.md`).
- **Sin tocar** Starter Contract Surfaces (medusa-config.ts, vite.config.ts, blocks.json, `@acme/api/_generated`) sin justificarlo.
- **Web Serial = Chrome**: cualquier feature de impresora/cajón asume Chrome en las terminales.
- **n8n producción (VPS)**: no activar workflows sin probar local.

---

## Active Queues

### Pendientes de producto (priorizados)
1. **PedidosModule → backend real:** crear ruta `/caja/pedidos` y reemplazar `PROVEEDORES`/`HISTORIAL_MOCK` inline por llamadas de `client.ts`.
2. **Formatos de ticket:** implementar pestañas Nota de venta / Factura / Cupón (hoy placeholders).
3. **Cartera/Clientes → BD (Fase 3):** diseñar migración de `pos_clientes`/`pos_cartera` (localStorage) a módulos Medusa.
4. **Cancelación/anulación de ventas:** endpoint de reverso (hoy SalesHistory tiene UI de cancelación de 2 pasos, falta backend).

### Deuda técnica abierta
- **Race condition en venta:** `/caja/ventas` POST valida stock y luego descuenta sin transacción atómica (check→decrement). Riesgo de sobreventa concurrente.
- **Sin auth/RBAC en `/caja/*`:** las rutas confían en CORS; los permisos de usuario se cargan pero no se validan server-side.
- **Sin auditoría de cambios:** no se registra quién editó qué (artículos, precios, taxonomía).
- **localStorage por terminal:** clientes/cartera/proveedores/cajas viven aislados por navegador.

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

- **2026-05-29:** Construcción del harness de contexto inspirado en ECC. Reestructurado `CLAUDE.md` (conservando taxonomía, protocolo de impacto cruzado y gotchas). Creados `.claude/{ECC-SELECTION,FERREMEX-STATE,FERREMEX-MODULES,FERREMEX-PREFERENCES,FERREMEX-SCHEMA,HARNESS-SUMMARY}.md`, contextos `dev/research/review`, 7 agentes y hooks de memoria de sesión. Backup del CLAUDE.md previo en `CLAUDE.md.bak-2026-05-29`.
