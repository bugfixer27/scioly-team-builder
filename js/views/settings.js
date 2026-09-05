// Settings view: weights (live re-score preview), caps, author, theme, diagnostics.
import { esc, fmtTime } from '../ui.js';
import { FACTORS, computeScore, band } from '../score.js';
import { maskedApiUrl } from '../api.js';

export function mount(root, ctx) {
  const { store, actions } = ctx;
  let built = false;

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.w) { const v = clamp(t.value, 0, 5); actions.setSettings({ weights: { [t.dataset.w]: v } }); }
    else if (t.dataset.s) { const v = Math.max(0, Math.round(Number(t.value) || 0)); actions.setSettings({ [t.dataset.s]: v }); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'author') actions.setAuthor(t.value.trim());
    if (t.name === 'theme') actions.setTheme(t.value);
  });
  root.addEventListener('click', e => { if (e.target.dataset.act === 'reset-weights') { actions.setSettings({ weights: { ...store.server.defaults.weights } }); built = false; render(); } });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

  function bandChanges() {
    const base = store.baseState.settings.weights, cur = store.state.settings.weights;
    let n = 0; store.responses.forEach(r => { if (band(computeScore(r, base).score) !== band(computeScore(r, cur).score)) n++; });
    const dist = { A: 0, B: 0, C: 0 }; store.responses.forEach(r => { dist[band(computeScore(r, cur).score)]++; });
    return { n, dist };
  }

  function render() {
    // Don't rebuild the form under the user's fingers; just refresh the live bits.
    if (built && root.contains(document.activeElement) && document.activeElement.matches('input')) { refreshLive(); return; }
    const s = store.state.settings, w = s.weights;
    const meta = store.server.responseMeta || {};
    const api = maskedApiUrl();
    const missing = meta.missingFields || [], unmapped = meta.unmappedHeaders || [];
    root.innerHTML = `<div class="two-col">
      <div style="display:grid;gap:12px">
        <div class="card-panel"><h3>Score weights <span class="muted small" style="font-weight:400">(0–5, saved with everything else)</span> <button class="btn xs ghost" data-act="reset-weights" style="float:right">Reset to defaults</button></h3>
          <div class="weights">${FACTORS.map(f => `<label class="field">${esc(f.label)}<input class="input" type="number" min="0" max="5" step="1" value="${w[f.key] ?? 0}" data-w="${f.key}"></label>`).join('')}</div>
          <p class="small" id="live-bands" style="margin:10px 0 0"></p></div>
        <div class="card-panel"><h3>Rules & thresholds</h3>
          <div class="weights" style="grid-template-columns:repeat(3,1fr)">
            <label class="field">Team cap (Division C: 15)<input class="input" type="number" min="1" value="${s.teamCap}" data-s="teamCap"></label>
            <label class="field">Senior cap (Division C: 7)<input class="input" type="number" min="0" value="${s.seniorCap}" data-s="seniorCap"></label>
            <label class="field">Warn at n events<input class="input" type="number" min="1" value="${s.eventWarnAt}" data-s="eventWarnAt"></label></div></div>
        <div class="card-panel"><h3>This computer</h3>
          <div class="weights" style="grid-template-columns:1fr 1fr">
            <label class="field">Your display name (written to the change log)<input class="input" name="author" maxlength="60" value="${esc(ctx.getAuthor())}"></label>
            <label class="field">Theme<select class="input" name="theme">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${ctx.getTheme() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div></div>
      </div>
      <div class="card-panel"><h3>Diagnostics</h3>
        ${missing.length ? `<div class="notice warn" style="margin-bottom:8px">⚠ The form wording changed; these fields aren't being read: <b>${esc(missing.join(', '))}</b>. Edit <code>FIELD_PATTERNS</code> in the Apps Script and deploy a new version.</div>` : ''}
        <dl class="kv">
          <dt>API URL</dt><dd class="mono">${esc(api.url)}</dd>
          <dt>Token</dt><dd class="mono">${esc(api.token)}</dd>
          <dt>Poll interval</dt><dd>${esc(String(ctx.pollSeconds))} s</dd>
          <dt>Server version</dt><dd>v${store.server.version} · ${fmtTime(store.server.updatedAt)} · ${esc(store.server.author || '—')}</dd>
          <dt>Last serverTime</dt><dd>${esc(store.server.serverTime || '—')}</dd>
          <dt>Loaded at</dt><dd>${store.server.loadedAt ? fmtTime(new Date(store.server.loadedAt).toISOString()) : '—'}</dd>
          <dt>Responses sheet</dt><dd>${esc(meta.sheetName || '—')}</dd>
          <dt>Raw rows</dt><dd>${meta.rawRows ?? '—'}</dd>
          <dt>Unique respondents</dt><dd>${meta.uniqueRespondents ?? '—'}</dd>
          <dt>Events in slate</dt><dd>${store.server.events.length} (${store.server.events.reduce((n, e) => n + e.slots, 0)} slots per team)</dd>
          <dt>Missing fields</dt><dd>${!store.loaded ? '—' : missing.length ? esc(missing.join(', ')) : '<span class="chip green">none ✓</span>'}</dd>
          <dt>Unmapped headers</dt><dd>${unmapped.length ? `<ul class="diff-list">${unmapped.map(u => `<li><span class="muted">col ${u.index + 1}:</span> ${esc(u.header)}</li>`).join('')}</ul><span class="muted small">Shown in the drawer under “Other questions”.</span>` : '<span class="muted">none</span>'}</dd>
        </dl></div></div>`;
    built = true;
    refreshLive();
  }
  function refreshLive() {
    const el = root.querySelector('#live-bands'); if (!el) return;
    const { n, dist } = bandChanges();
    el.innerHTML = `Live preview: <b>${dist.A}</b> A-range · <b>${dist.B}</b> B-range · <b>${dist.C}</b> C-range. ${n ? `<span class="chip amber">${n} member${n === 1 ? '' : 's'} change band vs. the saved weights</span>` : '<span class="muted">No band changes vs. the saved weights.</span>'}`;
    // keep non-focused inputs in sync (e.g. after Reload)
    root.querySelectorAll('input[data-w]').forEach(i => { if (i !== document.activeElement) i.value = store.state.settings.weights[i.dataset.w] ?? 0; });
    root.querySelectorAll('input[data-s]').forEach(i => { if (i !== document.activeElement) i.value = store.state.settings[i.dataset.s]; });
  }
  return { render, invalidate() { built = false; } };
}
