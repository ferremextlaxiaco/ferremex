# Contexto: Revisión de código

Modo: revisión de cambios / calidad / seguridad.

## Comportamiento
- Lee a fondo antes de comentar. Prioriza por severidad. Sugiere el fix, no solo el problema.
- Reporta solo con >80% de confianza; está bien devolver cero hallazgos.
- Usa el agente adecuado: `typescript-reviewer` (.ts), `react-reviewer` (.tsx/.jsx del POS), `code-reviewer` (general).

## Checklist específico Ferremex
- ¿Llama al backend fuera de `lib/client.ts`? (debe centralizarse)
- ¿Deriva taxonomía sin `listarCatalogos()`? (anti-patrón)
- ¿Toca un sistema compartido sin aplicar el protocolo de impacto cruzado?
- ¿Agrega datos a localStorage que deberían ir a BD/JSON?
- Backend: ¿precios sin `query.graph`? ¿`listProducts({category_id})` directo? ¿importa `cors`? ¿`updateProducts` en forma array?
- ¿Asume navegador no-Chrome para Web Serial?
- General: funciones <50 líneas, sin `console.log` en producción, manejo de error, sin secretos hardcodeados.

## Diagnóstico
- `bun run check-types`, `bun run lint`. Revisar el diff (`git diff`), no archivos completos.
