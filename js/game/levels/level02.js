// Verified with tools/solve-level.mjs: solvable, minimum 22 actions. Two plates: BOTH must be lit to open the portal.
export default {
  id: 'level-02',
  map: [
    '########',
    '#1.#..X#',
    '#..#...#',
    '#2...#P#',
    '#..#P..#',
    '#3.....#',
    '########',
  ],
  marks: { 1: '+z', 2: '-y', 3: '+x' },
};
