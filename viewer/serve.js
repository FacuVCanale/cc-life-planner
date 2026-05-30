#!/usr/bin/env node
// cc-life-planner viewer server
// Vanilla Node http server. Sin dependencias.
//
// Endpoints:
//   GET  /                       → index.html
//   GET  /viewer.js | /stats.js | /styles.css   → estáticos
//   GET  /api/dates              → {plans: [...], logs: [...]}
//   GET  /api/plan/:date         → plans/YYYY-MM-DD.json (404 si no existe)
//   GET  /api/log/:date          → log/YYYY-MM-DD.json   ({entries: []} si no existe)
//   POST /api/log/:date          → upsert entry. body: {task_id, time_spent_min, status, notes}
//   GET  /api/stats?days=30      → agregaciones
//
// Uso: node viewer/serve.js [puerto]   (default 5173)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PLANS = path.join(ROOT, 'plans');
const LOG = path.join(ROOT, 'log');
const VIEWER = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const STATIC = {
  '/': { file: path.join(VIEWER, 'index.html'), type: 'text/html; charset=utf-8' },
  '/index.html': { file: path.join(VIEWER, 'index.html'), type: 'text/html; charset=utf-8' },
  '/viewer.js': { file: path.join(VIEWER, 'viewer.js'), type: 'application/javascript; charset=utf-8' },
  '/stats.js': { file: path.join(VIEWER, 'stats.js'), type: 'application/javascript; charset=utf-8' },
  '/styles.css': { file: path.join(VIEWER, 'styles.css'), type: 'text/css; charset=utf-8' },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (Buffer.isBuffer(body) || typeof body === 'string') res.end(body);
  else res.end(JSON.stringify(body));
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function listDates(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && DATE_RE.test(f.slice(0, 10)))
    .map((f) => f.slice(0, 10))
    .sort();
}

function timeStrToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function dowName(iso) {
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return names[new Date(iso + 'T12:00:00-03:00').getDay()];
}

