# Auditoría Ferremex — Reporte de diagnóstico

> **Modo:** solo-diagnóstico. **Ningún archivo de código o documento fue modificado.** Este reporte solo describe hallazgos y propuestas de mejora.
> **Fecha:** 2026-05-29
> **Alcance:** (1) Módulos POS `apps/pos/src/`, (2) Backend `packages/api/src/api/caja/`, (3) Documentos del harness `.claude/*.md` + `CLAUDE.md` + `LÉEME-PRIMERO.md`.
> **Método:** agentes especializados (`react-reviewer`, `typescript-reviewer`, `code-reviewer`) + verificación manual directa de todos los hallazgos críticos contra el código real. Los hallazgos que un agente reportó pero que la verificación manual desmintió fueron **descartados** y se anotan al final.

---

## Resumen por severidad

| Área | 🔴 Crítico | 🟡 Importante | 🟢 Menor |
|------|:---------:|:------------:|:--------:|
| 1. Módulos POS | 4 | 12 | 11 |
| 2. Backend `/caja` | 2 | 9 | 7 |
| 3. Docs del harness | 3 | 6 | 3 |
| **Total** | **9** | **27** | **21** |

**Lectura rápida del estado:** el proyecto está sólido en arquitectura y el harness es en su mayoría fiel al código. Los riesgos reales se concentran en: (a) un par de huecos de seguridad en el backend (path traversal + rutas mutantes sin auth), (b) condiciones de carrera en escritura de JSON/inventario que ya están reconocidas como deuda pero conviene priorizar, (c) un PIN de cajeros que viaja al cliente en texto plano, y (d) tres rutas/funciones mal documentadas en el harness que harían que una sesión futura genere código que falla en silencio.

---

# 1. Módulos POS (`apps/pos/src/`)

## 🔴 Críticos

