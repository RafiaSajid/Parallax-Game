// Everything the player sees around the 3D view. It only RENDERS the game state; it owns no state of its own.
import { h, $, showMsg } from '../core.js';
import { fmtTime, starText } from '../components.js';
import { S } from './GameFlow.js';

export function setStats({ timeMs, moves }) {
  if (timeMs != null) $('#hud-time').textContent = fmtTime(timeMs);
  if (moves != null) $('#hud-moves').textContent = String(moves);
}
export function setObjective(text) { $('#objective').textContent = text; }

function render(state) {
  $('#pause').hidden = state !== S.PAUSED;
  $('#intro').hidden = state !== S.MENU;
  $('#complete').hidden = state !== S.COMPLETE;
}
const FOCUS = { [S.PAUSED]: '#pause-resume', [S.MENU]: '#intro-go', [S.COMPLETE]: '#done-replay' };

export function initHud(flow) {
  render(flow.state);
  flow.on((state, prev, ev) => {
    render(state);
    if (ev === 'restart') setStats({ timeMs: 0, moves: 0 });
    if (FOCUS[state]) $(FOCUS[state]).focus(); else document.activeElement?.blur?.();
  });
  $('#btn-pause').addEventListener('click', () => flow.pause());
  $('#pause-resume').addEventListener('click', () => flow.resume());
  for (const id of ['#btn-restart', '#pause-restart', '#done-replay']) $(id).addEventListener('click', () => flow.restart());
  $('#btn-how').addEventListener('click', () => flow.openMenu());
  $('#intro-go').addEventListener('click', () => flow.start());
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k !== 'escape' && k !== 'p') return;
    if (flow.state === S.MENU) { if (k === 'escape') flow.start(); }
    else if (flow.state === S.PLAYING) flow.pause();
    else if (flow.state === S.PAUSED) flow.resume();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flow.pause(); }); // ignored unless PLAYING
}

export function fillComplete({ timeMs, moves, stars, nextHref = null }) {
  $('#done-time').textContent = fmtTime(timeMs);
  $('#done-moves').textContent = String(moves);
  $('#done-stars').textContent = starText(stars);
  $('#done-stars').setAttribute('aria-label', `${stars} of 3 stars`);
  const next = $('#done-next');
  next.href = nextHref || 'levels.html';
  next.textContent = nextHref ? 'Next room' : 'Back to levels';
  setSaveResult({ state: 'saving', message: 'Saving your result…' });
}

// state: 'saving' | 'saved' | 'error'. Only 'saved' ever says the result was saved.
export function setSaveResult({ state, message, detail = '', achievements = [] }) {
  showMsg($('#done-save'), state === 'saved' ? 'success' : state === 'error' ? 'error' : 'info', message);
  $('#done-detail').hidden = !detail; $('#done-detail').textContent = detail;
  $('#done-retry').hidden = state !== 'error';
  $('#done-ach').hidden = achievements.length === 0;
  $('#done-ach-list').replaceChildren(...achievements.map((a) => h('li', {}, h('b', {}, a.name), h('span', { class: 'muted' }, a.description))));
}
export function onRetry(fn) { $('#done-retry').onclick = fn; } // assignment, not addEventListener: never stacks duplicate handlers
