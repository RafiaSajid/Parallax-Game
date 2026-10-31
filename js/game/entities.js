import * as THREE from 'three';
import { DIRS } from './LevelLoader.js';

const ease = (k) => 1 - Math.pow(1 - k, 3);
const UP = new THREE.Vector3(0, 1, 0);
export const CUBE_Y = 0.41;

function glowMaterials(root) {
  if (root.userData.glowMats) return root.userData.glowMats;
  const mats = [];
  root.traverse((o) => { if (o.name === 'Glow' && o.material) mats.push(...[].concat(o.material)); });
  return mats;
}
const setGlow = (mats, v, extra = 0) => mats.forEach((m) => { if ('emissiveIntensity' in m) m.emissiveIntensity = 0.15 + v * 1.6 + extra; });

// Each gameplay object is its own entity with its own group, so puzzle logic can read and drive them independently.
export class CubeEntity {
  // Visual only. Where a cube is and which way it faces for the RULES lives in PuzzleState.
  constructor(id, visual, cell, mark) {
    this.id = id; this.anim = null; this.onSettled = null;
    this.group = new THREE.Group();
    this.group.add(visual);
    this.group.position.set(cell[0], CUBE_Y, cell[1]);
    this.group.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...DIRS[mark]).normalize());
  }
  get busy() { return this.anim !== null; }
  slide(dx, dz, dur = 0.16) {
    const from = this.group.position.clone();
    const to = new THREE.Vector3(from.x + dx, CUBE_Y, from.z + dz);
    this.anim = { t: 0, dur, apply: (k) => this.group.position.lerpVectors(from, to, ease(k)) };
  }
  turn(axis, dir, dur = 0.22) {
    const q0 = this.group.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromAxisAngle(axis, dir * Math.PI / 2).multiply(q0); // rotate about a WORLD axis
    this.anim = { t: 0, dur, apply: (k) => {
      this.group.quaternion.slerpQuaternions(q0, q1, ease(k));
      this.group.position.y = CUBE_Y + Math.sin(k * Math.PI) * 0.1; // small hop so the turn reads clearly
    } };
  }
  bump(dx, dz, dur = 0.14) { // "blocked" feedback: a short nudge toward the obstacle and back
    const x = this.group.position.x, z = this.group.position.z;
    this.anim = { t: 0, dur, apply: (k) => { const s = Math.sin(k * Math.PI) * 0.1; this.group.position.set(x + dx * s, CUBE_Y, z + dz * s); } };
  }
  vanish(dur = 0.45) { // swallowed by the portal
    this.anim = { t: 0, dur, apply: (k) => { const e = ease(k); this.group.scale.setScalar(Math.max(0.001, 1 - e)); this.group.position.y = CUBE_Y + e * 0.6; } };
  }
  update(dt) {
    const a = this.anim; if (!a) return;
    a.t += dt; const k = Math.min(1, a.t / a.dur);
    a.apply(k);
    if (k >= 1) { this.anim = null; this.onSettled?.(this); }
  }
  markDirection() { return UP.clone().applyQuaternion(this.group.quaternion); }
}

export class PlateEntity {
  constructor(visual, cell) {
    this.cell = { x: cell.x, z: cell.z }; this.group = new THREE.Group(); this.group.add(visual);
    this.group.position.set(cell.x, 0, cell.z);
    this.glow = glowMaterials(visual); this.active = false; this.v = 0;
  }
  setActive(on) { this.active = on; }
  update(dt, t, motion) {
    this.v += ((this.active ? 1 : 0) - this.v) * Math.min(1, dt * 8);
    setGlow(this.glow, this.v, Math.sin(t * 4) * 0.15 * this.v * motion);
    this.group.position.y = -0.025 * this.v; // plate presses down
  }
}

export class PortalEntity {
  constructor(visual, cell) {
    this.cell = { x: cell.x, z: cell.z }; this.group = new THREE.Group(); this.group.add(visual);
    this.group.position.set(cell.x, 0, cell.z);
    const u = visual.userData;
    this.glow = glowMaterials(visual); this.disc = u.disc; this.discMat = u.discMat; this.spin = u.spin ?? [];
    this.light = new THREE.PointLight(0xa8bbff, 0, 6, 2); this.light.position.set(0, 0.9, 0.5); this.group.add(this.light);
    this.open = false; this.v = 0;
  }
  setOpen(on) { this.open = on; }
  update(dt, t, motion) {
    this.v += ((this.open ? 1 : 0) - this.v) * Math.min(1, dt * 5);
    if (this.disc) { this.discMat.opacity = 0.1 + this.v * 0.5; this.disc.scale.setScalar((0.85 + this.v * 0.15) * (1 + Math.sin(t * 3) * 0.04 * this.v * motion)); }
    this.spin.forEach((m) => { m.rotation.z += dt * (0.5 + this.v * 2) * motion; });
    setGlow(this.glow, this.v * 0.8);
    this.light.intensity = this.v * 8;
  }
}
