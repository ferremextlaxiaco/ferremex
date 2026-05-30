---
name: actualizador
description: Actualiza MEMORIA_INSTALACIÓN.md con el estado actual del proyecto Ferremex. Verifica servicios corriendo, últimos commits, estado de PM2, y progreso de fases. Ejecutar después de cada sesión de trabajo o cuando el cron lo dispare.
---

# ACTUALIZADOR — Memoria de Instalación Ferremex

Ejecuta este skill para actualizar `C:\ferremex\MEMORIA_INSTALACIÓN.md` con el estado real y actual del proyecto.

## Lo que debes hacer al ejecutar este skill

### 1. Verificar servicios

Corre estos comandos y registra los resultados:

```bash
# Estado de PM2
pm2 list

# Redis corriendo
docker ps --filter name=redis-ferremex --format "{{.Names}}: {{.Status}}"

# PostgreSQL responde
export PATH="$PATH:/c/Program Files/PostgreSQL/16/bin" && pg_isready

# Puertos activos
netstat -ano | grep ":9000\|:7000\|:6379\|:5432" | findstr LISTENING
```

### 2. Verificar último commit

```bash
cd /c/ferremex && git log --oneline -5
```

### 3. Actualizar el archivo

Edita `C:\ferremex\MEMORIA_INSTALACIÓN.md`:

- Actualiza la tabla de servicios con el estado real (✅ online / ❌ offline)
- Actualiza la fecha de última verificación
- Registra cualquier error encontrado
- Si se completó una fase nueva, cambia ⏳ PENDIENTE por ✅ COMPLETA
- Agrega una entrada en "NOTAS DE SESIONES" con la fecha y cambios de la sesión actual

### 4. Hacer commit si hubo cambios de código

Si en la sesión actual se modificaron archivos del proyecto (no solo este archivo de memoria):

```bash
cd /c/ferremex && git add -A && git commit -m "descripción de los cambios"
```

## Formato de la tabla de servicios

```markdown
| Servicio | Puerto | Proceso PM2 | Estado |
|---------|--------|-------------|--------|
| MedusaJS API | 9000 | ferremex-api | ✅ online |
| Vite Admin Dev Server | 7000 | ferremex-admin | ✅ online |
| Redis | 6379 | Docker (redis-ferremex) | ✅ online |
| PostgreSQL | 5432 | Servicio Windows | ✅ online |
```

## Cuando agregar notas de sesión

Siempre que:
- Se complete un paso de alguna fase
- Se corrija un error
- Se tome una decisión de arquitectura
- Se instale algo nuevo

Formato:
```markdown
### Sesión YYYY-MM-DD
- [qué se hizo]
- [problemas encontrados y soluciones]
- [decisiones tomadas]
```
