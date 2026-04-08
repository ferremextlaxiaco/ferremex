# MEMORIA DE INSTALACIÓN — FERREMEX
> Actualizada automáticamente por el skill ACTUALIZADOR cada 15 minutos.
> No editar manualmente — los cambios se sobreescriben.

---

## ESTADO GENERAL

| Fase | Nombre | Estado |
|------|--------|--------|
| Fase 0 | Fundación — infraestructura en red local | ✅ COMPLETA |
| Fase 1 | Catálogo de productos | ✅ COMPLETA |
| Fase 2 | POS de mostrador | 🔧 EN PROGRESO |
| Fase 3 | Compras y XML de proveedores | ⏳ PENDIENTE |
| Fase 4 | Créditos y clientes | ⏳ PENDIENTE |
| Fase 5 | Monedero, comisiones y reportes | ⏳ PENDIENTE |

---

## FASE 0 — COMPLETADA

### Fecha de instalación
2026-04-07

### Última verificación
2026-04-08 21:00 (verificación automática)

### Servicios corriendo

| Servicio | Puerto | Proceso PM2 | Estado |
|---------|--------|-------------|--------|
| MedusaJS API | 9000 | ferremex-api | ✅ online |
| Vite Admin Dev Server | 7000 | ferremex-admin | ✅ online |
| Vite POS Dev Server | 7002 | ferremex-pos | ✅ online |
| Redis | 6379 | Docker (redis-ferremex) | ✅ online |
| PostgreSQL | 5432 | Servicio Windows | ✅ online |

### Acceso POS

| Pantalla | URL local | URL desde cajas |
|---------|-----------|-----------------|
| **POS** | **http://localhost:7002/pos/** | **http://192.168.1.105:7002/pos/** |

### Estado PM2

| Proceso | PID | Uptime | Reinicios | Memoria |
|---------|-----|--------|-----------|---------|
| ferremex-admin | 15880 | 5h+ | 0 | 14.7 MB |
| ferremex-api | 20360 | ~2m | 3 | 56.6 MB |
| ferremex-pos | 18824 | 20m | 1 | 56.4 MB |

> ⚠️ ferremex-api tiene 3 reinicios — normal durante sesión de desarrollo activa.

### Acceso al sistema

| Pantalla | URL local | URL desde cajas |
|---------|-----------|-----------------|
| Login Admin | http://localhost:9000/login | http://192.168.1.105:9000/login |
| Panel Admin | http://localhost:9000/orders | http://192.168.1.105:9000/orders |
| Vendor Portal | http://localhost:9000/seller | http://192.168.1.105:9000/seller |
| **POS** | **http://localhost:7002/pos/** | **http://192.168.1.105:7002/pos/** |

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
- **Último commit:** `95efce4` — Fix: inventory items con título correcto

### Estructura del proyecto
```
C:\ferremex\
├── apps/
│   ├── admin/          → Panel de administración (Vite, puerto 7000)
│   ├── vendor/         → Portal de vendedores
│   └── pos/            → POS de mostrador (Vite, puerto 7002) ← NUEVO
├── packages/
│   └── api/            → Backend MedusaJS (puerto 9000)
│       ├── .env        → Variables de entorno (NO en git)
│       ├── medusa-config.ts
│       ├── src/scripts/
│       │   ├── seed.ts              → Seed inicial (MXN, México)
│       │   └── import-productos.ts  → Importación catálogo Sicar
│       └── src/api/
│           └── caja/               → Rutas POS sin publishable key ← NUEVO
│               ├── productos/      → GET /caja/productos?q=
│               ├── ventas/         → POST /caja/ventas
│               └── corte/          → GET+POST /caja/corte
├── articulosExportados.xlsx → Catálogo exportado de Sicar (NO en git)
├── RepExistencias.xlsx      → Reporte de existencias Sicar (NO en git)
├── ecosystem.config.js → Configuración PM2 (3 procesos)
├── launch-api.js       → Lanzador Node.js para PM2
├── launch-admin.js     → Lanzador Vite admin para PM2
├── launch-pos.js       → Lanzador Vite POS para PM2 ← NUEVO
└── MEMORIA_INSTALACIÓN.md → Este archivo
```

### Configuración MedusaJS
- **Moneda:** MXN (Peso mexicano)
- **Región:** México
- **País:** mx
- **RBAC:** activado
- **Registro de vendedores:** activado

### Decisiones pendientes
- [x] ~~Renombrar almacén "European Warehouse"~~ → renombrado a "Almacén Principal" ✅
- [ ] PAC para CFDI: Facturama vs Facturapi (decidir cuando POS esté activo)
- [ ] Disco de la Matriz: SSD o HDD (no confirmado)
- [ ] Impresoras de tickets en las cajas: marca/modelo pendiente
- [ ] Lectores de código de barras: ✅ confirmado que ya hay lector USB en las cajas
- [ ] Puerto 7002 abierto en firewall para acceso de cajas al POS
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
- **2,673 productos** con thumbnail asignado desde carpeta "Imagenes de productos/"
- **20,033 inventory items** creados y linkeados a sus variants
- **3,270 inventory levels** con existencia > 0 en Almacén Principal
- Scripts idempotentes: se pueden volver a correr sin duplicar datos

