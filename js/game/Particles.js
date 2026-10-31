import * as THREE from 'three';

// One pooled Points object for all bursts: no allocation after construction.
export class Particles {
  constructor(scene, max = 72) {
    this.max = max; this.next = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry(); geo.userData.own = true;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, depthWrite: false });
    mat.userData.own = true;
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.visible = false;
    this.geo = geo; this.tmp = new THREE.Color(); scene.add(this.points);
  }
  // Confetti: each piece picks a colour from `colors`. Normal blending (additive blending disappears on a light background).
  burst(x, y, z, count, colors, speed = 2.2) {
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % this.max; const k = i * 3;
      this.tmp.setHex(colors[Math.floor(Math.random() * colors.length)]);
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
      this.vel[k] = (Math.random() - 0.5) * speed; this.vel[k + 1] = 0.8 + Math.random() * speed; this.vel[k + 2] = (Math.random() - 0.5) * speed;
      this.col[k] = this.tmp.r; this.col[k + 1] = this.tmp.g; this.col[k + 2] = this.tmp.b; this.life[i] = 1;
    }
    this.points.visible = true;
  }
  update(dt) {
    if (!this.points.visible) return;
    let alive = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3; this.life[i] -= dt * 0.9;
      if (this.life[i] <= 0) { this.pos[k + 1] = -100; continue; } // gone: parked far below the room
      alive = true; this.vel[k + 1] -= 3.2 * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] = Math.max(0.03, this.pos[k + 1] + this.vel[k + 1] * dt); this.pos[k + 2] += this.vel[k + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.points.visible = alive;
  }
}
