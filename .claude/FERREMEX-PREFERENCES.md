# FERREMEX-PREFERENCES.md — Patrones y convenciones detectados en el código

> Patrones que se repiten en ≥2 módulos del POS. Detectados del código real (`apps/pos/src/`).
> Úsalos al construir features nuevas para mantener coherencia. Última actualización: 2026-05-29.

---

## Buscadores

**Patrón (pantalla de venta — `Buscador.tsx`):**
- Input controlado → `setQuery`. KeyDown: `Enter` = buscar, `Esc` = limpiar.
- `FiltroBar` (Dept→Cat→Marca por chips) emite `onChange`; auto-busca si hay filtro activo.
- Si hay 1 resultado con stock → auto-expand a `ProductoDetalle`.
- La búsqueda real ocurre en backend (`/caja/productos`) con **normalización fonética español** (quita acentos, ce/ci→se/si, z→s, v→b, ll→y, h→""). Multi-palabra = todas las palabras deben aparecer (AND).

**Patrón (admin — `ArticlesModule.jsx`):** search box + filtros cascada (selects) + tabla paginada. La búsqueda llama `listarArticulos(q)`.

> Regla: la jerarquía Dept→Cat→Marca **siempre** sale de `listarCatalogos()`. Nunca hardcodear ni derivar de `listarArticulos`.

---

## Tablas con paginación + filtros

Usado en `ArticlesModule`, `SalesHistory`, `EmployeesModule`. Patrón de estado:
```js
const [items, setItems]   = useState([])
const [page, setPage]     = useState(0)
const [search, setSearch] = useState("")
const [filtros, setFiltros] = useState({})
const PAGE_SIZE = 40   // ArticlesModule usa 40
const pagedItems = useMemo(
  () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
  [items, page]
)
```
- Tabla presentacional pura (`XxxTabla.jsx`) recibe `rows` + callbacks por props.
- Filtros en `XxxFiltros.jsx`, emiten `onChange`.

---

## Drawer / Modal de crear-editar

Usado en `ArticleDrawer`, `EmployeesModule`. Patrón:
```js
// abrir
setDrawerMode("add" | "edit"); setSelectedId(id); setDrawerOpen(true)
// guardar
async function save(data) {
  try {
    const r = mode === "add" ? await crearXxx(data) : await actualizarXxx(data)
    setItems(prev => /* upsert */)
    setDrawerOpen(false)
    push("Guardado", "success")
  } catch (e) { setError(e.message) }
}
```
- Crear/editar → `XxxDrawer.jsx` (panel lateral).
- Borrar → `XxxDeleteModal.jsx` (confirmación). Cancelaciones complejas (SalesHistory) = modal de 2 pasos (alcance → motivo → confirmar).

---

## ModalCobro (pago split)

```
neededCash = total - pagoTransferencia - pagoCredito
cambio     = max(0, pagoEfectivo - neededCash)
pendiente  = max(0, neededCash - pagoEfectivo)
cubierto   = (pEfectivo + pTransferencia + pCredito) >= total
```
- Botón "Completar" rellena el campo para cubrir el faltante.
- Tras `registrarVenta()`: si `pago_credito>0` y hay `clienteActivo` → `agregarMovimientoCredito(...)`. Si efectivo → `abrirCajon()`.

---

## Toasts

`useToasts()` reutilizable (en `SalesHistory`, `EmployeesModule`):
```js
const push = (msg, type="info") => { /* id=Date.now(); auto-dismiss 3s */ }
// tipos: "success" (verde), "error" (rojo), "info" (oscuro). Render fixed bottom-right.
```

---

## Cascada de taxonomía (Dept → Cat → Marca)

Ver el patrón canónico en `CLAUDE.md` § Taxonomía. Reglas:
- Cambiar Dept → resetear `categoria` y `marca`. Cambiar Cat → resetear `marca`.
- Selects/chips hijos deshabilitados hasta elegir el padre.
- `cats[].medusaId` (UUID) es el que va en `?category_id=` al backend; `cats[].id`/`depId`/`catId` son slugs para joins internos.

---

## Convenciones de nombres

- **Páginas:** `AdminXxx.tsx` (wrapper delgado que monta el módulo). Pantallas core: `Venta.tsx`, `Login.tsx`, `Corte.tsx`.
- **Módulos:** `XxxModule.jsx` (dueño del estado). Sub-componentes: `XxxTabla.jsx`, `XxxFiltros.jsx`, `XxxPreview.jsx`.
- **Paneles:** `XxxDrawer.jsx` (crear/editar), `XxxDeleteModal.jsx` (confirmación).
- **Funciones de cliente:** verbos en español — `buscarX`, `listarX`, `crearX`, `actualizarX`, `eliminarX`, `obtenerX`, `registrarX`.
- **localStorage keys:** prefijo `pos_` (`pos_clientes`, `pos_cartera`, `pos_grupos`, `pos_proveedores`, `pos_cajas_catalogo`, `pos_cajas_asignaciones`, `pos_sales_filters`).
- **CSS:** estilos centralizados en `apps/pos/src/pos.css` (no CSS-in-JS). Clases por área.
- **TS vs JSX:** componentes core nuevos en `.tsx`; varios módulos admin existentes en `.jsx`. Mantener la extensión del módulo al que perteneces.
- **Ubicación de módulos (inconsistente — verificar antes de importar):** los módulos más nuevos viven en `apps/pos/src/modules/` (`CashMovementsModule`, `EmployeesModule`, `SalesHistory`); otros viven en `apps/pos/src/components/` (`ArticlesModule`, `ComprasModule`, `PedidosModule`, `CatalogosModule`). No asumas la carpeta: confírmala con Glob.

---

## Persistencia de datos (cómo se guarda)

- **Productos / inventario / precios / categorías / imágenes:** BD de Medusa, vía `/caja/*` (que usan `query.graph`, `Modules.PRODUCT/INVENTORY/PRICING/FILE`).
- **Ventas / cortes / usuarios / ticket-config / folio / marcas-extra:** archivos JSON en `packages/api/data/` (cada ruta lee/escribe su archivo).
- **Clientes / cartera / proveedores / cajas / filtros de UI:** `localStorage` (provisional, por terminal — deuda a migrar).
- **Imágenes nuevas:** base64 → `/caja/imagen` → `Modules.FILE` (local hoy, S3 mañana). Nunca `fs.writeFileSync` directo.

---

## Endpoints (referencia rápida)

Todas las llamadas pasan por `lib/client.ts` → `/caja/*`. Lista completa de rutas y métodos en `CLAUDE.md` § Backend
y en `.claude/FERREMEX-SCHEMA.md`. No hagas `fetch` ad-hoc desde componentes.
