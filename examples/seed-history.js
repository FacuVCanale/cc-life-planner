#!/usr/bin/env node
// Genera 14 días de plans + logs falsos en plans/ y log/.
// Útil para probar el viewer y la vista de stats sin tener data real todavía.
//
// Uso: node examples/seed-history.js [días]
//
// El script no toca state/. Sólo crea archivos en plans/ y log/.
// Si ya existen archivos para esas fechas, los pisa.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLANS_DIR = path.join(ROOT, 'plans');
const LOG_DIR = path.join(ROOT, 'log');

const DAYS = Number(process.argv[2] || 14);

const CATEGORIES = {
  ferreteria: '#f59e0b',
  cocina:     '#10b981',
  gimnasio:   '#3b82f6',
  personal:   '#a78bfa',
  calendar:   '#94a3b8',
  buffer:     '#e5e7eb',
};

const TASK_POOL = [
  { id: 'ferr-ventas-pos',       title: 'Arreglar POS que duplica tickets', category: 'ferreteria', est: 2.0, deadline: '2026-05-12' },
  { id: 'ferr-inventario-recuento', title: 'Recontar stock tornillería',    category: 'ferreteria', est: 2.5, deadline: '2026-05-18' },
  { id: 'ferr-prov-pintura',     title: 'Pedido proveedor de pinturas',     category: 'ferreteria', est: 0.5, deadline: '2026-05-10' },
  { id: 'cocina-menu-semana',    title: 'Armar el menú de la semana',       category: 'cocina',     est: 1.0, deadline: '2026-05-11' },
  { id: 'cocina-eventos-catering', title: 'Cotizar catering casamiento',    category: 'cocina',     est: 1.5, deadline: '2026-05-20' },
  { id: 'cocina-compras-verduleria', title: 'Pedido a la verdulería',       category: 'cocina',     est: 0.25, deadline: '2026-05-10' },
  { id: 'gym-rutina-hipertrofia', title: 'Rutina de hipertrofia cliente',   category: 'gimnasio',   est: 1.5, deadline: '2026-05-15' },
  { id: 'gym-clientes-seguimiento', title: 'Seguimiento de clientes',       category: 'gimnasio',   est: 1.0, deadline: '2026-05-30' },
  { id: 'habilitacion',          title: 'Renovar habilitación municipal',   category: 'personal',   est: 1.0, deadline: '2026-05-12' },
  { id: 'seguro-local',          title: 'Pagar el seguro del local',        category: 'personal',   est: 0.25, deadline: '2026-05-10' },
];

