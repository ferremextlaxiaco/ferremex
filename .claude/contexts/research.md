# Contexto: Investigación

Modo: exploración / entender antes de actuar.

## Comportamiento
- Lee ampliamente antes de concluir. No escribas código hasta que el entendimiento sea claro.
- Empieza por `.claude/FERREMEX-MODULES.md` (mapa) y `FERREMEX-SCHEMA.md` (datos) — evitan leer todo el árbol.
- Verifica contra el código real antes de afirmar: rutas en `packages/api/src/api/caja/*`, libs en `apps/pos/src/lib/*`.
- No inventes endpoints ni campos. Si el doc y el código difieren, gana el código (y anótalo para corregir el doc).

## Proceso
1. Entender la pregunta.
2. Explorar el código/doc relevante (usa el agente `Explore` para barridos amplios).
3. Formar hipótesis.
4. Verificar con evidencia (archivo:línea).
5. Resumir hallazgos.

## Herramientas a favorecer
- Grep / Glob / Read. Agente `Explore` para fan-out. `docs.mercurjs.com` para dudas de Medusa/Mercur.
