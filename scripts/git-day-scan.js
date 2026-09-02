#!/usr/bin/env node
// cc-life-planner — escaneo de actividad del día para logueo auto.
//
// Uso:  node scripts/git-day-scan.js [YYYY-MM-DD] [--code-dir ~/code] [--no-github]
//       (sin fecha → hoy, hora local America/Argentina/Buenos_Aires)
//
// Captura el trabajo del autor (state/repo-map.json → author_emails / cuenta gh) del día:
//   - Commits de TODAS las ramas de cada repo en ~/code/* (`git log --all`, no solo el HEAD).
//   - Worktrees del mismo repo (comparten .git) se deduplican: se escanea un solo representante.
//   - Actividad de GitHub (PRs creadas/revisadas/comentadas, issues creados/comentados) vía `gh`
//     search. On por default; degrada a solo-git si `gh` no está autenticado o no hay red.
//
// Propone una entry de log por repo (combinando commits + GitHub):
//   - task_id / module  →  según state/repo-map.json (lookup por nombre de repo)
//   - time_spent_min    →  sesiones de commits (span, gap >90min) + costo fijo por evento GitHub.
//   - notes             →  resumen de commits + actividad GitHub. Tiempo ESTIMADO, no medido.
//
// Salida: JSON { date, generated_at, proposals: [ {repo, task_id, module, commits, first, last,
//   time_spent_min, status, notes, estimated, github?} ] }.
// NO escribe el log. El logueador muestra la propuesta, el usuario confirma/edita, y recién ahí upsert.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SINGLE_COMMIT_DEFAULT_MIN = 20; // minutos asignados a una sesión de 1 solo commit
const SESSION_GAP_MIN = 90;           // gap > esto entre commits => sesión nueva (no contar el hueco)

// Costo fijo por evento de GitHub (heurística — el tiempo de GitHub no tiene "duración" medible).
// Siempre `estimated: true`; el usuario corrige en /log. Precedencia por ítem: authored > reviewed > commented.
const GH_PR_MIN = 15;      // PR creada por el autor ESE día (no "actualizada" — ver ghSearch)
const GH_REVIEW_MIN = 20;  // review sobre una PR ajena
const GH_THREAD_MIN = 10;  // comentario(s) en una PR/issue ajena
const GH_ISSUE_MIN = 10;   // issue creado por el autor

