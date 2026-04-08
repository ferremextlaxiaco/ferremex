# MEMORIA DE INSTALACIÓN — FERREMEX
> Actualizada automáticamente por el skill ACTUALIZADOR cada 10 minutos.
> No editar manualmente — los cambios se sobreescriben.

---

## ESTADO GENERAL

| Fase | Nombre | Estado |
|------|--------|--------|
| Fase 0 | Fundación — infraestructura en red local | ✅ COMPLETA |
| Fase 1 | Catálogo de productos | ✅ COMPLETA |
| Fase 2 | POS de mostrador | ⏳ PENDIENTE |
| Fase 3 | Compras y XML de proveedores | ⏳ PENDIENTE |
| Fase 4 | Créditos y clientes | ⏳ PENDIENTE |
| Fase 5 | Monedero, comisiones y reportes | ⏳ PENDIENTE |

---

## FASE 0 — COMPLETADA

### Fecha de instalación
2026-04-07

### Última verificación
2026-04-08

### Servicios corriendo

| Servicio | Puerto | Proceso PM2 | Estado |
|---------|--------|-------------|--------|
| MedusaJS API | 9000 | ferremex-api | ✅ online |
| Vite Admin Dev Server | 7000 | ferremex-admin | ✅ online |
| Redis | 6379 | Docker (redis-ferremex) | ✅ online (Up 4 hours) |
| PostgreSQL | 5432 | Servicio Windows | ✅ online |

### Estado PM2

| Proceso | PID | Uptime | Reinicios | Memoria |
|---------|-----|--------|-----------|---------|
| ferremex-admin | 15880 | 3h | 0 | 18.2 MB |
| ferremex-api | 6636 | 3h | 0 | 16.7 MB |

> ✅ Ambos procesos estables sin reinicios en esta sesión.

### Acceso al sistema

| Pantalla | URL local | URL desde cajas |
|---------|-----------|-----------------|
| Login Admin | http://localhost:9000/login | http://192.168.1.105:9000/login |
| Panel Admin | http://localhost:9000/orders | http://192.168.1.105:9000/orders |
| Vendor Portal | http://localhost:9000/seller | http://192.168.1.105:9000/seller |

### Credenciales del sistema
- **Admin email:** ferremextlaxiaco@gmail.com
- **Admin password:** Ferremex2024!
- **PostgreSQL usuario:** postgres
- **Base de datos:** ferremex

### Red local
- **IP de la Matriz:** 192.168.1.105
- **Firewall:** Puertos 9000 y 3000 abiertos para red local
- **Cajas:** acceden por WiFi a http://192.168.1.105:9000/dashboard

### Software instalado

| Herramienta | Versión | Notas |
|-------------|---------|-------|
| Node.js | v24.14.1 | Compatible con MedusaJS 2.x |
| Bun | 1.3.11 | Runtime principal del proyecto |
| Yarn | 1.22.22 | Gestor de paquetes |
| Git | 2.53.0 | Control de versiones |
| PM2 | 6.0.14 | Gestor de procesos |
| PostgreSQL | 16.13 | Base de datos |
| Redis | 7 (Docker) | Caché y eventos |
| Docker | 29.3.1 | Usada solo para Redis |
| WSL2 | 2.6.3.0 | Disponible |

### Repositorio
- **GitHub:** https://github.com/ferremextlaxiaco/ferremex
- **Rama principal:** master
- **Último commit:** `423ef3c` — Fase 0: infraestructura Ferremex corriendo en red local

### Estructura del proyecto
```
C:\ferremex\
├── apps/
│   ├── admin/          → Panel de administración (Vite, puerto 7000)
│   └── vendor/         → Portal de vendedores
├── packages/
│   └── api/            → Backend MedusaJS (puerto 9000)
│       ├── .env        → Variables de entorno (NO en git)
│       ├── medusa-config.ts
│       └── src/scripts/
│           ├── seed.ts              → Seed inicial (MXN, México)
│           └── import-productos.ts  → Importación catálogo Sicar
├── articulosExportados.xlsx → Catálogo exportado de Sicar (NO en git)
├── RepExistencias.xlsx      → Reporte de existencias Sicar (NO en git)
├── ecosystem.config.js → Configuración PM2
├── launch-api.js       → Lanzador Node.js para PM2
├── launch-admin.js     → Lanzador Vite para PM2
└── MEMORIA_INSTALACIÓN.md → Este archivo
```

