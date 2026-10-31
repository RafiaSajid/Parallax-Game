// Dev tool: proves a level is solvable and finds the minimum number of actions (slides + rotations).
// Usage: node tools/solve-level.mjs [path-to-level.js]
import { parseLevel } from '../js/game/LevelLoader.js';
import { PuzzleState } from '../js/game/PuzzleState.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const file = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : '../js/game/levels/level01.js';
const def = (await import(file)).default;
const level = parseLevel(def);
const st = new PuzzleState(level);
const ids = [...st.cubes.keys()];
const actions = [];
for (const id of ids) {
  for (const [dx, dz, n] of [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']]) actions.push({ id, t: 'move', dx, dz, name: `cube ${id} ${n}` });
  for (const [axis, dir, n] of [['z', 1, 'Q'], ['z', -1, 'E'], ['x', 1, 'R'], ['x', -1, 'F']]) actions.push({ id, t: 'turn', axis, dir, name: `cube ${id} ${n}` });
}
const size = st.base ** ids.length;
const parent = new Int32Array(size).fill(-2), how = new Int16Array(size);
const start = st.encode(); parent[start] = -1;
const queue = new Int32Array(size); let head = 0, tail = 0; queue[tail++] = start;
let goal = -1;
while (head < tail && goal < 0) {
  const v = queue[head++];
  for (let a = 0; a < actions.length; a++) {
    st.decode(v);
    const A = actions[a];
    const r = A.t === 'move' ? st.move(A.id, A.dx, A.dz, { record: false }) : st.rotate(A.id, A.axis, A.dir, { record: false });
    if (!r.ok) continue;
    const w = st.encode();
    if (parent[w] !== -2) continue;
    parent[w] = v; how[w] = a; queue[tail++] = w;
    if (st.solved) { goal = w; break; }
  }
}
if (goal < 0) { console.log(`UNSOLVABLE. Explored ${tail} states.`); process.exit(1); }
const path = []; for (let v = goal; parent[v] !== -1; v = parent[v]) path.push(actions[how[v]].name);
path.reverse();
console.log(`SOLVABLE. Minimum ${path.length} actions. Explored ${tail} states.`);
console.log(path.join(' > '));
