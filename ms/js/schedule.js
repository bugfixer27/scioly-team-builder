// Competition-day schedule (Division B, NYC Regionals — https://sites.google.com/view/nycregionals/schedule)
// and the one rule built on it: NOBODY may hold two events that run in the same time block on the same team.
//
// The regional runs six 50-minute slots; each timed event takes a pair of slots, with teams 1-13 in one and
// teams 14-27 in the other. Two events collide exactly when they share the slot pair AND the team order —
// regardless of your team number. Build events are self-scheduled and never collide (Thermodynamics' written
// exam is timed). Everything here is pure and DOM-free.

// One entry per conflict group (colour is only for the dots in the UI).
export const BLOCK_GROUPS = [
  { key: 'am1',  label: '8:30–10:20 · teams 1-13 first',  color: '#cf5a4a', events: ['Anatomy & Physiology', 'Crime Busters', 'Remote Sensing', 'Thermodynamics'] },
  { key: 'am2',  label: '8:30–10:20 · teams 14-27 first', color: '#e3b62f', events: ['Circuit Lab', 'Disease Detectives', 'Experimental Design', 'Rocks and Minerals'] },
  { key: 'mid1', label: '10:30–12:20 · teams 1-13 first', color: '#5aa457', events: ['Dynamic Planet', 'Food Science', 'Heredity'] },
  { key: 'mid2', label: '10:30–12:20 · teams 14-27 first', color: '#4a7fdb', events: ['Botany', 'Meteorology', 'Write It Do It'] },
  { key: 'pm1',  label: '12:30–2:20 · teams 1-13 first',  color: '#8b6cc9', events: ['Codebusters', 'Solar System'] },
  { key: 'pm2',  label: '12:30–2:20 · teams 14-27 first', color: '#d9659f', events: ['Water Quality'] }
];
export const BLOCKS = BLOCK_GROUPS.map(g => g.label);
export const ROTATION = {};
BLOCK_GROUPS.forEach((g, i) => g.events.forEach(ev => { ROTATION[ev] = i; }));
export const SELF_SCHEDULE = ['Boomilever', 'Elastic Launched Glider', 'Hovercraft', 'Ping Pong Parachute', 'Roller Coaster', 'Scrambler'];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ROT_BY_KEY = Object.fromEntries(Object.keys(ROTATION).map(k => [norm(k), ROTATION[k]]));
const SELF_KEYS = new Set(SELF_SCHEDULE.map(norm));

export function isSelfSchedule(event) { return SELF_KEYS.has(norm(event)); }
// Colour block index of an event, or null when it is a self-scheduled build.
export function groupOf(event) { const g = ROT_BY_KEY[norm(event)]; return g === undefined ? null : g; }
export function isScheduled(event) { return groupOf(event) !== null; }

// Which colour block (0-5) an event runs in, or null. (The team number does not matter here.)
export function blockFor(event) { return groupOf(event); }
export function blockOf(event) { const g = groupOf(event); return g === null ? null : BLOCK_GROUPS[g]; }
// Label shown next to slots / in dialogs, e.g. "8:30–10:20 · teams 1-13 first".
export function timeFor(event) { const g = groupOf(event); return g === null ? null : BLOCKS[g]; }

// Two events overlap iff both are scheduled and share a rotation group.
export function overlaps(a, b) {
  const ga = groupOf(a), gb = groupOf(b);
  return ga !== null && gb !== null && ga === gb && norm(a) !== norm(b);
}

// Events `email` already holds on `team` that overlap `event`. [] means the assignment is allowed.
export function conflictsFor(state, team, event, email) {
  const asg = (state.assignments && state.assignments[team]) || {};
  return Object.keys(asg).filter(ev => (asg[ev] || []).includes(email) && overlaps(ev, event)).sort();
}

// Every overlap already present in the state: [{team, email, events:[a,b]}] (each pair once).
export function allConflicts(state) {
  const out = [];
  ['A', 'B', 'C'].forEach(team => {
    const asg = (state.assignments && state.assignments[team]) || {};
    const held = {};
    Object.keys(asg).forEach(ev => (asg[ev] || []).forEach(email => { (held[email] = held[email] || []).push(ev); }));
    Object.keys(held).forEach(email => {
      const evs = held[email].slice().sort();
      for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) if (overlaps(evs[i], evs[j])) out.push({ team, email, events: [evs[i], evs[j]] });
    });
  });
  return out;
}

// Human label for a conflict: "overlaps Botany (10:30–12:20 · teams 14-27 first)".
export function describeConflict(event, others, teamNumber) {
  const t = timeFor(event, teamNumber);
  return `overlaps ${others.join(' and ')}${t ? ` (${t})` : ' (same time block)'}`;
}
