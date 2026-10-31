import { h, friendlyError, describeError } from './core.js';

export function fmtTime(ms) {
  if (ms == null) return '—';
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
export const starText = (n) => '★'.repeat(n ?? 0) + '☆'.repeat(3 - (n ?? 0));
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function levelCard(level, prog, locked) {
  const done = prog?.status === 'completed';
  const badge = done ? ['Completed', 'badge badge-done'] : prog ? ['In progress', 'badge badge-prog'] : locked ? ['Locked', 'badge'] : ['New', 'badge'];
  return h('article', { class: 'card level-card' + (locked ? ' is-locked' : '') },
    h('span', { class: badge[1] }, badge[0]),
    h('h3', {}, level.name),
    h('p', { class: 'muted' }, level.description),
    prog ? h('ul', { class: 'facts' },
      h('li', {}, 'Best time ', h('b', {}, fmtTime(prog.best_time_ms))),
      h('li', {}, 'Best moves ', h('b', {}, prog.best_moves ?? '—')),
      h('li', {}, 'Stars ', h('b', { 'aria-label': `${prog.best_stars ?? 0} of 3 stars` }, starText(prog.best_stars))),
      h('li', {}, 'Attempts ', h('b', {}, prog.attempts))) : null,
    locked
      ? h('button', { class: 'btn btn-ghost', type: 'button', disabled: true }, 'Complete the previous room')
      : h('a', { class: 'btn btn-primary', href: 'game.html?level=' + encodeURIComponent(level.id) }, done ? 'Play again' : prog ? 'Continue' : 'Play'));
}

export function achievementCard(a, earnedAt) {
  return h('article', { class: 'card ach ' + (earnedAt ? 'is-earned' : 'is-locked') },
    h('span', { class: 'ach-icon', 'aria-hidden': 'true' }),
    h('div', {},
      h('h3', {}, a.name),
      h('p', { class: 'muted' }, a.description),
      h('p', { class: 'muted' }, earnedAt ? 'Earned ' + fmtDate(earnedAt) : 'Not earned yet')));
}

export const emptyState = (text, href, cta) =>
  h('div', { class: 'empty' }, h('p', {}, text), href ? h('a', { class: 'btn btn-primary btn-sm', href }, cta) : null);

/* ---------- loading / error states for independently loaded page sections ---------- */
export function memo(fn) { let p = null; const get = () => (p ??= fn()); get.reset = () => { p = null; }; return get; }

export function errorBox(err, retry) {
  console.error('[load] failed', err);
  return h('div', { class: 'msg msg-error', role: 'alert' },
    h('p', {}, `Could not load this section: ${friendlyError(err)}`),
    h('p', { class: 'hint' }, describeError(err)),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: retry }, 'Retry'));
}

// Shows "Loading…", then the rendered nodes, or an error with a Retry button. Nothing fake is ever shown on failure.
export async function loadSection(box, render, resets = []) {
  box.replaceChildren(h('p', { class: 'muted', role: 'status' }, 'Loading…'));
  try {
    const nodes = await render();
    box.replaceChildren(...[].concat(nodes));
  } catch (err) {
    box.replaceChildren(errorBox(err, () => { resets.forEach((m) => m.reset()); loadSection(box, render, resets); }));
  }
}
