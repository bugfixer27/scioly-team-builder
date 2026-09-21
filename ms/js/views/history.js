// History view: snapshots (preview diff / restore) + this session's save summaries.
import { esc, fmtTime } from '../ui.js';
import { diffStates, normalizeState } from '../store.js';

export function mount(root, ctx) {
  const { store, actions } = ctx;
  let snaps = null, loading = false, error = '', preview = null; // preview: {version, diff, author, updatedAt}

  root.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const v = Number(b.dataset.version);
    if (b.dataset.act === 'refresh') { snaps = null; await fetchSnaps(); return; }
    if (b.dataset.act === 'preview') { b.disabled = true; try { const s = await actions.loadSnapshot(v); preview = { version: v, author: s.author, updatedAt: s.updatedAt, diff: diffStates(store.state, s.state), state: s.state }; } catch (err) { /* toast shown by actions */ } render(); return; }
    if (b.dataset.act === 'restore') { const s = preview && preview.version === v ? { state: preview.state } : await actions.loadSnapshot(v).catch(() => null); if (s) actions.restoreSnapshot(normalizeState(s.state), v); return; }
    if (b.dataset.act === 'close-preview') { preview = null; render(); }
  });

  async function fetchSnaps() {
    if (loading) return; loading = true; error = ''; render();
    try { snaps = await actions.loadSnapshots(); } catch (err) { error = err.message; snaps = []; }
    loading = false; render();
  }

  function render() {
    if (snaps === null && !loading && store.loaded) { fetchSnaps(); return; }
    const byEmail = store.byEmail();
    const nm = e => byEmail[e] ? byEmail[e].name : e;
    const cur = `<li><span class="grow"><b>v${store.server.version}</b> <span class="muted">(current on server)</span> · ${fmtTime(store.server.updatedAt)} · ${esc(store.server.author || '—')}${store.dirty ? ' <span class="chip amber">+ unsaved local changes</span>' : ''}</span></li>`;
    const list = (snaps || []).map(s => `<li><span class="grow"><b>v${s.version}</b> · ${fmtTime(s.updatedAt)} · ${esc(s.author || '—')}</span><button class="btn xs" data-act="preview" data-version="${s.version}">Preview</button><button class="btn xs" data-act="restore" data-version="${s.version}">Restore</button></li>`).join('');
    let pv = '';
    if (preview) {
      const d = preview.diff;
      const li = (label, arr, fmt) => arr.length ? `<li><b>${label} (${arr.length}):</b> ${arr.map(fmt).join(', ')}</li>` : '';
      pv = `<div class="card-panel"><h3>Snapshot v${preview.version} vs. your current state <button class="btn xs ghost" data-act="close-preview" style="float:right">close</button></h3>
        <p class="small muted">What would change if you restore v${preview.version}. Restoring only edits your local copy; you then Save it as a new version.</p>
        <ul class="diff-list">
          ${li('Members whose team differs', d.moved, m => `${esc(nm(m.email))} (${m.from || 'unplaced'} → ${m.to || 'unplaced'})`)}
          ${li('Slots that would be filled', d.slotsAdded, s => `${esc(nm(s.email))} → ${esc(s.event)} ${s.team}`)}
          ${li('Slots that would be cleared', d.slotsRemoved, s => `${esc(nm(s.email))} × ${esc(s.event)} ${s.team}`)}
          ${li('Notes that differ', d.notesEdited, nm)}
          ${li('Members not in the snapshot', d.removedMembers, nm)}
          ${d.settingsChanged ? '<li><b>Settings differ</b> (weights/caps)</li>' : ''}
          ${!d.moved.length && !d.slotsAdded.length && !d.slotsRemoved.length && !d.notesEdited.length && !d.removedMembers.length && !d.settingsChanged ? '<li class="muted">Identical to your current state.</li>' : ''}
        </ul>
        <button class="btn primary sm" data-act="restore" data-version="${preview.version}">Restore v${preview.version} into my working copy</button></div>`;
    }
    const saves = store.sessionSaves.length ? store.sessionSaves.slice().reverse().map(s => `<li><span class="grow"><b>v${s.version}</b> · ${fmtTime(s.at)} · ${esc(s.author)} — ${esc(s.text)} <span class="muted">(A ${s.summary.A} · B ${s.summary.B} · C ${s.summary.C} · unplaced ${s.summary.unplaced} · slots ${s.summary.slotsFilled}/${s.summary.slotsTotal})</span></span></li>`).join('') : '<li class="muted">No saves yet this session. The Change Log tab in the spreadsheet has the full history.</li>';
    root.innerHTML = `<div class="two-col">
      <div class="card-panel"><h3>Versions <button class="btn xs ghost" data-act="refresh" style="float:right" ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner"></span>' : 'Refresh'}</button></h3>
        ${error ? `<div class="notice bad">${esc(error)}</div>` : ''}
        <ul class="snap-list">${cur}${list}${snaps && !snaps.length ? '<li class="muted">No snapshots yet — they appear after the second save.</li>' : ''}</ul></div>
      <div style="display:grid;gap:12px">${pv}<div class="card-panel"><h3>Saves this session</h3><ul class="snap-list">${saves}</ul></div></div></div>`;
  }
  return { render, reset() { snaps = null; preview = null; } };
}
