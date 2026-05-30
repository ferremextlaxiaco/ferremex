# HARNESS-SUMMARY.md — Resumen del harness de contexto Ferremex

> Construido el 2026-05-29 tomando lo útil del repositorio ECC (`github.com/affaan-m/ECC`) y adaptándolo
> al stack real de Ferremex (Medusa 2.x + Mercur, React 18/TS, monorepo bun/turborepo, Windows + PM2).

---

## 1. Qué encontré en Ferremex (problemas de estructura)

**Lo bueno (ya existía):** un `CLAUDE.md` de 26 KB muy completo (taxonomía Dept→Cat→Marca, protocolo de impacto
cruzado, ~16 gotchas de Medusa), `MEMORIA_INSTALACIÓN.md` (estado por fases, lo mantiene el skill `actualizador`),
`CLAUDE CONTEXTO FERREMEX.md` (negocio + n8n) y memoria persistente en `~/.claude/.../memory/`.

**Problemas detectados:**
- **Sin "estado vivo" de desarrollo.** `MEMORIA_INSTALACIÓN.md` cubre fases/infra, pero no había un lugar para colas de trabajo, deuda técnica y notas de ejecución por sesión.
- **Sin mapa explícito de conexiones entre módulos** (ni de las conexiones que *faltan*). El conocimiento estaba disperso entre el CLAUDE.md y el código.
- **Sin esquema de datos consolidado** (entidades Medusa + `metadata` + JSON + localStorage en un solo lugar).
- **Sin agentes especializados** ni contextos de modo (dev/research/review).
- **Sin memoria de sesión:** cada sesión arrancaba sin saber qué hizo la anterior.
- **Inconsistencia de carpetas:** módulos repartidos entre `apps/pos/src/modules/` y `apps/pos/src/components/` (verificado y documentado en PREFERENCES y MODULES).
- El `CLAUDE.md` mezclaba reglas, referencia y arquitectura sin una jerarquía clara de "qué leer primero".

---

## 2. Qué tomé de ECC (y por qué)

| De ECC | Uso en Ferremex |
|---|---|
| Estructura de `examples/*-CLAUDE.md` + `SOUL.md` | Reestructuré `CLAUDE.md`: Prompt Defense → Principios → Cómo iniciar sesión → Critical Rules → referencia. Conservé íntegro el saber previo. |
| `WORKING-CONTEXT.md` (esquema de estado vivo) | `FERREMEX-STATE.md` (Purpose, Current Truth, Constraints, Active Queues, Update Rule, Latest Execution Notes). |
| `contexts/{dev,research,review}.md` | Copiados/adaptados a `.claude/contexts/` con comandos reales (bun/PM2/Medusa). |
| 7 agentes (`planner`, `architect`, `code-reviewer`, `typescript-reviewer`, `react-reviewer`, `doc-updater`, `build-error-resolver`) | Copiados a `.claude/agents/` con Prompt Defense Baseline + reglas Ferremex (rutas `/caja`, `query.graph`, taxonomía, impacto cruzado, bun). |
| Diseño de hooks de memoria (`session-start.js`/`session-end.js`) | **Patrón** replicado en hooks autocontenidos nuevos (sin el árbol de dependencias de ECC). |
| `rules/common/*` | Destilados en las Critical Rules y en los agentes reviewers. |

Detalle completo en `.claude/ECC-SELECTION.md`.

---

## 3. Qué descarté de ECC (y por qué no aplica al POS)

- **Sistema de hooks completo + `scripts/lib/*`:** acoplado a una instalación de plugin ECC en `~/.claude/plugins/ecc/...`; bootstrap frágil que recorre rutas de cache inexistentes. Repliqué solo el patrón, autocontenido.
- **Hooks de calidad** (post-edit-format/typecheck, config-protection, gateguard): decisión del usuario (solo memoria por ahora). Ver "Recomendaciones futuras".
- **Hooks de governance/telemetría/dashboards:** infraestructura interna de ECC, irrelevante.
- **Agentes de otros lenguajes/dominios** (rust, go, java, django, marketing, homelab, healthcare…): fuera del stack.
- **~220 skills genéricas de ECC:** Ferremex ya tiene skills nativas de Mercur/Medusa (`mercur-blocks`, `mercur-cli`, `medusa-ui-conformance`, `dashboard-*`, `actualizador`). Lo accionable se destiló en Critical Rules.
- **Adaptadores multi-harness** (.codex, .gemini, .cursor, .zed…): Ferremex usa Claude Code.

---

## 4. Cómo iniciar la próxima sesión

**Automático:** el hook `SessionStart` (registrado en `.claude/settings.local.json`) inyecta el resumen de la sesión
anterior desde `.claude/sessions/`. No tienes que hacer nada para eso.

**Manual (al empezar a trabajar), lee en orden:**
1. `.claude/FERREMEX-STATE.md` — qué está en curso, colas, últimas notas.
2. `.claude/FERREMEX-MODULES.md` — mapa de módulos y conexiones (incl. pendientes).
3. `CLAUDE.md` — reglas obligatorias y arquitectura.
4. Según la tarea: `.claude/FERREMEX-SCHEMA.md` (datos) o `.claude/FERREMEX-PREFERENCES.md` (patrones).

