// Verified with tools/solve-level.mjs: solvable, minimum 26 actions. Narrow corridors force you to plan the order.
export default {
  id: 'level-03',
  map: [
    '###############',
    '#1..#...#..P###',
    '#...#.#...#####',
    '#.#...#.2.#####',
    '#.....#.#...###',
    '#...#...###...#',
    '#3.#P.#.####.X#',
    '###############',
  ],
  marks: { 1: '+x', 2: '-y', 3: '-z' },
};
