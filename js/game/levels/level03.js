// Verified with tools/solve-level.mjs: solvable, minimum 26 actions. Narrow corridors force you to plan the order.
export default {
  id: 'level-03',
  map: [
    '#########',
    '#1..#..X#',
    '#...#.#.#',
    '#.#...#.#',
    '#2..P.#P#',
    '#...#...#',
    '#3.#..#.#',
    '#########',
  ],
  marks: { 1: '+x', 2: '-y', 3: '-z' },
};
