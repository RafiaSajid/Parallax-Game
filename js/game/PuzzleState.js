// Pure puzzle rules. No Three.js and no knowledge of selection or rendering, so it can be tested in Node.
// Orientation: only the direction of each cube's marked face matters for the rules (an integer vector).
import { DIRS } from './LevelLoader.js';

const key = (x, z) => `${x},${z}`;
const n0 = (v) => (v === 0 ? 0 : v); // never produce -0
const MARKS = Object.values(DIRS);
const markCode = (m) => (m[0] + 1) * 9 + (m[1] + 1) * 3 + (m[2] + 1);
const MARK_INDEX = new Map(MARKS.map((m, i) => [markCode(m), i]));

// Rotate a direction 90 degrees about a WORLD axis ('x' or 'z'), right-hand rule: same as the visual quaternion.
export const rotateMark = (m, axis, dir) =>
  axis === 'x' ? [m[0], n0(-m[2] * dir), n0(m[1] * dir)] : [n0(-m[1] * dir), n0(m[0] * dir), m[2]];

const fail = (reason) => ({ ok: false, reason });

export class PuzzleState {
  constructor(level) {
    this.level = level;
    this.walls = new Set(level.walls.map((w) => key(w.x, w.z)));
    this.plates = level.plates; this.portal = level.portal;
    this.floorCells = level.floors; this.floorIdx = new Map(level.floors.map((f, i) => [key(f.x, f.z), i]));
    this.base = level.floors.length * 6;
    this.reset();
  }

  reset() {
    this.cubes = new Map(this.level.cubes.map((c) => [c.id, { id: c.id, x: c.x, z: c.z, mark: [...DIRS[c.mark]] }]));
    this.history = []; this.moves = 0;
  }

  cubeAt(x, z, exceptId = null) {
    for (const c of this.cubes.values()) if (c.id !== exceptId && c.x === x && c.z === z) return c;
    return null;
  }
  // A plate is ON when a cube rests on it with its marked face up. `exceptId` ignores one cube (used when that cube is about to move).
  plateOn(i, exceptId = null) { const p = this.plates[i], c = this.cubeAt(p.x, p.z, exceptId); return !!c && c.mark[1] === 1; }
  platesOnCount(exceptId = null) { let n = 0; for (let i = 0; i < this.plates.length; i++) if (this.plateOn(i, exceptId)) n++; return n; }
  get plateCount() { return this.plates.length; }
  isPlateActive(exceptId = null) { return this.platesOnCount(exceptId) === this.plates.length; } // ALL plates must be on
  get plateActive() { return this.isPlateActive(); }
  get portalOpen() { return this.plateActive; }
  get solved() { return this.cubeAt(this.portal.x, this.portal.z) !== null; }

  check(id, dx, dz) {
    const c = this.cubes.get(id);
    if (!c) return fail('unknown-cube');
    if (Math.abs(dx) + Math.abs(dz) !== 1) return fail('bad-step');
    const x = c.x + dx, z = c.z + dz;
    if (x < 0 || z < 0 || x >= this.level.width || z >= this.level.depth) return fail('out-of-bounds');
    if (this.walls.has(key(x, z))) return fail('wall');
    if (this.cubeAt(x, z, id)) return fail('occupied');
    if (x === this.portal.x && z === this.portal.z && !this.isPlateActive(id)) return fail('portal-closed');
    return { ok: true };
  }

  move(id, dx, dz, { record = true } = {}) {
    const r = this.check(id, dx, dz); if (!r.ok) return r;
    const c = this.cubes.get(id); c.x += dx; c.z += dz;
    if (record) { this.history.push({ type: 'move', id, dx, dz, movesBefore: this.moves }); this.moves += 1; }
    return { ok: true, type: 'move', id, dx, dz };
  }

  rotate(id, axis, dir, { record = true } = {}) {
    const c = this.cubes.get(id);
    if (!c) return fail('unknown-cube');
    if ((axis !== 'x' && axis !== 'z') || (dir !== 1 && dir !== -1)) return fail('bad-turn');
    c.mark = rotateMark(c.mark, axis, dir);
    if (record) { this.history.push({ type: 'turn', id, axis, dir, movesBefore: this.moves }); this.moves += 1; }
    return { ok: true, type: 'turn', id, axis, dir };
  }

  // Reverses the last action exactly. Every action has an exact inverse, so no sequence of legal actions can trap the player.
  undo() {
    const h = this.history.pop(); if (!h) return fail('nothing-to-undo');
    const c = this.cubes.get(h.id); this.moves = h.movesBefore;
    if (h.type === 'move') { c.x -= h.dx; c.z -= h.dz; return { ok: true, type: 'move', id: h.id, dx: -h.dx, dz: -h.dz, undo: true }; }
    c.mark = rotateMark(c.mark, h.axis, -h.dir);
    return { ok: true, type: 'turn', id: h.id, axis: h.axis, dir: -h.dir, undo: true };
  }

  // Compact integer form of a position (used by the solver tool).
  encode() {
    let v = 0;
    for (const c of this.cubes.values()) v = v * this.base + this.floorIdx.get(key(c.x, c.z)) * 6 + MARK_INDEX.get(markCode(c.mark));
    return v;
  }
  decode(v) {
    const list = [...this.cubes.values()];
    for (let i = list.length - 1; i >= 0; i--) {
      const r = v % this.base; v = Math.floor(v / this.base);
      const f = this.floorCells[Math.floor(r / 6)];
      list[i].x = f.x; list[i].z = f.z; list[i].mark = [...MARKS[r % 6]];
    }
  }
}
