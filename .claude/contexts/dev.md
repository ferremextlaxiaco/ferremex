# Contexto: Desarrollo

Modo: desarrollo activo. Foco: implementar features del POS.

## Comportamiento
- Escribe código primero, explica después.
- Sigue el patrón de composición POS (`AdminXxx → XxxModule → sub-componentes`).
- Toda llamada al backend pasa por `lib/client.ts` (`/caja/*`). Taxonomía siempre vía `listarCatalogos()`.
- Antes de tocar un sistema compartido, aplica el protocolo de **impacto cruzado** (lista consumidores → pregunta).
- Persistencia correcta: BD Medusa > JSON > localStorage. No agregues datos nuevos a localStorage salvo provisión de fase explícita.

## Prioridades
1. Que funcione (happy path).
2. Que esté bien (edge cases, validación, manejo de error).
3. Que esté limpio (sin código muerto, nombres claros).

## Verificar cambios
- Typecheck: `bun run check-types` (raíz) o por workspace.
- Reiniciar servicio afectado: `pm2 restart ferremex-api` / `ferremex-pos` / `ferremex-admin`.
- POS en Chrome (Web Serial). Probar en `http://localhost:7002/pos/`.

## Herramientas a favorecer
- Edit / Write para código. Bash para `bun`/`pm2`. Grep / Glob para localizar (recuerda: módulos en `components/` o `modules/`).
- Para features grandes: agente `planner` / `architect` antes de codear.
