// cc-life-planner viewer — vista del día
(() => {
  const TIMELINE_START = 7 * 60;  // 07:00
  const TIMELINE_END = 26 * 60;   // 02:00 del día siguiente — soporta bloques que cruzan medianoche
  const PX_PER_MIN = 1.0;         // 1px = 1min → ~1140px total

  const state = {
    currentDate: todayISO(),
    plan: null,
    log: null,
    dates: { plans: [], logs: [] },
    expanded: null, // task_id del block expandido
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
    const isToday = state.currentDate === todayISO();
    document.getElementById('day-title').textContent =
      `${dowName(state.currentDate)} ${state.currentDate}${isToday ? ' (hoy)' : ''}`;
    document.getElementById('day-meta').textContent = state.plan
      ? `factor calibración: ${state.plan.calibration_factor || 1.4}`
      : 'sin plan para esta fecha';

    renderTimeline();
    renderSidePanel();
  }

  function renderTimeline() {
    const tl = document.getElementById('timeline');
    tl.innerHTML = '';

    // hours
    for (let m = TIMELINE_START; m <= TIMELINE_END; m += 60) {
      const top = (m - TIMELINE_START) * PX_PER_MIN;
      const label = document.createElement('div');
      label.className = 'tl-hour';
      label.style.top = `${top}px`;
      label.textContent = minToStr(m);
      tl.appendChild(label);
      const line = document.createElement('div');
      line.className = 'tl-hour-line';
      line.style.top = `${top}px`;
      tl.appendChild(line);
    }
    tl.style.minHeight = `${(TIMELINE_END - TIMELINE_START) * PX_PER_MIN + 20}px`;

    if (!state.plan) {
      const empty = document.createElement('div');
      empty.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:var(--text-dim);';
      empty.textContent = 'No hay plan para esta fecha. Generá uno con /plan-hoy en Claude Code.';
      tl.appendChild(empty);
      return;
    }

    const cats = state.plan.categories || {};
    const actuals = actualByTaskId();
    const entries = entryByTaskId();
    const layout = computeLayout(state.plan.blocks || []);
    const titleByBlockId = {};
    for (const b of state.plan.blocks || []) if (b.id) titleByBlockId[b.id] = b.title;

    for (const block of state.plan.blocks || []) {
      const startMin = timeStrToMin(block.start);
      let endMin = timeStrToMin(block.end);
      if (endMin <= startMin) endMin += 1440; // bloque que cruza medianoche
      if (endMin < TIMELINE_START || startMin > TIMELINE_END) continue;
      const top = (Math.max(startMin, TIMELINE_START) - TIMELINE_START) * PX_PER_MIN;
      const height = (Math.min(endMin, TIMELINE_END) - Math.max(startMin, TIMELINE_START)) * PX_PER_MIN;

      const expandedNow = state.expanded === block.task_id;
      const el = document.createElement('div');
      el.className = 'tl-block' + (block.type === 'calendar' ? ' calendar' : '') + (expandedNow ? ' expanded' : '');
      el.style.top = `${top}px`;
      el.style.height = `${Math.max(height, 28)}px`;

      // lane positioning para bloques que se superponen (vía CSS vars en styles.css)
      const lane = layout.get(block) || { lane: 0, total: 1 };
      if (lane.total > 1) {
        el.style.setProperty('--lane', lane.lane);
        el.style.setProperty('--total', lane.total);
        el.classList.add('concurrent');
      }

      const color = cats[block.category] || '#64748b';
      el.style.borderLeftColor = color;
      el.style.background = `linear-gradient(to right, ${hexToRgba(color, 0.15)}, var(--surface-2) 30%)`;

      const planned = endMin - startMin;
      const actual = actuals[block.task_id] || 0;
      let badgeHtml = '';
      if (block.task_id && actual > 0) {
        const diffPct = ((actual - planned) / planned) * 100;
        const cls = Math.abs(diffPct) <= 20 ? 'good' : Math.abs(diffPct) <= 50 ? 'warn' : 'bad';
        const sign = diffPct >= 0 ? '+' : '';
        badgeHtml = `<span class="tl-block-badge ${cls}">${actual}min · ${sign}${Math.round(diffPct)}%</span>`;
      }

      // marcadores extra: estimación default + concurrente
      let extras = '';
      const estStar = block.estimated_hours_default ? '<span class="tl-block-mark" title="estimación default — refinala con /capturar">*</span>' : '';
      if (block.concurrent_with) {
        const otherTitle = titleByBlockId[block.concurrent_with] || block.concurrent_with;
        extras += `<div class="tl-block-concurrent" title="concurrente con ${escapeHtml(otherTitle)}">↗ con: ${escapeHtml(otherTitle)}</div>`;
      }
      if (block.attention && block.attention !== 'full' && block.type === 'calendar') {
        extras += `<div class="tl-block-attention">attention: ${escapeHtml(block.attention)}</div>`;
      }

      const detailHtml = expandedNow ? renderDetail(block, entries[block.task_id]) : '';
      el.innerHTML = `
        <div class="tl-block-title">${escapeHtml(block.title)}${estStar}${badgeHtml}</div>
        <div class="tl-block-time">${block.start}–${block.end} · ${escapeHtml(block.category || '')}</div>
        ${extras}
        ${detailHtml}
      `;

      if (block.task_id) {
        el.addEventListener('click', (ev) => {
          if (ev.target.closest('.tl-form')) return;
          state.expanded = expandedNow ? null : block.task_id;
          render();
        });
      }
      tl.appendChild(el);
    }
  }

  // Asigna a cada bloque {lane, total} para superposiciones.
  // Bloques que se solapan (transitivamente) en el tiempo comparten un "grupo"
  // y se reparten el ancho horizontalmente.
  function computeLayout(blocks) {
    const items = blocks
      .map((b, i) => { const sm = timeStrToMin(b.start); let em = timeStrToMin(b.end); if (em <= sm) em += 1440; return { b, i, startMin: sm, endMin: em }; })
      .sort((a, b) => a.startMin - b.startMin || a.i - b.i);

    const groups = [];
    for (const it of items) {
      let merged = false;
      for (const g of groups) {
        if (g.maxEnd > it.startMin) {
          g.items.push(it);
          g.maxEnd = Math.max(g.maxEnd, it.endMin);
          merged = true;
          break;
        }
      }
      if (!merged) groups.push({ items: [it], maxEnd: it.endMin });
    }

    const layout = new Map();
    for (const g of groups) {
      const total = g.items.length;
      g.items.forEach((it, lane) => layout.set(it.b, { lane, total }));
    }
    return layout;
  }

  function renderDetail(block, entry) {
    const j = block.justification || {};
    const e = entry || {};
    return `
      <div class="tl-detail" onclick="event.stopPropagation()">
        ${j.why_today ? `<div class="why">↳ <strong>hoy:</strong> ${escapeHtml(j.why_today)}</div>` : ''}
        ${j.why_order ? `<div class="why">↳ <strong>orden:</strong> ${escapeHtml(j.why_order)}</div>` : ''}
        <form class="tl-form" data-task-id="${escapeHtml(block.task_id)}" onsubmit="return false">
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

  function renderSidePanel() {
    const sp = document.getElementById('side-panel');
    if (!state.plan) {
      sp.innerHTML = '<div class="empty">Sin plan para mostrar.</div>';
      return;
    }

    let html = '';

    // Tablero (Feature 2): secciones nuevas. Aditivas — si el plan no las trae, no se muestran.
    const mustDos = state.plan.must_dos || [];
    if (mustDos.length) {
      html += '<h2>🎯 must-do</h2><ul>';
      for (const m of mustDos) {
        const meta = [m.deadline ? `vence ${escapeHtml(m.deadline)}` : '', escapeHtml(m.why || '')].filter(Boolean).join(' · ');
        html += `<li>${escapeHtml(m.title)}${meta ? `<br><span class="deferred-when">${meta}</span>` : ''}${m.tactical ? `<br><span class="deferred-when">${escapeHtml(m.tactical)}</span>` : ''}</li>`;
      }
      html += '</ul>';
    }

    const carriles = state.plan.carriles || [];
    if (carriles.length) {
      html += '<h2>🚦 carriles</h2><ul>';
      for (const c of carriles) {
        html += `<li><strong>${escapeHtml(c.lane || '')}</strong> · ${escapeHtml(c.title)}${c.note ? `<br><span class="deferred-when">${escapeHtml(c.note)}</span>` : ''}</li>`;
      }
      html += '</ul>';
    }

    const alertas = state.plan.alertas || [];
    if (alertas.length) {
      html += '<h2>⚠️ alertas</h2><ul>';
      for (const a of alertas) html += `<li><span class="alerta-kind">${escapeHtml(a.kind || '')}</span> ${escapeHtml(a.text)}</li>`;
      html += '</ul>';
    }

    const proximos = state.plan.proximos_anclas || [];
    if (proximos.length) {
      html += '<h2>🔭 próximos anclas</h2><ul>';
      for (const p of proximos) html += `<li><span class="deferred-when">${escapeHtml(p.date)}</span> ${escapeHtml(p.text)}</li>`;
      html += '</ul>';
    }

    const deferred = state.plan.deferred || [];
    html += '<h2>para después</h2>';
    if (deferred.length === 0) {
      html += '<div class="empty">nada pateado.</div>';
    } else {
      html += '<ul>';
      for (const d of deferred) {
        html += `<li>${escapeHtml(d.title)}<br><span class="deferred-when">→ ${escapeHtml(d.moved_to)} · ${escapeHtml(d.reason || '')}</span></li>`;
      }
      html += '</ul>';
    }

    const recs = state.plan.strategic_recommendations || [];
    html += '<h2>recomendaciones</h2>';
    if (recs.length === 0) html += '<div class="empty">ninguna.</div>';
    else { html += '<ul>'; recs.forEach((r) => (html += `<li>${escapeHtml(r)}</li>`)); html += '</ul>'; }

    // Resumen del día (si hay log)
    const log = state.log || { entries: [] };
    if (log.entries.length > 0) {
      const actuals = actualByTaskId();
      let plannedMin = 0;
      for (const b of state.plan.blocks || []) if (b.task_id) { const sm = timeStrToMin(b.start); let em = timeStrToMin(b.end); if (em <= sm) em += 1440; plannedMin += em - sm; }
      const actualMin = log.entries.reduce((s, e) => s + (Number(e.time_spent_min) || 0), 0);
      const done = log.entries.filter((e) => e.status === 'done').length;
      const total = (state.plan.blocks || []).filter((b) => b.task_id).length;
      html += '<h2>resumen del día</h2>';
      html += `<div class="summary">`;
      html += `Planeado: <strong>${plannedMin}min</strong><br>`;
      html += `Real: <strong>${actualMin}min</strong> (${plannedMin ? Math.round((actualMin / plannedMin - 1) * 100) : 0}%)<br>`;
      html += `Completadas: <strong>${done}/${total}</strong>`;
      html += `</div>`;
    }

    const cal = state.plan.calibration_notes || [];
    if (cal.length > 0) {
      html += '<h2>calibración</h2>';
      html += '<ul>';
      cal.forEach((c) => (html += `<li>${escapeHtml(c)}</li>`));
      html += '</ul>';
    }

    sp.innerHTML = html;
  }

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
    const planned = (() => {
      for (const b of state.plan.blocks || []) if (b.task_id === taskId) { const sm = timeStrToMin(b.start); let em = timeStrToMin(b.end); if (em <= sm) em += 1440; return em - sm; }
      return 0;
    })();
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
    document.getElementById('timeline').innerHTML = `<div class="error">error: ${escapeHtml(e.message)}<br>¿Está corriendo el server? (node viewer/serve.js)</div>`;
  });
})();