function parseArgs(argv) {
  const out = { date: null, codeDir: path.join(os.homedir(), 'code'), github: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--code-dir') out.codeDir = argv[++i];
    else if (a === '--no-github') out.github = false;
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
  // `.git` es un dir en repos normales y un archivo en worktrees → existsSync cubre ambos.
  return fs.existsSync(path.join(dir, '.git'));
}

// Devuelve { gitDir, commonDir, isPrimary } absolutos para un repo/worktree, o null si no es git.
// Worktrees del mismo repo comparten `commonDir`; el principal cumple gitDir === commonDir.
function gitDirInfo(repoDir) {
  try {
    const out = execFileSync('git', ['-C', repoDir, 'rev-parse', '--git-dir', '--git-common-dir'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n');
    const gitDir = path.resolve(repoDir, out[0]);
    const commonDir = path.resolve(repoDir, out[1] || out[0]);
    return { gitDir, commonDir, isPrimary: gitDir === commonDir };
  } catch (e) {
    return null;
  }
}

// Agrupa los dirs de ~/code por repo físico (common-dir) y elige un representante por grupo,
// para no contar N veces los commits de worktrees que comparten .git.
function dedupeWorktrees(codeDir, dirNames, repoMap) {
  const groups = new Map(); // commonDir -> [{ name, repoDir, info }]
  for (const name of dirNames) {
    const repoDir = path.join(codeDir, name);
    if (!isGitRepo(repoDir)) continue;
    const info = gitDirInfo(repoDir);
    if (!info) continue;
    if (!groups.has(info.commonDir)) groups.set(info.commonDir, []);
    groups.get(info.commonDir).push({ name, repoDir, info });
  }
  const repos = [];
  for (const members of groups.values()) {
    // Preferir el repo principal; si no está acá, el que matchee repo-map; si no, alfabético.
    let rep = members.find((m) => m.info.isPrimary)
      || members.find((m) => (repoMap.repos || {})[m.name])
      || members.slice().sort((a, b) => a.name.localeCompare(b.name))[0];
    repos.push({ name: rep.name, repoDir: rep.repoDir });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

function gitCommitsForDay(repoDir, date, emails) {
  // commits del autor en [date 00:00, date+1 00:00) hora local, de TODAS las ramas. Formato: epoch|ISO|subject
  const since = `${date}T00:00:00-03:00`;
  const until = `${date}T23:59:59-03:00`;
  const args = [
    '-C', repoDir, 'log', '--all', '--no-merges',
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
  if (!commits.length) return { minutes: 0, sessions: 0 };
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

// ---- Capa GitHub (opt-out con --no-github; degrada si gh no está disponible) ----

function ghAvailable() {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 8000 });
    return true;
  } catch (e) {
    return false;
  }
}

let _ghLogin = null;
function ghLogin() {
  if (_ghLogin !== null) return _ghLogin;
  try {
    _ghLogin = execFileSync('gh', ['api', 'user', '--jq', '.login'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  } catch (e) {
    _ghLogin = '';
  }
  return _ghLogin;
}

function ghApiJson(endpoint) {
  try {
    const out = execFileSync('gh', ['api', endpoint, '--paginate'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 25000, maxBuffer: 20 * 1024 * 1024 });
    // --paginate concatena arrays: "][" entre páginas.
    return JSON.parse(out.replace(/\]\s*\[/g, ',') || '[]');
  } catch (e) {
    return null; // null = no se pudo verificar (≠ [] = verificado y vacío)
  }
}

// ¿El usuario dejó un review/comentario en ESTE ítem en ESTA fecha local?
// `--updated` de gh search solo dice "el hilo se movió ese día", no que lo hayas movido vos:
// un review tuyo de abril en una PR que otro cierra hoy se contaba como trabajo de hoy.
// Devuelve true/false, o null si no se pudo verificar (ahí conservamos el ítem para no perder señal).
function userTouchedOnDay(nameWithOwner, number, type, date) {
  const me = ghLogin();
  if (!me) return null;
  const endpoints = type === 'pr'
    ? [`repos/${nameWithOwner}/pulls/${number}/reviews`,
       `repos/${nameWithOwner}/pulls/${number}/comments`,
       `repos/${nameWithOwner}/issues/${number}/comments`]
    : [`repos/${nameWithOwner}/issues/${number}/comments`];
  let anyOk = false;
  for (const ep of endpoints) {
    const arr = ghApiJson(ep);
    if (arr === null || !Array.isArray(arr)) continue;
    anyOk = true;
    for (const it of arr) {
      const who = it.user && it.user.login;
      if (who !== me) continue;
      const when = it.submitted_at || it.created_at || it.updated_at;
      if (!when) continue;
      // Fecha LOCAL del usuario (America/Argentina/Buenos_Aires, UTC-3).
      const localDay = new Date(new Date(when).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      if (localDay === date) return true;
    }
  }
  return anyOk ? false : null;
}

function ghSearch(kind, qualifier, rango, dateFilter = 'updated') {
  // kind: 'prs' | 'issues'. qualifier: ej '--author=@me'. rango: 'YYYY-..-03:00..YYYY-..-03:00'.
  // dateFilter: 'created' (el ítem NACIÓ ese día) | 'updated' (hubo actividad ese día).
  // Para role=authored usamos SIEMPRE 'created': con 'updated' una PR vieja que alguien más
  // cierra/toca hoy se contaba como "PR creada hoy" e inventaba tiempo (caso real: 26 PRs de
  // abril cerradas en masa el 2026-07-16 → 390 min fantasma en un día sin trabajo).
  const args = [
    'search', kind, qualifier, `--${dateFilter}=${rango}`, '--limit', '100',
    '--json', 'number,title,repository,url,updatedAt',
  ];
  try {
    const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 25000 });
    return JSON.parse(out || '[]');
  } catch (e) {
    return [];
  }
}

// Devuelve { <repoName>: { prRoles: {num: role}, issueRoles: {num: role} } } con la actividad del
// autor en GitHub para la fecha. role ∈ authored|reviewed|commented (mayor peso gana por ítem).
function githubActivityForDay(date) {
  if (!ghAvailable()) {
    process.stderr.write('GitHub: gh no disponible o sin auth → sigo con git local.\n');
    return {};
  }
  const rango = `${date}T00:00:00-03:00..${date}T23:59:59-03:00`;
  process.stderr.write('GitHub: consultando actividad del autor (5 queries)…\n');
  const buckets = [
    // authored → 'created': solo lo que NACIÓ ese día (ver nota en ghSearch).
    { list: ghSearch('prs', '--author=@me', rango, 'created'), type: 'pr', role: 'authored' },
    { list: ghSearch('issues', '--author=@me', rango, 'created'), type: 'issue', role: 'authored' },
    // reviewed/commented → 'updated': gh search no expone la fecha del review/comentario en sí,
    // así que "hubo actividad ese día" es lo más fino disponible. Es condición necesaria pero no
    // suficiente → puede sobrecontar si otro tocó el hilo. Por eso todo sale `estimated: true`.
    { list: ghSearch('prs', '--reviewed-by=@me', rango), type: 'pr', role: 'reviewed' },
    { list: ghSearch('prs', '--commenter=@me', rango), type: 'pr', role: 'commented' },
    { list: ghSearch('issues', '--commenter=@me', rango), type: 'issue', role: 'commented' },
  ];
  const rank = { authored: 3, reviewed: 2, commented: 1 };
  const byRepo = {};
  let descartados = 0;
  for (const { list, type, role } of buckets) {
    for (const it of list || []) {
      const repo = it.repository && it.repository.name;
      if (!repo) continue;
      // authored ya vino filtrado por --created. reviewed/commented vinieron por --updated:
      // verificamos contra la API que la actividad sea TUYA y de ESE día.
      if (role !== 'authored') {
        const nwo = it.repository && it.repository.nameWithOwner;
        const touched = nwo ? userTouchedOnDay(nwo, it.number, type, date) : null;
        if (touched === false) { descartados++; continue; }
      }
      const b = byRepo[repo] || (byRepo[repo] = { prRoles: {}, issueRoles: {} });
      const roles = type === 'pr' ? b.prRoles : b.issueRoles;
      const cur = roles[it.number];
      if (!cur || rank[role] > rank[cur]) roles[it.number] = role;
    }
  }
  if (descartados) {
    process.stderr.write(`GitHub: ${descartados} ítem(s) descartado(s) — el hilo se movió ese día pero la actividad tuya es de otra fecha.\n`);
  }
  return byRepo;
}

// Convierte los roles de un repo en minutos estimados + conteos para las notas.
function ghMinutesAndCounts(b) {
  let minutes = 0;
  const c = { prs_creadas: 0, reviews: 0, prs_comentadas: 0, issues_creados: 0, issues_comentados: 0 };
  for (const role of Object.values(b.prRoles)) {
    if (role === 'authored') { minutes += GH_PR_MIN; c.prs_creadas++; }
    else if (role === 'reviewed') { minutes += GH_REVIEW_MIN; c.reviews++; }
    else { minutes += GH_THREAD_MIN; c.prs_comentadas++; }
  }
  for (const role of Object.values(b.issueRoles)) {
    if (role === 'authored') { minutes += GH_ISSUE_MIN; c.issues_creados++; }
    else { minutes += GH_THREAD_MIN; c.issues_comentados++; }
  }
  return { minutes, counts: c };
}

function ghCountsToText(c) {
  const plural = (n, sing, plur) => `${n} ${n === 1 ? sing : plur}`;
  const bits = [];
  if (c.prs_creadas) bits.push(plural(c.prs_creadas, 'PR creada', 'PRs creadas'));
  if (c.reviews) bits.push(plural(c.reviews, 'review', 'reviews'));
  if (c.prs_comentadas) bits.push(plural(c.prs_comentadas, 'PR comentada', 'PRs comentadas'));
  if (c.issues_creados) bits.push(plural(c.issues_creados, 'issue creado', 'issues creados'));
  if (c.issues_comentados) bits.push(plural(c.issues_comentados, 'issue comentado', 'issues comentados'));
  return bits.join(', ');
}

function resolveTaskId(repoName, cfg, date, defaultTemplate) {
  const tmpl = (s) => s.replace('<fecha>', date).replace('<repo>', repoName.toLowerCase());
  if (cfg && cfg.task_id) return cfg.task_id;
  if (cfg && cfg.task_id_template) return tmpl(cfg.task_id_template);
  return tmpl(defaultTemplate);
}

function main() {
  const { date, codeDir, github } = parseArgs(process.argv);
  const map = loadRepoMap();
  const emails = map.author_emails || [];
  const hhmm = (iso) => iso.slice(11, 16);

  let entries;
  try {
    entries = fs.readdirSync(codeDir, { withFileTypes: true });
  } catch (e) {
    console.error(`No pude leer ${codeDir}: ${e.message}`);
    process.exit(1);
  }

  // 1) Dedupe de worktrees → un representante por repo físico.
  const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const repos = dedupeWorktrees(codeDir, dirNames, map);

  // 2) Commits del día por repo (todas las ramas).
  const gitByName = {};
  for (const { name, repoDir } of repos) {
    const commits = gitCommitsForDay(repoDir, date, emails);
    if (!commits.length) continue;
    const { minutes, sessions } = sessionizedMinutes(commits);
    gitByName[name] = {
      commits: commits.length,
      minutes,
      sessions,
      first: hhmm(commits[0].iso),
      last: hhmm(commits[commits.length - 1].iso),
      subjects: commits.map((c) => c.subject).join('; '),
    };
  }

  // 3) Actividad de GitHub (on por default), keyed por nombre de repo (= clave de repo-map).
  const ghByRepo = github ? githubActivityForDay(date) : {};

  // 4) Merge: una proposal por repo combinando commits + GitHub.
  const allNames = new Set([...Object.keys(gitByName), ...Object.keys(ghByRepo)]);
  const proposals = [];
  for (const name of allNames) {
    const g = gitByName[name];
    const gh = ghByRepo[name] ? ghMinutesAndCounts(ghByRepo[name]) : null;
    if (gh && gh.minutes === 0) continue; // sin eventos reales

    const cfg = (map.repos || {})[name];
    const taskId = resolveTaskId(name, cfg, date, map.default_template || 'ad-hoc-<repo>-<fecha>');
    const moduleSlug = cfg && cfg.module !== undefined ? cfg.module : null;
    const minutes = (g ? g.minutes : 0) + (gh ? gh.minutes : 0);

    const parts = [];
    if (g) {
      const sessTag = g.sessions > 1 ? `, ${g.sessions} sesiones` : '';
      parts.push(`${g.commits} commits ${g.first}–${g.last}${sessTag}: ${g.subjects}`);
    }
    if (gh) {
      const txt = ghCountsToText(gh.counts);
      if (txt) parts.push(`GitHub: ${txt}`);
    }
    const notes = `${name} (${parts.join('. ')}). [tiempo estimado — corregir si hace falta]`;

    const proposal = {
      repo: name,
      task_id: taskId,
      module: moduleSlug,
      commits: g ? g.commits : 0,
      first: g ? g.first : null,
      last: g ? g.last : null,
      time_spent_min: minutes,
      status: 'partial',
      notes,
      estimated: true,
    };
    if (gh) proposal.github = gh.counts;
    proposals.push(proposal);
  }

  proposals.sort((a, b) => b.time_spent_min - a.time_spent_min);
  const result = { date, generated_at: new Date().toISOString(), proposals };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
