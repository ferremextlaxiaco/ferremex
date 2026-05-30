# ECC-SELECTION.md — Qué tomamos de ECC para Ferremex

> Selección razonada de componentes del repositorio **ECC** (`github.com/affaan-m/ECC`)
> para construir el harness de contexto de Ferremex (Medusa 2.x + Mercur + React 18/TS, bun/turborepo, Windows + PM2).
> Fecha de evaluación: 2026-05-29. ECC clonado en `C:\Users\andre\AppData\Local\Temp\ecc-research\`.

ECC es enorme (≈30 agentes, ≈230 skills, ≈45 hooks, soporte para 20+ lenguajes). La mayoría de su catálogo
no aplica a Ferremex. Esta tabla documenta **solo lo que se adopta y por qué**, y al final lo que se descarta.

---

## ✅ Seleccionado para Ferremex

### 1. Estructura de CLAUDE.md (ejemplos de ECC)
- **Ruta ECC:** `examples/django-api-CLAUDE.md`, `examples/rust-api-CLAUDE.md`, `examples/saas-nextjs-CLAUDE.md`, `CLAUDE.md` (raíz).
- **Por qué sirve:** la mejor estructura observada es: *Project Overview → Critical Rules por área → File Structure → Key Patterns (con código real) → Commands → Skills/Workflow*. Es exactamente lo que un POS multi-módulo necesita para que cada sesión arranque alineada.
- **Cómo se adapta:** se reorganiza el `CLAUDE.md` actual con esa columna vertebral, pero **conservando íntegro** el conocimiento ya documentado (taxonomía Dept→Cat→Marca, protocolo de impacto cruzado, ~15 gotchas de Medusa). No se copian los ejemplos; se usan como plantilla de orden.

### 2. SOUL.md → "Principios Ferremex"
- **Ruta ECC:** `SOUL.md` (Core Identity + 5 Core Principles).
- **Por qué sirve:** un bloque de 5 principios da a cada sesión una brújula de decisión en segundos.
- **Cómo se adapta:** se incrusta como sección "Principios" dentro de `CLAUDE.md` (no archivo aparte) con principios propios de Ferremex: arquitectura nativa Medusa, análisis de impacto cruzado, persistencia correcta (BD > JSON > localStorage según fase), patrón de composición POS, plan antes de ejecutar.

### 3. WORKING-CONTEXT.md → `FERREMEX-STATE.md`
- **Ruta ECC:** `WORKING-CONTEXT.md`.
- **Por qué sirve:** modelo de "estado vivo" con secciones verificables (Purpose, Current Truth, Constraints, Active Queues, Update Rule, Latest Execution Notes). Es el complemento perfecto a `MEMORIA_INSTALACIÓN.md` (que cubre fases/infra) — `FERREMEX-STATE.md` cubre el **estado de desarrollo activo** (colas de trabajo, notas de ejecución).
- **Cómo se adapta:** se replica el esquema seccional, en español, con la realidad de Ferremex. Se documenta su relación con `MEMORIA_INSTALACIÓN.md` para no duplicar.

### 4. Contextos modulares (`contexts/`)
- **Ruta ECC:** `contexts/dev.md`, `contexts/research.md`, `contexts/review.md`.
- **Por qué sirve:** micro-contextos que fijan el "modo de operación" (implementar vs investigar vs revisar). Cortos y de alto valor.
- **Cómo se adapta:** se copian a `.claude/contexts/` ajustando comandos al stack real (bun/turbo/PM2, no inventar `pytest`/`npm`).

### 5. Agentes especializados (7)
- **Ruta ECC:** `agents/planner.md`, `agents/architect.md`, `agents/code-reviewer.md`, `agents/typescript-reviewer.md`, `agents/react-reviewer.md`, `agents/doc-updater.md`, `agents/build-error-resolver.md`.
- **Por qué sirve:** planner/architect (Opus) para diseño; code/typescript/react-reviewer (Sonnet) cubren exactamente el stack TS+React; doc-updater (Haiku) mantiene el estado vivo; build-error-resolver (Sonnet) para roturas tras upgrades. Todos llevan el "Prompt Defense Baseline" de ECC.
- **Cómo se adapta:** se copian a `.claude/agents/` y se inyecta contexto Ferremex en cada uno: rutas `/caja/*`, `query.graph`, taxonomía, persistencia correcta, comandos `bun run check-types`. doc-updater apunta a `FERREMEX-STATE/MODULES` en vez de `docs/CODEMAPS`.

### 6. Diseño de hooks de memoria de sesión (patrón, NO el código)
- **Ruta ECC:** `scripts/hooks/session-end.js` (parser JSONL, líneas 40-90), `scripts/hooks/session-start.js` (dedup + límites de chars, líneas 57-104), `hooks/hooks.json` (registro async con fallback a stdin).
- **Por qué sirve:** el patrón es sólido y multiplataforma (usa solo `fs/path/os/child_process`, y ECC documenta compatibilidad Windows explícita).
- **Cómo se adapta:** se escriben **hooks autocontenidos nuevos** en `.claude/hooks/` que replican el diseño SIN el árbol de dependencias de ECC (ver "Descartado" abajo). Guardan resúmenes en `.claude/sessions/` dentro del repo (no en `~/.claude/`), para que el estado viva junto al proyecto.

### 7. Rules comunes (como insumo de las Critical Rules)
- **Ruta ECC:** `rules/common/code-review.md`, `coding-style.md`, `security.md`, `patterns.md`, `development-workflow.md`.
- **Por qué sirve:** límites concretos y accionables (tamaño de función <50 líneas, sin secrets, sin `console.log`, error handling, etc.).
- **Cómo se adapta:** se destilan en las "Critical Rules" del `CLAUDE.md` y en los agentes reviewers — no se copian como archivos sueltos para no fragmentar el contexto.

---

## ❌ Descartado (y por qué no aplica al POS)

| Componente ECC | Por qué se descarta |
|---|---|
| **Sistema de hooks completo + `scripts/lib/*`** (`observer-sessions.js`, `session-aliases.js`, `package-manager.js`, `project-detect.js`, `utils.js`, bootstrap) | Profundamente acoplado a una instalación de plugin ECC en `~/.claude/plugins/ecc/...`. El bootstrap recorre rutas de cache de plugins inexistentes en Ferremex. Arrastrarlo = decenas de archivos frágiles. Replicamos solo el patrón, autocontenido. |
| **Hooks de calidad** (`post-edit-format.js`, `post-edit-typecheck.js`, `config-protection.js`, `stop-format-typecheck.js`, `gateguard-fact-force.js`) | Decisión del usuario: solo memoria de sesión por ahora. Añaden latencia tras cada Edit y pueden chocar con el flujo bun/PM2. Quedan documentados como recomendación futura en `HARNESS-SUMMARY.md`. |
| **Hooks de governance/telemetría** (`governance-capture.js`, `ecc-metrics-bridge.js`, `cost-tracker.js`, `insaits-security-*`, `mcp-health-check.js`, `ecc_dashboard.py`) | Infraestructura interna de ECC (dashboards, métricas, costos). Irrelevante para un POS de una ferretería. |
| **Agentes de otros lenguajes** (`rust-*`, `go-*`, `java-*`, `kotlin-*`, `swift-*`, `cpp-*`, `dart-*`, `csharp-*`, `django-*`, `laravel-*`, `harmonyos-*`, `pytorch-*`, etc.) | Ferremex es TS + React. No aplican. |
| **Agentes de dominio** (`marketing-agent`, `seo-specialist`, `opensource-*`, `gan-*`, `homelab-*`, `network-*`, `healthcare-*`) | Fuera del dominio del proyecto. |
| **Agentes meta** (`loop-operator`, `harness-optimizer`, `chief-of-staff`) | Para operar la infraestructura de ECC, no un POS. El concepto de loop puede ser útil más adelante, pero no se instala. |
| **~220 skills de ECC** (`backend-patterns`, `frontend-patterns`, `postgres-patterns`, `docker-patterns`, `tdd-workflow`, etc.) | Ferremex ya tiene sus propias skills específicas de Mercur/Medusa en `.claude/skills/` (`mercur-blocks`, `mercur-cli`, `medusa-ui-conformance`, `dashboard-*`, `actualizador`). Las skills genéricas de ECC duplicarían o contradirían las reglas nativas del starter. Lo accionable se destila en las Critical Rules. |
| **Soporte multi-harness** (`.codex`, `.gemini`, `.cursor`, `.zed`, `.kiro`, `.qwen`, `.trae`, `manifests/`, `integrations/`) | Ferremex usa Claude Code. El resto de adaptadores es ruido. |
| **`rules/` por lenguaje** (angular, cpp, golang, java, php, python, ruby, rust, swift…) | No aplican al stack. Solo se usaron `rules/common/` como insumo. |

---

## Relación con el harness existente de Ferremex

- `CLAUDE.md` → guía principal (se reestructura, no se reemplaza el saber).
- `MEMORIA_INSTALACIÓN.md` → estado por **fases / infraestructura**, lo mantiene el skill `actualizador`. **Se conserva.**
- `FERREMEX-STATE.md` (nuevo) → estado de **desarrollo activo** (colas, notas de ejecución). Capa complementaria, no duplica fases.
- `CLAUDE CONTEXTO FERREMEX.md` → contexto de negocio + n8n. **Se conserva.**
- `.claude/skills/*` → skills nativas Mercur/Medusa. **Se conservan; no se tocan.**
