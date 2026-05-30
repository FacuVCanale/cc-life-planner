// cc-life-planner — vista de stats
(() => {
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function pctClass(pct) {
    const a = Math.abs(pct);
    if (a <= 20) return 'good';
    if (a <= 50) return 'warn';
    return 'bad';
  }

  function statRow(name, planned, actual, pct, meta) {
    const max = Math.max(planned, actual, 1);
    const sign = pct >= 0 ? '+' : '';
    return `
      <div class="stats-row">
        <div class="name">${escapeHtml(name)}</div>
        <div class="bar" title="planeado ${planned}min · real ${actual}min">
          <div class="planned" style="width:${(planned / max) * 100}%"></div>
          <div class="actual"  style="width:${(actual / max) * 100}%"></div>
        </div>
        <div class="pct ${pctClass(pct)}">${sign}${pct}%</div>
        <div class="meta">${escapeHtml(meta || '')}</div>
      </div>
    `;
  }

  async function loadStats() {
    const days = Number(document.getElementById('stats-window').value) || 30;
    const container = document.getElementById('stats-content');
    container.innerHTML = '<div style="color:var(--text-dim)">cargando…</div>';
    try {
      const res = await fetch(`/api/stats?days=${days}`);
      const s = await res.json();
      render(s);
    } catch (e) {
      container.innerHTML = `<div class="error">error: ${escapeHtml(e.message)}</div>`;
    }
  }

  function render(s) {
    const totals = s.totals;
    const sign = totals.diff_min >= 0 ? '+' : '';
    let html = '';

    // tarjetas
    html += '<div class="stats-totals">';
    html += card('días con datos', `${s.days_with_data} / ${s.window_days}`, '');
    html += card('planeado', `${Math.round(totals.planned_min / 60 * 10) / 10}h`, `${totals.planned_min}min`);
    html += card('real', `${Math.round(totals.actual_min / 60 * 10) / 10}h`, `${totals.actual_min}min`);
    html += card('diff', `${sign}${totals.diff_pct}%`, `${sign}${totals.diff_min}min`, pctClass(totals.diff_pct));
    html += '</div>';

    // por categoría
    html += '<div class="stats-table"><h2>por categoría</h2>';
    if (s.by_category.length === 0) html += '<div style="color:var(--text-dim)">sin datos</div>';
    for (const c of s.by_category) {
      html += statRow(c.category, c.planned_min, c.actual_min, c.diff_pct, `${c.tasks} bloques`);
    }
    html += '</div>';

    // por día de la semana
    html += '<div class="stats-table"><h2>por día de la semana</h2>';
    if (s.by_weekday.length === 0) html += '<div style="color:var(--text-dim)">sin datos</div>';
    for (const w of s.by_weekday) {
      html += statRow(w.weekday, w.planned_min, w.actual_min, w.diff_pct, `${w.days_with_data} días`);
    }
    html += '</div>';

    // recomendación
    html += '<div class="stats-rec">';
    const f = s.implied_calibration_factor;
    html += `<strong>completion rate:</strong> ${Math.round(s.completion_rate * 100)}% &nbsp;·&nbsp; <strong>factor implícito:</strong> ${f}<br>`;
    if (f > 1.5) {
      html += `Estimás <strong>${Math.round((f - 1) * 100)}%</strong> optimista. Sugerencia: subir <code>factor_optimismo</code> a ${Math.round(f * 10) / 10}.`;
    } else if (f < 0.85) {
      html += `Estás siendo <strong>${Math.round((1 - f) * 100)}% pesimista</strong> (o no llenás los bloques). Considerá bajar el factor o revisar por qué quedan bloques sin completar.`;
    } else {
      html += `Calibración estable (factor implícito cerca del default 1.4). Sin cambios sugeridos.`;
    }
    html += '</div>';

    document.getElementById('stats-content').innerHTML = html;
  }

  function card(label, value, sub, cls) {
    return `<div class="stat-card"><div class="label">${label}</div><div class="value ${cls || ''}">${value}</div><div class="sub">${sub}</div></div>`;
  }

  document.getElementById('stats-window').addEventListener('change', loadStats);
  window.loadStats = loadStats;
})();
