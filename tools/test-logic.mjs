// Run: node --import ./tools/register-stub.mjs tools/test-logic.mjs
import assert from 'node:assert/strict';
import { parseLevel } from '../js/game/LevelLoader.js';
import { PuzzleState, rotateMark } from '../js/game/PuzzleState.js';
import { Interaction, pointerToNdc, classify } from '../js/game/Interaction.js';
import { Raycaster } from 'three';
import { GameFlow, S } from '../js/game/GameFlow.js';
import level01 from '../js/game/levels/level01.js';
import { LEVEL_LAYOUTS } from '../js/game/levels/index.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok  ', name); } catch (e) { console.error('  FAIL', name, '\n', e.message); process.exitCode = 1; } };
const mk = (map, marks = {}) => new PuzzleState(parseLevel({ id: 't', map, marks }));

console.log('PuzzleState');
test('rotations match right-hand rule and four turns return home', () => {
  assert.deepEqual(rotateMark([0, 0, -1], 'x', 1), [0, 1, 0]);
  assert.deepEqual(rotateMark([1, 0, 0], 'z', 1), [0, 1, 0]);
  for (const axis of ['x', 'z']) for (const dir of [1, -1]) { let m = [0, 0, 1]; for (let i = 0; i < 4; i++) m = rotateMark(m, axis, dir); assert.deepEqual(m, [0, 0, 1]); }
  assert.ok(![].concat(rotateMark([0, 0, 1], 'z', 1), rotateMark([0, 1, 0], 'x', 1)).some((v) => Object.is(v, -0)));
});
test('bounds, walls and occupied cells are rejected', () => {
  const s = mk(['#####', '#12.#', '#P.X#', '#####']);
  assert.equal(s.move('1', -1, 0).reason, 'wall');
  assert.equal(s.move('1', 1, 0).reason, 'occupied');
  assert.equal(s.move('1', 0, -1).reason, 'wall');
  assert.equal(s.move('1', 1, 1).reason, 'bad-step');
  assert.equal(s.move('9', 1, 0).reason, 'unknown-cube');
  assert.equal(s.moves, 0, 'rejected actions are not counted');
  const edge = mk(['1P.X']); assert.equal(edge.move('1', -1, 0).reason, 'out-of-bounds');
});
test('plate needs the marked face UP and is detected by the gameplay system', () => {
  const s = mk(['#####', '#1PX#', '#####'], { 1: '+z' });
  s.move('1', 1, 0); assert.equal(s.plateActive, false, 'on plate, mark sideways');
  s.rotate('1', 'x', -1); assert.equal(s.plateActive, true, 'mark now up'); assert.equal(s.portalOpen, true);
  s.rotate('1', 'x', 1); assert.equal(s.plateActive, false);
});
test('two plates: BOTH must be on before the portal opens', () => {
  const s = mk(['#######', '#12PPX#', '#######'].map((r) => r), { 1: '+y', 2: '+y' });
  assert.equal(s.plateCount, 2); assert.equal(s.platesOnCount(), 0);
  s.move('2', 1, 0); assert.equal(s.platesOnCount(), 1); assert.equal(s.portalOpen, false);
});
test('portal stays closed until the plate is active; the plate cube cannot step into it', () => {
  const s = mk(['#####', '#1PX#', '#####'], { 1: '+y' });
  s.move('1', 1, 0); assert.equal(s.plateActive, true);
  assert.equal(s.move('1', 1, 0).reason, 'portal-closed');
});
test('level 1: shipped solution solves it', () => {
  const s = new PuzzleState(parseLevel(level01));
  const sol = 'cube 2 right > cube 2 down > cube 2 right > cube 2 right > cube 2 right > cube 2 up > cube 2 right > cube 2 up > cube 2 up > cube 3 right > cube 3 right > cube 3 right > cube 3 right > cube 3 up > cube 3 F > cube 2 up'.split(' > ');
  const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (const step of sol) {
    const [, id, a] = step.split(' ');
    const r = D[a] ? s.move(id, ...D[a]) : s.rotate(id, a === 'F' ? 'x' : 'x', a === 'F' ? -1 : 1);
    assert.ok(r.ok, `${step} -> ${r.reason}`);
  }
  assert.equal(s.solved, true); assert.equal(s.moves, 16);
});
test('undo restores positions, orientation and move count exactly (random walks)', () => {
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 50; run++) {
    const s = new PuzzleState(parseLevel(level01));
    const start = JSON.stringify([...s.cubes.values()]);
    const ids = [...s.cubes.keys()];
    for (let i = 0; i < 120; i++) {
      const id = ids[Math.floor(rnd() * ids.length)];
      if (rnd() < 0.5) s.move(id, ...[[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(rnd() * 4)]);
      else s.rotate(id, rnd() < 0.5 ? 'x' : 'z', rnd() < 0.5 ? 1 : -1);
      if (s.solved) break;
    }
    while (s.history.length) assert.ok(s.undo().ok);
    assert.equal(JSON.stringify([...s.cubes.values()]), start); assert.equal(s.moves, 0);
  }
  assert.equal(new PuzzleState(parseLevel(level01)).undo().ok, false);
});
test('all shipped levels parse; every room has more cubes than plates', () => {
  for (const [id, def] of Object.entries(LEVEL_LAYOUTS)) { const l = parseLevel(def); assert.equal(l.id, id); assert.ok(l.cubes.length > l.plates.length, id); }
});
test('encode/decode round-trips', () => {
  const s = new PuzzleState(parseLevel(level01)); s.move('2', 1, 0); s.rotate('3', 'z', 1);
  const v = s.encode(), snap = JSON.stringify([...s.cubes.values()]);
  s.reset(); s.decode(v); assert.equal(JSON.stringify([...s.cubes.values()]), snap);
});

