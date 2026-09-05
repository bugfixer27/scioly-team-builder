// Events view: matrix of 24 events × Team A/B/C with slot chips and a per-team slot picker.
import { esc } from '../ui.js';
import { teamStats, TEAMS } from '../score.js';
import { createPicker } from './picker.js';

const TYPE_LABEL = { study: 'Study', build: 'Build', lab: 'Lab', trial: 'Trial' };

export function mount(root, ctx) {
  const { store, actions } = ctx;
  const ui = { type: '', emptyOnly: false };

  root.addEventListener('click', onClick);
  root.addEventListener('change', e => { if (e.target.dataset.ev === 'emptyOnly') { ui.emptyOnly = e.target.checked; render(); } });

  function onClick(e) {
    const t = e.target;
    if (t.dataset.type !== undefined) { ui.type = t.dataset.type; render(); return; }
    if (t.closest('[data-open]')) { actions.openDrawer(t.closest('[data-open]').dataset.open); return; }
    const un = t.closest('[data-unassign]');
    if (un) { const [team, event, email] = JSON.parse(un.dataset.unassign); actions.unassign(team, event, email); return; }
    const pk = t.closest('[data-pick]');
    if (pk) { const [team, event] = JSON.parse(pk.dataset.pick); openPicker(pk, team, event); return; }
  }

  const picker = createPicker(ctx);
  function closePicker() { picker.close(); }
  function openPicker(anchor, team, event) { picker.open(anchor, team, event, () => { const again = root.querySelector(`[data-pick='${JSON.stringify([team, event])}']`); if (again) again.focus(); }); }

  function render() {
    closePicker();
    const events = store.server.events;
    if (!events.length) { root.innerHTML = '<div class="empty-state">No events loaded.</div>'; return; }
    const settings = store.state.settings;
    const byEmail = store.byEmail();
    const stats = teamStats(store.state, store.responses, events, settings.weights);
    const types = [...new Set(events.map(e => e.type))];
    const shown = events.filter(ev => (!ui.type || ev.type === ui.type) && (!ui.emptyOnly || TEAMS.some(t => (store.state.assignments[t][ev.name] || []).length < ev.slots)));
    const groups = types.map(t => ({ type: t, events: shown.filter(e => e.type === t) })).filter(g => g.events.length);

    const summary = TEAMS.map(t => `<span><b>${t}:</b> ${stats[t].slotsFilled}/${stats[t].slotsTotal} slots · ${stats[t].eventsTouched}/${stats[t].eventsTotal} events touched</span>`).join('');
    const chips = `<button class="btn xs ${ui.type === '' ? 'primary' : ''}" data-type="">All</button>` + types.map(t => `<button class="btn xs ${ui.type === t ? 'primary' : ''}" data-type="${t}">${TYPE_LABEL[t] || t}</button>`).join('');

    const rows = groups.map(g => `<tr class="type-head"><td colspan="4">${TYPE_LABEL[g.type] || g.type} events</td></tr>` + g.events.map(ev => `<tr><td class="evname">${esc(ev.name)}<small>${ev.slots} slots</small></td>${TEAMS.map(t => `<td>${renderCell(t, ev, byEmail)}</td>`).join('')}</tr>`).join('')).join('');
    const load = `<tr class="ev-load"><td class="evname">Load<small>0 events / at ≥ ${settings.eventWarnAt}</small></td>${TEAMS.map(t => `<td>${renderLoad(t, byEmail, settings)}</td>`).join('')}</tr>`;

    root.innerHTML = `
      <div class="toolbar"><div class="ev-summary">${summary}</div><span class="grow"></span><label class="inline"><input type="checkbox" data-ev="emptyOnly" ${ui.emptyOnly ? 'checked' : ''}> show only events with empty slots</label></div>
      <div class="toolbar" role="group" aria-label="Event type filter">${chips}</div>
      <div class="ev-table-wrap card-panel" style="padding:0"><table class="ev-table"><thead><tr><th>Event</th>${TEAMS.map(t => `<th>Team ${t} <span class="muted">(${stats[t].count})</span></th>`).join('')}</tr></thead><tbody>${rows}${load}</tbody></table></div>`;
  }

  function renderCell(team, ev, byEmail) {
    const list = store.state.assignments[team][ev.name] || [];
    const chips = list.map(email => {
      const r = byEmail[email];
      const hard = r && r.hardNos.includes(ev.name), notInt = r && !hard && !r.interests.includes(ev.name);
      const cls = 'slot filled' + (hard ? ' hardno' : notInt ? ' notint' : '');
      const mark = hard ? '<span class="hardno-flag" title="Listed as a hard no">!</span>' : notInt ? '<span class="dot amber" title="Not in their interests"></span>' : '';
      return `<span class="${cls}">${mark}<button class="nm" type="button" data-open="${esc(email)}" title="${esc(email)}${hard ? ' — HARD NO' : notInt ? ' — not an interest' : ''}">${esc(r ? r.name : email)}</button><button class="x" type="button" data-unassign='${esc(JSON.stringify([team, ev.name, email]))}' aria-label="Remove ${esc(r ? r.name : email)} from ${esc(ev.name)}">×</button></span>`;
    });
    for (let i = list.length; i < ev.slots; i++) chips.push(`<span class="slot empty"><button type="button" data-pick='${esc(JSON.stringify([team, ev.name]))}' aria-label="Assign someone to ${esc(ev.name)} on Team ${team}" title="Assign">+</button></span>`);
    return `<div class="slots">${chips.join('')}</div>`;
  }
  function renderLoad(team, byEmail, settings) {
    const members = Object.keys(store.state.members).filter(e => store.state.members[e].team === team);
    const counts = members.map(email => ({ email, n: Object.values(store.state.assignments[team]).filter(l => l.includes(email)).length }));
    const zero = counts.filter(c => c.n === 0), heavy = counts.filter(c => c.n >= settings.eventWarnAt);
    const nm = e => `<button class="btn xs ghost" type="button" data-open="${esc(e.email)}">${esc(byEmail[e.email] ? byEmail[e.email].name : e.email)}${e.n ? ` <span class="muted">${e.n}</span>` : ''}</button>`;
    return `<div><span class="muted">0 events:</span> ${zero.length ? zero.map(nm).join(' ') : '<span class="chip green">everyone has one ✓</span>'}</div><div><span class="muted">≥ ${settings.eventWarnAt}:</span> ${heavy.length ? heavy.map(nm).join(' ') : '<span class="muted">none</span>'}</div>`;
  }
  return { render };
}
