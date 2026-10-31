import * as THREE from 'three';
import { AVATAR_H } from './AvatarSkin.js';

const CUBE_HALF = 0.5; // half the cube's height: the avatar stands on top of the cube it is "riding"

// The painted cylinder. It is purely cosmetic: it is not registered with Interaction (cannot be clicked or block clicks)
// and never affects the puzzle rules. It rides on the selected cube and hops to the next one when the selection changes.
export class Avatar {
  constructor(parts) {
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(parts.geo, [parts.side, parts.cap, parts.cap]);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.follow = null; this.point = null; this.snap = true;
    this.hop = 0; this.yaw = 0; this.celebrate = false;
  }

  rideCube(entity, instant = false) {
    if (this.follow === entity) return;
    this.follow = entity; this.point = null; this.celebrate = false;
    if (instant) this.snap = true; else this.hop = 1;
  }
  standAt(x, z) { // finished the room: hop onto the portal pad and cheer
    this.follow = null; this.point = { x, z }; this.celebrate = true; this.hop = 1;
  }

  update(dt, t, motion) {
    const f = this.follow;
    if (f) {
      const g = f.group;
      this.target.set(g.position.x, g.position.y + CUBE_HALF * g.scale.y + AVATAR_H / 2, g.position.z);
    } else if (this.point) this.target.set(this.point.x, AVATAR_H / 2 + 0.06, this.point.z);

    if (this.snap) { this.pos.copy(this.target); this.snap = false; }
    else {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      if (Math.hypot(dx, dz) > 0.04) { // turn to face the direction of travel (shortest way round)
        let d = Math.atan2(dx, dz) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 12);
      }
      this.pos.lerp(this.target, 1 - Math.pow(0.0004, dt));
    }

    let lift = 0, stretch = 1;
    if (this.hop > 0) { this.hop = Math.max(0, this.hop - dt / 0.4); const s = Math.sin((1 - this.hop) * Math.PI); lift += s * 0.5; stretch += s * 0.18; }
    if (this.celebrate) lift += Math.abs(Math.sin(t * 6)) * 0.28 * motion;
    lift += Math.sin(t * 3) * 0.015 * motion; // idle bob
    this.group.position.set(this.pos.x, this.pos.y + lift, this.pos.z);
    this.group.rotation.y = this.yaw + (this.celebrate ? Math.sin(t * 4) * 0.4 * motion : 0);
    this.mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch)); // squash and stretch
  }
}