console.log('GameFlow (explicit states)');
test('normal path: menu -> playing -> paused -> playing -> solved -> complete', () => {
  const f = new GameFlow(); const seen = []; f.on((s, p, e) => seen.push(`${p}>${s}${e ? ':' + e : ''}`));
  assert.equal(f.canManipulate, false, 'no manipulation in the menu');
  assert.ok(f.start()); assert.ok(f.canManipulate);
  assert.ok(f.pause()); assert.equal(f.canManipulate, false, 'no manipulation while paused'); assert.equal(f.frozen, true);
  assert.ok(f.resume()); assert.ok(f.solve()); assert.equal(f.canManipulate, false, 'no manipulation once solved'); assert.equal(f.frozen, false);
  assert.ok(f.finish()); assert.equal(f.canManipulate, false, 'no manipulation after completion');
  assert.deepEqual(seen, ['menu>playing', 'playing>paused', 'paused>playing', 'playing>solved', 'solved>complete']);
});
test('illegal transitions are ignored and notify nobody', () => {
  const f = new GameFlow(); let n = 0; f.on(() => n++);
  assert.equal(f.pause(), false); assert.equal(f.solve(), false); assert.equal(f.finish(), false); assert.equal(f.restart(), false, 'no restart from the menu');
  f.start(); assert.equal(f.finish(), false, 'cannot complete without solving'); assert.equal(f.start(), false, 'already playing');
  f.solve(); assert.equal(f.pause(), false, 'cannot pause during the solve animation'); assert.equal(f.openMenu(), false);
  f.finish(); assert.equal(f.pause(), false); assert.equal(f.resume(), false); assert.equal(f.solve(), false);
  assert.equal(n, 3); // start, solve, finish
});
test('restart works from playing, paused, solved and complete, and always lands in PLAYING', () => {
  for (const setup of [(f) => {}, (f) => f.pause(), (f) => f.solve(), (f) => { f.solve(); f.finish(); }]) {
    const f = new GameFlow(); f.start(); setup(f); const ev = []; f.on((s, p, e) => ev.push(e));
    assert.ok(f.restart()); assert.equal(f.state, S.PLAYING); assert.deepEqual(ev, ['restart']);
  }
});
test('how-to card opens mid-game and returns to playing', () => {
  const f = new GameFlow(); f.start(); assert.ok(f.openMenu()); assert.equal(f.canManipulate, false); assert.ok(f.start()); assert.ok(f.canManipulate);
});
test('reset restores every puzzle value (positions, orientation, history, move count, plate and portal)', () => {
  const s = new PuzzleState(parseLevel(level01)); const initial = JSON.stringify([...s.cubes.values()]);
  s.move('3', 1, 0); s.rotate('3', 'x', 1); s.rotate('2', 'z', 1); s.move('2', 1, 0);
  assert.notEqual(JSON.stringify([...s.cubes.values()]), initial); assert.ok(s.moves > 0);
  s.reset();
  assert.equal(JSON.stringify([...s.cubes.values()]), initial); assert.equal(s.moves, 0); assert.equal(s.history.length, 0);
  assert.equal(s.plateActive, false); assert.equal(s.portalOpen, false); assert.equal(s.solved, false);
});
test('detection uses integer grid cells, never floating point', () => {
  const s = new PuzzleState(parseLevel(level01));
  assert.ok([...s.cubes.values()].every((c) => Number.isInteger(c.x) && Number.isInteger(c.z) && c.mark.every(Number.isInteger)));
  for (let i = 0; i < 50; i++) { s.rotate('1', 'x', 1); s.rotate('1', 'z', -1); }
  assert.ok(s.cubes.get('1').mark.every(Number.isInteger), 'repeated rotations never drift');
});

