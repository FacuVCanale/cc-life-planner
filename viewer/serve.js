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
const { upsertEntry, regenLogMd } = require('./log-utils');

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

// upsertEntry y regenLogMd viven en ./log-utils (compartidos con scripts/git-day-scan.js).

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

  // índice task_id -> {category, module} desde todos los planes de la ventana
  const meta = {};
  for (const plan of plans) {
    if (!plan) continue;
    for (const b of plan.blocks || []) if (b.task_id) meta[b.task_id] = { category: b.category, module: b.module };
    for (const m of plan.must_dos || []) if (m.task_id && !meta[m.task_id]) meta[m.task_id] = { module: m.module };
    for (const c of plan.carriles || []) if (c.task_id && !meta[c.task_id]) meta[c.task_id] = { module: c.module };
  }
  const MOD_CAT = { uni: 'academia', gsvto: 'gsvto', alethia: 'alethia', costea: 'costea', personal: 'personal', edi: 'personal' };
  function catFromModule(mod) { return mod ? (MOD_CAT[mod.split('-')[0]] || mod.split('-')[0]) : null; }
  function catFromTaskId(id) {
    const s = String(id).toLowerCase();
    if (/gsvto|gs-vto/.test(s)) return 'gsvto';
    if (/fluxnet|overworld|alethia|adeco|oneflux|pdd/.test(s)) return 'alethia';
    if (/nlp|dm1|hsf|robotica|ingsoft|historia|vitro|survey|reacher|tp\d|tpf/.test(s)) return 'academia';
    if (/costea/.test(s)) return 'costea';
    if (/edi|oft|pasaporte|mod-|lentes/.test(s)) return 'personal';
    return 'otros';
  }
  function categoryOf(id) {
    const m = meta[id];
    if (m && m.category) return m.category;
    if (m && m.module) return catFromModule(m.module) || catFromTaskId(id);
    return catFromTaskId(id);
  }

  // === tiempo REAL del log (source of truth), por categoría y por día ===
  const byCategory = {}; // {cat: realMin}
  const byWeekday = {};  // {dow: {real, days:Set}}
  let totalReal = 0;
  let doneEntries = 0;
  for (const date of Object.keys(logs)) {
    const dow = dowName(date);
    if (!byWeekday[dow]) byWeekday[dow] = { real: 0, days: new Set() };
    byWeekday[dow].days.add(date);
    for (const e of logs[date].entries || []) {
      const min = Number(e.time_spent_min) || 0;
      totalReal += min;
      if (e.status === 'done') doneEntries++;
      byWeekday[dow].real += min;
      const cat = categoryOf(e.task_id);
      byCategory[cat] = (byCategory[cat] || 0) + min;
    }
  }

  // === factor de optimismo BIMODAL: actual/estimado por categoría, sólo donde hubo estimación ===
  // (el tablero no estima horas; esto sale de días viejos con estimated_hours en los bloques)
  const byFactor = {}; // {cat: {est, act}}
  for (const plan of plans) {
    if (!plan) continue;
    const actualByTaskId = {};
    for (const e of (logs[plan.date]?.entries || [])) actualByTaskId[e.task_id] = (actualByTaskId[e.task_id] || 0) + (Number(e.time_spent_min) || 0);
    for (const b of plan.blocks || []) {
      if (!b.task_id || !b.estimated_hours) continue;
      const cat = b.category || categoryOf(b.task_id);
      if (!byFactor[cat]) byFactor[cat] = { est: 0, act: 0 };
      byFactor[cat].est += b.estimated_hours * 60;
      byFactor[cat].act += actualByTaskId[b.task_id] || 0;
    }
  }

  // promedio por día LABORAL (lun-vie): tiempo de días hábiles / cantidad de días hábiles con datos
  const WORKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
  let workdayReal = 0, workdayDays = 0;
  for (const d of WORKDAYS) if (byWeekday[d]) { workdayReal += byWeekday[d].real; workdayDays += byWeekday[d].days.size; }

  return {
    window_days: days,
    days_with_data: Object.keys(logs).length,
    total_real_min: totalReal,
    workday_real_min: workdayReal,
    workday_days: workdayDays,
    done_entries: doneEntries,
    by_category: Object.entries(byCategory)
      .filter(([, real_min]) => real_min > 0)
      .map(([category, real_min]) => ({ category, real_min, share_pct: totalReal ? round1((real_min / totalReal) * 100) : 0 }))
      .sort((a, b) => b.real_min - a.real_min),
    by_weekday: Object.entries(byWeekday)
      .map(([weekday, v]) => ({ weekday, real_min: v.real, days_with_data: v.days.size, avg_min: v.days.size ? Math.round(v.real / v.days.size) : 0 }))
      .sort((a, b) => weekdayOrder(a.weekday) - weekdayOrder(b.weekday)),
    factor_by_category: Object.entries(byFactor)
      .filter(([, v]) => v.est > 0 && v.act > 0)
      .map(([category, v]) => ({ category, estimated_min: v.est, actual_min: v.act, factor: round2(v.act / v.est) }))
      .sort((a, b) => b.factor - a.factor),
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