**Frase sugerida para arrancar una sesión de desarrollo:**
> "Lee `.claude/FERREMEX-STATE.md` y `.claude/FERREMEX-MODULES.md`, luego ayúdame con: <tarea>."

**Agentes disponibles** (invócalos por nombre o deja que se activen): `planner`, `architect`, `code-reviewer`,
`typescript-reviewer`, `react-reviewer`, `doc-updater`, `build-error-resolver`.

**Al cerrar la sesión:** actualiza `.claude/FERREMEX-STATE.md` (o pide al agente `doc-updater` que lo haga). El skill
`actualizador` sigue manteniendo `MEMORIA_INSTALACIÓN.md` por separado.

---

## 5. Deuda técnica identificada

**Módulos no conectados / datos sin persistir:**
- **PedidosModule** usa mock inline (`PROVEEDORES`, `HISTORIAL_MOCK`) — no hay ruta `/caja/pedidos`.
- **Proveedores:** PedidosModule no comparte origen con `lib/proveedores.ts` (`pos_proveedores`).
- **Cartera/Clientes** viven en localStorage aislado por terminal (migración Fase 3 a BD).
- **Compras (recepción)** no incrementa inventario; **Cancelación de ventas** no tiene endpoint de reverso.

**Backend / correctitud:**
- **Race condition** en `/caja/ventas` POST: valida stock y descuenta sin transacción atómica (riesgo de sobreventa concurrente).
- **Sin auth/RBAC** en `/caja/*` (confía en CORS); permisos de usuario cargados pero no validados server-side.
- **Sin auditoría** de cambios (quién editó artículos/precios/taxonomía).

**Componentes inconsistentes:**
- Módulos repartidos entre `modules/` y `components/` (verificar carpeta antes de importar; ver MODULES/PREFERENCES).
- Formatos de ticket: Nota/Factura/Cupón son placeholders.

Lista priorizada y viva en `.claude/FERREMEX-STATE.md` § Active Queues.

---

## 6. Recomendaciones futuras (opcionales)

- **Hooks de calidad** (cuando quieras más rigor): `post-edit-typecheck` (corre `tsc` tras editar `.ts`) y `config-protection` (bloquea debilitar linters). Diseño probado en ECC; se pueden adaptar autocontenidos como los de memoria.
- **Conectar `doc-updater` a un flujo de cierre de sesión** para refrescar `FERREMEX-STATE.md` automáticamente.
- **Migración Fase 3** (clientes/cartera → BD Medusa): usar el agente `architect` para diseñar el modelo antes de codear.

---

## 7. Inventario de archivos del harness

```
CLAUDE.md                         (reestructurado; backup en CLAUDE.md.bak-2026-05-29)
.claude/
├── ECC-SELECTION.md              selección razonada de componentes ECC
├── FERREMEX-STATE.md             estado vivo de desarrollo
├── FERREMEX-MODULES.md           mapa de módulos + conexiones (actuales/pendientes)
├── FERREMEX-PREFERENCES.md       patrones y convenciones del código
├── FERREMEX-SCHEMA.md            esquema de datos (Medusa + JSON + localStorage)
├── HARNESS-SUMMARY.md            este archivo
├── settings.local.json           registro de hooks SessionStart/Stop (+ permisos preservados)
├── agents/                       7 agentes (planner, architect, *-reviewer, doc-updater, build-error-resolver)
├── contexts/                     dev.md, research.md, review.md
├── hooks/                        session-start.js, session-end.js (autocontenidos, probados)
└── sessions/                     resúmenes de sesión (git-ignored, generados por los hooks)
```

---

## 8. Verificación realizada

- **Hooks probados de extremo a extremo** con un transcript JSONL real de Claude Code:
  - `session-end.js` extrajo correctamente mensajes de usuario (filtrando ruido `<system-reminder>`), 25 archivos modificados y 11 herramientas; generó `YYYY-MM-DD-<id>-session.md`. **Idempotente** (1 solo bloque SUMMARY al re-correr).
  - `session-start.js` recuperó e inyectó el resumen (2171 bytes); interruptor `FERREMEX_SESSION_CONTEXT=off` → 0 bytes.
  - Ambos exit 0, sin stderr. Leen stdin de forma **asíncrona** (importante: `fs.readFileSync(0)` devuelve vacío en este entorno Windows/Node; por eso se usa lectura event-based).
- **Integridad del saber del CLAUDE.md:** los 16 gotchas, la taxonomía Dept→Cat→Marca y el protocolo de impacto cruzado preservados (comparados lado a lado contra `CLAUDE.md.bak-2026-05-29`).
- **Coherencia de datos:** funciones (`listarCatalogos`, `listarFaltantes`, `incrementarInventario`, `obtenerVenta`, `agregarMovimientoCredito`), claves localStorage (`pos_clientes/grupos/cartera/proveedores/cajas_*/sales_filters`), `PAGE_SIZE=40` y campos `metadata` (precio2-4) contrastados contra el código real (`/caja/*`, `lib/*`). Ubicación real de módulos corregida en los docs.
- **settings.local.json:** JSON válido; eventos SessionStart + Stop registrados; los 6 permisos previos preservados.
- **Agentes:** frontmatter válido (name/description/tools/model) en los 7.
