// Person drawer: verbatim answers, interests/hard-nos, score breakdown, event checklist, leader note.
import { esc, fmtTime } from '../ui.js';
import { computeScore, band, bandLabel, TEAMS } from '../score.js';

// Form order, short label, and the raw question text (shown on hover).
const FIELDS = [
  ['ack', 'Honesty pledge', 'This is not a form for who gets on a "better team." … please BE HONEST!'],
  ['priorExperience', 'Done SciOly before?', 'Have you done the Science Olympiad previously in either middle or high school?'],
  ['yearsExperience', 'Years', 'If so, for how many years?'],
  ['medals', 'Medals', 'Have you medaled in any Sci Oly events? Please describe.'],
  ['grade', 'Grade', 'What grade are you in?'],
  ['honorsScience', 'Honors science?', 'Are you in any honors science classes, or have you taken science classes beyond the integrated curriculum?'],
  ['honorsList', 'Honors classes', 'If so, please list them:'],
  ['miniCourse', 'Mini Course?', 'Are you in the Mini Course'],
  ['activityPeriods', 'Activity periods', 'What activity periods would you be able to make?'],
  ['makerSpace', 'Maker space?', 'Would you be interested in committing out of club time to travel to the maker space in order to build something?'],
  ['outsideWork', 'Work outside AP (1–5)', 'How willing would you be to complete work outside of Activity Period/Minicourse to prepare for your events?'],
  ['afterSchool', 'After school (1–5)', 'How willing would you be to get work done for Science Olympiad after school if needed?'],
  ['weekends', 'Weekends (1–5)', 'How willing would you be to work certain Saturdays or days off school before the competition to prepare?'],
  ['conflicts', 'Communicates conflicts', 'Would you be willing to communicate any conflicts with competition dates quickly and promptly meet deadlines for completing tasks?'],
  ['accountability', 'Accountability (1–5)', 'How able/willing are you to hold yourself accountable for learning new material and understanding the rules of your event?'],
  ['selfTeam', 'Self-placed team', 'What Team would you place yourself with? …'],
  ['unlikedEvent', 'Unliked event (1–5)', 'How willing would you be to do an event that you don’t like for the betterment of the team?'],
  ['credentials', 'Credentials', 'Do you have any awards, certificates, or courses related to science that show outstanding work in a specialized area?'],
  ['interests', 'Interests', 'Of the following events, after your research, select at least 5 events that interest you most:'],
  ['hardNos', 'Hard no’s', 'Are any of the following HARD NO\'s for you?']
];

