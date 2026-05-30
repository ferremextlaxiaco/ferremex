#!/usr/bin/env node
/**
 * Ferremex — Hook SessionStart (memoria de sesión)
 *
 * Autocontenido: solo módulos nativos de Node (fs, path). Multiplataforma.
 * Inspirado en ECC (scripts/hooks/session-start.js) pero SIN su árbol de dependencias.
 *
 * Al iniciar una sesión, busca el resumen más reciente en <repo>/.claude/sessions/ y lo imprime
 * a stdout para inyectarlo como contexto. Nunca bloquea (siempre exit 0).
 *
 * No depende de stdin (lo drena por compatibilidad pero no lo necesita).
 *
 * Controles por entorno:
 *   FERREMEX_SESSION_CONTEXT=off   → desactiva la inyección.
 *   FERREMEX_SESSION_MAX_CHARS=N   → límite de caracteres a inyectar (default 6000).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_CHARS = 6000;

function isDisabled() {
  const v = String(process.env.FERREMEX_SESSION_CONTEXT || '').trim().toLowerCase();
  return ['0', 'false', 'off', 'none', 'disabled'].includes(v);
}

function maxChars() {
  const raw = process.env.FERREMEX_SESSION_MAX_CHARS;
  if (!raw) return DEFAULT_MAX_CHARS;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_CHARS;
}

// Drena stdin sin bloquear (no se usa su contenido, pero algunos runners lo envían).
function drainStdin() {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try {
      process.stdin.on('data', () => {});
      process.stdin.on('end', done);
      process.stdin.on('error', done);
      setTimeout(done, 300);
    } catch { done(); }
  });
}

function findLatestSession(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return null; }
  const sessions = entries.filter((f) => f.endsWith('-session.md'));
  if (!sessions.length) return null;

  let best = null;
  for (const name of sessions) {
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!best || stat.mtimeMs > best.mtimeMs) best = { full, name, mtimeMs: stat.mtimeMs };
  }
  return best;
}

async function main() {
  await drainStdin();

  if (isDisabled()) return;

  const dir = path.join(process.cwd(), '.claude', 'sessions');
  const latest = findLatestSession(dir);
  if (!latest) return;

  let content = '';
  try { content = fs.readFileSync(latest.full, 'utf8'); } catch { return; }
  if (!content.trim()) return;

  const limit = maxChars();
  let body = content;
  if (limit > 0 && body.length > limit) {
    body = body.slice(0, limit) + '\n\n…(resumen truncado)…';
  }

  const out = [
    '## Contexto de la sesión anterior (Ferremex)',
    `> Recuperado de .claude/sessions/${latest.name}`,
    '',
    body,
    '',
    '---',
    'Continúa desde aquí. Lee `.claude/FERREMEX-STATE.md` y `CLAUDE.md` si necesitas más contexto.',
    '',
  ].join('\n');

  process.stdout.write(out);
}

main().catch(() => {}).finally(() => process.exit(0));
