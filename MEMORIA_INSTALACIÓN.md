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
2026-04-08 20:00 (verificación automática)

### Servicios corriendo

| Servicio | Puerto | Proceso PM2 | Estado |
|---------|--------|-------------|--------|
| MedusaJS API | 9000 | ferremex-api | ✅ online |
| Vite Admin Dev Server | 7000 | ferremex-admin | ✅ online |
| Redis | 6379 | Docker (redis-ferremex) | ✅ online |
| PostgreSQL | 5432 | Servicio Windows | ✅ online |

### Estado PM2

| Proceso | PID | Uptime | Reinicios | Memoria |
|---------|-----|--------|-----------|---------|
| ferremex-admin | 15880 | 4h+ | 0 | 17.3 MB |
| ferremex-api | 6636 | 4h+ | 0 | 16.5 MB |

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
- **Último commit:** (ver abajo)

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
- [x] ~~Renombrar almacén "European Warehouse"~~ → renombrado a "Almacén Principal" ✅
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
