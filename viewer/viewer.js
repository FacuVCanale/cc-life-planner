// cc-life-planner viewer — vista del día
(() => {
  const state = {
    currentDate: todayISO(),
    plan: null,
    log: null,
    dates: { plans: [], logs: [] },
    expanded: null, // task_id de la card expandida (para mostrar el form de logueo)
  };

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function timeStrToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minToStr(m) { const h = Math.floor(m / 60) % 24; return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  function shiftDate(iso, days) {
    const d = new Date(iso + 'T12:00:00-03:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const DOW_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function dowName(iso) { return DOW_NAMES[new Date(iso + 'T12:00:00-03:00').getDay()]; }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok && res.status !== 404) throw new Error(`${path}: ${res.status}`);
    return { ok: res.ok, data: await res.json().catch(() => null) };
  }

  async function loadDates() {
    const r = await api('/api/dates');
    state.dates = r.data || { plans: [], logs: [] };
  }

  async function loadDay(date) {
    state.currentDate = date;
    state.expanded = null;
    const [planR, logR] = await Promise.all([api(`/api/plan/${date}`), api(`/api/log/${date}`)]);
    state.plan = planR.ok ? planR.data : null;
    state.log = logR.data || { date, entries: [] };
    render();
  }

  function actualByTaskId() {
    const map = {};
    for (const e of (state.log?.entries || [])) {
      map[e.task_id] = (map[e.task_id] || 0) + (Number(e.time_spent_min) || 0);
    }
    return map;
  }

  function entryByTaskId() {
    const map = {};
    for (const e of (state.log?.entries || [])) map[e.task_id] = e;
    return map;
  }

  function render() {
    document.getElementById('date-picker').value = state.currentDate;
    renderBrief();
  }

  // helper: color de categoría desde plan.categories
  function catColor(cat) { return (state.plan?.categories || {})[cat] || '#64748b'; }
  // helper: días hasta una fecha ISO (desde currentDate)
  function daysUntil(iso) {
    if (!iso) return null;
    const a = new Date(state.currentDate + 'T12:00:00-03:00');
    const b = new Date(iso + 'T12:00:00-03:00');
    return Math.round((b - a) / 86400000);
  }

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fechaLarga(iso) {
    const d = new Date(iso + 'T12:00:00-03:00');
    const dow = dowName(iso);
    return `${dow.charAt(0).toUpperCase()}${dow.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  function sectionLabel(text) { return `<h2 class="brief-section">${escapeHtml(text)}</h2>`; }

  // síntesis del día, como la escribiría un asistente
  function buildLead(fijo, must) {
    const bits = [];
    if (fijo.length) bits.push(`${fijo.length} ${fijo.length === 1 ? 'cosa fija' : 'cosas fijas'} en la agenda`);
    if (must.length) bits.push(`${must.length} que ${must.length === 1 ? 'mueve' : 'mueven'} la aguja`);
    let s = bits.length ? bits.join(' · ') + '.' : '';
    if (must[0]) s += ` El foco: ${must[0].title}.`;
    return s;
  }

  // Render editorial: el brief del día (una columna tipo documento)
  function renderBrief() {
    const el = document.getElementById('brief');
    const isToday = state.currentDate === todayISO();
    const kicker = isToday ? 'hoy' : 'tu día';
    let head = `<header class="brief-head"><p class="brief-kicker">${kicker}</p><h1 class="brief-date">${escapeHtml(fechaLarga(state.currentDate))}</h1>`;

    if (!state.plan) {
      el.innerHTML = head + `<p class="brief-lead">No hay plan para esta fecha. Generalo con <code>/plan-hoy</code>.</p></header>`;
      return;
    }
    const p = state.plan;
    const must = p.must_dos || [];
    const carr = p.carriles || [];
    const fijo = (p.blocks || []).slice().sort((a, b) => timeStrToMin(a.start) - timeStrToMin(b.start));
    const alertas = p.alertas || [];
    const proximos = p.proximos_anclas || [];
    const entries = entryByTaskId();
    const titleByBlockId = {};
    for (const b of p.blocks || []) if (b.id) titleByBlockId[b.id] = b.title;

    const recs = p.strategic_recommendations || [];
    const lead = recs[0] || buildLead(fijo, must);
    let html = head + (lead ? `<p class="brief-lead">${escapeHtml(lead)}</p>` : '') + '</header>';

    // Tu día (calendar fijo) — el marco del día va primero
    if (fijo.length) {
      html += sectionLabel('Tu día');
      html += '<div class="agenda">';
      for (const b of fijo) {
        const att = (b.attention && b.attention !== 'full') ? `<span class="ag-att">${escapeHtml(b.attention)}</span>` : '';
        html += `<div class="agenda-row">
          <span class="ag-time">${escapeHtml(b.start)}-${escapeHtml(b.end)}</span>
          <span class="ag-dot" style="background:${catColor(b.category)}"></span>
          <span class="ag-title">${escapeHtml(b.title)}${att}</span>
        </div>`;
      }
      html += '</div>';
    }

    // Lo que importa (must-do) — logueable. La descripción (por qué + táctica) aparece al abrir el item.
    if (must.length) {
      html += sectionLabel('Lo que importa');
      html += '<ol class="lo-list">';
      for (const m of must) {
        const d = daysUntil(m.deadline);
        const urg = (m.deadline && d != null && d <= 1) ? 'urgent' : (m.deadline && d != null && d <= 3) ? 'soon' : '';
        const when = m.deadline ? (d <= 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence ${m.deadline}`) : '';
        const can = !!m.task_id;
        const exp = can && state.expanded === m.task_id;
        const attrs = can ? ` data-task-id="${escapeHtml(m.task_id)}" tabindex="0" role="button" aria-expanded="${exp}"` : '';
        const descHtml = `${m.why ? `<p class="lo-why">${escapeHtml(m.why)}</p>` : ''}${m.tactical ? `<p class="lo-tactic">${escapeHtml(m.tactical)}</p>` : ''}`;
        const body = can ? (exp ? `<div class="lo-desc">${descHtml}</div>${renderLogForm(m.task_id, entries[m.task_id])}` : '') : descHtml;
        html += `<li class="lo-item${can ? ' loggable' : ''}"${attrs}>
          <div class="lo-row">
            <span class="lo-title">${escapeHtml(m.title)}</span>
            ${when ? `<span class="lo-when ${urg}">${escapeHtml(when)}</span>` : ''}
            ${can ? loggedBadge(m.task_id) : ''}
            ${can ? `<span class="lo-toggle" aria-hidden="true">${exp ? '−' : '+'}</span>` : ''}
          </div>
          ${body}
        </li>`;
      }
      html += '</ol>';
    }

    // En paralelo (carriles) — logueable
    if (carr.length) {
      html += sectionLabel('En paralelo');
      html += '<ul class="par-list">';
      for (const c of carr) {
        const laneColor = LANE_COLORS[slug(c.lane)] || 'var(--text-mut)';
        const exp = c.task_id && state.expanded === c.task_id;
        const attrs = c.task_id ? ` data-task-id="${escapeHtml(c.task_id)}" tabindex="0" role="button" aria-expanded="${exp}"` : '';
        const can = !!c.task_id;
        const conc = c.concurrent_with ? `junto a ${escapeHtml(titleByBlockId[c.concurrent_with] || c.concurrent_with)}` : '';
        const noteHtml = (c.note || conc) ? `<p class="par-note">${escapeHtml(c.note || '')}${c.note && conc ? ' · ' : ''}${conc}</p>` : '';
        const body = can ? (exp ? `<div class="lo-desc">${noteHtml}</div>${renderLogForm(c.task_id, entries[c.task_id])}` : '') : noteHtml;
        html += `<li class="par-item${can ? ' loggable' : ''}"${attrs}>
          <div class="par-row">
            <span class="par-lane" style="color:${laneColor}">${escapeHtml(c.lane || '')}</span>
            <span class="par-title">${escapeHtml(c.title)}</span>
            ${can ? loggedBadge(c.task_id) : ''}
            ${can ? `<span class="lo-toggle" aria-hidden="true">${exp ? '−' : '+'}</span>` : ''}
          </div>
          ${body}
        </li>`;
      }
      html += '</ul>';
    }

    // Ojo con (alertas) — dot por severidad, sobrio
    if (alertas.length) {
      html += sectionLabel('Ojo con');
      html += '<ul class="ojo-list">';
      for (const a of alertas) {
        html += `<li class="ojo-item"><span class="ojo-dot ojo--${slug(a.kind)}"></span><span><span class="ojo-kind">${escapeHtml(a.kind || '')}</span>${escapeHtml(a.text)}</span></li>`;
      }
      html += '</ul>';
    }

    // Lo que viene (próximos anclas)
    if (proximos.length) {
      html += sectionLabel('Lo que viene');
      html += '<ul class="viene-list">';
      for (const x of proximos) html += `<li><span class="viene-when">${escapeHtml(x.date)}</span><span>${escapeHtml(x.text)}</span></li>`;
      html += '</ul>';
    }

    // Notas al pie — recomendaciones restantes, para después, calibración, resumen del log
    const restRecs = recs.slice(1);
    const deferred = p.deferred || [];
    const cal = p.calibration_notes || [];
    const log = state.log || { entries: [] };
    const notas = [];
    restRecs.forEach((r) => notas.push(escapeHtml(r)));
    deferred.forEach((d) => notas.push(`<strong>${escapeHtml(d.title)}</strong> → ${escapeHtml(d.moved_to)} · ${escapeHtml(d.reason || '')}`));
    if (log.entries.length > 0) {
      const actualMin = log.entries.reduce((s, e) => s + (Number(e.time_spent_min) || 0), 0);
      const done = log.entries.filter((e) => e.status === 'done').length;
      notas.push(`Hoy registrado: <strong>${actualMin}min</strong> en ${log.entries.length} entradas · ${done} done`);
    }
    cal.forEach((c) => notas.push(escapeHtml(c)));
    if (notas.length) {
      html += sectionLabel('Notas');
      html += '<ul class="notas-list">';
      notas.forEach((n) => (html += `<li>${n}</li>`));
      html += '</ul>';
    }

    el.innerHTML = html;
  }

  // form de logueo embebido en cards con task_id (reusa POST /api/log vía el submit handler global)
  function renderLogForm(taskId, entry) {
    const e = entry || {};
    return `
      <div class="tl-detail">
        <form class="tl-form" data-task-id="${escapeHtml(taskId)}" onsubmit="return false">
          <label>tiempo real: <input type="number" name="time_spent_min" min="0" step="5" value="${e.time_spent_min ?? ''}" placeholder="min" /></label>
          <label>status:
            <select name="status">
              <option value="done" ${e.status === 'done' ? 'selected' : ''}>done</option>
              <option value="partial" ${e.status === 'partial' ? 'selected' : ''}>partial</option>
              <option value="deferred" ${e.status === 'deferred' ? 'selected' : ''}>deferred</option>
              <option value="skipped" ${e.status === 'skipped' ? 'selected' : ''}>skipped</option>
            </select>
          </label>
          <textarea name="notes" placeholder="notas (opcional)">${escapeHtml(e.notes || '')}</textarea>
          <button data-action="save">guardar</button>
        </form>
      </div>
    `;
  }

  // badge de min reales + status para una card con task_id
  function loggedBadge(taskId) {
    const e = entryByTaskId()[taskId];
    if (!e || !(Number(e.time_spent_min) > 0)) return '';
    const cls = e.status === 'done' ? 'done' : 'logged';
    return `<span class="badge ${cls}">${e.time_spent_min}min · ${escapeHtml(e.status)}</span>`;
  }

  const LANE_COLORS = {
    compromiso: '#06b6d4', emergente: '#10b981', cierre: '#f59e0b',
    alethia: '#10b981', trabajo: '#10b981', uni: '#3b82f6', research: '#10b981',
  };
  function slug(s) { return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-'); }

  // (el render de cada sección vive ahora en renderBrief, formato editorial de una columna)

  // expandir/colapsar el form de logueo al clickear (o Enter/Space) una card con task_id
  function toggleCard(card) {
    const taskId = card.dataset.taskId;
    state.expanded = state.expanded === taskId ? null : taskId;
    render();
  }
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('.tl-form')) return;             // clicks dentro del form no togglean
    const card = ev.target.closest('.loggable[data-task-id]');
    if (card) toggleCard(card);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.target.closest('.tl-form')) return;
    const card = ev.target.closest('.loggable[data-task-id]');
    if (!card) return;
    ev.preventDefault();
    toggleCard(card);
  });

  // navegación
  function navigatePrev() {
    const all = [...new Set([...state.dates.plans, ...state.dates.logs])].sort();
    const before = all.filter((d) => d < state.currentDate);
    const target = before.length ? before[before.length - 1] : shiftDate(state.currentDate, -1);
    loadDay(target);
  }
  function navigateNext() {
    const all = [...new Set([...state.dates.plans, ...state.dates.logs])].sort();
    const after = all.filter((d) => d > state.currentDate);
    const target = after.length ? after[0] : shiftDate(state.currentDate, 1);
    loadDay(target);
  }

  // form submit
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action=save]');
    if (!btn) return;
    const form = btn.closest('form');
    const taskId = form.dataset.taskId;
    const formData = new FormData(form);
    // tomamos el valor actual del input como TOTAL deseado, no incremento
    const totalWanted = Number(formData.get('time_spent_min')) || 0;
    const cur = entryByTaskId()[taskId];
    const delta = totalWanted - (cur?.time_spent_min || 0);

    btn.disabled = true;
    btn.textContent = 'guardando…';
    try {
      const res = await fetch(`/api/log/${state.currentDate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          time_spent_min: delta,
          status: formData.get('status'),
          notes: formData.get('notes'),
          timestamp: new Date().toISOString(),
        }),
      });
      const log = await res.json();
      state.log = log;
      render();
    } catch (e) {
      alert('error guardando: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'guardar';
    }
  });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hexToRgba(hex, a) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return `rgba(100,116,139,${a})`;
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})`;
  }

  // wire up
  document.getElementById('btn-prev').addEventListener('click', navigatePrev);
  document.getElementById('btn-next').addEventListener('click', navigateNext);
  document.getElementById('btn-today').addEventListener('click', () => loadDay(todayISO()));
  document.getElementById('date-picker').addEventListener('change', (e) => loadDay(e.target.value));
  document.getElementById('btn-day').addEventListener('click', () => switchView('day'));
  document.getElementById('btn-stats').addEventListener('click', () => switchView('stats'));

  function switchView(name) {
    document.getElementById('view-day').hidden = name !== 'day';
    document.getElementById('view-stats').hidden = name !== 'stats';
    document.getElementById('btn-day').classList.toggle('active', name === 'day');
    document.getElementById('btn-stats').classList.toggle('active', name === 'stats');
    if (name === 'stats' && window.loadStats) window.loadStats();
  }

  // expose para stats.js
  window.viewerSwitchToDay = () => switchView('day');

  // init
  loadDates().then(() => loadDay(todayISO())).catch((e) => {
    document.getElementById('brief').innerHTML = `<div class="error">error: ${escapeHtml(e.message)}<br>¿Está corriendo el server? (node viewer/serve.js)</div>`;
  });
})();
