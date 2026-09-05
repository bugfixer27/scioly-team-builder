// Boot, routing, actions, save/reload/conflict, polling, keyboard shortcuts, export menu, draft autosave.
import { apiGet, apiPost } from './api.js';
import { createStore, placeMember, assignmentsLostByMove, assignSlot, unassignSlot, setNote, setSettings, removeMember, summarizeDiff, diffStates, buildRoster, buildEventRows, rosterSummaryText, toCsv, normalizeState, clone } from './store.js';
import { computeScore, rulesCheck } from './score.js';
import { esc, toast, modal, confirmDialog, promptDialog, download, copyText, ls, ago, fmtClock } from './ui.js';
import * as Board from './views/board.js';
import * as Events from './views/events.js';
import * as People from './views/people.js';
import * as History from './views/history.js';
import * as Settings from './views/settings.js';
import * as Drawer from './views/drawer.js';

const CONFIG = window.TEAMBUILDER_CONFIG || {};
const POLL_SECONDS = Math.max(15, Number(CONFIG.pollSeconds) || 45);
const DRAFT_KEY = 'tb.draft', AUTHOR_KEY = 'tb.author', THEME_KEY = 'tb.theme';

const store = createStore();
const filters = { search: '', grades: new Set(), selfTeam: '', interestEvent: '', activity: '', hardNo: false, unassigned: false, sort: 'score' };
let scoreCache = new Map(), scoreCacheKey = '';
const ctx = {
  store, filters, pollSeconds: POLL_SECONDS,
  scoreOf(r) {
    const key = JSON.stringify(store.state.settings.weights);
    if (key !== scoreCacheKey) { scoreCache = new Map(); scoreCacheKey = key; }
    if (!scoreCache.has(r.email)) scoreCache.set(r.email, computeScore(r, store.state.settings.weights).score);
    return scoreCache.get(r.email);
  },
  getAuthor() { return ls.get(AUTHOR_KEY, '') || ''; },
  getTheme() { return ls.get(THEME_KEY, 'system') || 'system'; },
  actions: {}
};

// ---------------------------------------------------------------- actions (all confirms live here)
const byEmailName = email => { const r = store.byEmail()[email]; return r ? r.name : email; };

Object.assign(ctx.actions, {
  async place(emails, team) {
    emails = [...new Set(emails)].filter(e => (store.state.members[e] ? store.state.members[e].team : null) !== team);
    if (!emails.length) return false;
    const lost = emails.flatMap(e => assignmentsLostByMove(store.state, e, team).map(h => ({ email: e, ...h })));
    if (lost.length) {
      const body = `<p>Moving ${emails.length === 1 ? `<b>${esc(byEmailName(emails[0]))}</b>` : `<b>${emails.length} members</b>`} to <b>${team ? 'Team ' + team : 'Unplaced'}</b> will remove ${lost.length === 1 ? 'this event assignment' : 'these event assignments'}:</p><ul>${lost.map(l => `<li>${esc(byEmailName(l.email))} — ${esc(l.event)} (Team ${l.team})</li>`).join('')}</ul>`;
      if (!await confirmDialog('Remove event assignments?', body, 'Move and remove')) return false;
    }
    let next = store.state;
    emails.forEach(e => { next = placeMember(next, e, team).state; });
    store.setState(next, { reason: 'place' });
    return true;
  },
  async assign(team, event, email) {
    const r = store.byEmail()[email];
    if (r && r.hardNos.includes(event)) {
      const ok = await confirmDialog('Hard no', `<p><b>${esc(r.name)}</b> listed <b>${esc(event)}</b> as a hard no. Assign anyway?</p>`, 'Assign anyway', 'danger');
      if (!ok) return false;
    }
    try {
      const ev = store.eventByName(event);
      store.setState(assignSlot(store.state, team, event, email, ev ? ev.slots : undefined), { reason: 'assign' });
      return true;
    } catch (err) { toast(err.message, 'error'); return false; }
  },
  // Drag onto an event slot / drawer quick-assign: move to the team first (with the usual confirm) then assign.
  async assignWithMove(email, team, event) {
    const cur = store.state.members[email] ? store.state.members[email].team : null;
    if (cur !== team) { const ok = await ctx.actions.place([email], team); if (!ok) return false; }
    return ctx.actions.assign(team, event, email);
  },
  unassign(team, event, email) { store.setState(unassignSlot(store.state, team, event, email), { reason: 'unassign' }); },
  setNote(email, note) { store.setState(setNote(store.state, email, note), { reason: 'note' }); },
  setSettings(patch) { store.setState(setSettings(store.state, patch), { reason: 'settings' }); },
  async removeMember(email) {
    const held = assignmentsLostByMove(store.state, email, '__none__');
    const ok = await confirmDialog('Remove member?', `<p>Remove <b>${esc(email)}</b> from the working state?${held.length ? ` Their ${held.length} event assignment${held.length === 1 ? '' : 's'} will be cleared.` : ''}</p>`, 'Remove', 'danger');
    if (!ok) return false;
    store.setState(removeMember(store.state, email), { reason: 'remove' });
    return true;
  },
  openDrawer(email) { drawer.open(email); },
  setAuthor(name) { ls.set(AUTHOR_KEY, name); renderAuthor(); },
  setTheme(t) { ls.set(THEME_KEY, t); applyTheme(); },
  async loadSnapshots() { const r = await apiGet('snapshots'); return r.snapshots || []; },
  async loadSnapshot(version) { try { return await apiGet('snapshot', { version }); } catch (err) { toast(err.message, 'error'); throw err; } },
  restoreSnapshot(state, version) {
    store.setState(normalizeState(state), { reason: 'restore' });
    toast(`Restored v${version} into your working copy. Click Save to make it a new version.`, 'ok', { ms: 6000 });
    location.hash = '#board';
  }
});

