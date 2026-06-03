#!/usr/bin/env node
// cc-life-planner — escaneo de commits del día para logueo auto.
//
// Uso:  node scripts/git-day-scan.js [YYYY-MM-DD] [--code-dir ~/code]
//       (sin fecha → hoy, hora local America/Argentina/Buenos_Aires)
//
// Lee los commits del autor (state/repo-map.json → author_emails) de cada repo en ~/code/*
// para la fecha dada, y propone una entry de log por repo:
//   - task_id / module  →  según state/repo-map.json
//   - time_spent_min    →  span (último - primer commit del día). Si hay 1 solo commit → 20min default.
//   - notes             →  "<n> commits HH:MM–HH:MM: <subjects>" (estimado de spans, NO medido)
//
// Salida: JSON { date, generated_at, proposals: [ {repo, task_id, module, commits, first, last,
//   time_spent_min, status, notes, estimated} ] }.
// NO escribe el log. El logueador muestra la propuesta, el usuario confirma/edita, y recién ahí upsert.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SINGLE_COMMIT_DEFAULT_MIN = 20; // minutos asignados a una sesión de 1 solo commit
const SESSION_GAP_MIN = 90;           // gap > esto entre commits => sesión nueva (no contar el hueco)

function parseArgs(argv) {
  const out = { date: null, codeDir: path.join(os.homedir(), 'code') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--code-dir') out.codeDir = argv[++i];
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) out.date = a;
  }
  if (!out.date) out.date = localTodayISO();
  return out;
}

function localTodayISO() {
  // Fecha local en America/Argentina/Buenos_Aires (UTC-3).
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function loadRepoMap() {
  const f = path.join(ROOT, 'state', 'repo-map.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return { author_emails: [], repos: {}, default_template: 'ad-hoc-<repo>-<fecha>' };
  }
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function gitCommitsForDay(repoDir, date, emails) {
  // commits del autor en [date 00:00, date+1 00:00) hora local. Formato: epoch|ISO|subject
  const since = `${date}T00:00:00-03:00`;
  const until = `${date}T23:59:59-03:00`;
  const args = [
    '-C', repoDir, 'log', '--no-merges',
    `--since=${since}`, `--until=${until}`,
    '--pretty=format:%at|%aI|%s',
  ];
  for (const e of emails) args.push(`--author=${e}`);
  let out;
  try {
    out = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return [];
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [epoch, iso, ...rest] = line.split('|');
      return { epoch: Number(epoch), iso, subject: rest.join('|') };
    })
    .sort((a, b) => a.epoch - b.epoch);
}

// Agrupa commits (ordenados por epoch) en sesiones: un gap > SESSION_GAP_MIN abre sesión nueva.
// Devuelve el total de minutos trabajados = suma de la duración de cada sesión (sin contar los
// huecos, ej. la noche). Una sesión de 1 commit aporta SINGLE_COMMIT_DEFAULT_MIN.
function sessionizedMinutes(commits) {
  if (!commits.length) return 0;
  const sessions = [[commits[0]]];
  for (let i = 1; i < commits.length; i++) {
    const gapMin = (commits[i].epoch - commits[i - 1].epoch) / 60;
    if (gapMin > SESSION_GAP_MIN) sessions.push([commits[i]]);
    else sessions[sessions.length - 1].push(commits[i]);
  }
  let total = 0;
  for (const s of sessions) {
    if (s.length === 1) total += SINGLE_COMMIT_DEFAULT_MIN;
    else total += Math.max(Math.round((s[s.length - 1].epoch - s[0].epoch) / 60), 5);
  }
  return { minutes: total, sessions: sessions.length };
}

function resolveTaskId(repoName, cfg, date, defaultTemplate) {
  const tmpl = (s) => s.replace('<fecha>', date).replace('<repo>', repoName.toLowerCase());
  if (cfg && cfg.task_id) return cfg.task_id;
  if (cfg && cfg.task_id_template) return tmpl(cfg.task_id_template);
  return tmpl(defaultTemplate);
}

function main() {
  const { date, codeDir } = parseArgs(process.argv);
  const map = loadRepoMap();
  const emails = map.author_emails || [];
  const proposals = [];

  let entries;
  try {
    entries = fs.readdirSync(codeDir, { withFileTypes: true });
  } catch (e) {
    console.error(`No pude leer ${codeDir}: ${e.message}`);
    process.exit(1);
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const repoName = ent.name;
    const repoDir = path.join(codeDir, repoName);
    if (!isGitRepo(repoDir)) continue;

    const commits = gitCommitsForDay(repoDir, date, emails);
    if (!commits.length) continue;

    const first = commits[0];
    const last = commits[commits.length - 1];
    const { minutes, sessions } = sessionizedMinutes(commits);
    const hhmm = (iso) => iso.slice(11, 16);
    const cfg = (map.repos || {})[repoName];
    const taskId = resolveTaskId(repoName, cfg, date, map.default_template || 'ad-hoc-<repo>-<fecha>');
    const subjects = commits.map((c) => c.subject).join('; ');
    const sessTag = sessions > 1 ? `, ${sessions} sesiones` : '';

    proposals.push({
      repo: repoName,
      task_id: taskId,
      module: cfg && cfg.module !== undefined ? cfg.module : null,
      commits: commits.length,
      first: hhmm(first.iso),
      last: hhmm(last.iso),
      time_spent_min: minutes,
      status: 'partial',
      notes: `${repoName} (${commits.length} commits ${hhmm(first.iso)}–${hhmm(last.iso)}${sessTag}): ${subjects}. [tiempo estimado de sesiones de commits — corregir si hace falta]`,
      estimated: true,
    });
  }

  proposals.sort((a, b) => b.time_spent_min - a.time_spent_min);
  const result = { date, generated_at: new Date().toISOString(), proposals };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
