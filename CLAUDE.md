# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project: Ferremex

Ferremex is a hardware store (ferretería) in Tlaxiaco, Oaxaca, México, building an e-commerce and POS platform on top of Mercur (a Medusa 2.x marketplace framework). The stack runs locally on a Windows machine and is also accessed from store terminals on the local network (`192.168.1.105`).

**Phase status:** Fase 0 (infrastructure) is complete. See `MEMORIA_INSTALACIÓN.md` for current phase tracking and `CLAUDE CONTEXTO FERREMEX.md` for business context and n8n automation rules.

---

## Architecture Overview

This is a **Turborepo monorepo** managed with **bun** (`bun@1.3.11`):

```
packages/api/       → MedusaJS 2.x backend (port 9000)
apps/admin/         → Admin dashboard (Vite dev server, port 7000)
apps/vendor/        → Vendor portal (served by the API proxy)
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

Processes are managed via PM2 using `ecosystem.config.js`. The launchers are Node.js scripts (`launch-api.js`, `launch-admin.js`) — **not `.bat` files**, which failed on auto-restart.

```bash
pm2 start ecosystem.config.js   # start both processes
pm2 status                       # check running processes
pm2 logs                         # tail logs for all processes
pm2 restart ferremex-api         # restart a single process
```

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

See `.claude/lessons.md` for the full list. Critical items:

- **Admin panel requires Vite first**: Start the Vite dev server (`ferremex-admin` in PM2) before the API. The API proxies Vite — if Vite isn't up, the dashboard returns errors.
- **`base: '/dashboard'` is required**: If removed from `apps/admin/vite.config.ts`, Vite asset paths break under the API proxy.
- **PM2 launchers must be `.js` files**: `.bat` launchers caused infinite restart loops. The current `launch-api.js` / `launch-admin.js` approach is stable.
- **Codegen**: Run `dev:codegen` from `packages/api` after changing route paths or request/response types that feed `@acme/api/_generated`.

---

## Access URLs

| Surface | Local | LAN (store terminals) |
|---|---|---|
| Login / Admin panel | http://localhost:9000/login | http://192.168.1.105:9000/login |
| Admin orders | http://localhost:9000/orders | http://192.168.1.105:9000/orders |
| Vendor portal | http://localhost:9000/seller | http://192.168.1.105:9000/seller |

---

## AI Resources

- **Docs**: https://docs.mercurjs.com
- **MCP Server**: https://docs.mercurjs.com/mcp
- **llms.txt**: https://docs.mercurjs.com/llms.txt
