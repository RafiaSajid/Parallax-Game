import * as THREE from 'three';

// Central pointer interaction: raycasting, hover and selection. It knows NOTHING about puzzle rules.
// Only registered objects are ever raycast: interactive roots (cubes) and occluders (walls, which can hide a cube).
// Decorative objects are never registered, so they can neither be selected nor block clicks.

const DRAG_PX = 6; // a pointer that travels farther than this between down and up is a drag, not a click

export function pointerToNdc(clientX, clientY, rect, out) {
  out.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  out.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return out;
}

// Walks up from a hit mesh (models can have many child meshes) to the registered root.
export function classify(object) {
  for (let o = object; o; o = o.parent) {
    const kind = o.userData?.interaction;
    if (kind) return { kind, id: o.userData.interactiveId ?? null };
  }
  return null;
}

export class Interaction {
  constructor({ canvas, getCamera, isEnabled = () => true, onHover = () => {}, onSelect = () => {}, signal }) {
    this.canvas = canvas; this.getCamera = getCamera; this.isEnabled = isEnabled;
    this.onHover = onHover; this.onSelect = onSelect;
    // Allocated once and reused for every pick (nothing is created per pointer event).
    this.raycaster = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.hits = [];
    this.interactive = new Map(); this.occluders = new Set(); this.targets = []; this.targetsDirty = true;
    this.hoveredId = null; this.selectedId = null;
    this.pointer = { x: 0, y: 0, inside: false, dirty: false };
    this.down = null;

    const opts = { signal };
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return; // no hover on touch screens
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.inside = true; this.pointer.dirty = true;
    }, opts);
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; this.pointer.dirty = false; this.setHover(null); }, opts);
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.isEnabled() || (e.pointerType === 'mouse' && e.button !== 0)) { this.down = null; return; }
      this.down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }, opts);
    canvas.addEventListener('pointerup', (e) => {
      const d = this.down; this.down = null;
      if (!d || d.id !== e.pointerId || !this.isEnabled()) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return;
      this.click(e.clientX, e.clientY);
    }, opts);
    canvas.addEventListener('pointercancel', () => { this.down = null; }, opts);
  }

  /* ---------- registry ---------- */
  register(root, id) {
    root.userData.interaction = 'interactive'; root.userData.interactiveId = id;
    this.interactive.set(id, root); this.targetsDirty = true;
  }
  registerOccluder(root) { root.userData.interaction = 'occluder'; this.occluders.add(root); this.targetsDirty = true; }
  unregister(id) {
    const root = this.interactive.get(id); if (!root) return;
    delete root.userData.interaction; delete root.userData.interactiveId;
    this.interactive.delete(id); this.targetsDirty = true;
    if (this.hoveredId === id) this.setHover(null);
    if (this.selectedId === id) this.select(null);
  }
  clearInteractive() { for (const id of [...this.interactive.keys()]) this.unregister(id); this.setHover(null); this.select(null); }
  dispose() { this.clearInteractive(); this.occluders.clear(); this.targets.length = 0; }

  /* ---------- selection / hover ---------- */
  select(id) {
    if (id !== null && !this.interactive.has(id)) return;
    if (id === this.selectedId) return;
    this.selectedId = id; this.onSelect(id);
  }
  deselect() { this.select(null); }
  setHover(id) { if (id === this.hoveredId) return; this.hoveredId = id; this.onHover(id); }

  // Returns the id of the interactive object under the pointer, or null (empty space, decor, or an occluder in front).
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(); // read fresh so resizing/scrolling can never leave stale coordinates
    if (!rect.width || !rect.height) return null;
    if (this.targetsDirty) {
      this.targets.length = 0;
      this.interactive.forEach((o) => this.targets.push(o)); this.occluders.forEach((o) => this.targets.push(o));
      this.targetsDirty = false;
    }
    pointerToNdc(clientX, clientY, rect, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.getCamera());
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.targets, true, this.hits); // sorted nearest first
    for (const h of this.hits) {
      const c = classify(h.object);
      if (!c) continue;
      return c.kind === 'interactive' && this.interactive.has(c.id) ? c.id : null; // the nearest registered hit decides
    }
    return null;
  }

  click(clientX, clientY) {
    const id = this.pick(clientX, clientY);
    if (id !== null) this.select(id); else this.deselect(); // empty-space click deselects
  }

  // Called once per frame: hover is raycast at most once per frame, however many pointer events arrived.
  update() {
    if (!this.isEnabled()) { this.pointer.dirty = false; this.setHover(null); return; }
    if (!this.pointer.dirty) return;
    this.pointer.dirty = false;
    this.setHover(this.pointer.inside ? this.pick(this.pointer.x, this.pointer.y) : null);
  }
}
