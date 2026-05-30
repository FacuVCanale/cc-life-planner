#!/usr/bin/env node
// Backfill idempotente de la capa de grafo en notas-día históricas.
//
// Para cada plans/*.md y log/*.md existente:
//   1. Si no tiene frontmatter, le antepone `--- tipo/capa ---` (capa: fecha → filtrable en el grafo).
//   2. Si no tiene footer `**Módulos:**`, lo appendea con los módulos únicos del día.
//
// Los módulos se derivan del .json hermano: primero `block.module` si existe; si no, mapeando
// `task_id → módulo` con scripts/task-module-map.json (generado en la migración). task_ids sin módulo
// conocido se reportan y se omiten (no se inventa módulo).
//
// Append-only sobre vistas .md (nunca toca .json ni tasks.md). Re-ejecutable sin efectos.
// Uso:  node scripts/backfill-grafo.js [--dry]

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLANS = path.join(ROOT, 'plans');
const LOG = path.join(ROOT, 'log');
// El mapa task_id→módulo es data personal (nombres de proyectos) → vive en state/ (gitignored),
// no en scripts/ (que se commitea al repo público).
const MAP_FILE = path.join(ROOT, 'state', 'task-module-map.json');
const DRY = process.argv.includes('--dry');

const taskModuleMap = fs.existsSync(MAP_FILE)
  ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
  : {};

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Devuelve la lista de módulos únicos (en orden) para un día, + los task_ids sin mapear.
function modulesForDay(json) {
  const modules = [];
  const unmapped = new Set();
  if (!json) return { modules, unmapped: [] };
  const items = Array.isArray(json.blocks)
    ? json.blocks
    : Array.isArray(json.entries)
    ? json.entries
    : [];
  for (const it of items) {
    if (!it.task_id) continue; // calendar / buffer (usan `id`, no `task_id`)
    const id = String(it.task_id);
    // Pseudo-bloques que no son tasks de conocimiento: no linkean ni se reportan.
    if (id.startsWith('ad-hoc-') || id.startsWith('calendar-') || id === 'wind-down' || id === 'buffer')
      continue;
    const mod = it.module || taskModuleMap[id];
    if (!mod) {
      unmapped.add(id);
      continue;
    }
    if (!modules.includes(mod)) modules.push(mod);
  }
  return { modules, unmapped: [...unmapped] };
}

function backfillFile(mdPath, jsonPath, tipo) {
  if (!fs.existsSync(mdPath)) return null;
  let content = fs.readFileSync(mdPath, 'utf8');
  const json = readJsonSafe(jsonPath);
  const { modules, unmapped } = modulesForDay(json);

  let changed = false;

  // 1. Frontmatter (sólo si no tiene ya uno al tope).
  if (!content.startsWith('---\n')) {
    content = `---\ntipo: ${tipo}\ncapa: fecha\n---\n${content}`;
    changed = true;
  }

  // 2. Footer de módulos (sólo si no está ya presente y hay módulos).
  if (modules.length && !/\*\*Módulos[^\n]*:\*\*/.test(content)) {
    const footer = `**Módulos:** ${modules.map((m) => `[[${m}]]`).join(' · ')}`;
    content = `${content.replace(/\s*$/, '')}\n\n${footer}\n`;
    changed = true;
  }

  if (changed && !DRY) fs.writeFileSync(mdPath, content);
  return { changed, modules, unmapped };
}

function run() {
  const allUnmapped = new Set();
  let touched = 0;
  let scanned = 0;

  for (const [dir, tipo] of [[PLANS, 'plan'], [LOG, 'log']]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const base = f.slice(0, -3);
      const res = backfillFile(
        path.join(dir, f),
        path.join(dir, `${base}.json`),
        tipo
      );
      if (!res) continue;
      scanned++;
      if (res.changed) touched++;
      res.unmapped.forEach((t) => allUnmapped.add(t));
    }
  }

  console.log(`${DRY ? '[DRY] ' : ''}Escaneados ${scanned} .md · modificados ${touched}.`);
  if (allUnmapped.size) {
    console.log(
      `\n⚠ task_ids sin módulo (agregalos a scripts/task-module-map.json y re-corré):`
    );
    [...allUnmapped].sort().forEach((t) => console.log(`  - ${t}`));
  }
}

run();