### Cómo actualizar el catálogo (cuando cambien precios en Sicar)
1. Exportar desde Sicar: `PROCESOS → EXPORTAR → articulosExportados.xlsx`
2. Reemplazar el archivo en `C:\ferremex\articulosExportados.xlsx`
3. Ejecutar: `cd C:\ferremex\packages\api && bun run import:productos`

### Cómo actualizar imágenes
1. Colocar imágenes en `C:\ferremex\Imagenes de productos\` (patrón: `{SKU}s_s_selected{N}.jpg`)
2. Ejecutar: `cd C:\ferremex\packages\api && bun run attach:imagenes`

### Scripts disponibles (desde `packages/api`)
- `bun run import:productos` — importa/actualiza catálogo desde articulosExportados.xlsx
- `bun run attach:imagenes` — asigna thumbnails a productos desde carpeta de imágenes
- `bun run reparar:inventario` — crea inventory items + links + levels (solo necesario una vez)
- Las imágenes se copian a `packages/api/static/` y se sirven en `http://localhost:9000/static/`

---

## FASE 2 — EN PROGRESO

### Objetivo
POS de mostrador — ventas rápidas desde las cajas.

### Alcance confirmado para Fase 2
- Buscar producto por texto o código de barras (lector USB ya disponible)
- Carrito + cobro en efectivo con cálculo de cambio
- Abrir cajón de dinero (conectado a impresora por RJ11, via Web Serial API)
- Imprimir ticket en impresora térmica (window.print() con CSS 80mm)
- Corte de caja al final del turno por cajero
- Sin cobro con tarjeta en esta fase

### Lo que se construyó
- `apps/pos/` — nueva app Vite + React en puerto 7002
- Pantallas: Login (selección cajero), Venta (búsqueda + carrito + cobro), Corte
- Backend: rutas en `/caja/productos`, `/caja/ventas`, `/caja/corte` (sin publishable key)
- Ventas guardadas en `packages/api/data/ventas-pos.json` (se migra a DB en fase posterior)
- Cajón de dinero: Web Serial API envia ESC/POS [0x1B, 0x70, 0x00, 0x19, 0x19] a la impresora
- PM2: proceso `ferremex-pos` agregado a `ecosystem.config.js`

### Estado actual
- ✅ Interfaz POS visible en http://localhost:7002/pos/
- 🔧 Búsqueda de productos en prueba — rutas `/caja/*` activas, API reiniciado sin errores
- ⏳ Pendiente: verificar búsqueda funcional, prueba de venta completa, prueba de ticket

### Nota técnica importante
Las rutas del POS NO van bajo `/store/` porque Medusa requiere `x-publishable-api-key`
para todas las rutas `/store/*`. Las rutas POS van bajo `/caja/` con CORS configurado
en `packages/api/src/api/middlewares.ts`.

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
- Almacén renombrado "European Warehouse" → "Almacén Principal" via script
- Escrito `packages/api/src/scripts/attach-imagenes.ts` — asigna thumbnails desde "Imagenes de productos/"
- 2,673 imágenes asignadas exitosamente; imágenes servidas desde `packages/api/static/`
- Fix: `productModule.updateProducts([{id,..}])` falla con `Product.0` — correcto es `updateProducts(id, data)`
- `packages/api/static/` y `"Imagenes de productos/"` agregados a .gitignore
- Commit `6688d2b`: Fase 1 completa + imágenes de productos
- Descubierto: `productModule.createProducts()` directo NO crea inventory items (solo el workflow HTTP lo hace)
- Escrito `reparar-inventario.ts`: crea 20,033 inventory items + 20,044 links variant↔item + 3,270 levels
- Inventario visible en http://localhost:9000/inventory ✅
- Fix: inventory items tenían title=SKU en lugar del nombre del producto
- reparar-inventario.ts corregido: ahora usa `v.title` (descripción) como title del item
- Verificado: 20,044 items tienen nombre correcto (ej. "Barreta de uña 3/4' x 60 cm, Truper")
- **Fase 1 COMPLETA (catálogo + imágenes + inventario)**
- **Inicio Fase 2:** POS de mostrador planeado y comenzado a construir
- Construida app `apps/pos/` completa: Login, Venta, Corte, Buscador, Carrito, ModalCobro, Ticket
- Cajón de dinero: Web Serial API (Chrome nativo, sin instalar nada en cajas)
- Ticket: window.print() con CSS @media print para papel térmico 80mm
- Bug: JSX en archivo .ts → resuelto con createElement() en pos-store.ts
- Bug: rutas /store/pos/* bloqueadas por Medusa (requiere publishable API key)
  → Solución: mover rutas a /caja/* (fuera del middleware de store)
  → CORS configurado en middlewares.ts para /caja/*
- POS visible en http://localhost:7002/pos/ ✅
- ferremex-pos agregado a PM2 ecosystem.config.js ✅
- Bug: `import cors from 'cors'` en middlewares.ts → "Cannot find module 'cors'" al arrancar
  → Solución: eliminar middleware cors explícito — el proxy Vite (7002→9000) ya resuelve CORS
- Rutas antiguas `packages/api/src/api/store/pos/` eliminadas (reemplazadas por `caja/`)
- API arranca limpio ✅ — búsqueda en prueba