console.log('Interaction (raycasting selection logic, three stubbed)');
class FakeCanvas extends EventTarget { getBoundingClientRect() { return { left: 10, top: 20, width: 200, height: 100 }; } }
const ev = (type, x, y, extra = {}) => Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, ...extra });
const node = (kind, parent = null, id) => ({ userData: kind ? { interaction: kind, interactiveId: id } : {}, parent });
function rig(over = {}) {
  const canvas = new FakeCanvas(), ac = new AbortController(), log = { sel: [], hov: [] };
  let enabled = true;
  const it = new Interaction({ canvas, signal: ac.signal, getCamera: () => ({}), isEnabled: () => enabled, onSelect: (i) => log.sel.push(i), onHover: (i) => log.hov.push(i), ...over });
  const cube = node(null); it.register(cube, 'A'); const cubeMesh = node(null, cube); const cubeDeep = node(null, cubeMesh);
  const wall = node(null); it.registerOccluder(wall); const wallMesh = node(null, wall);
  const deco = node(null);
  return { it, canvas, ac, log, cube, cubeDeep, wallMesh, deco, setEnabled: (v) => { enabled = v; } };
}
const click = (r, x, y) => { r.canvas.dispatchEvent(ev('pointerdown', x, y)); r.canvas.dispatchEvent(ev('pointerup', x, y)); };

