// Room layout as data. x grows right, z grows toward the camera.
// Legend: # wall, . floor, P pressure plate, X exit portal, 1-9 cubes.
// Verified with tools/solve-level.mjs: solvable, minimum 16 actions (slides + rotations).
export default {
  id: 'level-01',
  map: [
    '########',
    '#..#.#X#',
    '#1.#...#',
    '#...##.#',
    '#2..#P.#',
    '#3.....#',
    '########',
  ],
  // Which face carries the amber mark at the start. None starts facing up, so rotation is required.
  marks: { 1: '+x', 2: '-y', 3: '+z' },
};
