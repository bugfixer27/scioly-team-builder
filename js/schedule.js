// Competition-day schedule (Division C, May 2027) and the one rule built on it:
// NOBODY may hold two events that run in the same time block on the same team.
//
// The tournament schedule rotates team-number ranges (1-10, 11-20, … 51-60) through six
// one-hour blocks. Each event has a rotation offset; two events collide for a team
// exactly when they share the same offset — regardless of the team's number. Build
// events are self-scheduled and never collide. Everything here is pure and DOM-free.

export const BLOCKS = ['8:15–9:15 AM', '9:30–10:30 AM', '10:45–11:45 AM', '12:30–1:30 PM', '1:45–2:45 PM', '3:00–4:00 PM'];
const RANGES = ['1-10', '11-20', '21-30', '31-40', '41-50', '51-60'];

// rotation offset = which team-number range takes the event in the first block (0 → "1-10").
export const ROTATION = {
  'Anatomy & Physiology': 0, 'Engineering CAD': 0, 'Forensics': 0,
  'Designer Genes': 1, 'Dynamic Planet': 1, 'Thermodynamics': 1,
  'Circuit Lab': 2, 'Protein Modeling': 2, 'Water Quality': 2,
  'Chemistry Lab': 3, 'Rocks and Minerals': 3,
  'Astronomy': 4, 'Botany': 4, 'Experimental Design': 4,
  'Codebusters': 5, 'Disease Detectives': 5, 'Remote Sensing': 5
};
export const SELF_SCHEDULE = ['Boomilever', 'Electric Vehicle', 'Hovercraft', 'Mission Possible', 'Ping-Pong Parachute', 'Wright Stuff'];
export const IMPOUND = ['Electric Vehicle', 'Hovercraft', 'Mission Possible', 'Protein Modeling', 'Thermodynamics'];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ROT_BY_KEY = Object.fromEntries(Object.keys(ROTATION).map(k => [norm(k), ROTATION[k]]));
const SELF_KEYS = new Set(SELF_SCHEDULE.map(norm));

export function isSelfSchedule(event) { return SELF_KEYS.has(norm(event)); }
// Rotation group of an event, or null when it is self-scheduled / not on the schedule (e.g. Code Craze).
export function groupOf(event) { const g = ROT_BY_KEY[norm(event)]; return g === undefined ? null : g; }
export function isScheduled(event) { return groupOf(event) !== null; }

// Which block (0-5) an event runs in for a given tournament team number, or null.
export function blockFor(event, teamNumber) {
  const g = groupOf(event);
  const n = Number(teamNumber);
  if (g === null || !n || n < 1) return null;
  const rangeIdx = Math.min(5, Math.floor((n - 1) / 10));
  return (rangeIdx - g + 6) % 6;
}
export function timeFor(event, teamNumber) {
  const b = blockFor(event, teamNumber);
  return b === null ? null : BLOCKS[b];
}
export function rangeLabel(teamNumber) { const n = Number(teamNumber); return n >= 1 ? RANGES[Math.min(5, Math.floor((n - 1) / 10))] : null; }

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

// Human label for a conflict: "overlaps Forensics (8:15–9:15 AM)" when the team number is known.
export function describeConflict(event, others, teamNumber) {
  const t = timeFor(event, teamNumber);
  return `overlaps ${others.join(' and ')}${t ? ` (${t})` : ' (same time block)'}`;
}
