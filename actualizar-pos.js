#!/usr/bin/env node
/**
 * actualizar-pos.js — Aplica una versión nueva del POS en producción.
 *
 * El POS se sirve ESTÁTICO desde apps/pos/dist (lo sirve el API en /pos). Este
 * script reconstruye ese build y reinicia el API para que sirva la versión nueva.
 * El API corre en modo dev (medusa develop); no se compila aquí.
 *
 * Pasos:
 *   1. bun run build en apps/pos        → genera apps/pos/dist/pos/*
 *   2. copia dist/pos/index.html        → dist/index.html (para la detección de
 *      modo estático de Mercur y el fallback de rutas SPA; ver medusa-config.ts)
 *   3. pm2 restart ferremex-api         → el API re-detecta y sirve el nuevo dist
 *
 * Uso (desde C:\ferremex):   node actualizar-pos.js
 * NO hace git pull — versiona/actualiza el código tú antes si aplica.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const POS = path.join(ROOT, 'apps', 'pos')
const DIST = path.join(POS, 'dist')

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { cwd: cwd || ROOT, stdio: 'inherit', shell: true })
}

try {
  console.log('=== Actualizando POS (build estático) ===')

  // 1. Build del POS (genera dist/pos/ por el outDir en vite.config.ts).
  //    Usamos `vite build` directo, NO `bun run build` (que hace `tsc -b && vite
  //    build`): el `tsc -b` falla por dos copias duplicadas de vite en node_modules
  //    (deuda preexistente). Vite transpila con esbuild sin necesitar tsc; el
  //    typecheck se corre aparte con `tsc --noEmit` en desarrollo.
  run('npx vite build', POS)

  // 2. El index real debe estar también en dist/ (raíz) porque el vendor-ui de
  //    Mercur detecta el modo estático por <appDir>/index.html y usa ese mismo
  //    archivo como fallback de rutas SPA. appDir = apps/pos/dist.
  const src = path.join(DIST, 'pos', 'index.html')
  const dest = path.join(DIST, 'index.html')
  if (!fs.existsSync(src)) {
    throw new Error(`No se generó ${src} — ¿cambió el outDir del build?`)
  }
  fs.copyFileSync(src, dest)
  console.log(`\n✔ Copiado ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`)

  // 3. Reiniciar el API para que sirva el build nuevo.
  run('pm2 restart ferremex-api')

  console.log('\n✅ POS actualizado. Verifica en http://localhost:9000/pos/')
} catch (err) {
  console.error('\n❌ Falló la actualización del POS:', err.message)
  process.exit(1)
}
