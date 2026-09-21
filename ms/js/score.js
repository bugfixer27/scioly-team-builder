import { allConflicts } from './schedule.js';
// Pure scoring, banding, event abbreviations and rules check. Importable in Node (no DOM).

// Middle school form: far fewer questions than the high school one, so the score is built from
// the commitment answer, the two 1–5 ratings, experience, medals and grade.
export const FACTORS = [
  { key: 'commitment',     label: 'Commitment to preparing',  source: 'commitment' },
  { key: 'accountability', label: 'Holds self accountable',   source: 'accountability' },
  { key: 'unlikedEvent',   label: 'Will do an unliked event', source: 'unlikedEvent' },
  { key: 'experience',     label: 'Years of experience',      source: 'yearsExperience' },
  { key: 'medals',         label: 'Has medaled',              source: 'medals' },
  { key: 'grade',          label: 'Grade (6 → 8)',            source: 'grade' }
];

export const DEFAULT_WEIGHTS = { commitment: 4, accountability: 3, unlikedEvent: 2, experience: 2, medals: 1, grade: 1 };

function rating(v) { return v === null || v === undefined || v === '' ? null : (Number(v) - 1) / 4; }

// 'very' | 'committed' | 'not' | null from the commitment answer (the backend sends the level; raw text also works).
export function commitmentLevel(v) {
  const t = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (!t) return null;
  if (t === 'very' || /^very/.test(t)) return 'very';
  if (t === 'not' || /^not/.test(t)) return 'not';
  if (t === 'committed' || /^committed/.test(t)) return 'committed';
  return null;
}
export const COMMITMENT_LABEL = { very: 'Very committed', committed: 'Committed', not: 'Not (yet) committed' };

// The medals question is required on the MS form, so "no" / "none" / "n/a" are real answers meaning no medals.
export function hasMedaled(v) {
  const t = String(v === null || v === undefined ? '' : v).trim();
  if (!t) return false;
  return !/^(no|nope|none|nah|never|not yet|n\/?a|na|0|-+)\b[\s.!]*$/i.test(t) && !/^(no|none)[,.\s]/i.test(t);
}

// Returns { raw, normalized } where normalized is null when the question was skipped.
export function normalizeFactor(key, r) {
  r = r || {};
  switch (key) {
    case 'accountability': case 'unlikedEvent':
      return { raw: r[key] ?? null, normalized: rating(r[key]) };
    case 'commitment': {
      const lvl = commitmentLevel(r.commitment);
      return { raw: lvl ? COMMITMENT_LABEL[lvl] : null, normalized: lvl === 'very' ? 1 : lvl === 'committed' ? 0.5 : lvl === 'not' ? 0 : null };
    }
    case 'experience': {
      if (r.priorExperience === false) return { raw: 'No prior experience', normalized: 0 };
      const y = r.yearsExperience;
      if (y === null || y === undefined || y === '') return { raw: null, normalized: null };
      return { raw: y, normalized: Math.min(Number(y), 3) / 3 };
    }
    case 'medals': {
      const m = r.medals;
      if (m === null || m === undefined) return { raw: null, normalized: null };
      return { raw: m, normalized: hasMedaled(m) ? 1 : 0 };
    }
    case 'grade': {
      const g = Number(r.grade);
      if (!g) return { raw: null, normalized: null };
      return { raw: g, normalized: Math.max(0, Math.min(1, (g - 6) / 2)) };
    }
    default: return { raw: null, normalized: null };
  }
}

// score = round(100 × Σ(w·f) / Σ(w)) over factors whose value is non-null.
export function computeScore(response, weights) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  let num = 0, den = 0;
  const breakdown = FACTORS.map(f => {
    const { raw, normalized } = normalizeFactor(f.key, response);
    const weight = Number(w[f.key]) || 0;
    const counted = normalized !== null && weight > 0;
    const contribution = counted ? normalized * weight : 0;
    if (counted) { num += contribution; den += weight; }
    return { key: f.key, label: f.label, raw, normalized, weight, contribution, counted };
  });
  const score = den > 0 ? Math.round(100 * num / den) : 0;
  return { score, breakdown, weightTotal: den };
}

export function band(score) {
  if (score >= 70) return 'A';
  if (score >= 40) return 'B';
  return 'C';
}
export function bandLabel(score) { return band(score) + '-range'; }

// 3–4 letter codes per event; unknown names get a generated code.
const ABBREV = {
  'Anatomy & Physiology': 'ANAT', 'Boomilever': 'BOOM', 'Botany': 'BOTN', 'Circuit Lab': 'CIRC', 'Codebusters': 'CODE',
  'Crime Busters': 'CRIM', 'Disease Detectives': 'DISD', 'Dynamic Planet': 'DYPL', 'Elastic Launched Glider': 'ELG',
  'Experimental Design': 'EXPD', 'Food Science': 'FOOD', 'Heredity': 'HERD', 'Hovercraft': 'HOVR', 'Meteorology': 'METR',
  'Ping Pong Parachute': 'PPP', 'Remote Sensing': 'RSEN', 'Rocks and Minerals': 'ROCK', 'Roller Coaster': 'ROLL',
  'Scrambler': 'SCRM', 'Solar System': 'SOLR', 'Thermodynamics': 'THRM', 'Water Quality': 'WATQ', 'Write It Do It': 'WIDI'
};
export function abbrev(eventName) {
  if (ABBREV[eventName]) return ABBREV[eventName];
  const words = String(eventName).replace(/^\?/, '').split(/[^A-Za-z]+/).filter(Boolean);
  if (words.length >= 2) return words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
  return String(eventName).replace(/^\?/, '').slice(0, 4).toUpperCase();
}

