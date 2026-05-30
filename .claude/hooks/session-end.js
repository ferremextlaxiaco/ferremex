#!/usr/bin/env node
/**
 * Ferremex — Hook SessionEnd / Stop (memoria de sesión)
 *
 * Autocontenido: solo módulos nativos de Node (fs, path). Multiplataforma (Windows/macOS/Linux).
 * Inspirado en el diseño de ECC (scripts/hooks/session-end.js) pero SIN su árbol de dependencias.
 *
 * Disparado en Stop (tras cada respuesta) y/o SessionEnd. Lee el JSON del hook por stdin
 * (incluye transcript_path), extrae un resumen del transcript JSONL y lo guarda en
 * <repo>/.claude/sessions/YYYY-MM-DD-<id>-session.md para continuidad entre sesiones.
 *
 * stdin se lee de forma ASÍNCRONA (event-based): fs.readFileSync(0) devuelve vacío en algunos
 * entornos Windows/node. Diseño defensivo: cualquier error se traga y NUNCA bloquea (exit 0).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_USER_MSGS = 12;
const MAX_MSG_CHARS = 200;
const MAX_FILES = 40;
const SUMMARY_START = '<!-- FERREMEX:SUMMARY:START -->';
const SUMMARY_END = '<!-- FERREMEX:SUMMARY:END -->';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(data); } };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', done);
      process.stdin.on('error', done);
      // Salvaguarda: si no llega 'end' (sin stdin conectado), resolver tras un margen corto.
      setTimeout(done, 800);
    } catch {
      done();
    }
  });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function pad2(n) { return String(n).padStart(2, '0'); }
function dateString(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function timeString(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }

function stripControl(text) {
  // Quita secuencias ANSI y caracteres de control (rango 0x00-0x1F y 0x7F), preservando saltos.
  let out = String(text).replace(/\x1b\[[0-9;]*m/g, '');
  let res = '';
  for (let i = 0; i < out.length; i++) {
    const code = out.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || code >= 32) res += out[i];
    else res += ' ';
  }
  return res.trim();
}

function extractText(rawContent) {
  if (typeof rawContent === 'string') return rawContent;
  if (Array.isArray(rawContent)) {
    return rawContent.map((c) => (c && typeof c.text === 'string' ? c.text : '')).join(' ');
  }
  return '';
}

function extractSummary(transcriptPath) {
  let content = '';
  try { content = fs.readFileSync(transcriptPath, 'utf8'); } catch { return null; }
  if (!content) return null;

  const lines = content.split('\n').filter(Boolean);
  const userMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();

  for (const line of lines) {
    const entry = safeJson(line);
    if (!entry) continue;

    const role = (entry.message && entry.message.role) || entry.role || entry.type;
    if (role === 'user') {
      const text = stripControl(extractText((entry.message && entry.message.content) ?? entry.content));
      if (text && !text.startsWith('<') && !text.startsWith('Caveat:')) {
        userMessages.push(text.slice(0, MAX_MSG_CHARS));
      }
    }

    if (entry.type === 'tool_use' || entry.tool_name) {
      const name = entry.tool_name || entry.name || '';
      if (name) toolsUsed.add(name);
      const fp = (entry.tool_input && entry.tool_input.file_path) || (entry.input && entry.input.file_path) || '';
      if (fp && (name === 'Edit' || name === 'Write')) filesModified.add(fp);
    }

    if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block && block.type === 'tool_use') {
          const name = block.name || '';
          if (name) toolsUsed.add(name);
          const fp = (block.input && block.input.file_path) || '';
          if (fp && (name === 'Edit' || name === 'Write')) filesModified.add(fp);
        }
      }
    }
  }

  if (!userMessages.length && !toolsUsed.size && !filesModified.size) return null;

  return {
    userMessages: userMessages.slice(-MAX_USER_MSGS),
    toolsUsed: Array.from(toolsUsed),
    filesModified: Array.from(filesModified).slice(0, MAX_FILES),
    totalUserMessages: userMessages.length,
  };
}

function getSessionsDir(root) {
  const dir = path.join(root, '.claude', 'sessions');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function shortId(payload) {
  const id = (payload && (payload.session_id || payload.sessionId)) || '';
  if (id) return String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'sesion';
  return 'sesion';
}

function buildSummaryBlock(summary) {
  const lines = [];
  lines.push(SUMMARY_START);
  lines.push('## Resumen de la sesión');
  lines.push('');
  if (summary.userMessages.length) {
    lines.push('### Tareas / peticiones');
    for (const m of summary.userMessages) lines.push(`- ${m}`);
    lines.push('');
  }
  if (summary.filesModified.length) {
    lines.push('### Archivos modificados');
    for (const f of summary.filesModified) lines.push(`- ${f}`);
    lines.push('');
  }
  if (summary.toolsUsed.length) {
    lines.push('### Herramientas usadas');
    lines.push(summary.toolsUsed.join(', '));
    lines.push('');
  }
  lines.push('### Stats');
  lines.push(`- Mensajes de usuario: ${summary.totalUserMessages}`);
  lines.push(SUMMARY_END);
  return lines.join('\n');
}

async function main() {
  const raw = await readStdin();
  const payload = safeJson(raw) || {};
  const transcriptPath = payload.transcript_path || payload.transcriptPath;

  // Reemite stdin para no romper la cadena de hooks (patrón ECC).
  if (raw) process.stdout.write(raw);

  if (!transcriptPath) return;

  const summary = extractSummary(transcriptPath);
  if (!summary) return;

  const now = new Date();
  const root = process.cwd();
  const dir = getSessionsDir(root);
  const id = shortId(payload);
  const file = path.join(dir, `${dateString(now)}-${id}-session.md`);

  const header = [
    `# Sesión Ferremex: ${dateString(now)}`,
    `**Última actualización:** ${dateString(now)} ${timeString(now)}`,
    `**Session ID:** ${id}`,
    '',
    '---',
    '',
  ].join('\n');

  const block = buildSummaryBlock(summary);

  let existing = '';
  try { existing = fs.readFileSync(file, 'utf8'); } catch {}

  let out;
  if (existing && existing.includes(SUMMARY_START) && existing.includes(SUMMARY_END)) {
    const before = existing.slice(0, existing.indexOf(SUMMARY_START));
    const after = existing.slice(existing.indexOf(SUMMARY_END) + SUMMARY_END.length);
    out = before + block + after;
  } else if (existing) {
    out = existing.trimEnd() + '\n\n' + block + '\n';
  } else {
    out = header + block + '\n';
  }

  try { fs.writeFileSync(file, out, 'utf8'); } catch {}
}

main().catch(() => {}).finally(() => process.exit(0));
