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

  const toH = (m) => `${Math.round((m / 60) * 10) / 10}h`;

  function rowReal(name, real, max, meta) {
    return `
      <div class="stats-row">
        <div class="name">${escapeHtml(name)}</div>
        <div class="bar" title="${real}min"><div class="actual" style="width:${(real / Math.max(max, 1)) * 100}%;height:100%"></div></div>
        <div class="pct">${toH(real)}</div>
        <div class="meta">${escapeHtml(meta || '')}</div>
      </div>
    `;
  }

  function factorRow(f) {
    // >1 = más lento que lo estimado (research); <1 = más rápido (dev agéntico)
    const cls = f.factor >= 1.5 ? 'bad' : f.factor >= 1.2 ? 'warn' : f.factor <= 0.8 ? 'good' : '';
    return `
      <div class="stats-row">
        <div class="name">${escapeHtml(f.category)}</div>
        <div class="bar" title="estimado ${f.estimated_min}min · real ${f.actual_min}min"><div class="actual" style="width:${Math.min((f.factor / 4) * 100, 100)}%;height:100%"></div></div>
        <div class="pct ${cls}">${f.factor}×</div>
        <div class="meta">${toH(f.estimated_min)} → ${toH(f.actual_min)}</div>
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
    let html = '';

    // tarjetas — todo tiempo REAL (del log), sin "planeado" ficticio
    html += '<div class="stats-totals">';
    html += card('días con datos', `${s.days_with_data} / ${s.window_days}`, '');
    html += card('tiempo real', toH(s.total_real_min), `${s.total_real_min}min loggeados`);
    html += card('promedio / día', s.days_with_data ? toH(Math.round(s.total_real_min / s.days_with_data)) : '0h', 'sobre días con datos');
    html += card('entradas done', `${s.done_entries}`, 'cosas cerradas');
    html += '</div>';

    // tiempo real por categoría
    const maxCat = Math.max(...s.by_category.map((c) => c.real_min), 1);
    html += '<div class="stats-table"><h2>tiempo real por categoría</h2>';
    if (s.by_category.length === 0) html += '<div style="color:var(--text-dim)">sin datos</div>';
    for (const c of s.by_category) html += rowReal(c.category, c.real_min, maxCat, `${c.share_pct}%`);
    html += '</div>';

    // tiempo real por día
    const maxDay = Math.max(...s.by_weekday.map((w) => w.real_min), 1);
    html += '<div class="stats-table"><h2>tiempo real por día</h2>';
    if (s.by_weekday.length === 0) html += '<div style="color:var(--text-dim)">sin datos</div>';
    for (const w of s.by_weekday) html += rowReal(w.weekday, w.real_min, maxDay, `${w.days_with_data}d · ~${toH(w.avg_min)}/d`);
    html += '</div>';

    // factor de optimismo BIMODAL (por categoría, donde hubo estimación)
    html += '<div class="stats-table"><h2>factor de optimismo por categoría</h2>';
    if (!s.factor_by_category || s.factor_by_category.length === 0) {
      html += '<div style="color:var(--text-dim);font-size:13px">Sin estimaciones recientes para calcular (el tablero no estima horas).</div>';
    } else {
      for (const f of s.factor_by_category) html += factorRow(f);
    }
    html += '</div>';

    html += '<div class="stats-rec">';
    html += `<strong>El factor es bimodal, no un número único.</strong> Dev agent-driven rinde &lt;1× (terminás más rápido); research / escritura se expande a 3-4×. Por eso un solo "factor implícito" promediado engaña. No se auto-aplica al plan: es guía cualitativa en <code>context.md</code> (dev ~0.4×, research ~4×). Acá lo ves por categoría, calculado sólo en días que tenían estimación.`;
    html += '</div>';

    document.getElementById('stats-content').innerHTML = html;
  }

  function card(label, value, sub, cls) {
    return `<div class="stat-card"><div class="label">${label}</div><div class="value ${cls || ''}">${value}</div><div class="sub">${sub}</div></div>`;
  }

  document.getElementById('stats-window').addEventListener('change', loadStats);
  window.loadStats = loadStats;
})();
