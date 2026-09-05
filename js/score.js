// Pure scoring, banding, event abbreviations and rules check. Importable in Node (no DOM).

export const FACTORS = [
  { key: 'outsideWork',    label: 'Work outside AP/minicourse', source: 'outsideWork' },
  { key: 'afterSchool',    label: 'Work after school',          source: 'afterSchool' },
  { key: 'weekends',       label: 'Saturdays / days off',       source: 'weekends' },
  { key: 'accountability', label: 'Holds self accountable',     source: 'accountability' },
  { key: 'conflicts',      label: 'Communicates conflicts',     source: 'conflicts' },
  { key: 'unlikedEvent',   label: 'Will do an unliked event',   source: 'unlikedEvent' },
  { key: 'selfTeam',       label: 'Self-placed team',           source: 'selfTeam' },
  { key: 'experience',     label: 'Years of experience',        source: 'yearsExperience' },
  { key: 'medals',         label: 'Has medaled',                source: 'medals' },
  { key: 'honors',         label: 'Honors science',             source: 'honorsScience' },
  { key: 'miniCourse',     label: 'In the Mini Course',         source: 'miniCourse' },
  { key: 'makerSpace',     label: 'Would go to maker space',    source: 'makerSpace' }
];

export const DEFAULT_WEIGHTS = {
  outsideWork: 3, afterSchool: 2, weekends: 2, accountability: 3, conflicts: 2,
  unlikedEvent: 1, selfTeam: 3, experience: 2, medals: 1, honors: 1, miniCourse: 1, makerSpace: 1
};

function rating(v) { return v === null || v === undefined || v === '' ? null : (Number(v) - 1) / 4; }

// Returns { raw, normalized } where normalized is null when the question was skipped.
export function normalizeFactor(key, r) {
  r = r || {};
  switch (key) {
    case 'outsideWork': case 'afterSchool': case 'weekends': case 'accountability': case 'unlikedEvent':
      return { raw: r[key] ?? null, normalized: rating(r[key]) };
    case 'conflicts':
      return { raw: r.conflicts ?? null, normalized: rating(r.conflicts) };
    case 'selfTeam': {
      const t = r.selfTeam || null;
      return { raw: t, normalized: t === 'A' ? 1 : t === 'B' ? 0.5 : t === 'C' ? 0 : null };
    }
    case 'experience': {
      if (r.priorExperience === false) return { raw: 'No prior experience', normalized: 0 };
      const y = r.yearsExperience;
      if (y === null || y === undefined || y === '') return { raw: null, normalized: r.priorExperience === true ? null : null };
      return { raw: y, normalized: Math.min(Number(y), 3) / 3 };
    }
    case 'medals': {
      const m = r.medals;
      if (m === null || m === undefined) return { raw: null, normalized: null };
      return { raw: m, normalized: String(m).trim() ? 1 : 0 };
    }
    case 'honors':     return { raw: r.honorsScience ?? null, normalized: r.honorsScience === true ? 1 : r.honorsScience === false ? 0 : null };
    case 'miniCourse': return { raw: r.miniCourse ?? null,    normalized: r.miniCourse === true ? 1 : r.miniCourse === false ? 0 : null };
    case 'makerSpace': return { raw: r.makerSpace ?? null,    normalized: r.makerSpace === true ? 1 : r.makerSpace === false ? 0 : null };
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
  'Anatomy & Physiology': 'ANAT', 'Astronomy': 'ASTR', 'Boomilever': 'BOOM', 'Botany': 'BOTN',
  'Chemistry Lab': 'CHEM', 'Circuit Lab': 'CIRC', 'Codebusters': 'CODE', 'Designer Genes': 'DGEN',
  'Disease Detectives': 'DISD', 'Dynamic Planet': 'DYPL', 'Electric Vehicle': 'EVEH', 'Engineering CAD': 'ECAD',
  'Experimental Design': 'EXPD', 'Forensics': 'FORN', 'Hovercraft': 'HOVR', 'Mission Possible': 'MISP',
  'Ping-Pong Parachute': 'PPP', 'Protein Modeling': 'PROT', 'Remote Sensing': 'RSEN', 'Rocks and Minerals': 'ROCK',
  'Thermodynamics': 'THRM', 'Water Quality': 'WATQ', 'Wright Stuff': 'WRGT', 'Code Craze': 'CRAZ'
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

// Per-team stats: count, seniors, avgScore, eventsTouched, slotsFilled.
export function teamStats(state, responses, events, weights) {
  const byEmail = {};
  (responses || []).forEach(r => { byEmail[r.email] = r; });
  const out = {};
  TEAMS.forEach(team => {
    const emails = membersOnTeam(state, team);
    let seniors = 0, scoreSum = 0, scored = 0;
    emails.forEach(e => {
      const r = byEmail[e];
      if (r && r.grade === 12) seniors++;
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
  const s = settings || {};
  const teamCap = Number(s.teamCap ?? 15), seniorCap = Number(s.seniorCap ?? 7);
  const byEmail = {};
  (responses || []).forEach(r => { byEmail[r.email] = r; });
  const nameOf = e => (byEmail[e] && byEmail[e].name) || e;
  const problems = [];
  const stats = teamStats(state, responses, events, s.weights);
  TEAMS.forEach(team => {
    if (stats[team].count > teamCap) problems.push({ code: 'teamCap', team, message: `Team ${team} has ${stats[team].count} members (max ${teamCap})` });
    if (stats[team].seniors > seniorCap) problems.push({ code: 'seniorCap', team, message: `Team ${team} has ${stats[team].seniors} twelfth-graders (max ${seniorCap})` });
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

// Events (by team) held by one member: [{team, event}]
export function eventsHeldBy(state, email) {
  const out = [];
  TEAMS.forEach(team => {
    const asg = (state.assignments && state.assignments[team]) || {};
    Object.keys(asg).forEach(ev => { if ((asg[ev] || []).includes(email)) out.push({ team, event: ev }); });
  });
  return out;
}