export function mount(root, ctx) {
  const { store, actions } = ctx;
  let email = null, noteTimer = null;

  root.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-close]')) { close(); return; }
    const seg = t.closest('[data-team]');
    if (seg) { await actions.place([email], seg.dataset.team || null); return; }
    if (t.closest('[data-remove]')) { const ok = await actions.removeMember(email); if (ok) close(); return; }
    if (t.closest('[data-quick]')) {
      const qt = root.querySelector('select[name=qteam]').value, qe = root.querySelector('select[name=qevent]').value;
      if (!qe) return;
      const ok = await actions.assignWithMove(email, qt, qe);
      if (ok) { const sel = root.querySelector('select[name=qevent]'); if (sel) sel.focus(); }
      return;
    }
  });
  root.addEventListener('change', async e => {
    const t = e.target;
    if (t.name === 'qteam') { const sel = root.querySelector('select[name=qevent]'); sel.innerHTML = eventOptions(t.value); return; }
    if (t.dataset.ev) {
      const [team, ev] = JSON.parse(t.dataset.ev);
      if (t.checked) { const ok = await actions.assign(team, ev, email); if (!ok) t.checked = false; }
      else actions.unassign(team, ev, email);
    }
  });
  root.addEventListener('input', e => {
    if (e.target.name === 'note') { clearTimeout(noteTimer); const v = e.target.value; noteTimer = setTimeout(() => actions.setNote(email, v), 250); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); } });

  function open(em) { email = em; root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open'); render(); const f = root.querySelector('[data-close]'); if (f) f.focus(); }
  function close() { email = null; root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); root.innerHTML = ''; }

  const yn = v => v === true ? 'Yes' : v === false ? 'No' : '';
  function eventOptions(team) {
    const r = store.byEmail()[email] || { interests: [], hardNos: [] };
    return '<option value="">— pick an event —</option>' + store.server.events.map(ev => {
      const list = store.state.assignments[team][ev.name] || [];
      const on = list.includes(email), full = list.length >= ev.slots;
      const tag = on ? ' · already' : full ? ' · full' : r.hardNos.includes(ev.name) ? ' · HARD NO' : r.interests.includes(ev.name) ? ' · ★ interested' : '';
      return `<option value="${esc(ev.name)}" ${on || full ? 'disabled' : ''}>${esc(ev.name)} (${list.length}/${ev.slots})${tag}</option>`;
    }).join('');
  }
  function rawOf(r, key) {
    if (key === 'interests') return r.interestsRaw || r.interests.join(', ');
    if (key === 'hardNos') return r.hardNosRaw || r.hardNos.join(', ');
    if (r[key + 'Raw'] !== undefined && r[key + 'Raw'] !== '') return r[key + 'Raw'];
    const v = r[key];
    if (typeof v === 'boolean') return yn(v);
    return v === null || v === undefined ? '' : String(v);
  }

  function render() {
    if (!email) return;
    const ta = root.querySelector('textarea[name=note]');
    if (ta && document.activeElement === ta) return; // don't clobber typing
    const r = store.byEmail()[email] || null;
    const m = store.state.members[email] || null;
    const team = m && m.team ? m.team : null;
    const events = store.server.events;
    const held = TEAMS.flatMap(t => Object.keys(store.state.assignments[t]).filter(ev => store.state.assignments[t][ev].includes(email)).map(ev => ({ team: t, event: ev })));
    const sc = r ? computeScore(r, store.state.settings.weights) : null;
    const seg = `<div class="seg" role="group" aria-label="Team">${[['', 'Unplaced'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([v, l]) => `<button type="button" data-team="${v}" aria-pressed="${(team || '') === v}">${l}</button>`).join('')}</div>`;

    const head = `<div class="drawer-head"><div class="top"><h2>${esc(r ? r.name : email)}</h2><button class="btn sm ghost" type="button" data-close aria-label="Close drawer">✕</button></div>
      <div class="small muted">${esc(email)}${r && r.grade ? ` · grade ${r.grade}${r.grade === 12 ? ' (senior)' : ''}` : ''}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${seg}${sc ? `<span class="pill band-${band(sc.score)}">${sc.score}</span><span class="small">${bandLabel(sc.score)}</span>` : '<span class="chip amber">no response on file</span>'}</div>
      ${r ? `<div class="quick" role="group" aria-label="Assign to an event"><span class="small muted">Assign to</span><select class="input" name="qteam" aria-label="Team">${TEAMS.map(t => `<option ${t === (team || 'A') ? 'selected' : ''}>${t}</option>`).join('')}</select><select class="input" name="qevent" aria-label="Event">${eventOptions(team || 'A')}</select><button class="btn sm primary" type="button" data-quick>Assign</button></div>` : ''}</div>`;

    let body;
    if (!r) {
      body = `<section><div class="notice warn">This email is in the working state but has no form response (row deleted or email changed). ${held.length ? `They currently hold: ${esc(held.map(h => `${h.event} (${h.team})`).join(', '))}.` : ''}</div><p><button class="btn danger sm" type="button" data-remove>Remove from working state</button></p></section>`;
    } else {
      const answers = FIELDS.map(([k, label, q]) => `<dt title="${esc(q)}">${esc(label)}</dt><dd>${esc(rawOf(r, k))}</dd>`).join('');
      const extra = Object.keys(r.extra || {}).map(k => `<dt title="${esc(k)}">${esc(k.length > 40 ? k.slice(0, 40) + '…' : k)}</dt><dd>${esc(r.extra[k])}</dd>`).join('');
      const bd = sc.breakdown.map(b => `<tr class="${b.counted ? '' : 'skipped'}"><td>${esc(b.label)}</td><td>${b.raw === null || b.raw === undefined || b.raw === '' ? '<span class="muted">—</span>' : esc(typeof b.raw === 'boolean' ? yn(b.raw) : String(b.raw).slice(0, 30))}</td><td class="num">${b.normalized === null ? '—' : b.normalized.toFixed(2)}</td><td class="num">${b.weight}</td><td class="num">${b.counted ? b.contribution.toFixed(2) : '—'}</td></tr>`).join('');
      const check = events.map(ev => {
        const list = team ? (store.state.assignments[team][ev.name] || []) : [];
        const on = team && list.includes(email);
        const full = team && !on && list.length >= ev.slots;
        const hard = r.hardNos.includes(ev.name), int = r.interests.includes(ev.name);
        return `<label class="${hard ? 'hardno' : ''} ${full ? 'full' : ''}" title="${hard ? 'HARD NO — will ask to confirm' : int ? 'Interested' : ''}"><input type="checkbox" data-ev='${esc(JSON.stringify([team, ev.name]))}' ${on ? 'checked' : ''} ${!team || full ? 'disabled' : ''}>${hard ? '<span class="hardno-flag">!</span> ' : int ? '<span class="dot green" title="interested"></span> ' : ''}${esc(ev.name)}<span class="avail">${team ? `${list.length}/${ev.slots}` : ''}</span></label>`;
      }).join('');
      body = `
        <section><h3>Their answers</h3><dl class="answers">${answers}</dl>${extra ? `<h3 style="margin-top:10px">Other questions</h3><dl class="answers">${extra}</dl>` : ''}</section>
        <section><h3>Interests</h3><div class="row2" style="display:flex;flex-wrap:wrap;gap:4px">${r.interests.length ? r.interests.map(e => `<span class="chip green">${esc(e)}</span>`).join('') : '<span class="muted">none listed</span>'}</div>
          <h3 style="margin-top:8px">Hard no’s</h3><div style="display:flex;flex-wrap:wrap;gap:4px">${r.hardNos.length ? r.hardNos.map(e => `<span class="chip red">${esc(e)}</span>`).join('') : '<span class="muted">none</span>'}</div></section>
        <section><h3>Score breakdown — ${sc.score} (${bandLabel(sc.score)})</h3><table class="grid breakdown"><thead><tr><th>Factor</th><th>Answer</th><th>Norm.</th><th>Wt</th><th>Contrib.</th></tr></thead><tbody>${bd}</tbody><tfoot><tr><td colspan="3"><b>Σ(w·f) / Σ(w)</b> over answered factors</td><td class="num">${sc.weightTotal}</td><td class="num">${sc.breakdown.reduce((n, b) => n + b.contribution, 0).toFixed(2)}</td></tr></tfoot></table></section>
        <section><h3>Events on ${team ? 'Team ' + team : 'their team'} <span class="muted" style="text-transform:none;letter-spacing:0">(${held.length} held)</span></h3>${team ? '' : '<p class="small muted">Place them on a team first (use the selector above) to assign events.</p>'}<div class="checklist">${check}</div></section>
        <section><h3>Leader note</h3><textarea class="input" name="note" rows="3" placeholder="Private to the leaders; saved with the state." maxlength="4000">${esc(m ? m.note : '')}</textarea></section>`;
    }
    const foot = r ? `Submitted ${fmtTime(r.timestamp)} · row ${r.sheetRow}${r.submissionCount > 1 ? ` · resubmitted ×${r.submissionCount - 1}${r.previousRows ? ` (earlier rows ${r.previousRows.join(', ')})` : ''}` : ''}` : 'No response on file';
    root.innerHTML = head + `<div class="drawer-body">${body}</div><div class="drawer-foot">${foot}</div>`;
  }
  return { open, close, render, get email() { return email; } };
}
