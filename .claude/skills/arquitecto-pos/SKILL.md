---
name: arquitecto-pos
description: |
  Diseña E IMPLEMENTA módulos nuevos del POS Ferremex de forma que nazcan
  CABLEADOS al resto del sistema (client.ts, rutas /caja/*, pos-store, clientes,
  cartera, taxonomía, toasts) — nunca con botones o interfaces huérfanas.
  Úsala SIEMPRE que el usuario quiera crear, diseñar, planear o estructurar un
  módulo del POS, o diga "vamos a crear el módulo de…", "cómo debería funcionar…",
  "agrega una pantalla/panel/sección para…", o describa UI del POS (filtros,
  tablas, drawers, botones, flujos). El flujo es: analizar dependencias →
  investigar UX → proponer → iterar hasta aprobación → IMPLEMENTAR aquí mismo
  contra el Contrato de Conexión. No implementa hasta que el usuario apruebe el
  diseño explícitamente.
---

# Arquitecto POS — diseña e implementa módulos conectados

Esta skill existe por un problema concreto: antes los módulos se diseñaban en un
chat aparte que producía un prompt, y al construirlos salían **botones e
interfaces huérfanas** — sin cablear a `client.ts`, ni a la BD, ni a clientes,
ni a la taxonomía. Esta skill elimina ese hueco: el diseño y la implementación
ocurren **aquí**, y todo módulo nuevo debe cumplir el **Contrato de Conexión**
antes de darse por terminado.

Lee también, según el módulo: `CLAUDE.md` (reglas + impacto cruzado + taxonomía),
`.claude/FERREMEX-MODULES.md` (mapa), `.claude/FERREMEX-PREFERENCES.md` (patrones),
`.claude/FERREMEX-SCHEMA.md` (datos).

---

## Flujo de trabajo (no saltarse pasos)

```
0. DEPENDENCIAS  → qué entidades/datos/módulos previos necesita
1. INVESTIGAR    → UX del tipo de módulo (web) cuando aporte valor
2. PROPONER      → layout + flujo + componentes + sugerencias propias
3. ITERAR        → ajustar hasta aprobación EXPLÍCITA del usuario
4. IMPLEMENTAR   → construir aquí, cumpliendo el CONTRATO DE CONEXIÓN
5. VERIFICAR     → tsc filtrado + smoke en vivo + impacto cruzado
```

**Regla de oro:** nunca empezar a escribir código del módulo sin aprobación
explícita del diseño ("perfecto", "así está bien", "aprobado", "dale"). El
análisis de dependencias (paso 0) y la propuesta (paso 2) sí van sin pedir permiso.

---

## PASO 0 — Análisis de dependencias (SIEMPRE primero)

Antes de proponer nada, lista las **entidades de datos** que el módulo consume o
produce y, para cada una, dónde vive HOY en el POS (no inventes). Clasifica:

- 🔴 **BLOQUEANTE** — sin esto el módulo no tiene sentido. Construir primero.
- 🟡 **IMPORTANTE** — puede arrancar con datos parciales pero lo necesitará pronto.
- 🟢 **DESEABLE** — complementa, puede esperar.

Detecta cadenas (A necesita B que necesita C) y preséntalas ordenadas. Si hay
🔴 bloqueantes, **pregunta** si construimos primero esos o seguimos con un stub.

### Sub-paso 0B — Consolidación
Evalúa si algún módulo pequeño/acoplado conviene **integrarlo dentro** de otro
(tab/sección) en vez de crear navegación nueva. Consolidar si: siempre se
configura en contexto del padre, es 1–2 pantallas/<8 campos, nadie lo abriría
solo. NO consolidar si tiene ciclo de vida propio, lo usan varios padres, o es
complejo (filtros/búsqueda propios). Preséntalo como sugerencia, no decisión.

### Mapa de datos REAL del POS (de dónde sale cada cosa — NO inventar)

| Entidad | Dónde vive hoy | Cómo se accede |
|---|---|---|
| Productos / stock / precios / categorías / imágenes | 🟢 BD Medusa | `buscarProductos`, `listarArticulos`, `/caja/productos`, `/caja/articulos` |
| Taxonomía Dept→Cat→Marca | 🟢 BD Medusa | **`listarCatalogos()`** (única fuente — ver Taxonomía) |
| Clientes | 🟢 BD Medusa (Customer nativo) | `loadClientes()` / `client.ts` clientes API |
| Grupos de cliente | 🟢 BD (customer_group) | `loadGrupos()` / `/caja/grupos` |
| Cartera de crédito | 🟢 BD (módulo ferremex_cartera) | `loadCartera()`, `agregarMovimientoCredito()`, `/caja/cartera/*` |
| Ventas / cortes | 🟡 JSON (`packages/api/data/`) | `listarVentas`, `registrarVenta`, `cancelarVenta`, `/caja/ventas` |
| Usuarios / empleados POS | 🟡 JSON | `obtenerUsuarios`, `crearUsuario`, … `/caja/usuarios` |
| Pedidos a proveedor | 🟡 JSON | `listarPedidos`, … `/caja/pedidos` |
| Ticket / formatos / folio | 🟡 JSON | `obtenerTicketConfig`, `/caja/ticket-config`, `/caja/folio-contador` |
| Cajero activo / carrito / cliente activo / ticketConfig | estado global | `usePOS()` → `state.cajero`, `state.items`, `state.clienteActivo` |
| **Proveedores / Cajas** | 🔴 localStorage (deuda) | `lib/proveedores.ts`, `pos_cajas_*` — aún por migrar |

Si un módulo necesita una entidad que **no tiene endpoint** (p. ej. proveedores
en BD), eso es una dependencia 🔴/🟡 — decláralo, no inventes una ruta que no existe.

---

## PASO 1 — Investigación (cuando aporte)

Para tipos de módulo no triviales, investiga UX antes de proponer (WebSearch):
- `best UX patterns <tipo de módulo> POS retail`
- `<funcionalidad> admin panel design best practices`
Fuentes útiles: Nielsen Norman, Baymard, Shopify/Square/Toast POS.
**POS táctil:** targets ≥48×48px, regla de 3 taps, espaciado generoso (las
terminales se operan con el dedo). Salta este paso para módulos obvios/CRUD simples.

---

## PASO 2 — Propuesta + sugerencias propias

Presenta: **Layout** (zonas/columnas con dimensiones), **Flujo del usuario**
(numerado), **Componentes clave** (qué muestra / qué permite / cuándo aparece),
**Comportamientos** (vacíos, errores, confirmaciones, carga, validaciones).

Luego SIEMPRE propón mejoras propias, específicas y justificadas (no genéricas).
Marca con 🔗 si una sugerencia crea una dependencia nueva. Áreas a revisar:
estados vacíos, errores/recuperación, atajos de teclado, feedback inmediato
(toasts/spinners), consistencia con módulos existentes, confirmación antes de
acciones destructivas, optimistic UI, accesibilidad táctil.

Cierra con: *"¿Cambias, agregas o quitas algo antes de que lo implemente?"*

---

## PASO 3 — Iteración
Incorpora cada cambio al instante. Aprueba una sugerencia → intégrala. Rechaza →
quítala sin insistir. No asumas aprobación por silencio.

---

## PASO 4 — IMPLEMENTACIÓN (el corazón de esta skill)

Cuando el usuario apruebe, construye el módulo **aquí**. Sigue el patrón de
composición y, sobre todo, el **Contrato de Conexión** — sin él el módulo queda
huérfano.

### Patrón de composición POS (obligatorio)
```
AdminXxx.tsx   → página, wrapper delgado; solo monta <XxxModule />
XxxModule.jsx  → dueño del estado + lógica; renderiza sub-componentes
XxxTabla.jsx   → tabla presentacional pura (rows + callbacks por props)
XxxFiltros.jsx → panel de filtros; emite onChange
XxxDrawer.jsx  → crear/editar (panel lateral)
XxxDeleteModal.jsx → confirmación de borrado
```
Solo el Module tiene estado. Páginas core: `Venta.tsx`, `Login.tsx`, `Corte.tsx`.

### Ubicación y extensión (verificar, no asumir)
Módulos nuevos viven unos en `apps/pos/src/modules/`, otros en `components/`.
**Confirma con Glob** antes de importar. Componentes core nuevos en `.tsx`;
si extiendes un módulo `.jsx`, mantén `.jsx`.

### 🔌 CONTRATO DE CONEXIÓN (checklist — todo módulo nuevo lo cumple)

Cada elemento interactivo del módulo debe estar cableado. Antes de declarar el
módulo terminado, recorre esta lista y NO dejes ningún punto en "mock/TODO":

1. **Datos = `lib/client.ts`, nunca `fetch` ad-hoc.** Toda llamada al backend
   pasa por una función de `client.ts` (`buscarX/listarX/crearX/...`). Si la
   función no existe, créala en `client.ts` (con `apiFetch` + `posHeaders()`) y
   apunta a una ruta `/caja/*`. Nada de `fetch("/...")` dentro de un componente.

2. **Backend = ruta `/caja/*`** (NO `/store/`, NO importar `cors`). Métodos
   mutantes (POST/PUT/PATCH/DELETE) quedan cubiertos por el middleware del token
   `X-POS-Token` automáticamente (matcher `/caja/*`). Persistencia: BD Medusa >
   JSON (`lib/json-store`: `readJson`/`writeJsonAtomic`/`withFileLock`) >
   localStorage (solo provisional de fase, prefijo `pos_`).

3. **Estado global = `usePOS()`** para cajero/carrito/cliente activo/ticketConfig.
   No dupliques ese estado en local. `clienteActivo.id` es el `customer.id` de Medusa.

4. **Cada botón hace algo real.** Ningún `onClick` vacío, ningún botón decorativo.
   Si un botón "Guardar/Eliminar/Generar" no llama a su función de `client.ts`,
   el módulo NO está terminado. Acciones destructivas → modal de confirmación
   (`ConfirmDialog.jsx` o `XxxDeleteModal.jsx`), nunca `window.confirm`/`alert`.

5. **Navegación = `useNavigate()`** declarado en el componente. Si pones
   `onClick={() => navigate(...)}`, asegúrate de `const navigate = useNavigate()`.
   Guardias de acceso en render = `<Navigate to=… replace />`, NO `navigate()` en
   el cuerpo. (Este fue un bug real: guardias correctas pero handlers sin el hook.)

6. **Taxonomía Dept→Cat→Marca = `listarCatalogos()`** siempre. Nunca
   `buscarCategorias()` para jerarquía, ni listas hardcodeadas, ni derivar marcas
   de `listarArticulos`. Cascada: cambiar Dept resetea Cat+Marca; `cats[].medusaId`
   (UUID) es el que va en `?category_id=`. (Ver CLAUDE.md § Taxonomía.)

7. **Feedback = `useToasts()`** (`hooks/useToasts`): `{ toasts, push }`,
   `push(msg, "success"|"error"|"info")`, auto-dismiss 3s, render fixed
   bottom-right. Estados de carga y vacío explícitos (no pantallas en blanco).

8. **Helpers compartidos:** `formatMXN` (`lib/format`), `uuid` (`lib/utils` —
   solo para keys/borradores locales; los ids reales los da el backend),
   `ConfirmDialog`. No re-implementes lo que ya existe.

9. **ANÁLISIS DE IMPACTO CRUZADO (obligatorio).** Si el módulo toca un sistema
   compartido (`listarCatalogos`, `client.ts`, `pos-store`, cartera/clientes,
   ventas, `ArticuloPOS`, token POS, taxonomía…), antes de cambiarlo lista TODOS
   sus consumidores actuales (tabla en CLAUDE.md) y **pregunta** si actualizamos
   esos también. No continúes hasta tener respuesta.

10. **Si tocaste rutas/tipos del backend** que alimentan `@acme/api/_generated`,
    nota que el codegen de Mercur corre al reiniciar el API; `/caja/*` aparece ahí
    pero el POS no lo consume (usa `client.ts` directo).

### Snippets de referencia (copiar el patrón, no inventar otro)

```ts
// client.ts — nueva llamada (mutante lleva token vía posHeaders dentro de apiFetch)
export async function listarChambas(): Promise<Chamba[]> {
  return apiFetch<Chamba[]>("/caja/chambas")
}
export async function crearChamba(data: Omit<Chamba,"id">): Promise<Chamba> {
  return apiFetch<Chamba>("/caja/chambas", { method: "POST", body: JSON.stringify(data) })
}
```
```jsx
// Módulo — carga async + toasts + estados (patrón estándar)
const { toasts, push } = useToasts()
const [items, setItems] = useState([])
const [cargando, setCargando] = useState(true)
useEffect(() => { let on=true
  ;(async () => { try { const d = await listarChambas(); if(on) setItems(d) }
    catch(e){ if(on) push("No se pudo cargar","error") } finally { if(on) setCargando(false) } })()
  return () => { on=false } }, [])
```
```ts
// ruta backend /caja/* (resolver módulos nativos así)
const customerModule = req.scope.resolve(Modules.CUSTOMER)
// JSON seguro: import { updateJson } from "../../../lib/json-store"
```

---

## PASO 5 — Verificación
- **Backend:** `cd packages/api && bun x tsc --noEmit -p tsconfig.json` filtrado a
  tus archivos (el build completo NO compila de fábrica — deuda preexistente; no
  uses `bun run build` como gate). Smoke con `curl` a los endpoints nuevos.
- **Frontend:** typecheck POS filtrado (ignora ruido `TS7016` de `.jsx`). El POS
  corre por **Vite dev (PM2 `ferremex-pos`, HTTPS `https://localhost:7002/pos`)**
  con HMR — verifica en pantalla, no con build. Si Vite cachea un error viejo de
  dep-scan, `pm2 restart ferremex-pos`.
- **Recorre el Contrato de Conexión** punto por punto sobre el módulo terminado.
- Si todo bien, ofrece commitear y actualizar `.claude/FERREMEX-MODULES.md`
  (agente `doc-updater`).

---

## Stack y herramientas de UI

**Stack real (verificado):** React 18 + Vite 5 + TS · **Tailwind v4** instalado
(`@tailwindcss/vite`, `@import "tailwindcss"` + `@theme` en `apps/pos/src/pos.css`)
· `lucide-react` instalado (iconos) · `bun` · monorepo Turborepo, POS en `apps/pos`
· dev `https://localhost:7002/pos` vía PM2 · backend proxy `localhost:9000`.

**CSS — dos sistemas coexisten (no romper el viejo):**
- Módulos **antiguos** (ConsultarCompras, SalesHistory, CarteraCredito, etc.) usan
  CSS propio en `pos.css` (clases `.ar-*`, `.admin-*`, `.ac-*`) o inline styles.
  **No los migres** a Tailwind sin pedirlo: funcionan.
- Módulos **nuevos**: Tailwind v4 con tokens Ferremex. Mantén coherencia visual
  con los existentes (mismo naranja, mismas formas).

**Tokens y clases estándar (táctil — targets ≥48px):**
```
Naranja Ferremex:  bg-orange-600 / hover:bg-orange-700   (#F96302 / #d95500)
Botón primario:    bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700
Botón secundario:  bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50
Botón peligro:     text-red-600 border border-red-200 px-4 py-2.5 rounded-lg text-sm hover:bg-red-50
Input:             border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500
Card/panel:        bg-white border border-gray-200 rounded-lg
Fondo:             bg-gray-50   Texto: text-gray-900 / text-gray-500 / text-gray-400
Selección activa:  bg-orange-50 border-l-2 border-orange-600
Disabled:          opacity-40 pointer-events-none
```
Iconos: **siempre `lucide-react`** (`import { Plus, Search, Trash2 } from "lucide-react"`).
Para íconos en el sidebar admin van dentro de `<span className="admin-side-icon">`
(hereda `currentColor` → se ponen naranja en el item activo). Tamaño 18 sidebar, 16 inline.

**⚠️ Gotcha Tailwind v4 — capas de CSS (ya resuelto, no reintroducir):**
`apps/pos/src/pos.css` tenía un reset `* { padding: 0 }` SIN capa. En Tailwind v4
el CSS sin `@layer` SIEMPRE vence a las utilidades (que viven en `@layer utilities`),
así que ese reset anulaba `px-8`, `pl-8`, `py-3`… y los módulos Tailwind salían con
el contenido aplastado contra la orilla. Solución aplicada: el reset de padding vive
en `@layer base` (`ul, ol, fieldset, button, input, select, textarea { padding: 0 }`),
de modo que las utilidades de Tailwind ganan y los módulos viejos (reglas propias sin
capa) no se afectan. **No vuelvas a poner `padding` en el selector `*` global.** Si una
clase de padding/margin Tailwind "no hace nada" en un módulo nuevo, sospecha de una
regla sin capa que la está venciendo, no agregues `!important`.

**Librerías opcionales (instalar la 1ª vez que un módulo las necesite — NO están aún):**
- **TanStack Table** (`@tanstack/react-table`) — para tablas con orden/filtro/
  paginación no triviales (inventario grande, consultas). Headless: la lógica la
  pone la librería, el CSS lo pones tú con Tailwind. Instalar:
  `cd apps/pos && bun add @tanstack/react-table`. Para tablas simples, sigue
  bastando el patrón `useMemo` + slice de `FERREMEX-PREFERENCES.md`.
- **shadcn/ui** (sobre Radix, copy-paste, sin runtime) — para primitivos
  accesibles consistentes (Dialog, Drawer, Select, DropdownMenu, Popover) cuando
  un módulo necesite overlays/menús ricos. Requiere setup la 1ª vez
  (`clsx`, `tailwind-merge`, `class-variance-authority` + copiar el componente).
  Antes de añadirlo, **pregunta**: para confirmaciones simples ya tenemos
  `ConfirmDialog.jsx`; shadcn vale la pena cuando hay varios overlays nuevos.

**Cuándo usar qué:**
- Confirmación destructiva simple → `ConfirmDialog.jsx` (ya existe).
- Tabla CRUD chica/mediana → patrón `useMemo`+slice (PREFERENCES).
- Tabla con orden multi-columna / filtro por columna / muchos datos → TanStack Table.
- Varios overlays/menús/selects accesibles nuevos → evaluar shadcn/ui (preguntar).
- Iconos → lucide-react. Formato moneda → `formatMXN`.

---

## Referencia rápida por tipo de módulo
- **Catálogo/CRUD:** Miller Columns si jerarquía 3+ niveles · lista+panel lateral
  si plano con detalle rico · tabla full-width si es lectura/filtrado.
- **Transacción (venta/compra/pedido):** 3 columnas (búsqueda | trabajo | resumen)
  · footer fijo con totales+acciones · inline editing para velocidad.
- **Reporte/consulta:** filtros en sidebar colapsable · tabla ordenable · export/print en toolbar.
- **Configuración:** tabs o sección izquierda · guardado explícito (no auto-save) · preview cuando aplique.

---

## Auto-mantenimiento de la skill
Si modificas esta skill, edita directamente `.claude/skills/arquitecto-pos/SKILL.md`
(es invocable como `/arquitecto-pos` en Claude Code) y avisa al usuario del cambio.
Tras crear un módulo nuevo, ofrece actualizar `.claude/FERREMEX-MODULES.md` y, si
aplica, `FERREMEX-STATE.md`/`SCHEMA.md` con el agente `doc-updater`.