const CALENDAR_EVENTS = {
  1: [{ start: '11:00', end: '13:00', title: 'Turno en el mostrador' }],     // lunes
  3: [{ start: '11:00', end: '13:00', title: 'Turno en el mostrador' }],     // miércoles
  2: [{ start: '18:00', end: '19:00', title: 'Clase de spinning' }],         // martes
  4: [{ start: '18:00', end: '19:00', title: 'Clase de spinning' }],         // jueves
  5: [{ start: '09:00', end: '10:00', title: 'Reunión con proveedores' }],   // viernes
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function shiftDate(iso, deltaDays) {
  const d = new Date(iso + 'T12:00:00-03:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function dowOf(iso) {
  return new Date(iso + 'T12:00:00-03:00').getDay();
}

function timeStrToMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToTimeStr(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function pickN(arr, n, seed) {
  // shuffle determinístico para que el mismo día genere el mismo plan.
  const rng = mulberry32(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPlan(dateISO) {
  const seed = Number(dateISO.replace(/-/g, ''));
  const dow = dowOf(dateISO);
  const isWeekend = dow === 0 || dow === 6;
  const calEvents = CALENDAR_EVENTS[dow] || [];

  const blocks = [];
  let cursor = isWeekend ? timeStrToMin('10:00') : timeStrToMin('08:00');
  const dayEnd = isWeekend ? timeStrToMin('14:00') : timeStrToMin('19:00');

  // insertá calendar events en orden
  const calBlocks = calEvents.map((e) => ({
    start: e.start,
    end: e.end,
    type: 'calendar',
    category: 'calendar',
    title: e.title,
    source: 'context.md',
  }));

  // elegí 3-4 tareas
  const tasksToday = pickN(TASK_POOL, isWeekend ? 2 : 3 + (seed % 2), seed);

  // intercalá tareas y eventos del calendar
  const allEvents = [...calBlocks].sort((a, b) => timeStrToMin(a.start) - timeStrToMin(b.start));

  for (const task of tasksToday) {
    const durMin = Math.round(task.est * 60);
    // saltá calendar events que vengan después de cursor
    while (allEvents.length && timeStrToMin(allEvents[0].start) <= cursor + durMin + 30) {
      const ev = allEvents.shift();
      if (timeStrToMin(ev.start) < cursor) continue;
      // gap antes del evento
      if (timeStrToMin(ev.start) - cursor >= 30) {
        // espacio suficiente — meter tarea acá
      } else {
        blocks.push(ev);
        cursor = timeStrToMin(ev.end) + 15;
        continue;
      }
      blocks.push(ev);
      cursor = timeStrToMin(ev.end) + 15;
    }
    if (cursor + durMin > dayEnd) break;
    blocks.push({
      start: minToTimeStr(cursor),
      end: minToTimeStr(cursor + durMin),
      type: task.est >= 1.5 ? 'deep_work' : task.est >= 0.5 ? 'shallow' : 'admin',
      category: task.category,
      title: task.title,
      task_id: task.id,
      estimated_hours: task.est,
      deadline: task.deadline,
      justification: {
        why_today: `slack ajustado, factor 1.4`,
        why_order: cursor < timeStrToMin('12:00') ? 'ventana de alta energía' : 'huecos disponibles',
      },
      source: 'tasks.md',
    });
    cursor += durMin + 30;
  }
  // restantes calendar events
  for (const ev of allEvents) blocks.push(ev);
  blocks.sort((a, b) => timeStrToMin(a.start) - timeStrToMin(b.start));

  return {
    date: dateISO,
    generated_at: `${dateISO}T07:15:00-03:00`,
    calibration_factor: 1.4,
    categories: CATEGORIES,
    blocks,
    deferred: [],
    strategic_recommendations: seed % 3 === 0 ? ['Recordá revisar goals esta semana.'] : [],
    calibration_notes: ['Factor 1.4 aplicado (default).'],
  };
}

function buildLog(dateISO, plan) {
  const seed = Number(dateISO.replace(/-/g, '')) + 1;
  const rng = mulberry32(seed);
  const entries = [];
  for (const block of plan.blocks) {
    if (!block.task_id) continue;
    // 80% de chance de loggear
    if (rng() > 0.8) continue;
    const planned = timeStrToMin(block.end) - timeStrToMin(block.start);
    // factor real entre 0.7x y 1.7x el planeado (sesgo a optimista → sobre-uso)
    const factor = 0.7 + rng() * 1.0;
    const actual = Math.max(15, Math.round(planned * factor));
    const r = rng();
    let status;
    if (factor > 1.4) status = 'partial';
    else if (factor < 0.6) status = 'skipped';
    else status = 'done';
    entries.push({
      task_id: block.task_id,
      time_spent_min: actual,
      status,
      notes: '',
      timestamp: `${dateISO}T${block.end}:00-03:00`,
    });
  }
  return { date: dateISO, entries };
}

function buildLogMd(log, plan) {
  const titleByTaskId = {};
  for (const b of plan.blocks) if (b.task_id) titleByTaskId[b.task_id] = b.title;

  const lines = [`# Log ${log.date}`, ''];
  let totalMin = 0;
  const counts = { done: 0, partial: 0, deferred: 0, skipped: 0 };
  for (const e of log.entries) {
    const title = titleByTaskId[e.task_id] || '(no en plan)';
    const t = e.timestamp.slice(11, 16);
    lines.push(`## ${e.task_id} — ${title}`);
    lines.push(`- ${t} · ${e.status} · ${e.time_spent_min}min`);
    if (e.notes) lines.push(`- ${e.notes}`);
    lines.push('');
    totalMin += e.time_spent_min;
    counts[e.status] = (counts[e.status] || 0) + 1;
  }
  lines.push('---');
  lines.push(
    `**Resumen**: ${totalMin}min loggeados · ${counts.done} done · ${counts.partial} partial · ${counts.deferred} deferred · ${counts.skipped} skipped`
  );
  return lines.join('\n');
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writePretty(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  ensureDir(PLANS_DIR);
  ensureDir(LOG_DIR);

  const today = todayISO();
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDate(today, -i);
    const plan = buildPlan(date);
    const log = buildLog(date, plan);
    writePretty(path.join(PLANS_DIR, `${date}.json`), plan);
    writePretty(path.join(LOG_DIR, `${date}.json`), log);
    fs.writeFileSync(path.join(LOG_DIR, `${date}.md`), buildLogMd(log, plan));
    console.log(`seed: ${date}  blocks=${plan.blocks.length}  log_entries=${log.entries.length}`);
  }
  console.log(`\n✔ ${DAYS} días generados en plans/ y log/`);
}

main();
