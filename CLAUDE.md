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
  /generador    → Ticket generator / peripheral config tester
```

### State management (`apps/pos/src/lib/pos-store.ts`)

React Context + useReducer. Key state: `cajero`, `items` (cart), `ticketConfig`, `clienteActivo`. No Redux. `buildTurnoId()` generates shift IDs in the format `YYYY-MM-DD-m` or `-t`.

### Data persistence

- **Clientes**: `localStorage` (`pos_clientes`, `pos_grupos`) — NOT in Medusa DB yet.
- **Ventas / cortes / usuarios / ticket-config**: JSON files at `packages/api/data/*.json`.

### Client library

All backend calls go through `apps/pos/src/lib/client.ts` which hits `/caja/*` endpoints. The Vite dev server proxies `/caja` and `/static` to `localhost:9000`.

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
| GET/POST/PUT/DELETE | `/caja/articulos` | Product CRUD for admin (ArticlesModule). Full ArticuloPOS mapping. |
| GET/PUT | `/caja/ticket-config` | Ticket header/footer/print options. Handles legacy field migration. |

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

### Mercur CLI (run from project root, where `blocks.json` lives)

```bash
npx @mercurjs/cli@latest search --query <keyword>   # search the block registry
npx @mercurjs/cli add <block-name>                   # install a block
```

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
