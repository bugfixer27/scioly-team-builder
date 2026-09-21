// Slot picker popover shared by the Board and Events views: lists only members placed on that team,
// sorted interested-first → fewest events held → score desc.
import { esc, placePopover } from '../ui.js';
import { band, TEAMS } from '../score.js';
import { timesChip, matchWith, meetBadge } from './meet.js';
import { conflictsFor, timeFor } from '../schedule.js';

export function createPicker(ctx) {
  const { store, actions } = ctx;
  let picker = null; // {el, team, event, anchor}
  let q = '';

  document.addEventListener('click', e => { if (picker && !picker.el.contains(e.target) && !e.target.closest('[data-pick]')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && picker) { const back = picker.anchor; close(); if (back && back.isConnected) back.focus(); } });

  function close() { if (picker) { picker.el.remove(); picker = null; } }

  function open(anchor, team, event, onAssigned) {
    close();
    const ev = store.eventByName(event);
    const el = document.createElement('div');
    el.className = 'picker'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `Assign ${event} on Team ${team}`);
    picker = { el, team, event, anchor };
    document.body.appendChild(el);
    q = '';
    el.innerHTML = `<header><input class="input" type="search" placeholder="Search Team ${team}…" aria-label="Search members on Team ${team}"><button class="btn sm ghost" type="button" data-close aria-label="Close">×</button></header><div class="picker-title">${esc(event)} · Team ${team}</div><ul role="listbox"></ul><footer></footer>`;
    el.querySelector('[data-close]').onclick = () => close();
    renderList();
    placePopover(el, anchor);
    el.querySelector('input').focus();
    el.addEventListener('input', e => { if (e.target.matches('input')) { q = e.target.value; renderList(); } });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-assign]'); if (!b) return;
      const ok = await actions.assign(team, event, b.dataset.assign);
      if (ok) { close(); if (onAssigned) onAssigned(); }
    });

    function renderList() {
      const byEmail = store.byEmail();
      const members = Object.keys(store.state.members).filter(e => store.state.members[e].team === team);
      const already = store.state.assignments[team][event] || [];
      const occupants = already.map(e => byEmail[e]);
      const rows = members.filter(e => !already.includes(e)).map(email => {
        const r = byEmail[email];
        const held = TEAMS.reduce((n, t) => n + Object.values(store.state.assignments[t]).filter(l => l.includes(email)).length, 0);
        const tag = !r ? 'none' : r.hardNos.includes(event) ? 'hardno' : r.interests.includes(event) ? 'interested' : 'neutral';
        const fit = matchWith(r, occupants);
        const clash = conflictsFor(store.state, team, event, email);
        return { email, r, name: r ? r.name : email, score: r ? ctx.scoreOf(r) : 0, held, tag, fit, clash };
      }).filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.email.includes(q.toLowerCase()))
        .sort((a, b) => (a.clash.length > 0) - (b.clash.length > 0) || (b.tag === 'interested') - (a.tag === 'interested') || ((b.fit && b.fit.status === 'ok') - (a.fit && a.fit.status === 'ok')) || a.held - b.held || b.score - a.score);
      const current = occupants.filter(Boolean);
      const when = timeFor(event);
      const titleEl = el.querySelector('.picker-title');
      titleEl.innerHTML = `${esc(event)} · Team ${team}${when ? ` <span class="muted small">· ${esc(when)}</span>` : ''}` + (current.length ? ` · with ${current.map(r => `${esc(r.name)} ${timesChip(r, { small: true })}`).join(', ')}` : '');
      const unplaced = store.responses.filter(r => !store.state.members[r.email] || !store.state.members[r.email].team).length;
      el.querySelector('ul').innerHTML = rows.length
        ? rows.map(m => `<li role="option" class="${m.clash.length ? 'clash' : ''}"><button type="button" data-assign="${esc(m.email)}" ${m.clash.length ? `title="${esc('Overlaps ' + m.clash.join(' and ') + (when ? ' (' + when + ')' : ' — same time block') + '. Cannot be assigned.')}"` : ''}><span>${m.clash.length ? `<span class="meet clash" aria-label="Schedule overlap">⚠ overlaps ${esc(m.clash.join(' & '))}</span> ` : ''}<b>${esc(m.name)}</b> ${timesChip(m.r, { small: true })}${m.fit ? (m.fit.status === 'ok' ? `<span class="meet ok">✓ ${m.fit.shared.map(k => k === 'mc' ? 'MC' : k).join('+')}</span>` : '<span class="meet bad">⚠ no shared time</span>') : ''}</span><span class="pill band-${band(m.score)}">${m.score}</span><span class="chip" title="Events held">${m.held} ev</span>${m.tag === 'interested' ? '<span class="chip green">interested</span>' : m.tag === 'hardno' ? '<span class="chip red">HARD NO</span>' : '<span class="chip">neutral</span>'}</button></li>`).join('')
        : `<li class="muted small" style="padding:8px">${members.length ? 'No one matches.' : `No members on Team ${team} yet.`}</li>`;
      const open = ev ? ev.slots - already.length : 0;
      el.querySelector('footer').textContent = `${open} open slot${open === 1 ? '' : 's'} · ${unplaced} unplaced member${unplaced === 1 ? '' : 's'} — place them on the Board first`;
    }
  }
  return { open, close, get isOpen() { return !!picker; } };
}
