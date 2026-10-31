// Pure data parsing (no Three.js) so level layouts are easy to validate and test.
export const DIRS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };

// Map legend: # wall, . floor, P pressure plate (one or more), X exit portal, 1-9 cube start (mark direction from def.marks).
export function parseLevel(def) {
  const rows = def.map;
  if (!Array.isArray(rows) || !rows.length) throw new Error('Level has no map.');
  const depth = rows.length, width = Math.max(...rows.map((r) => r.length));
  const out = { id: def.id, width, depth, walls: [], floors: [], plates: [], portal: null, cubes: [] };
  rows.forEach((row, z) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '#';
      if (ch === '#') { out.walls.push({ x, z }); continue; }
      if (ch !== '.' && ch !== 'P' && ch !== 'X' && !/[1-9]/.test(ch)) throw new Error(`Unknown map symbol "${ch}" at ${x},${z}.`);
      out.floors.push({ x, z });
      if (ch === 'P') out.plates.push({ x, z });
      if (ch === 'X') { if (out.portal) throw new Error('Level has more than one portal.'); out.portal = { x, z }; }
      if (/[1-9]/.test(ch)) {
        const mark = def.marks?.[ch] ?? '+z';
        if (!DIRS[mark]) throw new Error(`Bad mark direction "${mark}" for cube ${ch}.`);
        out.cubes.push({ id: ch, x, z, mark });
      }
    }
  });
  if (!out.plates.length || !out.portal || !out.cubes.length) throw new Error('Level needs at least one plate (P), a portal (X) and at least one cube (1-9).');
  return out;
}