function shiftDate(iso, deltaDays) {
  const d = new Date(iso + 'T12:00:00-03:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// upsert key=task_id. time_spent_min se SUMA, status toma el último, notes concat, timestamp último.
function upsertEntry(log, entry) {
  const idx = log.entries.findIndex((e) => e.task_id === entry.task_id);
  const ts = entry.timestamp || new Date().toISOString();
  if (idx === -1) {
    log.entries.push({
      task_id: entry.task_id,
      time_spent_min: Number(entry.time_spent_min) || 0,
      status: entry.status || 'done',
      notes: entry.notes || '',
      timestamp: ts,
    });
  } else {
    const cur = log.entries[idx];
    cur.time_spent_min = (Number(cur.time_spent_min) || 0) + (Number(entry.time_spent_min) || 0);
    cur.status = entry.status || cur.status;
    if (entry.notes) cur.notes = cur.notes ? `${cur.notes}\n${entry.notes}` : entry.notes;
    cur.timestamp = ts;
  }
  return log;
}

// NOTA: este render debe quedar byte-idéntico al de la skill `logueador` (ambos regeneran log/*.md
// desde el JSON source of truth). Si tocás el formato acá, actualizá también logueador/SKILL.md.
function regenLogMd(log, plan) {
  const titleByTaskId = {};
  const moduleByTaskId = {};
  if (plan && Array.isArray(plan.blocks)) {
    for (const b of plan.blocks) {
      if (b.task_id) titleByTaskId[b.task_id] = b.title;
      if (b.task_id && b.module) moduleByTaskId[b.task_id] = b.module;
    }
  }
  // Frontmatter: marca la capa "fecha" para los filtros/colores del grafo de Obsidian.
  const lines = ['---', 'tipo: log', 'capa: fecha', '---', `# Log ${log.date}`, ''];
  let total = 0;
  const counts = { done: 0, partial: 0, deferred: 0, skipped: 0 };
  const modules = []; // únicos, en orden de aparición
  for (const e of log.entries) {
    const title = titleByTaskId[e.task_id] || '(no en plan)';
    const t = (e.timestamp || '').slice(11, 16);
    lines.push(`## ${e.task_id} — ${title}`);
    lines.push(`- ${t} · ${e.status} · ${e.time_spent_min}min`);
    if (e.notes) lines.push(`- ${e.notes.replace(/\n/g, ' / ')}`);
    lines.push('');
    total += Number(e.time_spent_min) || 0;
    counts[e.status] = (counts[e.status] || 0) + 1;
    const mod = moduleByTaskId[e.task_id];
    if (mod && !modules.includes(mod)) modules.push(mod);
  }
  lines.push('---');
  lines.push(
    `**Resumen**: ${total}min loggeados · ${counts.done || 0} done · ${counts.partial || 0} partial · ${counts.deferred || 0} deferred · ${counts.skipped || 0} skipped`
  );
  // Footer de módulos: conecta la nota-día con la capa de conocimiento del grafo (día → módulo).
  // Sólo linkea al módulo, nunca a otras fechas ni a tasks. Los wikilinks viven sólo en el .md.
  if (modules.length) {
    lines.push('');
    lines.push(`**Módulos:** ${modules.map((m) => `[[${m}]]`).join(' · ')}`);
  }
  return lines.join('\n');
}

function computeStats(days) {
  const today = todayISO();
  const plans = [];
  const logs = {};
  for (let i = 0; i < days; i++) {
    const date = shiftDate(today, -i);
    const planFile = path.join(PLANS, `${date}.json`);
    const logFile = path.join(LOG, `${date}.json`);
    if (fs.existsSync(planFile)) plans.push(readJsonSafe(planFile, null));
    if (fs.existsSync(logFile)) logs[date] = readJsonSafe(logFile, { date, entries: [] });
  }

  let plannedTotal = 0;
  let actualTotal = 0;
  let plannedTaskBlocks = 0;
  let doneEntries = 0;
  const byCategory = {}; // {cat: {planned, actual, tasks}}
  const byWeekday = {};  // {dow: {planned, actual, days}}

  for (const plan of plans) {
    if (!plan) continue;
    const dow = dowName(plan.date);
    if (!byWeekday[dow]) byWeekday[dow] = { planned: 0, actual: 0, days: new Set() };
    byWeekday[dow].days.add(plan.date);

    const log = logs[plan.date] || { entries: [] };
    const actualByTaskId = {};
    for (const e of log.entries) {
      actualByTaskId[e.task_id] = (actualByTaskId[e.task_id] || 0) + (Number(e.time_spent_min) || 0);
      if (e.status === 'done') doneEntries++;
    }

    for (const block of plan.blocks || []) {
      if (!block.task_id) continue; // skip calendar / buffer
      plannedTaskBlocks++;
      const planned = timeStrToMin(block.end) - timeStrToMin(block.start);
      const actual = actualByTaskId[block.task_id] || 0;
      plannedTotal += planned;
      actualTotal += actual;
      byWeekday[dow].planned += planned;
      byWeekday[dow].actual += actual;
      const cat = block.category || 'sin-categoria';
      if (!byCategory[cat]) byCategory[cat] = { planned: 0, actual: 0, tasks: 0 };
      byCategory[cat].planned += planned;
      byCategory[cat].actual += actual;
      byCategory[cat].tasks++;
    }
  }

  const diff = actualTotal - plannedTotal;
  const diffPct = plannedTotal ? (diff / plannedTotal) * 100 : 0;
  const completionRate = plannedTaskBlocks ? doneEntries / plannedTaskBlocks : 0;
  const impliedFactor = plannedTotal ? actualTotal / plannedTotal : 1.0;

  return {
    window_days: days,
    days_with_data: plans.length,
    totals: {
      planned_min: plannedTotal,
      actual_min: actualTotal,
      diff_min: diff,
      diff_pct: round1(diffPct),
    },
    by_category: Object.entries(byCategory)
      .map(([category, v]) => ({
        category,
        planned_min: v.planned,
        actual_min: v.actual,
        diff_pct: v.planned ? round1(((v.actual - v.planned) / v.planned) * 100) : 0,
        tasks: v.tasks,
      }))
      .sort((a, b) => b.actual_min - a.actual_min),
    by_weekday: Object.entries(byWeekday)
      .map(([weekday, v]) => ({
        weekday,
        planned_min: v.planned,
        actual_min: v.actual,
        diff_pct: v.planned ? round1(((v.actual - v.planned) / v.planned) * 100) : 0,
        days_with_data: v.days.size,
      }))
      .sort((a, b) => weekdayOrder(a.weekday) - weekdayOrder(b.weekday)),
    completion_rate: round2(completionRate),
    implied_calibration_factor: round2(impliedFactor),
  };
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function weekdayOrder(name) {
  return ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].indexOf(name);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'OPTIONS') return send(res, 204, '');

  // estáticos
  if (req.method === 'GET' && STATIC[pathname]) {
    const { file, type } = STATIC[pathname];
    if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    return send(res, 200, fs.readFileSync(file), type);
  }

  // /api/dates
  if (req.method === 'GET' && pathname === '/api/dates') {
    return send(res, 200, { plans: listDates(PLANS), logs: listDates(LOG) });
  }

  // /api/stats
  if (req.method === 'GET' && pathname === '/api/stats') {
    const days = Math.max(1, Math.min(365, Number(parsed.query.days) || 30));
    return send(res, 200, computeStats(days));
  }

  // /api/plan/:date
  let m = pathname.match(/^\/api\/plan\/(\d{4}-\d{2}-\d{2})$/);
  if (m && req.method === 'GET') {
    const file = path.join(PLANS, `${m[1]}.json`);
    if (!fs.existsSync(file)) return send(res, 404, { error: 'no plan for date', date: m[1] });
    return send(res, 200, readJsonSafe(file, {}));
  }

  // /api/log/:date  (GET / POST)
  m = pathname.match(/^\/api\/log\/(\d{4}-\d{2}-\d{2})$/);
  if (m) {
    const date = m[1];
    const file = path.join(LOG, `${date}.json`);
    const mdFile = path.join(LOG, `${date}.md`);

    if (req.method === 'GET') {
      const log = fs.existsSync(file) ? readJsonSafe(file, { date, entries: [] }) : { date, entries: [] };
      return send(res, 200, log);
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let entry;
        try {
          entry = JSON.parse(body);
        } catch (e) {
          return send(res, 400, { error: 'invalid json' });
        }
        if (!entry.task_id) return send(res, 400, { error: 'task_id required' });
        const log = fs.existsSync(file) ? readJsonSafe(file, { date, entries: [] }) : { date, entries: [] };
        upsertEntry(log, entry);
        if (!fs.existsSync(LOG)) fs.mkdirSync(LOG, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(log, null, 2) + '\n');
        const planFile = path.join(PLANS, `${date}.json`);
        const plan = fs.existsSync(planFile) ? readJsonSafe(planFile, null) : null;
        fs.writeFileSync(mdFile, regenLogMd(log, plan));
        return send(res, 200, log);
      });
      return;
    }
  }

  return send(res, 404, { error: 'not found', path: pathname });
});

server.listen(PORT, () => {
  console.log(`cc-life-planner viewer en http://localhost:${PORT}`);
  console.log(`  ROOT: ${ROOT}`);
});
