// vault-extractor.js — lee el ESTADO DE CONOCIMIENTO desde el vault (~/second-brain/Projects).
//
// Es el "extractor de salida" del hub: dado un `module` slug, devuelve el estado del proyecto
// (## Estado actual, ## Cierre como checklist, ## Aprendizajes) + relaciones del frontmatter.
// Lo consumen planner-diario, revisor-*, y cualquier app (viewer, etc.). Funciones puras, sin estado,
// al estilo de viewer/log-utils.js. El vault es la fuente de verdad; el planner sólo lee acá.
//
// CLI:  node viewer/vault-extractor.js <moduleSlug>   -> JSON del módulo
//       node viewer/vault-extractor.js                -> lista de proyectos activos
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const VAULT = process.env.VAULT_DIR || path.join(os.homedir(), 'second-brain');
const PROJECTS = path.join(VAULT, 'Projects');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Parser de frontmatter YAML simple. Soporta escalares, listas inline [a, b] y listas
// multilínea (formato "Properties" de Obsidian: `key:` seguido de `  - item`).
const unquote = (s) => s.trim().replace(/^["']|["']$/g, '');
function parseNote(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = {};
  let body = raw;
  if (m) {
    body = m[2];
    let curKey = null;
    for (const line of m[1].split('\n')) {
      const item = line.match(/^\s+-\s+(.*)$/);
      if (item && curKey) { fm[curKey].push(unquote(item[1])); continue; }
      const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1];
      const v = kv[2].trim();
      if (v === '') { fm[key] = []; curKey = key; }          // posible lista multilínea
      else if (v.startsWith('[') && v.endsWith(']')) {        // lista inline
        fm[key] = v.slice(1, -1).split(',').map(unquote).filter(Boolean); curKey = null;
      } else { fm[key] = unquote(v); curKey = null; }         // escalar
    }
  }
  return { fm, body };
}

// Devuelve { 'Estado actual': '...', 'Cierre': '...', ... } a partir de los `## headings`.
function sections(body) {
  const out = {};
  const re = /^##\s+(.+)$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(body))) marks.push({ title: m[1].trim(), start: m.index, contentStart: m.index + m[0].length });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : body.length;
    out[marks[i].title] = body.slice(marks[i].contentStart, end).trim();
  }
  return out;
}

function parseChecklist(text) {
  if (!text) return [];
  return text.split('\n')
    .filter(l => /^\s*- \[[ xX]\]/.test(l))
    .map(l => ({ done: /^\s*- \[[xX]\]/.test(l), text: l.replace(/^\s*- \[[ xX]\]\s*/, '').trim() }));
}

// Localiza la nota-proyecto por su `module` slug (robusto al nombre de la carpeta de contexto).
function findProjectNote(moduleSlug) {
  return walk(PROJECTS).find(f => path.basename(f, '.md') === moduleSlug) || null;
}

// Estado completo de un módulo, listo para que el planner decida.
function extractModuleState(moduleSlug) {
  const file = findProjectNote(moduleSlug);
  if (!file) return null;
  const { fm, body } = parseNote(file);
  const sec = sections(body);
  const cierre = parseChecklist(sec['Cierre']);
  return {
    module: moduleSlug,
    file: path.relative(VAULT, file),
    status: fm.status || 'active',
    context: fm.context || '',
    summary: fm.summary || '',
    people: fm.people || [],
    companies: fm.companies || [],
    repos: fm.repos || [],
    estado_actual: sec['Estado actual'] || '',
    cierre: cierre,
    cierre_pendiente: cierre.filter(i => !i.done).length,
    cierre_total: cierre.length,
    aprendizajes: sec['Aprendizajes'] || '',
  };
}

// Lista de proyectos (para "¿qué está activo?"). filter: {status, context}.
function listProjects(filter = {}) {
  return walk(PROJECTS).map(f => {
    const { fm } = parseNote(f);
    return {
      module: path.basename(f, '.md'),
      status: fm.status || 'active',
      context: fm.context || '',
      summary: fm.summary || '',
      file: path.relative(VAULT, f),
    };
  }).filter(p => (!filter.status || p.status === filter.status) && (!filter.context || p.context === filter.context));
}

module.exports = { VAULT, PROJECTS, findProjectNote, extractModuleState, listProjects, parseNote, sections, parseChecklist };

if (require.main === module) {
  const arg = process.argv[2];
  const out = arg ? extractModuleState(arg) : listProjects({ status: 'active' });
  console.log(JSON.stringify(out, null, 2));
}
