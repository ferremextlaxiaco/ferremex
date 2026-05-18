# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project: Ferremex

Ferremex is a hardware store (ferretería) in Tlaxiaco, Oaxaca, México, building an e-commerce and POS platform on top of Mercur (a Medusa 2.x marketplace framework). The stack runs locally on a Windows machine and is also accessed from store terminals on the local network (`192.168.1.105`).

**Phase status:** Fases 0–1 complete; Fase 2 (POS de mostrador) is in progress. See `MEMORIA_INSTALACIÓN.md` for current phase tracking and `CLAUDE CONTEXTO FERREMEX.md` for business context and n8n automation rules.

---

## Principio de Desarrollo — Arquitectura Robusta

**Toda implementación debe usar la arquitectura nativa de Medusa 2.x**, no soluciones ad-hoc que luego haya que migrar.

Antes de escribir código personalizado, verifica si Medusa ya resuelve el problema:
- **Archivos / imágenes** → `Modules.FILE` + `@medusajs/medusa/file-local` (hoy) / `file-s3` (mañana). Nunca `fs.writeFileSync` directo.
- **Imágenes de productos** → `product.images[]` (campo nativo). Nunca `metadata.imagenes`.
- **Precios** → price sets via `query.graph`. Nunca precios en metadata.
- **Inventario** → módulo `Modules.INVENTORY`. Nunca contadores manuales.
- **Clientes / pedidos** → módulos de Medusa cuando se migre de localStorage.

La regla de oro: si algo puede resolverse con un módulo de Medusa, úsalo — aunque parezca más trabajo ahora. Cambiar el provider (local → S3, local → Stripe, etc.) debe ser solo un cambio de config, no de código.

---

## Architecture Overview

This is a **Turborepo monorepo** managed with **bun** (`bun@1.3.11`):

```
packages/api/       → MedusaJS 2.x backend (port 9000)
apps/admin/         → Admin dashboard (Vite dev server, port 7000)
apps/vendor/        → Vendor portal (served by the API proxy)
apps/pos/           → POS de mostrador (Vite dev server, port 7002)
```

### How the dashboards are served

