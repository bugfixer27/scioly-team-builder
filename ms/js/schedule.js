// Competition-day schedule (Division B, middle school) and the one rule built on it:
// NOBODY may hold two events that run in the same time block on the same team.
//
// The leaders' colour-coded schedule puts the 17 timed events into six concurrent blocks
// (one colour each). Two events collide exactly when they share a colour. Build events are
// self-scheduled and never collide. Everything here is pure and DOM-free.

// One entry per colour block on the leaders' schedule sheet (colours are saturated versions of the sheet's pastels so the dots read in dark mode).
export const BLOCK_GROUPS = [
  { key: 'red',    label: 'Red',    color: '#cf5a4a', events: ['Codebusters', 'Disease Detectives', 'Remote Sensing'] },
  { key: 'yellow', label: 'Yellow', color: '#e3b62f', events: ['Water Quality', 'Experimental Design', 'Solar System'] },
  { key: 'green',  label: 'Green',  color: '#5aa457', events: ['Botany', 'Meteorology'] },
  { key: 'blue',   label: 'Blue',   color: '#4a7fdb', events: ['Circuit Lab', 'Dynamic Planet', 'Food Science'] },
  { key: 'purple', label: 'Purple', color: '#8b6cc9', events: ['Heredity', 'Rocks and Minerals', 'Thermodynamics'] },
  { key: 'pink',   label: 'Pink',   color: '#d9659f', events: ['Anatomy & Physiology', 'Crime Busters', 'Write It Do It'] }
];
export const BLOCKS = BLOCK_GROUPS.map(g => g.label + ' block');
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
// Label shown next to slots / in dialogs, e.g. "Blue block".
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

// Human label for a conflict: "overlaps Botany (Green block)".
export function describeConflict(event, others, teamNumber) {
  const t = timeFor(event, teamNumber);
  return `overlaps ${others.join(' and ')}${t ? ` (${t})` : ' (same time block)'}`;
}
