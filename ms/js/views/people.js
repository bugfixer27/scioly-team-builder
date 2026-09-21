// People view: sortable, filterable table of every respondent + CSV download.
import { esc, download } from '../ui.js';
import { toCsv } from '../store.js';
import { band, TEAMS, hasMedaled, commitmentLevel, COMMITMENT_LABEL } from '../score.js';

const COLS = [
  ['name', 'Name'], ['email', 'Email'], ['grade', 'Grade'], ['team', 'Team'], ['score', 'Score'], ['commitment', 'Commitment'], ['yearsExperience', 'Years'],
  ['medals', 'Medals?'], ['accountability', 'Accountable'], ['unlikedEvent', 'Unliked ev.'], ['workWith', 'Wants to work with'],
  ['held', 'Events held'], ['nInterests', '#Interests'], ['nHardNos', '#Hard-nos'], ['submissionCount', 'Submissions'], ['timestamp', 'Submitted']
];

export function mount(root, ctx) {
  const { store, actions } = ctx;
  const ui = { q: '', team: '', grade: '', sort: 'score', asc: false };
  let lastRows = [];

  root.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; if (ui.sort === k) ui.asc = !ui.asc; else { ui.sort = k; ui.asc = !['score', 'grade', 'held', 'yearsExperience', 'submissionCount', 'nInterests', 'nHardNos'].includes(k); } render(); return; }
    if (e.target.closest('[data-csv]')) { downloadCsv(); return; }
    const tr = e.target.closest('tr[data-email]'); if (tr) actions.openDrawer(tr.dataset.email);
  });
  root.addEventListener('input', e => { if (e.target.dataset.pf) { ui[e.target.dataset.pf] = e.target.value; render(); } });
  root.addEventListener('change', e => { if (e.target.dataset.pf) { ui[e.target.dataset.pf] = e.target.value; render(); } });

  function rowsData() {
    return store.responses.map(r => {
      const m = store.state.members[r.email];
      const team = m && m.team ? m.team : '';
      const held = TEAMS.reduce((n, t) => n + Object.values(store.state.assignments[t]).filter(l => l.includes(r.email)).length, 0);
      return { ...r, team, score: ctx.scoreOf(r), held, nInterests: r.interests.length, nHardNos: r.hardNos.length, medalsFlag: hasMedaled(r.medals) ? 'Yes' : 'No' };
    }).filter(x => (!ui.q || x.name.toLowerCase().includes(ui.q.toLowerCase()) || x.email.includes(ui.q.toLowerCase())) && (!ui.team || (ui.team === 'U' ? !x.team : x.team === ui.team)) && (!ui.grade || String(x.grade) === ui.grade))
      .sort((a, b) => { const va = a[ui.sort], vb = b[ui.sort]; const c = typeof va === 'number' || typeof vb === 'number' ? ((va ?? -Infinity) - (vb ?? -Infinity)) : String(va ?? '').localeCompare(String(vb ?? '')); return ui.asc ? c : -c; });
  }
  function cell(x, k) {
    switch (k) {
      case 'score': return `<span class="pill band-${band(x.score)}">${x.score}</span>`;
      case 'team': return x.team ? `<span class="tag-team">${x.team}</span>` : '<span class="muted">—</span>';
      case 'medals': return hasMedaled(x.medals) ? `<span title="${esc(x.medals)}">Yes</span>` : 'No';
      case 'commitment': return esc(COMMITMENT_LABEL[commitmentLevel(x.commitment)] || '');
      case 'submissionCount': return x.submissionCount > 1 ? `${x.submissionCount} <span class="chip amber">resubmitted</span>` : String(x.submissionCount);
      case 'timestamp': return `<span class="nowrap">${esc(new Date(x.timestamp).toLocaleString())}</span>`;
      case 'grade': return x.grade ? `<span class="grade">${x.grade}</span>` : '';
      default: return esc(x[k] ?? '');
    }
  }
  function csvVal(x, k) {
    switch (k) {
      case 'medals': return hasMedaled(x.medals) ? 'Yes' : 'No';
      case 'commitment': return COMMITMENT_LABEL[commitmentLevel(x.commitment)] || '';
      default: return x[k] ?? '';
    }
  }
  function downloadCsv() { download('ms-people.csv', toCsv([COLS.map(c => c[1])].concat(lastRows.map(x => COLS.map(c => csvVal(x, c[0]))))), 'text/csv'); }

  function render() {
    lastRows = rowsData();
    root.innerHTML = `
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search…" value="${esc(ui.q)}" data-pf="q" aria-label="Search people" style="width:200px">
        <label class="inline">Team <select class="input" data-pf="team"><option value="">all</option><option value="U" ${ui.team === 'U' ? 'selected' : ''}>Unplaced</option>${TEAMS.map(t => `<option ${ui.team === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="inline">Grade <select class="input" data-pf="grade"><option value="">all</option>${[6, 7, 8].map(g => `<option ${ui.grade === String(g) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <span class="muted small">${lastRows.length} of ${store.responses.length}</span><span class="grow"></span>
        <button class="btn sm" type="button" data-csv>Download CSV</button></div>
      <div class="people-wrap"><table class="grid"><thead><tr>${COLS.map(c => `<th data-sort="${c[0]}" class="${ui.sort === c[0] ? 'sorted' + (ui.asc ? ' asc' : '') : ''}" scope="col">${c[1]}</th>`).join('')}</tr></thead>
      <tbody>${lastRows.map(x => `<tr class="clickable" data-email="${esc(x.email)}" tabindex="0">${COLS.map(c => `<td>${cell(x, c[0])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      ${lastRows.length ? '' : '<div class="empty-state">No respondents match.</div>'}</div>`;
  }
  root.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-email]'); if (tr && e.key === 'Enter') actions.openDrawer(tr.dataset.email); });
  return { render };
}
