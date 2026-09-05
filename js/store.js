// Single in-memory store. The pure functions (everything above `createStore`) never touch the DOM
// and are unit-tested in Node. State shape follows API_CONTRACT.md.
import { TEAMS, eventsHeldBy } from './score.js';

export const DEFAULT_SETTINGS = {
  teamCap: 15, seniorCap: 7, eventWarnAt: 4,
  weights: { outsideWork: 3, afterSchool: 2, weekends: 2, accountability: 3, conflicts: 2, unlikedEvent: 1, selfTeam: 3, experience: 2, medals: 1, honors: 1, miniCourse: 1, makerSpace: 1 }
};

export function clone(x) { return JSON.parse(JSON.stringify(x)); }

export function emptyState() {
  return { settings: clone(DEFAULT_SETTINGS), members: {}, assignments: { A: {}, B: {}, C: {} }, published: false };
}

// Fill in anything the server (or an old draft) left out so views never null-check.
export function normalizeState(input) {
  const s = emptyState();
  if (!input || typeof input !== 'object') return s;
  s.settings = { ...s.settings, ...(input.settings || {}) };
  s.settings.weights = { ...DEFAULT_SETTINGS.weights, ...((input.settings && input.settings.weights) || {}) };
  Object.keys(input.members || {}).forEach(email => {
    const m = input.members[email] || {};
    s.members[String(email).toLowerCase()] = { team: TEAMS.includes(m.team) ? m.team : null, note: String(m.note || ''), flags: Array.isArray(m.flags) ? m.flags.slice() : [] };
  });
  TEAMS.forEach(t => {
    const src = (input.assignments && input.assignments[t]) || {};
    Object.keys(src).forEach(ev => { if (Array.isArray(src[ev])) s.assignments[t][ev] = src[ev].map(e => String(e).toLowerCase()); });
  });
  s.published = !!input.published;
  return s;
}

export function teamOf(state, email) {
  const m = state.members[email];
  return m && m.team ? m.team : null;
}

// ---- pure mutations: each returns a NEW state (input untouched) ---------------------------

// Move a member to team ('A'|'B'|'C') or null (unplaced). Removes their event assignments on any other team.
// Returns { state, removed:[{team,event}] } — the caller confirms `removed` with the user *before* calling.
export function placeMember(state, email, team) {
  const next = clone(state);
  team = TEAMS.includes(team) ? team : null;
  if (!next.members[email]) next.members[email] = { team: null, note: '', flags: [] };
  const removed = [];
  TEAMS.forEach(t => {
    if (t === team) return;
    const asg = next.assignments[t];
    Object.keys(asg).forEach(ev => {
      if (asg[ev].includes(email)) { removed.push({ team: t, event: ev }); asg[ev] = asg[ev].filter(e => e !== email); if (!asg[ev].length) delete asg[ev]; }
    });
  });
  next.members[email].team = team;
  return { state: next, removed };
}

// What placeMember would remove, without mutating (for the confirm dialog).
export function assignmentsLostByMove(state, email, team) {
  return eventsHeldBy(state, email).filter(h => h.team !== team);
}

// Assign email to event on team. Throws if they are not on that team or already hold the event there.
export function assignSlot(state, team, event, email, slots) {
  if (teamOf(state, email) !== team) throw new Error('Member is not on Team ' + team);
  const next = clone(state);
  const list = next.assignments[team][event] || [];
  if (list.includes(email)) throw new Error('Already assigned to ' + event);
  if (slots && list.length >= slots) throw new Error(event + ' on Team ' + team + ' is full');
  next.assignments[team][event] = list.concat([email]);
  return next;
}

export function unassignSlot(state, team, event, email) {
  const next = clone(state);
  const list = (next.assignments[team][event] || []).filter(e => e !== email);
  if (list.length) next.assignments[team][event] = list; else delete next.assignments[team][event];
  return next;
}

