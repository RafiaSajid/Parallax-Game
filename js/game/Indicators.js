import * as THREE from 'three';
import { PALETTE } from './procedural.js';

// Selection and hover feedback drawn as SEPARATE objects that follow the target.
// The cube's own materials are never touched, so nothing needs restoring. Everything is allocated once.
const own = (r) => { r.userData.own = true; return r; };

export class Indicators {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    const amber = own(new THREE.MeshBasicMaterial({ color: PALETTE.select, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    const blue = own(new THREE.MeshBasicMaterial({ color: PALETTE.hover, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    const arrowMat = own(new THREE.MeshStandardMaterial({ color: PALETTE.arrow, emissive: PALETTE.arrow, emissiveIntensity: 0.5, flatShading: true }));
    this.ring = new THREE.Mesh(own(new THREE.RingGeometry(0.5, 0.58, 40)), amber);
    this.halo = new THREE.Mesh(own(new THREE.RingGeometry(0.58, 0.64, 40)), amber); // second ring makes the selection obvious
    this.hover = new THREE.Mesh(own(new THREE.RingGeometry(0.47, 0.5, 40)), blue);
    for (const m of [this.ring, this.halo, this.hover]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2; }
    this.arrow = new THREE.Mesh(own(new THREE.ConeGeometry(0.13, 0.26, 4)), arrowMat);
    this.arrow.rotation.x = Math.PI; this.arrow.visible = false;
    this.group.add(this.ring, this.halo, this.hover, this.arrow);
    this.selected = null; this.hovered = null;
  }
  setSelected(obj) { this.selected = obj; this.ring.visible = this.halo.visible = this.arrow.visible = !!obj; this._refreshHover(); }
  setHover(obj) { this.hovered = obj; this._refreshHover(); }
  _refreshHover() { this.hover.visible = !!this.hovered && this.hovered !== this.selected; }

  update(time, motion) {
    const s = this.selected, h = this.hovered;
    if (s) {
      const p = s.position, pulse = 1 + Math.sin(time * 4) * 0.04 * motion;
      this.ring.position.set(p.x, 0.02, p.z); this.ring.scale.setScalar(pulse);
      this.halo.position.set(p.x, 0.02, p.z); this.halo.scale.setScalar(1 + Math.sin(time * 4 + 1) * 0.06 * motion);
      this.arrow.position.set(p.x, 1.2 + Math.sin(time * 3) * 0.06 * motion, p.z); this.arrow.rotation.y = time * 1.5 * motion;
    }
    if (h && this.hover.visible) this.hover.position.set(h.position.x, 0.025, h.position.z);
  }
}