### POS-C1 — `navigate()` llamado durante el render (viola las reglas de React)
- **Archivos:** [apps/pos/src/pages/Admin.tsx:12-19](apps/pos/src/pages/Admin.tsx#L12-L19), [apps/pos/src/pages/Venta.tsx:18-21](apps/pos/src/pages/Venta.tsx#L18-L21)
- **Qué es:** `navigate("/", { replace: true })` se invoca directamente en el cuerpo del componente, no dentro de un efecto. *(Verificado: confirmado en `Admin.tsx`.)*
- **Por qué importa:** Disparar una navegación como efecto secundario durante el render viola las reglas de React y produce el warning "Cannot update during an existing state transition". Con `StrictMode` activo ([main.tsx:30](apps/pos/src/main.tsx#L30)) el render se ejecuta dos veces en dev, duplicando la navegación.
- **Cómo mejorarlo:** Sustituir por el componente declarativo `<Navigate to="/" replace />` de React Router 6:
  ```tsx
  if (!state.cajero) return <Navigate to="/" replace />
  if (!state.cajero.permisos.puede_ver_admin) return <Navigate to="/venta" replace />
  ```

### POS-C2 — El PIN de todos los cajeros viaja al cliente en texto plano
- **Archivos:** [apps/pos/src/lib/client.ts](apps/pos/src/lib/client.ts) (tipo `PosUsuario.pin`), [apps/pos/src/pages/Login.tsx:26-43](apps/pos/src/pages/Login.tsx#L26-L43)
- **Qué es:** `obtenerUsuarios()` devuelve el campo `pin` de cada usuario; el Login lo guarda en estado y compara el PIN en el cliente (`nuevo === pinUsuario?.pin`).
- **Por qué importa:** Cualquiera que abra DevTools en una terminal ve los PINs de todos los cajeros, incluidos los de administradores. Es la credencial de acceso al POS y a la sección admin.
- **Cómo mejorarlo:** Validar el PIN server-side: un endpoint `POST /caja/login` que reciba `{ usuario, pin }` y devuelva un token/sesión. El listado `GET /caja/usuarios` no debe incluir el campo `pin`. *(Relacionado con el hallazgo de backend sobre rutas sin auth.)*

### POS-C3 — Cancelar una venta solo cambia el estado local; no persiste ni reintegra inventario
- **Archivo:** [apps/pos/src/modules/SalesHistory.jsx:1182-1193](apps/pos/src/modules/SalesHistory.jsx#L1182-L1193)
- **Qué es:** `handleCancelConfirm` hace `setAllVentas(...)` marcando la venta como `cancelada`, pero no existe `cancelarVenta()` en `client.ts` ni llamada al backend.
- **Por qué importa:** La cancelación se pierde al recargar la página. El inventario de la venta cancelada no se reintegra. Es un flujo de negocio que el usuario cree completado pero que no deja rastro.
- **Cómo mejorarlo:** Crear `PATCH /caja/ventas/:folio` (estado + motivo + reintegro de inventario) y una función `cancelarVenta(folio, motivo)` en `client.ts`; llamarla antes de actualizar el estado local.

### POS-C4 — Contador de folios de pedidos en variable de módulo mutable
- **Archivo:** [apps/pos/src/components/PedidosModule.jsx:54-60](apps/pos/src/components/PedidosModule.jsx#L54-L60)
- **Qué es:** `let _folioCount = 0` a nivel de módulo, incrementada en `genFolio()`.
- **Por qué importa:** No sobrevive recargas (vuelve a 1 → folios `PED-…-001` duplicados) y es estado compartido fuera de React. Con un solo cliente el riesgo es bajo, pero es un patrón frágil.
- **Cómo mejorarlo:** Cuando se cablee el backend de pedidos, generar el folio server-side (como ya se hace con ventas). Mientras tanto, derivar el siguiente número del último pedido en `localStorage`.

## 🟡 Importantes

### POS-I1 — `useToasts` duplicado en tres módulos
- **Archivos:** [SalesHistory.jsx:53-61](apps/pos/src/modules/SalesHistory.jsx#L53-L61), [EmployeesModule.jsx:101-109](apps/pos/src/modules/EmployeesModule.jsx#L101-L109), [CashMovementsModule.jsx:631-636](apps/pos/src/modules/CashMovementsModule.jsx#L631-L636) (variante inline)
- **Qué es / por qué importa:** El mismo hook de toasts (auto-expiran a 3000 ms) está copiado tres veces. Cualquier cambio de comportamiento exige tocar tres archivos.
- **Cómo mejorarlo:** Extraer a `apps/pos/src/hooks/useToasts.ts` y reusarlo.

### POS-I2 — Movimientos manuales de caja no persisten
- **Archivo:** [CashMovementsModule.jsx:542](apps/pos/src/modules/CashMovementsModule.jsx#L542) (`useState([])`)
- **Por qué importa:** Las entradas/salidas manuales de caja viven solo en estado del componente. Al salir de la sección y volver, se pierden. Las ventas (que vienen del backend) sí persisten; los ajustes de caja no.
- **Cómo mejorarlo:** Persistir en `localStorage` con clave por día (`pos_movimientos_caja_YYYY-MM-DD`) o, mejor, endpoint `/caja/movimientos`.

### POS-I3 — `fetch` directo fuera de `client.ts` en PedidosModule
- **Archivo:** [PedidosModule.jsx:96-107](apps/pos/src/components/PedidosModule.jsx#L96-L107) (`imageToDataUri` hace `fetch(abs)`)
- **Por qué importa:** Viola la regla "todas las llamadas pasan por `client.ts`". Sin manejo de error/headers consistente.
- **Cómo mejorarlo:** Mover la conversión a helper en `client.ts` o `lib/`. *(El `fetch("/static/claves-sat.json")` en `ComprasDetailPanel.jsx` es aceptable: es un archivo estático público con `.catch()`.)*

### POS-I4 — Pedidos sin backend (solo localStorage)
- **Archivo:** [PedidosModule.jsx](apps/pos/src/components/PedidosModule.jsx) (`ferremex_mis_pedidos`, `ferremex_pedidos_espera`, `ferremex_pedido_draft`)
- **Por qué importa:** No existe `/caja/pedidos`. Cada terminal tiene su copia aislada; sin trazabilidad central. El array `HISTORIAL_MOCK` está definido pero es **letra muerta** (no se usa). *(Ya documentado como pendiente en CLAUDE.md — se incluye aquí para tenerlo en el inventario de deuda.)*
- **Cómo mejorarlo:** Crear la ruta backend y reemplazar el acceso a `localStorage`; borrar `HISTORIAL_MOCK`.

### POS-I5 — Stale closure / re-suscripción por tecla en el teclado de Login
- **Archivo:** [Login.tsx:45-53](apps/pos/src/pages/Login.tsx#L45-L53)
- **Por qué importa:** El listener `keydown` se registra/desregistra en cada dígito porque `pinIngresado` está en las dependencias del efecto. Funciona, pero es ineficiente y frágil (`handlePinDigito`/`handlePinBorrar` no están en deps).
- **Cómo mejorarlo:** Envolver los handlers en `useCallback` con sus dependencias reales y dejar `[pinUsuario]` en el efecto, o usar una ref para el valor actual.

### POS-I6 — `AdminInventario` es un `<iframe>` a un HTML estático
- **Archivo:** [apps/pos/src/pages/AdminInventario.tsx](apps/pos/src/pages/AdminInventario.tsx) (`src="/pos/ajuste-inventario.html"`)
- **Por qué importa:** El ajuste de inventario está fuera de React: sin contexto POS, sin sistema de toasts/errores, sin acceso a `ajustarInventario()` de `client.ts`. Deuda técnica significativa y experiencia inconsistente.
- **Cómo mejorarlo:** Reescribir como módulo React (`InventarioModule.jsx`) que consuma `ajustarInventario()`.

### POS-I7 — `window.confirm` / `alert` en componentes
- **Archivos:** [ArticlesModule.jsx:239,252](apps/pos/src/components/ArticlesModule.jsx#L239), [PedidosModule.jsx:474,563](apps/pos/src/components/PedidosModule.jsx#L474)
- **Por qué importa:** APIs bloqueantes del navegador, no estilizadas, inconsistentes con el resto (que usa modales React). PedidosModule ya tiene `OCConfirmModal` propio.
- **Cómo mejorarlo:** Sustituir por los modales React existentes (`XxxDeleteModal` / confirm modal).

### POS-I8 — `CashMovementsModule` usa clases Tailwind que probablemente no aplican
- **Archivo:** [CashMovementsModule.jsx](apps/pos/src/modules/CashMovementsModule.jsx) (todo el archivo)
- **Por qué importa:** Usa clases utilitarias Tailwind (`flex`, `h-14`, `border-b`, `text-sm`) mientras el resto del POS usa CSS propio (`.ar-root`, `.admin-shell`). Si Tailwind no está configurado, el módulo se ve sin estilos.
- **Acción de verificación (no realizada en modo diagnóstico):** confirmar en `apps/pos/package.json` + `vite.config.ts` si Tailwind está instalado. Si no, este módulo necesita migrar a CSS propio.

### POS-I9 — `listarVentas()` sin rango carga todo el historial
- **Archivo:** [SalesHistory.jsx:1059-1065](apps/pos/src/modules/SalesHistory.jsx#L1059-L1065) y botón "Recargar" (~1251)
- **Por qué importa:** El fetch inicial trae **todas** las ventas y filtra en cliente. Con miles de ventas satura memoria de cliente y servidor.
- **Cómo mejorarlo:** Pasar el rango de fechas `applied` al fetch (`listarVentas(desde, hasta)` ya lo soporta en backend y `client.ts`).

### POS-I10 — Blob URL del PDF de OC nunca se revoca (fuga de memoria)
- **Archivo:** [client.ts](apps/pos/src/lib/client.ts) (`generarOCPdf` → `URL.createObjectURL`)
- **Por qué importa:** Cada generación de OC crea un object URL que nunca se libera con `URL.revokeObjectURL`. Generar varias OCs acumula memoria.
- **Cómo mejorarlo:** Revocar el URL en el componente consumidor cuando se cierra el visor/se descarga.

### POS-I11 — `eslint-disable react-hooks/exhaustive-deps` sin justificación
- **Archivos:** [ArticlesModule.jsx:167](apps/pos/src/components/ArticlesModule.jsx#L167), [ComprasModule.jsx:298](apps/pos/src/components/ComprasModule.jsx#L298), [AdminClientesLista.tsx:70](apps/pos/src/pages/AdminClientesLista.tsx#L70), [CatalogosColumnas.jsx:101,108](apps/pos/src/components/CatalogosColumnas.jsx#L101)
- **Por qué importa:** Las supresiones esconden dependencias implícitas. En `CatalogosColumnas` se omiten `depts/cats/marcas` (arrays) — si cambian, el panel de edición de nodos `mar` no se reinicia bien.
- **Cómo mejorarlo:** Añadir un comentario que justifique cada supresión o, mejor, corregir el array de dependencias.

### POS-I12 — `today`/`todayStr` como constantes de módulo en CashMovementsModule
- **Archivo:** [CashMovementsModule.jsx:22-23](apps/pos/src/modules/CashMovementsModule.jsx#L22-L23)
- **Por qué importa:** Se evalúan una sola vez al cargar el módulo. Una terminal abierta pasada la medianoche queda con la fecha del día anterior, afectando qué movimientos se permiten registrar. Riesgo real en turnos nocturnos.
- **Cómo mejorarlo:** Calcular la fecha dentro de la lógica de registro o refrescarla con un timer.

## 🟢 Menores

- **POS-M1** — `key={i}` (índice) en listas potencialmente reordenables: [ConsultarCompras.jsx](apps/pos/src/modules/ConsultarCompras.jsx) (tablas de artículos editables), [CarteraCredito.jsx](apps/pos/src/pages/CarteraCredito.jsx), [AdminTickets.tsx](apps/pos/src/pages/AdminTickets.tsx). En tablas editables puede arrastrar estado de inputs al reordenar → usar id estable.
- **POS-M2** — Inconsistencia de carpetas: `PedidosModule`, `ArticlesModule`, `ComprasModule`, `CatalogosModule` viven en `components/`, mientras `SalesHistory`, `EmployeesModule`, `CashMovementsModule`, `ConsultarCompras` están en `modules/`. El criterio módulo-con-estado→`modules/` no se aplicó uniformemente.
- **POS-M3** — `uuid()` duplicado en [AdminClientesLista.tsx](apps/pos/src/pages/AdminClientesLista.tsx), [CarteraCredito.jsx](apps/pos/src/pages/CarteraCredito.jsx), [ComprasModule.jsx](apps/pos/src/components/ComprasModule.jsx), [PedidosModule.jsx](apps/pos/src/components/PedidosModule.jsx) → centralizar en `lib/utils.ts`.
- **POS-M4** — Formateador de moneda MXN duplicado con 4 implementaciones distintas (`formatMXN`, `fmt`, `fmtPeso`) en CashMovements, SalesHistory, CarteraCredito, ModalCobro → unificar en `lib/format.ts`.
- **POS-M5** — `Admin.tsx` infiere el tab activo con 13 ternarios anidados sobre `location.pathname` ([Admin.tsx:21-46](apps/pos/src/pages/Admin.tsx#L21-L46)); frágil ante rutas nuevas. Considerar `useMatch` por ruta. *(Verificado.)*
- **POS-M6** — Inferencia de tab por `path.includes("/admin/clientes")` activa también con `/admin/clientes-lista` por coincidencia de substring; correcto hoy, frágil mañana.
- **POS-M7** — Persistencia de filtros en `localStorage` en cada keystroke ([SalesHistory.jsx:1081-1083](apps/pos/src/modules/SalesHistory.jsx#L1081-L1083)) → debounce o persistir solo al buscar.
- **POS-M8** — Accesibilidad: `<div onClick>` sin `role="button"`/`tabIndex` en tarjetas/filas clicables ([Carrito.tsx:84](apps/pos/src/components/Carrito.tsx#L84), `VentaCard` en SalesHistory, filas en CashMovements). El `Toggle` de EmployeesModule tiene `role="switch"` pero no es operable por teclado (falta `tabIndex`+`onKeyDown`).
- **POS-M9** — `handleCancelConfirm` usa `cancelTarget.folio` en el toast después de `setCancelTarget(null)` ([SalesHistory.jsx:1182-1193](apps/pos/src/modules/SalesHistory.jsx#L1182-L1193)); funciona por el batching de React 18 pero conviene capturar el folio en variable local antes.

---

# 2. Backend `/caja` (`packages/api/src/api/caja/`)

## 🔴 Críticos

### API-C1 — Path traversal en `/caja/generar-oc`
- **Archivo:** [packages/api/src/api/caja/generar-oc/route.ts:20-31](packages/api/src/api/caja/generar-oc/route.ts#L20-L31) *(Verificado directamente.)*
- **Qué es:** El campo `thumbnail`/`imagenUrl` viene del body sin validar. Si empieza con `/static/`, se hace `path.join(STATIC_DIR, filename)` sin comprobar que el resultado siga dentro de `STATIC_DIR`, y se lee el archivo:
  ```ts
  const filename = url.slice("/static/".length)
  const filePath = path.join(STATIC_DIR, filename)   // ← sin normalizar ni contener
  if (fs.existsSync(filePath)) { const buf = fs.readFileSync(filePath) ... }
  ```
- **Por qué importa:** Un body como `{ "rows":[{ "thumbnail":"/static/../../../data/usuarios-pos.json", "id":"x" }] }` lee archivos arbitrarios del servidor (incluidos `usuarios-pos.json` con los PINs) y los incrusta en el PDF devuelto. Filtración de datos.
- **Cómo mejorarlo:** Normalizar y contener la ruta antes de leer:
  ```ts
  const filePath = path.normalize(path.join(STATIC_DIR, filename))
  if (!filePath.startsWith(STATIC_DIR + path.sep)) return   // fuera del dir estático
  ```

### API-C2 — Race condition de inventario (check → decrement no atómico)
- **Archivo:** [packages/api/src/api/caja/ventas/route.ts:109-143](packages/api/src/api/caja/ventas/route.ts#L109-L143) *(Verificado directamente.)*
- **Qué es:** El flujo es `listInventoryLevels` → validar `stocked_quantity` en memoria → loop de `adjustInventory(-cantidad)`. Entre la lectura y el ajuste no hay atomicidad.
- **Por qué importa:** Dos ventas concurrentes del mismo SKU pueden leer el mismo stock, ambas pasar la validación y ambas decrementar → stock negativo / venta de mercancía inexistente. Ya está reconocido como deuda en CLAUDE.md; se eleva a crítico por el impacto de negocio.
- **Cómo mejorarlo:** Corto plazo, un mutex en memoria por SKU (`async-mutex`) que serialice el bloque check+decrement dentro del proceso único de Node. Estructural: mover a un Medusa Workflow con compensación, o ajuste transaccional en Postgres.

## 🟡 Importantes

### API-I1 — POST `/caja/ventas` sin `try/catch`: inventario decrementado sin venta registrada
- **Archivo:** [ventas/route.ts:91-168](packages/api/src/api/caja/ventas/route.ts#L91-L168) *(Verificado.)*
- **Qué es:** El handler decrementa inventario en loop (137-143), luego genera folio (146) y guarda la venta (163-165), sin try/catch global ni compensación.
- **Por qué importa:** Si `guardarVentas()` falla (disco/permiso/JSON corrupto) o un `adjustInventory` posterior lanza, el inventario ya decrementado de los ítems previos no se revierte y la venta no queda registrada. Un error no capturado en Medusa puede devolver 500 sin cuerpo JSON, rompiendo el flujo del POS.
- **Cómo mejorarlo:** Envolver todo en `try/catch`; acumular los ítems decrementados y, ante error, revertirlos con `adjustInventory(+cantidad)` antes de responder 500.

### API-I2 — Folio secuencial sin lock → folios duplicados bajo concurrencia
- **Archivos:** [ventas/route.ts:51-74](packages/api/src/api/caja/ventas/route.ts#L51-L74), [folio-contador/route.ts](packages/api/src/api/caja/folio-contador/route.ts) *(Verificado.)*
- **Qué es:** `leerContador()` → `guardarContador(n+1)` no es atómico. Dos requests leen `n` y ambos generan el mismo folio.
- **Por qué importa:** Folios duplicados en `ventas-pos.json` y en la contabilidad, sin detección de colisión.
- **Cómo mejorarlo:** Lock de archivo (`proper-lockfile` o `fs.openSync` con flag `'wx'` + retry) envolviendo lectura+escritura+generación, o el mismo mutex de API-C2.

### API-I3 — Escrituras a JSON sin lock (read-modify-write) → corrupción/pérdida de datos
- **Archivos:** [ventas/route.ts:36-40,163-165](packages/api/src/api/caja/ventas/route.ts#L36-L40), [usuarios/route.ts](packages/api/src/api/caja/usuarios/route.ts), [corte/route.ts](packages/api/src/api/caja/corte/route.ts), [ticket-config/route.ts](packages/api/src/api/caja/ticket-config/route.ts), [catalogos/route.ts](packages/api/src/api/caja/catalogos/route.ts) *(Patrón verificado en ventas.)*
- **Qué es:** `cargar → mutar → writeFileSync` sin lock. El event loop puede intercalar dos requests; el último en escribir pisa al primero.
- **Por qué importa:** El caso más grave es `ventas-pos.json`: dos ventas simultáneas leen el mismo array y la que guarda último borra el registro de la otra → venta perdida.
- **Cómo mejorarlo:** Escritura atómica (archivo temporal + `fs.renameSync` en el mismo FS) protegida por un mutex por archivo. A medio plazo, migrar ventas a BD de Medusa.

### API-I4 — Rutas mutantes sin autenticación ni autorización
- **Archivos:** todas las rutas mutantes; especialmente [ventas/route.ts](packages/api/src/api/caja/ventas/route.ts), [folio-contador/route.ts](packages/api/src/api/caja/folio-contador/route.ts) (DELETE), [ticket-config/route.ts](packages/api/src/api/caja/ticket-config/route.ts) (PUT)
- **Qué es:** No hay middleware de auth. `POST /caja/ventas` acepta `cajero` como string libre; `DELETE /caja/folio-contador` resetea el contador sin control.
- **Por qué importa:** Cualquier dispositivo en la LAN (o desde fuera si el 9000 queda expuesto) puede registrar ventas con cualquier cajero, alterar la config del ticket o resetear los folios. Aceptable como riesgo en LAN cerrada, pero combina mal con POS-C2 (PIN en cliente).
- **Cómo mejorarlo:** Middleware de token POS compartido (`X-POS-Token` validado contra `.env`) sobre `/caja/*` mutante, como puente hasta tener auth de cajero real.

### API-I5 — Búsqueda parcial de SKU descarga ~100k variantes a memoria
- **Archivos:** [productos/route.ts:116-148](packages/api/src/api/caja/productos/route.ts#L116-L148), también `take: 99999` en [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts)
- **Qué es:** Cuando el match exacto de SKU falla, `listProductVariants({}, { take: 99999 })` sin filtro, y luego `sku.includes(q)` en JS.
- **Por qué importa:** Con catálogo grande trae decenas de miles de registros a RAM por búsqueda → latencia y presión de memoria.
- **Cómo mejorarlo:** Búsqueda ILIKE en Postgres, o al menos limitar a 500 resultados y documentar la restricción.

### API-I6 — POST/PUT `/caja/articulos` no valida campos críticos
- **Archivo:** [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts) (POST ~469, PUT ~556)
- **Qué es:** El body es `any` sin validación: `clave` (SKU) vacío crea variante sin SKU (inencontrable por inventario); `descripcion` undefined → `title: undefined`; `precio1` negativo se acepta.
- **Por qué importa:** Productos malformados que rompen inventario/búsqueda o precios negativos en el price set.
- **Cómo mejorarlo:** Validar `clave` (no vacío, sin `/` ni `..`), `descripcion` (no vacío) y `precio1 >= 0` antes de llamar a Medusa.

### API-I7 — DELETE `/caja/articulos` no verifica existencia ni valida UUID
- **Archivo:** [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts) (DELETE ~688)
- **Qué es:** `deleteProducts([id])` directo sin comprobar existencia ni que `id` sea UUID. Medusa puede devolver `{ ok:true }` para un id inexistente.
- **Cómo mejorarlo:** `retrieveProduct(id)` con try/catch para 404 + validación de formato UUID antes de borrar.

### API-I8 — `generar-oc` sin `try/catch` en `renderToBuffer`
- **Archivo:** [generar-oc/route.ts:53-65](packages/api/src/api/caja/generar-oc/route.ts#L53-L65) *(Verificado.)*
- **Qué es:** `buildImageMap` y `renderToBuffer` pueden lanzar (imagen corrupta, prop inválida) sin captura → 500 sin cuerpo.
- **Cómo mejorarlo:** Envolver en try/catch y devolver `res.status(500).json({ error })`.

### API-I9 — Folio generado *después* de decrementar inventario
- **Archivo:** [ventas/route.ts:145-165](packages/api/src/api/caja/ventas/route.ts#L145-L165) *(Verificado.)*
- **Qué es:** En modo secuencial, `generarFolio()` (que toca el counter) corre tras el decremento de inventario.
- **Por qué importa:** Si la generación de folio falla, el inventario ya bajó pero la venta no se persiste. Conviene generar el folio primero (operación barata y aislada). Se resuelve junto con API-I1 (transacción compensable).

## 🟢 Menores

- **API-M1** — `normalizarFonetico` duplicada en [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts) y [productos/route.ts](packages/api/src/api/caja/productos/route.ts), con regex Unicode escrita distinto (`[̀-ͯ]` vs literal). Riesgo: búsqueda inconsistente entre pantalla de venta y admin. Centralizar en `packages/api/src/lib/`.
- **API-M2** — `slugify` duplicada en [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts) y [catalogos/route.ts](packages/api/src/api/caja/catalogos/route.ts) con `.slice(0,100)` vs `.slice(0,80)`; IDs/handles podrían divergir. Centralizar.
- **API-M3** — `Content-Disposition` interpola `ocNumber` sin sanitizar ([generar-oc/route.ts:64](packages/api/src/api/caja/generar-oc/route.ts#L64)); comillas/saltos malforman el header (header injection). Sanitizar a `[a-zA-Z0-9_\-]`. *(Verificado: `ocNumber` viene del body y solo se valida que exista, no su contenido.)*
- **API-M4** — Errores de parse de JSON silenciados sin log en `cargarConfig`/`cargarVentas`/`leerContador` (devuelven default). Un JSON corrupto se sobrescribe en silencio con el default, perdiendo la config. Añadir `console.error`.
- **API-M5** — `inventoryModule: any` en helper de [articulos/route.ts](packages/api/src/api/caja/articulos/route.ts) descarta type-safety; tipar con la interfaz del módulo de inventario.
- **API-M6** — `DELETE /caja/folio-contador` irreversible y sin control (relacionado con API-I4); el impacto contable (folios desde 0001) es alto.
- **API-M7** — Validación de stock omite SKUs sin `inventoryItem`/`nivel` con `continue` ([ventas/route.ts:124-127](packages/api/src/api/caja/ventas/route.ts#L124-L127)); un SKU sin inventory item se vende sin descontar nada, en silencio. Conviene al menos loguear o rechazar.

---

# 3. Documentos del harness

> Verificados directamente los tres críticos contra `main.tsx` y el árbol de archivos. **Un hallazgo que el agente reportó como crítico (`OcDocument.tsx` vs `.jsx`) fue DESCARTADO tras verificación** — ver nota al final.

## 🔴 Críticos

### DOC-C1 — Ruta de Cartera de Crédito incorrecta en CLAUDE.md
- **Documento:** `CLAUDE.md` — sección "Estructura de rutas" y "Cartera de Crédito"
- **Dice el doc:** montada en `/pos/admin/cartera`.
- **Dice el código:** [main.tsx:45](apps/pos/src/main.tsx#L45) → `path="cartera-credito"`. La ruta real es `/pos/admin/cartera-credito`. *(Verificado.)*
- **Por qué importa:** Código generado con `navigate('/admin/cartera')` cae en el wildcard `*` → redirige a Login en silencio.

### DOC-C2 — `/admin/usuarios` documentada como módulo activo; en el código es un redirect
- **Documento:** `CLAUDE.md` — "Estructura de rutas" (`/usuarios → Gestión de usuarios POS`)
- **Dice el código:** [main.tsx:42](apps/pos/src/main.tsx#L42) → `<Navigate to="/admin/empleados" replace />`. El módulo real es `AdminEmpleados`/`EmployeesModule`. *(Verificado.)*
- **Por qué importa:** Una sesión futura buscaría/editaría un `AdminUsuarios` que ya no es la fuente de verdad; el CRUD de usuarios vive en `EmployeesModule`.

### DOC-C3 — Lista de funciones de `client.ts` en CLAUDE.md incompleta
- **Documento:** `CLAUDE.md` — "Librerías helper"
- **Qué falta:** `obtenerUsuarios`, `crearUsuario`, `actualizarUsuario`, `eliminarUsuario` (CRUD que consume `EmployeesModule`), `obtenerTicketConfig`/`guardarTicketConfig`, `obtenerFolioContador`/`reiniciarFolioContador`, `listarArticulosDeCatalogo`, `migrarTicketConfig`.
- **Por qué importa:** Sin verlas documentadas, una sesión futura podría inventar llamadas CRUD de usuarios en lugar de usar las existentes. (Severidad alta por el efecto sobre código generado; el resto de la lista de CLAUDE.md sí es correcta.)

## 🟡 Importantes

### DOC-I1 — Rutas reales del router ausentes en CLAUDE.md
- **Documento:** `CLAUDE.md` — "Estructura de rutas". Faltan: `/admin/compras-nueva`, `/admin/consultar-compras`, `/admin/clientes-lista`, `/admin/catalogos`, `/admin/empleados`, `/admin/caja`. *(Verificado contra [main.tsx:50-58](apps/pos/src/main.tsx#L50-L58).)*

### DOC-I2 — `/admin/generador` está fuera del layout Admin
- **Documento:** CLAUDE.md lista `/generador` como sub-ruta de admin.
- **Dice el código:** [main.tsx:58](apps/pos/src/main.tsx#L58) → ruta hermana de `/admin`, **sin sidebar**. Diferencia de comportamiento no documentada. *(Verificado.)*

### DOC-I3 — `FERREMEX-MODULES.md` omite módulos/páginas existentes
- `modules/ConsultarCompras.jsx` + `pages/AdminConsultarCompras.jsx`, `pages/AdminComprasNueva.jsx`, `pages/AdminClientesLista.tsx`, fila de Catálogos. Existen en el código pero no en la tabla de MODULES.

### DOC-I4 — `buscarProductos()` ignora el campo `marca`
- **Documento:** la sección de taxonomía insinúa que el filtro por marca llega al backend.
- **Dice el código:** `FiltrosBusqueda.marca` existe en el tipo de `client.ts`, pero `buscarProductos()` solo envía `q`, `category_id`, `departamento`. `marca` se ignora. No documentado.

### DOC-I5 — Divergencia de schema `TicketConfig` frontend vs backend
- **Frontend** (`client.ts`): `encabezado` con `logo`, `nombre`, `direccion`, `telefono`, `email`, `rfc` (+ legacy `linea2/3`).
- **Backend** ([ticket-config/route.ts](packages/api/src/api/caja/ticket-config/route.ts)): `encabezado` con `nombre`, `linea2`, `linea3`, `rfc` — **sin** `logo/direccion/telefono/email`. La conversión la hace `migrarTicketConfig()` en el cliente. `FERREMEX-SCHEMA.md` no documenta esta divergencia.

### DOC-I6 — `AdminUsuarios.tsx` huérfano
- `pages/AdminUsuarios.tsx` existe pero no está montado en el router (reemplazado por `AdminEmpleados`). Ni MODULES ni CLAUDE.md lo aclaran. Candidato a borrado o nota explícita.

## 🟢 Menores

- **DOC-M1** — Comentario de `buildTurnoId()` dice "(mañana, <14h)"; el código usa `"m"`/`"t"` (matutino/tarde). El formato es correcto; solo la glosa es imprecisa.
- **DOC-M2** — `FERREMEX-MODULES.md` cita `Admin.tsx` junto a `AdminArticulos.tsx` en la columna "Página" del módulo de artículos; `Admin.tsx` es el shell de navegación, no la página.
- **DOC-M3** — `FERREMEX-PREFERENCES.md` presenta `PAGE_SIZE = 40` como patrón general cuando solo está verificado en `ArticlesModule`.

### Afirmaciones del harness verificadas como CORRECTAS (para dar confianza)
- Todas las rutas backend de la tabla de CLAUDE.md existen como `route.ts` en `caja/` (`productos`, `categorias`, `ventas`, `ventas/[folio]`, `corte`, `usuarios`, `articulos`, `ticket-config`, `imagen`, `ajuste-inventario`, `generar-oc`, `folio-contador`, `catalogos`).
- Interfaces de taxonomía (`CatalogosDept/Cat/Marca/Data`) y sus campos coinciden con `client.ts`.
- Tipos de cartera (`Movimiento`, `NotaCartera`, `HistorialLimite`, `CartEntrada`) y shape de `Cliente` coinciden con `clientes.ts`.
- `pos-store.ts` expone `{ state, dispatch, total }` con el estado documentado.
- Ubicación módulos nuevos (`modules/`) vs viejos (`components/`) descrita en PREFERENCES es correcta.
- `PedidosModule` en `components/` y sin ruta backend `/caja/pedidos`: correcto.

### ⚠️ Hallazgo de un agente DESCARTADO tras verificación manual
- El `code-reviewer` reportó como crítico que CLAUDE.md cita `OcDocument.tsx` siendo el archivo real `OCDocument.jsx`. **Falso.** Hay **dos archivos distintos**: el backend usa [packages/api/src/api/caja/generar-oc/OcDocument.tsx](packages/api/src/api/caja/generar-oc/OcDocument.tsx) (el `.tsx` que cita correctamente CLAUDE.md), y el frontend tiene su propio `apps/pos/src/components/OCDocument.jsx`. La referencia de CLAUDE.md es correcta. No se incluye como hallazgo.

---

## Priorización sugerida (si decides actuar después)

1. **Seguridad primero (rápido y de alto impacto):** API-C1 (path traversal, ~3 líneas), POS-C2 + API-I4 (PIN en cliente + rutas sin auth, van juntos).
2. **Integridad de datos:** API-C2 / API-I1 / API-I2 / API-I3 (mutex + escritura atómica + try/catch compensable en ventas). Es el bloque que evita ventas perdidas, stock negativo y folios duplicados.
3. **Correctitud React:** POS-C1 (navigate en render) y POS-C3 (cancelar venta no persiste).
4. **Fidelidad del harness:** DOC-C1, DOC-C2, DOC-C3 (3 ediciones puntuales de texto, sin tocar código).
5. **Limpieza de deuda:** dedupe de helpers (`useToasts`, `uuid`, formateadores, `slugify`, `normalizarFonetico`) y migración de `AdminInventario` fuera del iframe.

> Recordatorio: este documento es **solo diagnóstico**. No se modificó ningún archivo de código ni de documentación. Avísame qué bloque quieres abordar y lo planeamos antes de tocar nada.