export function setNote(state, email, note) {
  const next = clone(state);
  if (!next.members[email]) next.members[email] = { team: null, note: '', flags: [] };
  next.members[email].note = String(note || '').slice(0, 4000);
  return next;
}

export function setSettings(state, patch) {
  const next = clone(state);
  const { weights, ...rest } = patch || {};
  Object.assign(next.settings, rest);
  if (weights) next.settings.weights = { ...next.settings.weights, ...weights };
  return next;
}

// Remove a member entirely (used for "no response on file" ghosts).
export function removeMember(state, email) {
  const next = clone(state);
  delete next.members[email];
  TEAMS.forEach(t => {
    const asg = next.assignments[t];
    Object.keys(asg).forEach(ev => { asg[ev] = asg[ev].filter(e => e !== email); if (!asg[ev].length) delete asg[ev]; });
  });
  return next;
}

// ---- diff + summary ---------------------------------------------------------------------

export function slotSet(state) {
  const set = new Set();
  TEAMS.forEach(t => { const asg = state.assignments[t] || {}; Object.keys(asg).forEach(ev => (asg[ev] || []).forEach(e => set.add(t + '|' + ev + '|' + e))); });
  return set;
}

// Diff `from` → `to`. moved: {email, from, to}; slotsAdded/Removed: {team,event,email}; notesEdited: [email]; settingsChanged: bool
export function diffStates(from, to) {
  from = normalizeState(from); to = normalizeState(to);
  const emails = new Set([...Object.keys(from.members), ...Object.keys(to.members)]);
  const moved = [], notesEdited = [], removedMembers = [];
  emails.forEach(e => {
    const a = from.members[e], b = to.members[e];
    const ta = a ? a.team : null, tb = b ? b.team : null;
    if (a && !b) { removedMembers.push(e); if (ta) moved.push({ email: e, from: ta, to: null }); return; }
    if (ta !== tb) moved.push({ email: e, from: ta, to: tb });
    if ((a ? a.note : '') !== (b ? b.note : '')) notesEdited.push(e);
  });
  const sa = slotSet(from), sb = slotSet(to);
  const parse = k => { const [team, event, email] = k.split('|'); return { team, event, email }; };
  const slotsAdded = [...sb].filter(k => !sa.has(k)).map(parse);
  const slotsRemoved = [...sa].filter(k => !sb.has(k)).map(parse);
  const settingsChanged = JSON.stringify(from.settings) !== JSON.stringify(to.settings);
  return { moved, slotsAdded, slotsRemoved, notesEdited, removedMembers, settingsChanged };
}

