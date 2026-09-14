// Shared "when can they meet" widgets: a per-person times chip and a per-group shared-time badge.
import { esc } from '../ui.js';
import { availabilityOf, availabilityLabels, sharedTimes, sharedLabel } from '../score.js';

// Compact chips: MC · A · B (only the ones they have). Empty availability shows a warning chip.
export function timesChip(r, opts = {}) {
  if (!r) return '';
  const av = availabilityOf(r);
  const keys = ['mc', 'A', 'B'].filter(k => av[k]);
  const title = keys.length ? 'Can meet: ' + availabilityLabels(av).join(', ') : 'No Mini Course and no activity period given';
  if (!keys.length) return `<span class="times none" title="${esc(title)}">⚠ no times</span>`;
  return `<span class="times ${opts.small ? 'small' : ''}" title="${esc(title)}" aria-label="${esc(title)}">${keys.map(k => `<span class="t t-${k}">${k === 'mc' ? 'MC' : k}</span>`).join('')}</span>`;
}

// Badge for a group of people on one event: ✓ shared time, or ⚠ none. Null when fewer than 2 people.
export function meetBadge(responses) {
  const shared = sharedTimes(responses);
  if (shared === null) return '';
  const who = responses.filter(Boolean).map(r => `${r.name}: ${availabilityLabels(availabilityOf(r)).join(', ') || 'none'}`).join('\n');
  if (shared.length) return `<span class="meet ok" title="${esc('Everyone can meet during ' + shared.map(k => k === 'mc' ? 'Mini Course' : 'Period ' + k).join(' or ') + '\n' + who)}">✓ ${esc(sharedLabel(shared))}</span>`;
  return `<span class="meet bad" title="${esc('No time all of them share\n' + who)}">⚠ no shared time</span>`;
}

// For "would adding X work?" hints: 'ok' | 'bad' | null (no one there yet).
export function matchWith(candidate, occupants) {
  const list = occupants.filter(Boolean);
  if (!list.length || !candidate) return null;
  const shared = sharedTimes([candidate, ...list]);
  return { status: shared.length ? 'ok' : 'bad', shared };
}
