// Registry of every model the game can use. Put .glb files in /assets/models/ and set `file`.
// While `file` is null (or the file fails to load) the game builds a procedural placeholder instead.
//
// fit        largest dimension (in world units, 1 = one grid cell) the model is scaled to. null = keep native size
// scale      extra multiplier on top of fit
// anchor     where the model's pivot goes: 'center' (cube), 'bottom' (sits on floor), 'top' (floor tile surface at y=0)
// position   [x,y,z] extra offset in world units
// rotation   [x,y,z] extra rotation in DEGREES
// uniqueMaterials  clone materials per instance (needed when a model is animated, e.g. plate/portal glow)
// meta       interaction metadata read by the puzzle code
export const ASSET_REGISTRY = {
  cube: {
    file: 'assets/models/lowpoly_3d_portal_companion_cube.glb', fit: 0.82, scale: 1, anchor: 'center', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: false, castShadow: true,
    meta: { role: 'cube', selectable: true, movable: true, rotatable: true, markedFace: 'local +Y (or a child node named "Mark")' },
  },
  plate: {
    file: null, fit: 0.9, scale: 1, anchor: 'bottom', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: true, castShadow: false,
    meta: { role: 'plate', activatesWhen: 'cube-on-plate-marked-face-up', glowNode: 'Glow' },
  },
  portal: {
    file: null, fit: 1.3, scale: 1, anchor: 'bottom', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: true, castShadow: true,
    meta: { role: 'portal', opensWhen: 'plate-active', glowNode: 'Glow' },
  },
  wall: {
    file: null, fit: 1, scale: 1, anchor: 'bottom', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: false, castShadow: true,
    meta: { role: 'wall', blocksMovement: true },
  },
  floor: {
    file: null, fit: 1, scale: 1, anchor: 'top', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: false, castShadow: false,
    meta: { role: 'floor' },
  },
  decor: {
    file: null, fit: 0.6, scale: 1, anchor: 'center', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: false, castShadow: false,
    meta: { role: 'decor' },
  },
  pillar: {
    file: 'assets/models/zhongli_pillar.glb', fit: 3.2, scale: 1, anchor: 'center', position: [0, 0, 0], rotation: [0, 0, 0],
    uniqueMaterials: false, castShadow: true,
    meta: { role: 'decor' },
  },
};