// "Moved 3 to A, filled 5 slots, edited 1 note"
export function summarizeDiff(d) {
  const parts = [];
  const byTeam = { A: 0, B: 0, C: 0, U: 0 };
  d.moved.forEach(m => { byTeam[m.to || 'U']++; });
  ['A', 'B', 'C'].forEach(t => { if (byTeam[t]) parts.push(`Moved ${byTeam[t]} to ${t}`); });
  if (byTeam.U) parts.push(`Unplaced ${byTeam.U}`);
  if (d.slotsAdded.length) parts.push(`filled ${d.slotsAdded.length} slot${d.slotsAdded.length === 1 ? '' : 's'}`);
  if (d.slotsRemoved.length) parts.push(`cleared ${d.slotsRemoved.length} slot${d.slotsRemoved.length === 1 ? '' : 's'}`);
  if (d.notesEdited.length) parts.push(`edited ${d.notesEdited.length} note${d.notesEdited.length === 1 ? '' : 's'}`);
  if (d.removedMembers.length) parts.push(`removed ${d.removedMembers.length} member${d.removedMembers.length === 1 ? '' : 's'}`);
  if (d.settingsChanged) parts.push('changed settings');
  if (!parts.length) return 'No changes';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isDirty(base, current) {
  return JSON.stringify(normalizeState(base)) !== JSON.stringify(normalizeState(current));
}

// ---- CSV ---------------------------------------------------------------------------------

export function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows) { return rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'; }

// Roster in the same shape the export endpoint returns.
export function buildRoster(state, responses) {
  const byEmail = {}; (responses || []).forEach(r => { byEmail[r.email] = r; });
  const roster = { A: [], B: [], C: [] };
  const rows = [['Team', 'Name', 'Email', 'Grade', 'Events', 'Self-placed', 'Note']];
  const members = Object.keys(state.members).filter(e => state.members[e].team).map(email => {
    const r = byEmail[email] || {}, m = state.members[email];
    return { email, team: m.team, name: r.name || email, grade: r.grade || '', selfTeam: r.selfTeam || '', note: m.note || '', events: eventsHeldBy(state, email).filter(h => h.team === m.team).map(h => h.event).sort() };
  });
  members.sort((a, b) => a.team === b.team ? a.name.localeCompare(b.name) : a.team.localeCompare(b.team));
  members.forEach(m => { rows.push([m.team, m.name, m.email, m.grade, m.events.join(', '), m.selfTeam, m.note]); roster[m.team].push({ name: m.name, grade: m.grade, events: m.events }); });
  return { roster, rows, members };
}

export function buildEventRows(state, responses, events) {
  const byEmail = {}; (responses || []).forEach(r => { byEmail[r.email] = r; });
  const rows = [['Event', 'Slots', 'Team A', 'Team B', 'Team C']];
  (events || []).forEach(ev => rows.push([ev.name, ev.slots].concat(TEAMS.map(t => ((state.assignments[t] || {})[ev.name] || []).map(e => (byEmail[e] || {}).name || e).join(', ')))));
  return rows;
}

export function rosterSummaryText(state, responses) {
  const { roster } = buildRoster(state, responses);
  return TEAMS.map(t => `Team ${t} (${roster[t].length}): ` + roster[t].map(m => m.events.length ? `${m.name} (${m.events.join(', ')})` : m.name).join(', ')).join('\n');
}

// ---- store (thin, DOM-free) --------------------------------------------------------------

export function createStore() {
  const listeners = new Set();
  const store = {
    server: { version: 0, updatedAt: '', author: '', serverTime: '', events: [], teams: TEAMS.slice(), defaults: null, responseMeta: null, loadedAt: 0 },
    responses: [],
    baseState: emptyState(),   // what the server had when we loaded (diff/summary anchor)
    state: emptyState(),
    dirty: false,
    saving: false,
    newerVersion: null,        // {version, author} from polling
    sessionSaves: [],          // summaries returned by save this session
    loaded: false,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit(what) { listeners.forEach(fn => { try { fn(what || 'change', store); } catch (e) { console.error(e); } }); },
    // Replace everything from a `load` payload.
    setLoaded(payload) {
      store.server = { version: payload.version || 0, updatedAt: payload.updatedAt || '', author: payload.author || '', serverTime: payload.serverTime || '', events: payload.events || [], teams: payload.teams || TEAMS.slice(), defaults: payload.defaults || null, responseMeta: payload.responseMeta || null, loadedAt: Date.now() };
      store.responses = payload.responses || [];
      store.baseState = normalizeState(payload.state);
      store.state = clone(store.baseState);
      store.dirty = false; store.newerVersion = null; store.loaded = true;
      store.emit('load');
    },
    // Apply a pure mutation result.
    setState(next, opts) {
      store.state = normalizeState(next);
      store.dirty = isDirty(store.baseState, store.state);
      store.emit((opts && opts.reason) || 'change');
    },
    markSaved(version, updatedAt, author) {
      store.server.version = version; store.server.updatedAt = updatedAt || ''; store.server.author = author || ''; store.server.loadedAt = Date.now();
      store.baseState = clone(store.state); store.dirty = false; store.newerVersion = null;
      store.emit('saved');
    },
    byEmail() { const m = {}; store.responses.forEach(r => { m[r.email] = r; }); return m; },
    eventByName(name) { return store.server.events.find(e => e.name === name) || null; },
    diff() { return diffStates(store.baseState, store.state); }
  };
  return store;
}