### Configuración MedusaJS
- **Moneda:** MXN (Peso mexicano)
- **Región:** México
- **País:** mx
- **RBAC:** activado
- **Registro de vendedores:** activado

### Decisiones pendientes
- [ ] Renombrar almacén "European Warehouse" → "Sucursal Tlaxiaco" (pendiente confirmación)
- [ ] PAC para CFDI: Facturama vs Facturapi (decidir cuando POS esté activo)
- [ ] Disco de la Matriz: SSD o HDD (no confirmado)
- [ ] Impresoras de tickets en las cajas: marca/modelo pendiente
- [ ] Lectores de código de barras: USB o inalámbrico
- [ ] Formato de exportación de Sicar: Excel o CSV
- [ ] Correo donde llegan los XML de proveedores

---

## FASE 1 — COMPLETADA

### Fecha de completación
2026-04-08

### Objetivo
Productos reales de Ferremex cargados en el sistema.

### Resultado
- **20,032 artículos** importados desde `articulosExportados.xlsx` (exportado de Sicar)
- **41 categorías** creadas automáticamente
- **3,270 artículos** con existencia > 0 registrada en inventario
- Script idempotente: se puede volver a correr sin duplicar datos

### Cómo actualizar el catálogo (cuando cambien precios en Sicar)
1. Exportar desde Sicar: `PROCESOS → EXPORTAR → articulosExportados.xlsx`
2. Reemplazar el archivo en `C:\ferremex\articulosExportados.xlsx`
3. Ejecutar: `cd C:\ferremex\packages\api && bun run import:productos`

### Script de importación
- **Archivo:** `packages/api/src/scripts/import-productos.ts`
- **Comando:** `bun run import:productos` (desde `packages/api`)
- **Fuente:** `articulosExportados.xlsx` en raíz del proyecto

---

## FASE 2 — PENDIENTE

### Objetivo
POS de mostrador — ventas rápidas desde las cajas.

### Primeras acciones
1. Definir flujo de venta en mostrador (con o sin cliente registrado)
2. Confirmar tipo de impresora de tickets
3. Confirmar si se requiere integración con lector de código de barras

---

## NOTAS DE SESIONES

### Sesión 2026-04-07
- Primera instalación desde cero
- Bug en seed de Mercur corregido: `currency_code` faltante en `createSellers`
- Monedas cambiadas de EUR/USD a MXN en todo el seed
- PM2 con .bat files falló en reinicios — solución: lanzadores Node.js
- Panel admin requiere Vite dev server en puerto 7000 corriendo ANTES que el API
- medusa-config.ts: `appDir` apunta a `apps/admin/dist` pero el módulo proxea a Vite en modo dev
- `windowsHide: true` agregado a ambos launchers para suprimir ventanas CMD que se abrían automáticamente
- Fix dashboard: `base: '/dashboard'` agregado a `apps/admin/vite.config.ts`
- Panel admin confirmado funcionando en `localhost:9000/login` → `localhost:9000/orders` ✅
- **Fase 0 COMPLETA y verificada en navegador**

### Sesión 2026-04-08
- Revisión de manuales de Sicar — confirmado que exporta catálogo a Excel desde `PROCESOS → EXPORTAR`
- Andres subió `articulosExportados.xlsx` (20,032 artículos) y `RepExistencias.xlsx` a la raíz del proyecto
- Escrito `packages/api/src/scripts/import-productos.ts` — importa artículos en lotes de 100
- Fix: xlsx usa require() en lugar de import() dinámico por compatibilidad ESM/CJS con Medusa
- Importación ejecutada exitosamente: 20,032 productos, 41 categorías, 0 errores
- `packages/api/package.json` actualizado: dependencia `xlsx@^0.18.5` y script `import:productos`
- **Fase 1 COMPLETA**
- Pendiente: renombrar almacén "European Warehouse" → nombre real de Ferremex