- The API (`packages/api`) **proxies** the Vite dev server on port 7000 to serve the admin UI at `/dashboard`.
- `apps/admin/vite.config.ts` **must** have `base: '/dashboard'` — without it, Vite injects asset paths without the prefix and the proxy breaks.
- The vendor portal is served at `/seller` from `apps/vendor` (the API's `appDir` points to the directory, not a built dist).
- The built admin goes to `apps/admin/dist`; `medusa-config.ts` points `appDir` there for production.
- Medusa's default admin is **disabled** (`admin: { disable: true }`) — Mercur's `admin-ui` and `vendor-ui` modules replace it.

### Key config file

`packages/api/medusa-config.ts` is the central config — it wires dashboard paths, CORS origins, Redis, PostgreSQL, RBAC, and all plugins. Touch it when adding modules, changing dashboard paths, or updating CORS.

### Process management (PM2)

Processes are managed via PM2 using `ecosystem.config.js`. The launchers are Node.js scripts (`launch-api.js`, `launch-admin.js`, `launch-pos.js`) — **not `.bat` files**, which failed on auto-restart.

```bash
pm2 start ecosystem.config.js   # start all three processes
pm2 status                       # check running processes
pm2 logs                         # tail logs for all processes
pm2 restart ferremex-api         # restart a single process
```

---

## POS App (Fase 2)

The POS lives at `apps/pos/` (Vite, port 7002, `base: "/pos"`). It is a standalone React 18 app with React Router 6.

### Route structure

```
/pos/           → Login — cajero selection by name + PIN
/pos/venta      → Main sale screen: search + cart + checkout
/pos/corte      → Shift closing / cash count
/pos/admin      → Admin shell (requires permisos.puede_ver_admin)
  /tickets      → Ticket format config + live preview
  /usuarios     → POS user management
  /clientes     → Customer CRUD
  /articulos    → Article/product CRUD (ArticlesModule)
  /inventario   → Bulk inventory adjustment by SKU
  /proveedores  → Supplier management
  /compras      → Purchase orders (ComprasModule — frontend-only, phase 2)
  /pedidos      → Supplier order creation (PedidosModule — frontend-only, mock data, no backend route yet)
  /generador    → Ticket generator / peripheral config tester
```

### POS component composition pattern

All admin modules follow the same structure — copy it when building new features:

```
AdminXxx.tsx (page)         → thin wrapper, just mounts <XxxModule />
XxxModule.jsx (module)      → owns state + business logic, renders the three sub-components
XxxTabla.jsx (table)        → pure presentational table, receives rows + callbacks as props
XxxFiltros.jsx (filters)    → filter/search panel, emits onChange
XxxPreview.jsx (modal/panel)→ read-only detail view or edit overlay
```

Side panels that create/edit items are `XxxDrawer.jsx`; delete confirmations are `XxxDeleteModal.jsx`. Only the Module component has state; sub-components are presentational.

### State management (`apps/pos/src/lib/pos-store.ts`)

React Context + useReducer. Key state: `cajero`, `items` (cart), `ticketConfig`, `clienteActivo`. No Redux. `buildTurnoId()` generates shift IDs in the format `YYYY-MM-DD-m` or `-t`.

### Data persistence

- **Clientes**: `localStorage` (`pos_clientes`, `pos_grupos`) — NOT in Medusa DB yet.
- **Ventas / cortes / usuarios / ticket-config**: JSON files at `packages/api/data/*.json`.

### Client library

All backend calls go through `apps/pos/src/lib/client.ts` which hits `/caja/*` endpoints. The Vite dev server proxies `/caja` and `/static` to `localhost:9000`.

### POS helper libraries (`apps/pos/src/lib/`)

- `client.ts` — all `/caja/*` fetch calls. Key functions: `buscarProductos`, `registrarVenta`, `obtenerCorte/cerrarCorte`, `listarArticulos`, `listarFaltantes` (articles below min stock, hits `/caja/articulos?faltantes=1`), `crearArticulo/actualizarArticulo/eliminarArticulo`, `subirImagenArticulo`.
- `pos-store.ts` — global state (Context + useReducer)
- `clientes.ts` — localStorage client list (`pos_clientes`, `pos_grupos`)
- `proveedores.ts` — supplier data (in-memory, phase 2)
- `serial.ts` — ESC/POS printer + cash drawer (Chrome/Web Serial)
- `unidades-sat.ts` — SAT unit-of-measure definitions for product catalog

### ESC/POS and cash drawer

`apps/pos/src/lib/serial.ts` uses **Web Serial API** (Chrome only — does not work in Firefox or Safari). It sends ESC/POS commands directly to the thermal printer for receipts and `[0x1B, 0x70, 0x00, 0x19, 0x19]` to open the cash drawer.

---

## Backend — `/caja/` Routes

POS routes live at `packages/api/src/api/caja/` and do NOT go under `/store/` (which requires `x-publishable-api-key`). CORS for `/caja/*` is handled by the Vite proxy in dev (no explicit `cors` package needed).

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/caja/productos` | Product search for POS (q, sku, category_id, departamento). Phonetic Spanish search. Returns stock + price. |
| GET | `/caja/categorias` | List categories + departamentos extracted from metadata. |
| POST | `/caja/ventas` | Record a sale. Decrements inventory. Generates folio `POS-YYYYMMDD-XXXX`. |
| GET | `/caja/corte` | Sales summary for a shift (cajero + turno_id). |
| POST | `/caja/corte` | Close shift. |
| GET/POST/PUT/DELETE | `/caja/usuarios` | POS user CRUD. Enforces at least one active admin. |
| GET/POST/PUT/DELETE | `/caja/articulos` | Product CRUD for admin (ArticlesModule). Full ArticuloPOS mapping. `?faltantes=1` returns items below `inventarioMin` (used by PedidosModule). |
| GET/PUT | `/caja/ticket-config` | Ticket header/footer/print options. Handles legacy field migration. |
| POST | `/caja/imagen` | Upload base64 product thumbnail via Medusa File Module. Returns `{ url }`. |
| POST | `/caja/ajuste-inventario` | Bulk stock correction by SKU. Body: `{ ajustes: [{ sku, nueva_cantidad }] }`. Returns `{ ok, actualizados, errores }`. |

### Product pricing model

Products have **4 price tiers** (`precio1`–`precio4`): Mostrador / Cliente / Distribuidor / Especial. Price tier is selected per sale by `clienteActivo.num_precio`. Prices are stored as Medusa price sets (MXN). The articulos route fetches them via `query.graph` with variant IDs.

---

## Commands

All commands use `bun` as the package manager.

### From the project root (Turborepo)

```bash
bun run dev          # start all packages in dev mode (turbo)
bun run build        # build all packages
bun run lint         # lint all packages
bun run check-types  # typecheck all packages
bun run format       # format all .ts/.tsx/.md files with prettier
```

### From `packages/api`

```bash
bun run dev                        # medusa develop (watches + hot reload)
bun run build                      # medusa build
bun run seed                       # seed the database (MXN currency, México region)
bun run test:unit                  # unit tests
bun run test:integration:http      # HTTP integration tests
bun run test:integration:modules   # module-level integration tests
```

### From `packages/api` — Catalog & Inventory scripts (Fase 1)

```bash
bun run import:productos        # import/update catalog from articulosExportados.xlsx (root)
bun run attach:imagenes         # assign thumbnails from "Imagenes de productos/" folder
bun run reparar:inventario      # create inventory items + variant links + stock levels (one-time)
bun run actualizar:localizacion # sync metadata.localizacion from RepExistencias.xlsx (col "Loc.")
```

Images are copied to `packages/api/static/` and served at `http://localhost:9000/static/`.
Source files (`articulosExportados.xlsx`, `RepExistencias.xlsx`, image folder) live at the repo root and are git-ignored.

### From `packages/api` — SAT catalog scripts (Fase 2)

```bash
bun run importar:claves-sat     # import SAT product codes from ArticulosClaveSat.xlsx (root)
bun run generar:catalogo-sat    # download full SAT catalog → packages/api/static/claves-sat.json
bun run asignar:precios         # bulk price assignment across product catalog
```

`claves-sat.json` (~52 k entries) is served at `/static/claves-sat.json` and consumed by the POS articulos admin for SAT compliance.

### Mercur CLI (run from project root, where `blocks.json` lives)

```bash
npx @mercurjs/cli@latest search --query <keyword>   # search the block registry
npx @mercurjs/cli add <block-name>                   # install a block
```

---

## Environment Variables (`packages/api/.env`)

**Required (no defaults — the app will not start without these):**

| Variable | Example |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:pass@localhost:5432/ferremex` |
| `REDIS_URL` | `redis://localhost:6379` |
| `STORE_CORS` | `http://localhost:8000,http://localhost:7002` |
| `ADMIN_CORS` | `http://localhost:7000,http://localhost:9000` |
| `AUTH_CORS` | `http://localhost:7000,http://localhost:7001,http://localhost:7002,http://localhost:9000` |
| `VENDOR_CORS` | `http://localhost:7001` |

**Optional (safe defaults exist):**

| Variable | Default |
|---|---|
| `JWT_SECRET` | `"supersecret"` |
| `COOKIE_SECRET` | `"supersecret"` |
| `BACKEND_URL` | `http://localhost:9000` |

The PM2 launcher `launch-api.js` appends `C:\Program Files\PostgreSQL\16\bin` to `PATH` so Medusa migrations can find `pg_dump`/`psql`. PostgreSQL 16 must be installed in that standard location.

---

## Task Router

Before touching code, read the area guide:

- **Backend** (routes, modules, workflows, links, subscribers, jobs): `packages/api/CLAUDE.md`
- **Admin UI** (custom pages, forms, tabs): `apps/admin/CLAUDE.md`
- **Vendor UI** (vendor pages and flows): `apps/vendor/CLAUDE.md`
- **POS** (caja routes + React app): this file + `MEMORIA_INSTALACIÓN.md`

## Adding Features — Registry First

Search the Mercur block registry before building anything custom. Many features (reviews, notifications, approvals, chat, CSV import) already exist as blocks.

```bash
npx @mercurjs/cli@latest search --query <keyword>
```

Use the `mercur-blocks` skill when a registry block looks like a match.

---

## Starter Contract Surfaces

Do not change these silently — they affect the whole system:

- `blocks.json` — block aliases and registry config
- `packages/api/medusa-config.ts` — modules, CORS, dashboard wiring
- `packages/api/src/*` — backend entrypoints
- `@acme/api/_generated` — route types (codegen-dependent)
- `apps/admin/src/*` and `apps/vendor/src/*` — page and route structure
- `apps/admin/vite.config.ts` — must keep `base: '/dashboard'`
- `apps/vendor/vite.config.ts` — Vite bootstrap for vendor panel
- `apps/pos/vite.config.ts` — must keep `base: '/pos'` and proxy `/caja` + `/static`

---

## Shared Skills

Skills live in `.claude/skills/`. Load the matching one before non-trivial work:

| Skill | When to use |
|---|---|
| `mercur-blocks` | Installing or evaluating registry blocks |
| `mercur-cli` | CLI commands (`create`, `init`, `add`, `search`) |
| `medusa-ui-conformance` | New reusable UI components or primitives |
| `dashboard-page-ui` | Custom admin/vendor pages |
| `dashboard-form-ui` | Custom forms |
| `dashboard-tab-ui` | Tabbed wizard workflows |
| `migration-guide` | Migrating from Mercur 1.x to 2.0 |
| `actualizador` | Update `MEMORIA_INSTALACIÓN.md` after a work session |

---

## Known Gotchas

- **Admin panel requires Vite first**: Start the Vite dev server (`ferremex-admin` in PM2) before the API. The API proxies Vite — if Vite isn't up, the dashboard returns errors.
- **`base: '/dashboard'` is required**: If removed from `apps/admin/vite.config.ts`, Vite asset paths break under the API proxy.
- **PM2 launchers must be `.js` files**: `.bat` launchers caused infinite restart loops. The current `launch-api.js` / `launch-admin.js` / `launch-pos.js` approach is stable.
- **Codegen**: Run `dev:codegen` from `packages/api` after changing route paths or request/response types that feed `@acme/api/_generated`.
- **`createProducts()` does not create inventory**: Calling `productModule.createProducts()` directly skips inventory item creation. Use the HTTP workflow endpoint, or run `reparar:inventario` afterwards.
- **`updateProducts()` signature**: `productModule.updateProducts([{id, ...}])` (array form) throws `Product.0` errors. Correct call is `updateProducts(id, data)` (single item form).
- **xlsx import**: Use `require()` instead of dynamic `import()` for the `xlsx` package — ESM/CJS incompatibility with Medusa's build pipeline.
- **POS `/caja/*` must not import the `cors` npm package**: The Vite proxy already resolves cross-origin in dev. Adding `import cors from 'cors'` to middlewares fails at runtime because the package isn't installed in the Medusa workspace.
- **Medusa 2.x prices are not a direct relation**: `ProductVariant` does not have a `prices` property. Fetch prices via `query.graph` with `entity: "product_variant"` and variant IDs as a separate query.
- **Web Serial API = Chrome only**: The cash drawer and direct ESC/POS printing in `serial.ts` require Chrome (or Chromium). POS terminals must use Chrome.
- **Clientes are in localStorage, not Medusa DB**: `clientes.ts` reads/writes `localStorage` (`pos_clientes`, `pos_grupos`). Data lives in the browser — each POS terminal has its own client list until Fase 4 migrates this to the database.
- **POS is mounted as a `vendor-ui` module** in `medusa-config.ts` with `viteDevServerPort: 7002` (`@ts-expect-error` suppresses the non-standard option). The port must stay in sync with the `--port 7002` flag in `apps/pos/package.json`'s `dev` script.
- **PM2 start order matters**: `ferremex-admin` and `ferremex-pos` (Vite) must be running before `ferremex-api`. The API proxies both — if Vite is down at startup, `/dashboard` and `/pos` return errors.
- **blocks.json aliases** control where Mercur CLI places installed block files: `api` → `packages/api/src`, `vendor` → `apps/vendor/src`, `admin` → `apps/admin/src`. Update these if the directory structure changes.
- **PedidosModule uses hardcoded mock data**: `PROVEEDORES`, `ARTICULOS`, and `HISTORIAL_MOCK` arrays are defined inline in `PedidosModule.jsx`. There is no `/caja/pedidos` backend route yet. When wiring the backend, replace the mocks with `client.ts` calls and create the route under `packages/api/src/api/caja/pedidos/`.

---

## Access URLs

| Surface | Local | LAN (store terminals) |
|---|---|---|
| Login / Admin panel | http://localhost:9000/login | http://192.168.1.105:9000/login |
| Admin orders | http://localhost:9000/orders | http://192.168.1.105:9000/orders |
| Vendor portal | http://localhost:9000/seller | http://192.168.1.105:9000/seller |
| POS | http://localhost:7002/pos/ | http://192.168.1.105:7002/pos/ |

---

## n8n Automation Layer

n8n runs in Docker Desktop at `http://localhost:5678` (dev/test only). Production workflows live on a separate VPS — never activate a workflow on the VPS without testing locally first.

Full rules in `CLAUDE CONTEXTO FERREMEX.md`. Key points:
- **Active workflow**: "Automatización de Facturas" (ID: `DZ2HVxs6Lxl3OnP3`) — monitors Gmail for supplier invoices, sorts PDFs/XMLs into `/facturas/año/mes/Proveedor/`.
- **Inactive workflow**: "Descarga Facturas Truper" (ID: `MKUgZ9Oa5oiVyysZ`) — downloads invoices from Truper's REST API.
- n8n MCP (`n8n-mcp`) is configured to point at localhost only. Never wire it to the production VPS.
- Node names must be descriptive Spanish (e.g. "Descargar PDF", not "HTTP Request"). All non-obvious nodes need an explanatory note.

---

## AI Resources

- **Docs**: https://docs.mercurjs.com
- **MCP Server**: https://docs.mercurjs.com/mcp
- **llms.txt**: https://docs.mercurjs.com/llms.txt
