// Board view: Unplaced · Team A · Team B · Team C. Drag cards between columns, or focus a card and press A/B/C/U.
import { esc, ls, toast } from '../ui.js';
import { abbrev, band, teamStats, TEAMS } from '../score.js';
import { createPicker } from './picker.js';

const TYPE_LABEL = { study: 'Study', build: 'Build', lab: 'Lab', trial: 'Trial' };

const COLS = [{ key: 'U', title: 'Unplaced', team: null }, { key: 'A', title: 'Team A', team: 'A' }, { key: 'B', title: 'Team B', team: 'B' }, { key: 'C', title: 'Team C', team: 'C' }];

export function mount(root, ctx) {
  const { store, filters, actions } = ctx;
  const selected = new Set();
  let dragging = null;
  const picker = createPicker(ctx);
  let showSlots = ls.get('tb.boardSlots', true) !== false;

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragend', () => { root.querySelectorAll('.dragging').forEach(c => c.classList.remove('dragging')); root.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over')); dragging = null; });
  root.addEventListener('dragover', e => {
    const col = e.target.closest('.col'); if (!col) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.ev-row');
    root.querySelectorAll('.ev-row.drag-over').forEach(r => { if (r !== row) r.classList.remove('drag-over'); });
    if (row) { row.classList.add('drag-over'); col.classList.remove('drag-over'); } else col.classList.add('drag-over');
  });
  root.addEventListener('dragleave', e => {
    const col = e.target.closest('.col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    const row = e.target.closest('.ev-row'); if (row && !row.contains(e.relatedTarget)) row.classList.remove('drag-over');
  });
  root.addEventListener('drop', onDrop);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);

  function emailsFor(card) {
    const email = card.dataset.email;
    return selected.has(email) ? [...selected] : [email];
  }
  function onDragStart(e) {
    const card = e.target.closest('.card'); if (!card) return;
    dragging = emailsFor(card);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging.join(','));
    card.classList.add('dragging');
  }
  async function onDrop(e) {
    const col = e.target.closest('.col'); if (!col) return;
    e.preventDefault(); col.classList.remove('drag-over');
    const row = e.target.closest('.ev-row');
    const emails = dragging || (e.dataTransfer.getData('text/plain') || '').split(',').filter(Boolean);
    dragging = null;
    if (!emails.length) return;
    const team = col.dataset.team || null;
    if (row && team) {
      if (emails.length > 1) { toast('Drop one person at a time onto an event slot.', 'error'); return; }
      const ok = await actions.assignWithMove(emails[0], team, row.dataset.event);
      if (ok) selected.clear();
      return;
    }
    const ok = await actions.place(emails, team);
    if (ok) selected.clear();
  }
  function onClick(e) {
    const card = e.target.closest('.card');
    if (e.target.closest('[data-remove]')) { actions.removeMember(e.target.closest('[data-remove]').dataset.remove); return; }
    const mv = e.target.closest('[data-move-sel]');
    if (mv) { const team = mv.dataset.moveSel === 'U' ? null : mv.dataset.moveSel; actions.place([...selected], team).then(ok => { if (ok) { selected.clear(); render(); } }); return; }
    if (e.target.closest('[data-clear-sel]')) { selected.clear(); render(); return; }
    if (e.target.closest('[data-toggle-slots]')) { showSlots = !showSlots; ls.set('tb.boardSlots', showSlots); render(); return; }
    const un = e.target.closest('[data-unassign]');
    if (un) { const [team, event, email] = JSON.parse(un.dataset.unassign); actions.unassign(team, event, email); return; }
    const pk = e.target.closest('[data-pick]');
    if (pk) { const [team, event] = JSON.parse(pk.dataset.pick); picker.open(pk, team, event, () => { const again = root.querySelector(`[data-pick='${JSON.stringify([team, event])}']`); if (again) again.focus(); }); return; }
    const op = e.target.closest('[data-open]');
    if (op) { actions.openDrawer(op.dataset.open); return; }
    if (!card) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleSel(card.dataset.email); render(); return;
    }
    actions.openDrawer(card.dataset.email);
  }
  function toggleSel(email) { if (selected.has(email)) selected.delete(email); else selected.add(email); }
  async function onKey(e) {
    const card = e.target.closest('.card'); if (!card) return;
    const k = e.key.toLowerCase();
    if (['a', 'b', 'c', 'u'].includes(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const emails = emailsFor(card);
      const ok = await actions.place(emails, k === 'u' ? null : k.toUpperCase());
      if (ok) { selected.clear(); focusCard(card.dataset.email); }
    } else if (e.key === 'Enter') { e.preventDefault(); actions.openDrawer(card.dataset.email); }
    else if (e.key === ' ') { e.preventDefault(); toggleSel(card.dataset.email); render(); focusCard(card.dataset.email); }
  }
  function focusCard(email) { const el = root.querySelector(`.card[data-email="${CSS.escape(email)}"]`); if (el) el.focus(); }
  function onInput(e) {
    const t = e.target; if (!t.dataset.filter) return;
    const f = t.dataset.filter;
    if (f === 'grade') { if (t.checked) filters.grades.add(Number(t.value)); else filters.grades.delete(Number(t.value)); }
    else if (t.type === 'checkbox') filters[f] = t.checked;
    else filters[f] = t.value;
    if (e.type === 'input' && f !== 'search') return;
    render();
  }

  // ---- data ----
  function allMembers() {
    const byEmail = store.byEmail();
    const emails = new Set([...store.responses.map(r => r.email), ...Object.keys(store.state.members)]);
    return [...emails].map(email => {
      const r = byEmail[email] || null, m = store.state.members[email] || null;
      const held = TEAMS.flatMap(t => Object.keys(store.state.assignments[t]).filter(ev => store.state.assignments[t][ev].includes(email)).map(ev => ({ team: t, event: ev })));
      return { email, r, team: m && m.team ? m.team : null, note: m ? m.note : '', held, score: r ? ctx.scoreOf(r) : null };
    });
  }
  function passes(mm) {
    const r = mm.r;
    if (filters.search) { const q = filters.search.toLowerCase(); if (!(mm.email.includes(q) || (r && r.name.toLowerCase().includes(q)))) return false; }
    if (filters.grades.size && !(r && filters.grades.has(r.grade))) return false;
    if (filters.selfTeam && !(r && r.selfTeam === filters.selfTeam)) return false;
    if (filters.activity && !(r && r.activityPeriods === filters.activity)) return false;
    if (filters.hardNo && !(r && r.hardNos.length)) return false;
    if (filters.unassigned && mm.held.length) return false;
    return true;
  }
  function sortFn(a, b) {
    switch (filters.sort) {
      case 'name': return (a.r ? a.r.name : a.email).localeCompare(b.r ? b.r.name : b.email);
      case 'grade': return ((b.r && b.r.grade) || 0) - ((a.r && a.r.grade) || 0) || (b.score || 0) - (a.score || 0);
      case 'events': return b.held.length - a.held.length || (b.score || 0) - (a.score || 0);
      default: return (b.score ?? -1) - (a.score ?? -1) || (a.r ? a.r.name : a.email).localeCompare(b.r ? b.r.name : b.email);
    }
  }

  // ---- render ----
  function render() {
    if (!store.loaded && !store.responses.length) { root.innerHTML = '<div class="empty-state">Nothing loaded yet. Check the API URL in <code>config.js</code>, then click <b>Reload</b>.</div>'; return; }
    const events = store.server.events;
    const settings = store.state.settings;
    const stats = teamStats(store.state, store.responses, events, settings.weights);
    const members = allMembers();
    const evOptions = events.map(ev => `<option value="${esc(ev.name)}" ${filters.interestEvent === ev.name ? 'selected' : ''}>${esc(ev.name)}</option>`).join('');
    const activities = [...new Set(store.responses.map(r => r.activityPeriods).filter(Boolean))].sort();
    const selBar = selected.size ? `<span class="sel-bar">${selected.size} selected · Move to ${['A', 'B', 'C', 'U'].map(t => `<button class="btn xs" data-move-sel="${t}">${t === 'U' ? 'Unplaced' : t}</button>`).join('')} <button class="btn xs ghost" data-clear-sel>Clear</button></span>` : '';
    root.innerHTML = `
      <div class="toolbar" role="search">
        <input id="search" class="input" type="search" placeholder="Search name/email  ( / )" value="${esc(filters.search)}" data-filter="search" aria-label="Search members" style="width:200px">
        <label class="inline">Sort <select class="input" data-filter="sort">${[['score', 'Score ↓'], ['name', 'Name'], ['grade', 'Grade'], ['events', 'Events held']].map(([v, l]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="inline" style="display:inline-flex;gap:4px;align-items:center;font-size:12px">Grade ${[9, 10, 11, 12].map(g => `<label class="inline"><input type="checkbox" value="${g}" data-filter="grade" ${filters.grades.has(g) ? 'checked' : ''}>${g}</label>`).join('')}</span>
        <label class="inline">Says <select class="input" data-filter="selfTeam"><option value="">any</option>${['A', 'B', 'C'].map(t => `<option ${filters.selfTeam === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="inline">Interested in <select class="input" data-filter="interestEvent"><option value="">— any event —</option>${evOptions}</select></label>
        <label class="inline">Activity <select class="input" data-filter="activity"><option value="">any</option>${activities.map(a => `<option ${filters.activity === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
        <label class="inline"><input type="checkbox" data-filter="hardNo" ${filters.hardNo ? 'checked' : ''}> has hard-no</label>
        <label class="inline"><input type="checkbox" data-filter="unassigned" ${filters.unassigned ? 'checked' : ''}> no events yet</label>
        ${selBar}
        <span class="grow"></span>
        <button class="btn xs ${showSlots ? 'primary' : ''}" type="button" data-toggle-slots aria-pressed="${showSlots}" title="Show event slots under each team">Event slots</button>
      </div>
      <div class="board">${COLS.map(col => renderCol(col, members, stats, settings)).join('')}</div>`;
  }

  function renderCol(col, members, stats, settings) {
    const list = members.filter(m => m.team === col.team).sort(sortFn);
    const visible = list.filter(passes);
    let head;
    if (col.team) {
      const s = stats[col.team];
      const overCap = s.count > settings.teamCap, overSen = s.seniors > settings.seniorCap;
      const pct = s.eventsTotal ? Math.round(100 * s.eventsTouched / s.eventsTotal) : 0;
      head = `<div class="col-head ${overCap || overSen ? 'over' : ''}"><h2>${col.title} ${overCap || overSen ? '<span class="chip red" title="Division C rule exceeded">⚠ over limit</span>' : ''}</h2>
        <div class="stats">
          <span class="${overCap ? 'bad' : ''}" title="Members (max ${settings.teamCap})">${overCap ? '⚠ ' : ''}${s.count}/${settings.teamCap}</span>
          <span class="${overSen ? 'bad' : ''}" title="Twelfth-graders (max ${settings.seniorCap})">${overSen ? '⚠ ' : ''}seniors ${s.seniors}/${settings.seniorCap}</span>
          <span title="Average commitment score">avg ${s.avgScore === null ? '—' : s.avgScore}</span>
          <span class="meter" title="Events with at least one slot filled">cov <i><b style="width:${pct}%"></b></i> ${s.eventsTouched}/${s.eventsTotal}</span>
        </div></div>`;
    } else {
      head = `<div class="col-head"><h2>${col.title}</h2><div class="stats"><span>${list.length} member${list.length === 1 ? '' : 's'}</span></div></div>`;
    }
    const body = visible.length ? visible.map(m => renderCard(m, settings)).join('') : `<div class="col-empty">${list.length ? 'No cards match the filters' : 'Drop members here'}</div>`;
    const evs = col.team && showSlots ? renderEvents(col.team, stats[col.team]) : '';
    return `<div class="col" data-team="${col.team || ''}" aria-label="${col.title}">${head}<div class="col-body">${body}</div>${evs}</div>`;
  }

  function renderEvents(team, s) {
    const byEmail = store.byEmail();
    const events = store.server.events;
    const types = [...new Set(events.map(e => e.type))];
    const rows = types.map(type => `<div class="ev-type">${TYPE_LABEL[type] || type}</div>` + events.filter(ev => ev.type === type).map(ev => {
      const list = store.state.assignments[team][ev.name] || [];
      const chips = list.map(email => {
        const r = byEmail[email];
        const hard = r && r.hardNos.includes(ev.name), notInt = r && !hard && !r.interests.includes(ev.name);
        const mark = hard ? '<span class="hardno-flag" title="Listed as a hard no">!</span>' : notInt ? '<span class="dot amber" title="Not in their interests"></span>' : '';
        return `<span class="slot filled ${hard ? 'hardno' : notInt ? 'notint' : ''}">${mark}<button class="nm" type="button" data-open="${esc(email)}" title="${esc(email)}${hard ? ' — HARD NO' : notInt ? ' — not an interest' : ''}">${esc(r ? shortName(r.name) : email)}</button><button class="x" type="button" data-unassign='${esc(JSON.stringify([team, ev.name, email]))}' aria-label="Remove ${esc(r ? r.name : email)} from ${esc(ev.name)}">×</button></span>`;
      });
      for (let i = list.length; i < ev.slots; i++) chips.push(`<span class="slot empty"><button type="button" data-pick='${esc(JSON.stringify([team, ev.name]))}' aria-label="Assign someone to ${esc(ev.name)} on Team ${team}" title="Pick from Team ${team}">+</button></span>`);
      const full = list.length >= ev.slots;
      return `<div class="ev-row ${full ? 'full' : ''}" data-team="${team}" data-event="${esc(ev.name)}" title="Drop a card here to assign them ${esc(ev.name)} on Team ${team}"><span class="ev-nm" title="${esc(ev.name)}">${esc(ev.name)}</span><span class="slots">${chips.join('')}</span></div>`;
    }).join('')).join('');
    return `<div class="col-events"><div class="ev-sec-head">Events <span class="muted">${s.slotsFilled}/${s.slotsTotal} slots · ${s.eventsTouched}/${s.eventsTotal} touched</span></div>${rows}</div>`;
  }

  function renderCard(m, settings) {
    const r = m.r;
    const cls = ['card'];
    if (selected.has(m.email)) cls.push('selected');
    if (filters.interestEvent) { if (r && r.interests.includes(filters.interestEvent)) cls.push('highlight'); else cls.push('dimmed'); }
    if (!r) {
      cls.push('ghost');
      return `<div class="${cls.join(' ')}" draggable="true" tabindex="0" data-email="${esc(m.email)}" role="button" aria-label="${esc(m.email)}, no response on file">
        <div class="row1"><span class="name">${esc(m.email)}</span><span class="chip amber">no response on file</span></div>
        <div class="row2"><span class="chip">${m.held.length} ev</span><button class="btn xs danger" data-remove="${esc(m.email)}" title="Remove from the working state">Remove</button></div></div>`;
    }
    const held = m.held.length;
    const heldCls = held >= settings.eventWarnAt ? 'chip amber' : 'chip';
    const ints = r.interests.slice(0, 5).map(ev => `<span class="${ev === filters.interestEvent ? 'match' : ''}" title="${esc(ev.replace(/^\?/, ''))}">${esc(abbrev(ev))}</span>`).join('');
    const hn = r.hardNos.length ? `<span class="hardno-flag" title="Hard no: ${esc(r.hardNos.join(', '))}" aria-label="Has hard-no events: ${esc(r.hardNos.join(', '))}">!</span>` : '';
    const b = band(m.score);
    return `<div class="${cls.join(' ')}" draggable="true" tabindex="0" data-email="${esc(m.email)}" role="button" aria-label="${esc(r.name)}, grade ${r.grade || '?'}, score ${m.score}, ${m.team ? 'Team ' + m.team : 'unplaced'}. Press A, B, C or U to move, Enter for details.">
      <div class="row1"><span class="name" title="${esc(r.email)}">${esc(r.name)}</span>${hn}<span class="grade ${r.grade === 12 ? 'senior' : ''}" title="Grade ${r.grade || '?'}${r.grade === 12 ? ' (senior)' : ''}">${r.grade || '?'}${r.grade === 12 ? '•' : ''}</span><span class="pill band-${b}" title="${b}-range">${m.score}</span></div>
      <div class="row2">${r.selfTeam ? `<span class="chip outline" title="Self-placed team">says ${esc(r.selfTeam)}</span>` : ''}${r.activityPeriods ? `<span class="chip" title="Activity periods">${esc(shortAP(r.activityPeriods))}</span>` : ''}<span class="${heldCls}" title="Events held${held >= settings.eventWarnAt ? ' (at or above warning threshold)' : ''}">${held >= settings.eventWarnAt ? '⚠ ' : ''}${held} ev</span></div>
      <div class="ints">${ints}</div></div>`;
  }
  return { render };
}

export function shortName(n) { const p = String(n).trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : n; }
export function shortAP(s) { return /both/i.test(s) ? 'AP A+B' : 'AP ' + s; }