test('screen to NDC conversion respects the canvas rectangle', () => {
  const o = { x: 0, y: 0 }; pointerToNdc(110, 70, { left: 10, top: 20, width: 200, height: 100 }, o);
  assert.deepEqual(o, { x: 0, y: 0 }); pointerToNdc(10, 20, { left: 10, top: 20, width: 200, height: 100 }, o); assert.deepEqual(o, { x: -1, y: 1 });
});
test('click selects a cube even when the hit is a deep child mesh', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }];
  click(r, 50, 50); assert.equal(r.it.selectedId, 'A'); assert.deepEqual(r.log.sel, ['A']);
});
test('empty-space click deselects; decor hits are ignored', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }]; click(r, 50, 50);
  Raycaster.script = () => []; click(r, 60, 60); assert.equal(r.it.selectedId, null);
  Raycaster.script = () => [{ object: r.deco }]; click(r, 60, 60); assert.equal(r.it.selectedId, null);
});
test('a wall in front of a cube blocks selection; a cube in front of a wall does not', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.wallMesh }, { object: r.cubeDeep }]; click(r, 50, 50); assert.equal(r.it.selectedId, null);
  Raycaster.script = () => [{ object: r.cubeDeep }, { object: r.wallMesh }]; click(r, 50, 50); assert.equal(r.it.selectedId, 'A');
});
test('drags are not clicks', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }];
  r.canvas.dispatchEvent(ev('pointerdown', 50, 50)); r.canvas.dispatchEvent(ev('pointerup', 80, 50)); assert.equal(r.it.selectedId, null);
});
test('right/middle mouse buttons do nothing', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }];
  r.canvas.dispatchEvent(ev('pointerdown', 50, 50, { button: 2 })); r.canvas.dispatchEvent(ev('pointerup', 50, 50, { button: 2 })); assert.equal(r.it.selectedId, null);
});
test('paused/menu state blocks clicks and hover', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }]; r.setEnabled(false);
  click(r, 50, 50); assert.equal(r.it.selectedId, null);
  r.canvas.dispatchEvent(ev('pointermove', 50, 50)); r.it.update(); assert.equal(r.it.hoveredId, null);
  r.setEnabled(true); r.canvas.dispatchEvent(ev('pointermove', 50, 50)); r.it.update(); assert.equal(r.it.hoveredId, 'A');
  r.setEnabled(false); r.it.update(); assert.equal(r.it.hoveredId, null, 'hover clears when a menu opens');
});
test('pointer-down before a menu opens does not click through it', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }];
  r.canvas.dispatchEvent(ev('pointerdown', 50, 50)); r.setEnabled(false); r.canvas.dispatchEvent(ev('pointerup', 50, 50)); assert.equal(r.it.selectedId, null);
});
test('hover raycasts once per frame, not once per pointer event', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }]; Raycaster.calls = 0;
  for (let i = 0; i < 40; i++) r.canvas.dispatchEvent(ev('pointermove', 50 + i % 3, 50));
  assert.equal(Raycaster.calls, 0); r.it.update(); assert.equal(Raycaster.calls, 1); r.it.update(); assert.equal(Raycaster.calls, 1, 'idle frames do not raycast');
  assert.deepEqual(r.log.hov, ['A'], 'hover callback only on change');
});
test('touch has no hover; leaving the canvas clears hover', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }];
  r.canvas.dispatchEvent(ev('pointermove', 50, 50, { pointerType: 'touch' })); r.it.update(); assert.equal(r.it.hoveredId, null);
  r.canvas.dispatchEvent(ev('pointermove', 50, 50)); r.it.update(); r.canvas.dispatchEvent(ev('pointerleave', 0, 0)); assert.equal(r.it.hoveredId, null);
});
test('unregistering/clearing removes objects safely and notifies', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }]; click(r, 50, 50);
  r.it.clearInteractive(); assert.equal(r.it.selectedId, null); assert.equal(r.it.interactive.size, 0); assert.equal(r.log.sel.at(-1), null);
  click(r, 50, 50); assert.equal(r.it.selectedId, null, 'a removed object cannot be selected from a stale hit');
  assert.equal(r.it.occluders.size, 1, 'occluders survive a restart');
  assert.equal(classify(r.cubeDeep), null, 'registry metadata is cleaned up');
});
test('disposing the abort signal removes every listener (no duplicates after restart)', () => {
  const r = rig(); Raycaster.script = () => [{ object: r.cubeDeep }]; r.ac.abort(); click(r, 50, 50); assert.equal(r.it.selectedId, null);
});
test('selecting an unknown id is ignored', () => { const r = rig(); r.it.select('Z'); assert.equal(r.it.selectedId, null); });

console.log(`\n${passed} tests passed${process.exitCode ? ' (with FAILURES)' : ''}`);
