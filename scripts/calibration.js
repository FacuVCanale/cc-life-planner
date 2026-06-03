#!/usr/bin/env node
// cc-life-planner — factor de optimismo BIMODAL por categoría, calculado de datos reales.
//
// Uso:  node scripts/calibration.js [--days N]   (default 30)
//
// Para cada categoría compara horas ESTIMADAS (planes con estimated_hours) vs horas REALES
// (log) y devuelve el factor actual/estimado. >1 = se expande (research); <1 = más rápido (dev).
// Lo consume el planner-diario al estimar: aplicar el factor de la categoría de cada task en
// vez del 1.4 genérico. Categorías sin dato suficiente → usar el default bimodal de context.md.
//
// Salida: JSON { days, by_category: [{category, factor, estimated_min, actual_min, n}], defaults }.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLANS = path.join(ROOT, 'plans');
const LOG = path.join(ROOT, 'log');

const DEFAULTS = { dev: 0.4, research: 4, admin: 1 }; // guía cualitativa de context.md
// categoría -> "tipo" para el fallback default
const CAT_TYPE = { gsvto: 'dev', alethia: 'research', academia: 'research', costea: 'dev', personal: 'admin' };

function arg(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function localTodayISO() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function shiftDate(iso, d) { const x = new Date(iso + 'T12:00:00-03:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); }

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

function main() {
  const days = Number(arg('--days', 30)) || 30;
  const today = localTodayISO();
  const plans = [];
  const logs = {};
  for (let i = 0; i < days; i++) {
    const date = shiftDate(today, -i);
    const p = readJson(path.join(PLANS, `${date}.json`));
    const l = readJson(path.join(LOG, `${date}.json`));
    if (p) plans.push(p);
    if (l) logs[date] = l;
  }

  const meta = {};
  for (const p of plans) {
    for (const b of p.blocks || []) if (b.task_id) meta[b.task_id] = { category: b.category, module: b.module };
    for (const m of p.must_dos || []) if (m.task_id && !meta[m.task_id]) meta[m.task_id] = { module: m.module };
    for (const c of p.carriles || []) if (c.task_id && !meta[c.task_id]) meta[c.task_id] = { module: c.module };
  }
  const categoryOf = (id) => {
    const m = meta[id];
    if (m && m.category) return m.category;
    if (m && m.module) return catFromModule(m.module) || catFromTaskId(id);
    return catFromTaskId(id);
  };

  const byFactor = {}; // cat -> {est, act, n}
  for (const p of plans) {
    const actualByTask = {};
    for (const e of (logs[p.date]?.entries || [])) actualByTask[e.task_id] = (actualByTask[e.task_id] || 0) + (Number(e.time_spent_min) || 0);
    for (const b of p.blocks || []) {
      if (!b.task_id || !b.estimated_hours) continue;
      const cat = b.category || categoryOf(b.task_id);
      if (!byFactor[cat]) byFactor[cat] = { est: 0, act: 0, n: 0 };
      byFactor[cat].est += b.estimated_hours * 60;
      byFactor[cat].act += actualByTask[b.task_id] || 0;
      byFactor[cat].n++;
    }
  }

  const by_category = Object.entries(byFactor)
    .filter(([, v]) => v.est > 0 && v.act > 0)
    .map(([category, v]) => ({ category, factor: Math.round((v.act / v.est) * 100) / 100, estimated_min: v.est, actual_min: v.act, n: v.n }))
    .sort((a, b) => b.factor - a.factor);

  const result = { days, by_category, defaults: DEFAULTS, cat_type: CAT_TYPE };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  // resumen legible a stderr (no contamina el JSON de stdout)
  const lines = by_category.length
    ? by_category.map((c) => `  ${c.category.padEnd(10)} ${c.factor}×  (${Math.round(c.estimated_min / 60)}h est → ${Math.round(c.actual_min / 60)}h real, n=${c.n})`)
    : ['  (sin estimaciones recientes — usar defaults: dev 0.4×, research 4×, admin 1×)'];
  process.stderr.write(`Factor de optimismo por categoría (últimos ${days}d):\n${lines.join('\n')}\n`);
}

main();