// ---- rules -------------------------------------------------------------

export const TEAMS = ['A', 'B', 'C'];

export function membersOnTeam(state, team) {
  const m = (state && state.members) || {};
  return Object.keys(m).filter(e => m[e] && m[e].team === team);
}

// Per-team stats: count, seniors (= 9th graders here), avgScore, eventsTouched, slotsFilled.
export function teamStats(state, responses, events, weights) {
  const byEmail = {};
  (responses || []).forEach(r => { byEmail[r.email] = r; });
  const out = {};
  TEAMS.forEach(team => {
    const emails = membersOnTeam(state, team);
    let seniors = 0, scoreSum = 0, scored = 0;
    emails.forEach(e => {
      const r = byEmail[e];
      if (r && r.grade === 9) seniors++;   // Division B: at most five 9th graders (`seniors` keeps the HS field name)
      if (r) { scoreSum += computeScore(r, weights).score; scored++; }
    });
    const asg = (state.assignments && state.assignments[team]) || {};
    let touched = 0, filled = 0, total = 0;
    (events || []).forEach(ev => {
      const list = asg[ev.name] || [];
      total += ev.slots;
      filled += Math.min(ev.slots, list.length);
      if (list.length) touched++;
    });
    out[team] = { count: emails.length, seniors, avgScore: scored ? Math.round(scoreSum / scored) : null, eventsTouched: touched, eventsTotal: (events || []).length, slotsFilled: filled, slotsTotal: total };
  });
  return out;
}

// Returns an array of {code, team, event?, email?, message}. Empty array = clean.
export function rulesCheck(state, responses, events, settings) {
  return rulesCheckBase(state, responses, events, settings).concat(scheduleProblems(state, responses));
}
function rulesCheckBase(state, responses, events, settings) {
  const s = settings || {};
  const teamCap = Number(s.teamCap ?? 15), seniorCap = Number(s.seniorCap ?? 5);
  const byEmail = {};
  (responses || []).forEach(r => { byEmail[r.email] = r; });
  const nameOf = e => (byEmail[e] && byEmail[e].name) || e;
  const problems = [];
  const stats = teamStats(state, responses, events, s.weights);
  TEAMS.forEach(team => {
    if (stats[team].count > teamCap) problems.push({ code: 'teamCap', team, message: `Team ${team} has ${stats[team].count} members (max ${teamCap})` });
    if (stats[team].seniors > seniorCap) problems.push({ code: 'seniorCap', team, message: `Team ${team} has ${stats[team].seniors} ninth-graders (max ${seniorCap})` });
    const asg = (state.assignments && state.assignments[team]) || {};
    const slotsByName = {};
    (events || []).forEach(ev => { slotsByName[ev.name] = ev.slots; });
    Object.keys(asg).forEach(ev => {
      const list = asg[ev] || [];
      const seen = new Set();
      list.forEach(email => {
        if (seen.has(email)) problems.push({ code: 'duplicateSlot', team, event: ev, email, message: `${nameOf(email)} holds two ${ev} slots on Team ${team}` });
        seen.add(email);
        const m = state.members && state.members[email];
        if (!m || m.team !== team) problems.push({ code: 'crossTeam', team, event: ev, email, message: `${nameOf(email)} is assigned ${ev} on Team ${team} but is ${m && m.team ? 'on Team ' + m.team : 'unplaced'}` });
      });
      if (slotsByName[ev] !== undefined && list.length > slotsByName[ev]) problems.push({ code: 'overSlots', team, event: ev, message: `${ev} on Team ${team} has ${list.length} people for ${slotsByName[ev]} slots` });
    });
  });
  return problems;
}

// Schedule overlaps already in the state (same time block on the same team).
function scheduleProblems(state, responses) {
  const byEmail = {}; (responses || []).forEach(r => { byEmail[r.email] = r; });
  return allConflicts(state).map(c => ({ code: 'overlap', team: c.team, email: c.email, events: c.events, message: `${(byEmail[c.email] && byEmail[c.email].name) || c.email} holds ${c.events[0]} and ${c.events[1]} on Team ${c.team}, which run at the same time` }));
}

// Events (by team) held by one member: [{team, event}]
export function eventsHeldBy(state, email) {
  const out = [];
  TEAMS.forEach(team => {
    const asg = (state.assignments && state.assignments[team]) || {};
    Object.keys(asg).forEach(ev => { if ((asg[ev] || []).includes(email)) out.push({ team, event: ev }); });
  });
  return out;
}
