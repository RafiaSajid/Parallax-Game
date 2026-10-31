// Draggable cube toy for the landing page. Drag to move (it tumbles as it travels), release to snap to a flat face,
// tap to turn 90 degrees. Keyboard: arrows move, Space/R turn. Uses CSSOM only (allowed by the CSP).
import { h } from './core.js';

export function initToy(slot) {
  const faces = Array.from({ length: 6 }, () => h('i'));
  const cube = h('div', { class: 'cube' }, faces);
  const toy = h('div', { class: 'toy', tabindex: '0', role: 'img', 'aria-label': 'Draggable cube. Drag to move it, press Space to turn it.' },
    cube, h('div', { class: 'toy-shadow', 'aria-hidden': 'true' }));
  document.body.append(toy);

  let x = 0, y = 0, rx = -24, ry = -30, moved = false, held = false, userMoved = false, sx = 0, sy = 0, ox = 0, oy = 0;
  const size = () => toy.offsetWidth;
  const clamp = () => {
    x = Math.min(Math.max(x, 0), window.innerWidth - size());
    y = Math.min(Math.max(y, 0), window.innerHeight - size());
  };
  const paint = () => {
    toy.style.transform = `translate(${x}px, ${y}px)`;
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  const home = () => {
    const r = slot.getBoundingClientRect();
    x = r.left + (r.width - size()) / 2; y = r.top + (r.height - size()) / 2; // fixed positioning = viewport coords
    clamp(); paint();
  };
  const snap = () => { rx = Math.round(rx / 90) * 90; ry = Math.round(ry / 90) * 90; };

  toy.addEventListener('pointerdown', (e) => {
    held = true; moved = false; sx = e.clientX; sy = e.clientY; ox = x; oy = y;
    toy.classList.add('is-held'); toy.setPointerCapture(e.pointerId);
  });
  toy.addEventListener('pointermove', (e) => {
    if (!held) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    moved = true; userMoved = true;
    const px = x, py = y;
    x = ox + dx; y = oy + dy; clamp();
    ry += (x - px) * 0.7; rx -= (y - py) * 0.7; // tumble in the direction of travel
    paint();
  });
  const release = () => {
    if (!held) return;
    held = false; toy.classList.remove('is-held');
    if (!moved) ry += 90; // tap = turn
    snap(); paint();
  };
  toy.addEventListener('pointerup', release);
  toy.addEventListener('pointercancel', release);

  toy.addEventListener('keydown', (e) => {
    const step = 24, k = e.key;
    if (k === ' ' || k.toLowerCase() === 'r') { e.preventDefault(); ry += 90; }
    else if (k === 'ArrowLeft') { e.preventDefault(); x -= step; ry -= 90; }
    else if (k === 'ArrowRight') { e.preventDefault(); x += step; ry += 90; }
    else if (k === 'ArrowUp') { e.preventDefault(); y -= step; rx += 90; }
    else if (k === 'ArrowDown') { e.preventDefault(); y += step; rx -= 90; }
    else return;
    userMoved = true; clamp(); snap(); paint();
  });

  window.addEventListener('resize', () => { userMoved ? (clamp(), paint()) : home(); });
  home();
  snap(); paint();
  // Re-home once after fonts/layout settle if the player has not touched it yet.
  window.addEventListener('load', () => { if (!userMoved) home(); });
}