// ---------------------------------------------------------------- views / routing
const views = {
  board: Board.mount(document.getElementById('view-board'), ctx),
  events: Events.mount(document.getElementById('view-events'), ctx),
  people: People.mount(document.getElementById('view-people'), ctx),
  history: History.mount(document.getElementById('view-history'), ctx),
  settings: Settings.mount(document.getElementById('view-settings'), ctx)
};
const drawer = Drawer.mount(document.getElementById('drawer'), ctx);
let current = 'board';

function route() {
  const name = (location.hash || '#board').slice(1);
  current = views[name] ? name : 'board';
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + current));
  document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.view === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  views[current].render();
}
window.addEventListener('hashchange', route);

store.subscribe(reason => {
  views[current].render();
  drawer.render();
  renderStatus();
  if (reason !== 'load' && reason !== 'saved') writeDraft();
  if (reason === 'load' || reason === 'saved') { if (views.history.reset) views.history.reset(); if (views.settings.invalidate) views.settings.invalidate(); }
});

// ---------------------------------------------------------------- status cluster
const $ = id => document.getElementById(id);
function renderStatus() {
  const el = $('sync-status');
  el.className = 'sync';
  if (store.saving) el.innerHTML = '<span class="spinner"></span> Saving…';
  else if (!store.loaded) el.textContent = 'Not loaded';
  else if (store.newerVersion) { el.className = 'sync newer'; el.innerHTML = `Newer version on server (v${store.newerVersion.version}${store.newerVersion.author ? ' by ' + esc(store.newerVersion.author) : ''}) — Reload`; }
  else if (store.dirty) el.innerHTML = '<span class="dot amber"></span> Unsaved changes';
  else el.textContent = `Loaded v${store.server.version} · ${ago(store.server.loadedAt)}`;
  $('btn-save').disabled = !store.dirty || store.saving || !store.loaded;
  $('btn-reload').disabled = store.saving;
}
setInterval(() => { if (store.loaded && !store.dirty && !store.saving) renderStatus(); }, 30000);
function renderAuthor() { $('author-chip').textContent = `You are: ${ctx.getAuthor() || '—'} ✎`; }
function applyTheme() {
  const t = ctx.getTheme();
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------------------------------------------------------------- draft autosave
function writeDraft() {
  if (!store.loaded) return;
  if (store.dirty) ls.set(DRAFT_KEY, { baseVersion: store.server.version, state: store.state, savedAt: Date.now() });
  else ls.del(DRAFT_KEY);
}
async function offerDraft() {
  const d = ls.get(DRAFT_KEY);
  if (!d || !d.state) return;
  if (d.baseVersion === store.server.version) {
    const ok = await modal({ title: 'Restore unsaved draft?', body: `<p>You have unsaved changes from <b>${fmtClock(d.savedAt)}</b> (based on v${d.baseVersion}, which is still current).</p>`, buttons: [{ label: 'Discard', value: false }, { label: 'Restore draft', value: true, kind: 'primary' }], cancelValue: null });
    if (ok) { store.setState(d.state, { reason: 'draft' }); toast('Draft restored. Click Save when ready.'); }
    else if (ok === false) ls.del(DRAFT_KEY);
  } else {
    const v = await modal({ title: 'Stale draft found', body: `<p>You have unsaved changes from <b>${fmtClock(d.savedAt)}</b> based on <b>v${d.baseVersion}</b>, but the server is now at <b>v${store.server.version}</b>. They can't be applied automatically.</p>`, buttons: [{ label: 'Discard', value: 'discard' }, { label: 'Download as JSON, then discard', value: 'download', kind: 'primary' }], cancelValue: 'keep' });
    if (v === 'download') download(`teambuilder-draft-v${d.baseVersion}.json`, JSON.stringify(d, null, 2), 'application/json');
    if (v !== 'keep') ls.del(DRAFT_KEY);
  }
}

// ---------------------------------------------------------------- load / save / reload / export
let loading = false;
async function load({ silent } = {}) {
  if (loading) return; loading = true;
  $('btn-reload').disabled = true;
  const t0 = Date.now();
  const tick = setInterval(() => { const sec = Math.round((Date.now() - t0) / 1000); if (sec >= 5) $('sync-status').innerHTML = `<span class="spinner"></span> Loading… ${sec}s${sec >= 15 ? ' (Google is waking up the script — can take up to a minute)' : ''}`; }, 1000);
  if (!silent) $('sync-status').innerHTML = '<span class="spinner"></span> Loading…';
  try {
    const data = await apiGet('load');
    store.setLoaded(data);
    if (!silent) toast(`Loaded v${data.version} · ${data.responses.length} respondents`);
    return true;
  } catch (err) {
    toast(err.message + (store.loaded ? '' : ' — click Reload to try again.'), 'error');
    if (!store.loaded) { store.emit('change'); }
    return false;
  } finally { clearInterval(tick); loading = false; renderStatus(); }
}
async function reload() {
  if (store.dirty) {
    const ok = await confirmDialog('Discard unsaved changes?', `<p>Reloading will replace your local changes (<i>${esc(summarizeDiff(store.diff()))}</i>) with the server's version.</p>`, 'Reload and discard', 'danger');
    if (!ok) return false;
    ls.del(DRAFT_KEY);
  }
  return load({ silent: store.dirty ? false : true });
}
async function save() {
  if (!store.dirty || store.saving || !store.loaded) return;
  const diff = store.diff(), summary = summarizeDiff(diff);
  store.saving = true; renderStatus();
  try {
    const res = await apiPost('save', { baseVersion: store.server.version, state: store.state, author: ctx.getAuthor() || 'Leader', summary });
    if (res.conflict) { store.saving = false; renderStatus(); await onConflict(res); return; }
    store.saving = false;
    store.sessionSaves.push({ version: res.version, at: res.updatedAt, author: res.author, text: summary, summary: res.summary });
    store.markSaved(res.version, res.updatedAt, res.author);
    ls.del(DRAFT_KEY);
    toast(`Saved v${res.version} — ${summary}`);
  } catch (err) { store.saving = false; renderStatus(); toast('Save failed: ' + err.message, 'error'); }
}
async function onConflict(res) {
  const who = res.author ? esc(res.author) : 'Someone';
  const mine = () => download(`teambuilder-my-changes-v${store.server.version}.json`, JSON.stringify({ baseVersion: store.server.version, serverVersion: res.version, summary: summarizeDiff(store.diff()), state: store.state, savedAt: new Date().toISOString() }, null, 2), 'application/json');
  for (;;) {
    const v = await modal({ title: 'Someone else saved first', body: `<p><b>${who}</b> saved <b>v${res.version}</b> while you were editing. Your unsaved changes (<i>${esc(summarizeDiff(store.diff()))}</i>) can't be merged automatically.</p><p class="small muted">Download your changes to keep a copy, then reload to get v${res.version} and redo them.</p>`, buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Download my changes (JSON)', value: 'download' }, { label: 'Reload and discard', value: 'reload', kind: 'danger' }], cancelValue: 'cancel' });
    if (v === 'download') { mine(); continue; }
    if (v === 'reload') { ls.del(DRAFT_KEY); await load(); }
    return;
  }
}

async function rulesGate(actionLabel) {
  const problems = rulesCheck(store.state, store.responses, store.server.events, store.state.settings).filter(p => p.code === 'teamCap' || p.code === 'seniorCap');
  if (!problems.length) return true;
  return confirmDialog('Division C rules exceeded', `<p>These teams break the Division C limits:</p><ul>${problems.map(p => `<li>⚠ ${esc(p.message)}</li>`).join('')}</ul><p>${esc(actionLabel)} anyway?</p>`, `${actionLabel} anyway`, 'danger');
}
async function doExport(kind) {
  if (!store.loaded) return toast('Nothing loaded yet.', 'error');
  if (!await rulesGate(kind === 'sheet' ? 'Export' : 'Download')) return;
  if (kind === 'sheet') {
    if (store.dirty) { const ok = await confirmDialog('Unsaved changes', '<p>Export writes the <b>saved</b> version on the server, but you have unsaved local changes. Save first, or export the last saved version?</p>', 'Export saved version'); if (!ok) return; }
    try {
      const res = await apiPost('export', { baseVersion: store.server.version, author: ctx.getAuthor() || 'Leader' });
      if (res.conflict) { toast(res.error || 'The server has a newer version. Reload before exporting.', 'error'); store.newerVersion = { version: res.version, author: '' }; renderStatus(); return; }
      lastExport = res;
      toast(`Final Roster and Final Events tabs updated (v${res.version}) — ${res.rosterRows} roster rows`);
    } catch (err) { toast('Export failed: ' + err.message, 'error'); }
    return;
  }
  const { roster, rows } = buildRoster(store.state, store.responses);
  if (kind === 'roster-json') download('roster.json', JSON.stringify(lastExport && !store.dirty && lastExport.version === store.server.version ? lastExport.roster : roster, null, 2), 'application/json');
  if (kind === 'roster-csv') download('roster.csv', toCsv(rows), 'text/csv');
  if (kind === 'events-csv') download('events.csv', toCsv(buildEventRows(store.state, store.responses, store.server.events)), 'text/csv');
  if (kind === 'summary') { const ok = await copyText(rosterSummaryText(store.state, store.responses)); toast(ok ? 'Roster summary copied to clipboard' : 'Could not copy — clipboard blocked', ok ? 'ok' : 'error'); }
}
let lastExport = null;

// ---------------------------------------------------------------- polling
let pollTimer = null;
async function pollVersion() {
  if (document.hidden || !store.loaded || store.saving) return;
  try {
    const r = await apiGet('version');
    if (Number(r.version) > store.server.version) { store.newerVersion = { version: r.version, author: r.author }; renderStatus(); }
  } catch (err) { /* transient; the next save/reload will surface real errors */ }
}
function startPolling() { stopPolling(); pollTimer = setInterval(pollVersion, POLL_SECONDS * 1000); }
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else { startPolling(); pollVersion(); } });

// ---------------------------------------------------------------- wiring
$('btn-save').addEventListener('click', save);
$('btn-reload').addEventListener('click', reload);
$('sync-status').addEventListener('click', () => { if (store.newerVersion) reload(); });
$('author-chip').addEventListener('click', async () => { const v = await promptDialog('Your display name', 'Written into the change log as the author of your saves', ctx.getAuthor()); if (v !== null) ctx.actions.setAuthor(v); if (current === 'settings') { views.settings.invalidate(); views.settings.render(); } });
const exportBtn = $('btn-export'), exportMenu = $('export-menu');
function toggleMenu(open) { exportMenu.hidden = !open; exportBtn.setAttribute('aria-expanded', String(open)); if (open) exportMenu.querySelector('button').focus(); }
exportBtn.addEventListener('click', () => toggleMenu(exportMenu.hidden));
exportMenu.addEventListener('click', e => { const b = e.target.closest('[data-export]'); if (!b) return; toggleMenu(false); doExport(b.dataset.export); });
document.addEventListener('click', e => { if (!exportMenu.hidden && !e.target.closest('.menu')) toggleMenu(false); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (e.key === 'Escape' && !exportMenu.hidden) { toggleMenu(false); exportBtn.focus(); return; }
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if (e.key === '/' && !typing) { const s = document.getElementById('search'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
});
window.addEventListener('beforeunload', e => { if (store.dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------- boot
applyTheme(); renderAuthor(); route(); renderStatus();
(async () => {
  const ok = await load();
  if (ok) { await offerDraft(); startPolling(); }
})();
