// cc-life-planner — lógica compartida de logueo.
// Source of truth única para el upsert y la regeneración del .md del log.
// La consumen: viewer/serve.js (endpoint POST /api/log) y scripts/git-day-scan.js.
// La skill `logueador` describe ESTA misma lógica en prosa — si tocás algo acá,
// actualizá .claude/skills/logueador/SKILL.md para que sigan en sync.

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

// NOTA: este render debe quedar byte-idéntico al que describe la skill `logueador`
// (ambos regeneran log/*.md desde el JSON source of truth).
function regenLogMd(log, plan) {
  const titleByTaskId = {};
  const moduleByTaskId = {};
  if (plan && Array.isArray(plan.blocks)) {
    for (const b of plan.blocks) {
      if (b.task_id) titleByTaskId[b.task_id] = b.title;
      if (b.task_id && b.module) moduleByTaskId[b.task_id] = b.module;
    }
  }
  // Tablero (Feature 2): los task_id/título/módulo también pueden venir de must_dos/carriles.
  for (const arr of [plan && plan.must_dos, plan && plan.carriles]) {
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      if (it.task_id && it.title) titleByTaskId[it.task_id] = titleByTaskId[it.task_id] || it.title;
      if (it.task_id && it.module) moduleByTaskId[it.task_id] = moduleByTaskId[it.task_id] || it.module;
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
  if (modules.length) {
    lines.push('');
    lines.push(`**Módulos:** ${modules.map((m) => `[[${m}]]`).join(' · ')}`);
  }
  return lines.join('\n');
}

module.exports = { upsertEntry, regenLogMd };
