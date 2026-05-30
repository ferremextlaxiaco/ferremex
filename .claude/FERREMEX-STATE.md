# FERREMEX-STATE.md — Estado vivo de desarrollo

> Capa de "estado de desarrollo activo" (colas de trabajo, notas de ejecución). Complementa —no duplica—
> `MEMORIA_INSTALACIÓN.md` (estado por fases/infra, mantenido por el skill `actualizador`).
> **Actualiza este archivo al cierre de cada sesión** (regla abajo). Convierte fechas relativas a absolutas.
>
> Última actualización: **2026-05-30**

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
  - `8194566` Fase 2: formatos de ticket (Nota/Factura/Cupón) + InventarioModule sin iframe (2026-05-29/30)
  - `fda641d` Fase 3: migración de Clientes + Cartera de crédito de localStorage a BD Medusa (2026-05-29/30)
  - `c3e0cf0` Auditoría completa + fixes de seguridad/integridad + harness de contexto (2026-05-29)
  - `98e16bf` Mayoreo + búsqueda SKU case-insensitive + fixes de precios (2026-05-27)

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
1. **Proveedores/Cajas → BD (Fase 3 continuación):** migrar `pos_proveedores` y `pos_cajas_*` de localStorage a BD Medusa. Actualmente aislados por terminal.
2. **Compras (recepción) → inventario:** recibir una OC debe poder incrementar inventario vía `incrementarInventario()`.
3. **Empleados/Cajas ↔ Corte:** vincular asignaciones de caja al cierre de turno (`/caja/corte`). Hoy son áreas separadas.

### Deuda técnica abierta
- **Race condition en venta:** `/caja/ventas` POST valida stock y luego descuenta sin transacción atómica (check→decrement). Riesgo de sobreventa concurrente.
- **Sin auth/RBAC en `/caja/*`:** las rutas confían en token POS; los permisos de usuario se cargan pero no se validan server-side para operaciones específicas.
- **Sin auditoría de cambios:** no se registra quién editó qué (artículos, precios, taxonomía, límites de crédito).
- **localStorage por terminal:** proveedores/cajas aún viven aislados por navegador (clientes/cartera ya migrados).

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

- **2026-05-29/30:** Fase 3 (Clientes + Cartera BD) + Fase 2 (Formatos + Inventario) completadas. Módulo ferremex_cartera en BD (CarteraCliente/Movimiento/Nota/HistorialLimite); rutas `/caja/clientes/*`, `/caja/grupos/*`, `/caja/cartera/*`, `/caja/migrar-localstorage` implementadas. Frontend refactorizado a async. FormatoConfig.tsx permite config multi-formato (Nota/Factura/Cupón). InventarioModule.jsx reemplaza iframe. Commits fda641d + 8194566.
- **2026-05-29:** Construcción del harness de contexto inspirado en ECC. Reestructurado `CLAUDE.md` (conservando taxonomía, protocolo de impacto cruzado y gotchas). Creados `.claude/{ECC-SELECTION,FERREMEX-STATE,FERREMEX-MODULES,FERREMEX-PREFERENCES,FERREMEX-SCHEMA,HARNESS-SUMMARY}.md`, contextos `dev/research/review`, 7 agentes y hooks de memoria de sesión. Backup del CLAUDE.md previo en `CLAUDE.md.bak-2026-05-29`.
