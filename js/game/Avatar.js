import * as THREE from 'three';
import { AVATAR_H, AVATAR_R } from './AvatarSkin.js';

// The painted cylinder: the PLAYER. It walks freely on the floor (camera-relative input), collides with walls and cubes,
// jumps, stands on top of cubes and is carried by them, and pushes cubes by walking into their sides.
// It never touches puzzle rules itself: a push is only a REQUEST (`this.push`) that Game turns into PuzzleState.move().
// The old "hop onto the selected cube" mechanic is kept (rideCube / Space next to the selected cube).

const CUBE_HALF = 0.41;          // fallback half cube size; Game measures the real visual (incl. the amber mark card) into entity.half
const PAD_TOP = 0.06, PAD_R = 0.44; // plates and the portal pad stand this far above the floor
const HALF_H = AVATAR_H / 2;
const R = AVATAR_R + 0.04;       // collision radius = the visible cylinder plus a hair, so it never visibly clips into things
const SPEED = 3.6, ACCEL = 30;   // units/s, units/s^2
const GRAVITY = 22, JUMP_V = 7.4; // apex = 1.24 > cube top (0.82), so a jump can clear a cube
const STEP = 0.05;               // feet within this of a cube top count as "above" it
const SUPPORT = 0.1;             // the centre may overhang a cube edge by this much and still stand on it
const HOP_REACH = 1.9;           // Space hops onto the selected cube when it is this close
const PUSH_DWELL = 0.08, PUSH_GRACE = 0.5;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const solidCube = (e) => e.group.scale.y > 0.6; // a cube being swallowed by the portal is no longer an obstacle
const topOf = (e) => e.group.position.y + (e.half ?? CUBE_HALF) * e.group.scale.y;
const halfOf = (e) => (e.half ?? CUBE_HALF) * e.group.scale.x;

export class Avatar {
  constructor(parts) {
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(parts.geo, [parts.side, parts.cap, parts.cap]);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.floorY = 0;
    this.pos = new THREE.Vector3();        // centre of the cylinder (live: the camera reads it)
    this.lastBase = new THREE.Vector3();   // position of the supporting cube last frame (to carry the player)
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.input = { x: 0, z: 0 };           // desired world-space direction, length <= 1
    this.grounded = true; this.standingOn = null;
    this.hop = null; this.point = null; this.celebrate = false; this.celebT = 0;
    this.yaw = Math.PI;                    // faces into the room (-z) at the start
    this.landT = 0;
    this.world = null;                     // { solid(x, z) -> bool, cubes() -> CubeEntity[] }
    this.push = null;                      // { id, dx, dz }: ready to be requested this frame
    this.pushEnt = null; this.pushHold = 0; this.pushGrace = 0; this._contact = null;
    this.cdx = 0; this.cdz = 0;
  }

  setWorld(world) { this.world = world; this.floorY = world.floorY ?? 0; } // floorY: top surface of the floor tiles
  setInput(x, z) { this.input.x = x; this.input.z = z; }

  /* ---------- scripted hop onto a cube (the original mechanic) ---------- */
  rideCube(entity, instant = false) {
    if (!entity) return;
    if (this.hop?.entity === entity || (this.standingOn === entity && !this.hop)) return;
    this.point = null; this.celebrate = false;
    const g = entity.group.position;
    if (instant) {
      this.hop = null; this.pos.set(g.x, topOf(entity) + HALF_H, g.z);
      this.standingOn = entity; this.lastBase.copy(g); this.grounded = true; this.vx = this.vz = this.vy = 0;
      return;
    }
    const dist = Math.hypot(g.x - this.pos.x, g.z - this.pos.z);
    this.hop = { entity, from: this.pos.clone(), t: 0, dur: clamp(0.4 + 0.1 * dist, 0.4, 1.1), arc: clamp(0.5 + 0.2 * dist, 0.5, 2.2) };
    this.standingOn = null; this.grounded = false; this.vx = this.vz = this.vy = 0;
  }

  // Space. Next to the selected cube it hops onto it; otherwise it is a normal jump. Returns 'hop' | 'jump' | null.
  jump(selected) {
    if (this.point || this.hop || !this.grounded) return null;
    if (selected && this.standingOn !== selected && solidCube(selected)) {
      const g = selected.group.position;
      if (Math.hypot(g.x - this.pos.x, g.z - this.pos.z) <= HOP_REACH) { this.rideCube(selected); return 'hop'; }
    }
    this.vy = JUMP_V; this.grounded = false; this.standingOn = null;
    return 'jump';
  }

  standAt(x, z) { // finished the room: hop onto the portal pad and cheer
    this.standingOn = null; this.hop = null; this.point = { x, z }; this.celebrate = true; this.celebT = 0.4;
    this.vx = this.vz = this.vy = 0; this.push = null; this.pushEnt = null;
  }

  /* ---------- collision helpers ---------- */
  // Pushes the player's circle out of an axis-aligned box. Stores the pre-correction offset in cdx/cdz.
  _circleVsBox(cx, cz, half) {
    const dx = this.pos.x - cx, dz = this.pos.z - cz;
    const ox = dx - clamp(dx, -half, half), oz = dz - clamp(dz, -half, half), d2 = ox * ox + oz * oz;
    if (d2 >= R * R) return false;
    if (d2 > 1e-9) { const d = Math.sqrt(d2), s = (R - d) / d; this.pos.x += ox * s; this.pos.z += oz * s; }
    else { // centre is inside the box: leave by the nearest face
      const px = half - Math.abs(dx), pz = half - Math.abs(dz);
      if (px < pz) this.pos.x += (dx >= 0 ? 1 : -1) * (px + R); else this.pos.z += (dz >= 0 ? 1 : -1) * (pz + R);
    }
    this.cdx = dx; this.cdz = dz; return true;
  }

  // A cube counts as "being pushed" only on a flat side contact while the player steers into it (never on corners).
  _noteContact(e, half) {
    const ax = Math.abs(this.cdx), az = Math.abs(this.cdz), slack = 0.08;
    let px = 0, pz = 0;
    if (ax > half && az <= half + slack) px = this.cdx > 0 ? -1 : 1;
    else if (az > half && ax <= half + slack) pz = this.cdz > 0 ? -1 : 1;
    else return;
    if (this.input.x * px + this.input.z * pz < 0.45) return;
    this._contact = { e, dx: px, dz: pz };
  }

  /* ---------- physics ---------- */
  _walk(dt) {
    const w = this.world; if (!w || dt <= 0) return;
    const cubes = w.cubes();

    // 1. carry: whatever cube we stand on takes us with it (slides, undo, turn hops)
    if (this.standingOn) {
      const g = this.standingOn.group.position, b = this.lastBase;
      this.pos.x += g.x - b.x; this.pos.y += g.y - b.y; this.pos.z += g.z - b.z; b.copy(g);
    }

    // 2. horizontal velocity toward the desired one, then move
    const tx = this.input.x * SPEED, tz = this.input.z * SPEED;
    const ex = tx - this.vx, ez = tz - this.vz, len = Math.hypot(ex, ez), a = ACCEL * dt;
    if (len <= a) { this.vx = tx; this.vz = tz; } else { this.vx += (ex / len) * a; this.vz += (ez / len) * a; }
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt;

    // 3. collide: cubes (only while our feet are below their top), then walls last so we can never end up outside the room
    this._contact = null;
    for (let pass = 0; pass < 3; pass++) {
      const feet = this.pos.y - HALF_H;
      for (const e of cubes) {
        if (!solidCube(e) || feet >= topOf(e) - STEP) continue;
        const g = e.group.position, half = halfOf(e);
        if (this._circleVsBox(g.x, g.z, half) && pass === 0) this._noteContact(e, half);
      }
      const cx = Math.round(this.pos.x), cz = Math.round(this.pos.z);
      for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) if (w.solid(x, z)) this._circleVsBox(x, z, 0.5);
    }
    { // squeezed inside a cube (e.g. undo slid one onto us against a wall): stand on top of it instead
      const feet = this.pos.y - HALF_H;
      for (const e of cubes) {
        if (!solidCube(e)) continue;
        const g = e.group.position, half = halfOf(e);
        if (Math.abs(this.pos.x - g.x) < half && Math.abs(this.pos.z - g.z) < half && feet < topOf(e) - STEP) { this.pos.y = topOf(e) + HALF_H; this.vy = 0; break; }
      }
    }

    // 4. vertical: gravity, landing on the floor or on a cube top
    const prevFeet = this.pos.y - HALF_H;
    this.vy -= GRAVITY * dt;
    let ground = this.floorY, sup = null;
    for (const p of w.pads ?? []) if (Math.hypot(this.pos.x - p.x, this.pos.z - p.z) < PAD_R) { ground = Math.max(ground, PAD_TOP); break; } // standing on a plate / the portal pad
    for (const e of cubes) {
      if (!solidCube(e)) continue;
      const g = e.group.position, half = halfOf(e), top = topOf(e);
      if (prevFeet >= top - STEP && top > ground && Math.abs(this.pos.x - g.x) <= half + SUPPORT && Math.abs(this.pos.z - g.z) <= half + SUPPORT) { ground = top; sup = e; }
    }
    let feetNew = prevFeet + this.vy * dt;
    if (feetNew <= ground && this.vy <= 0) {
      if (!this.grounded && this.vy < -3) this.landT = 1;
      feetNew = ground; this.vy = 0; this.grounded = true; this.standingOn = sup;
      if (sup) this.lastBase.copy(sup.group.position);
    } else { this.grounded = false; this.standingOn = null; }
    this.pos.y = feetNew + HALF_H;

    // 5. push request: a steady side contact, on the ground, for a moment
    const c = this._contact;
    if (c && this.grounded) {
      if (this.pushEnt !== c.e) this.pushHold = 0;
      this.pushEnt = c.e; this.pushGrace = PUSH_GRACE; this.pushHold += dt;
      this.push = this.pushHold >= PUSH_DWELL ? { id: c.e.id, dx: c.dx, dz: c.dz } : null;
    } else {
      this.pushHold = 0; this.push = null; this.pushGrace -= dt;
      if (this.pushGrace <= 0) this.pushEnt = null;
    }

    // 6. face the direction of travel (shortest way round)
    if (Math.hypot(this.vx, this.vz) > 0.3) this.yaw += wrap(Math.atan2(this.vx, this.vz) - this.yaw) * Math.min(1, dt * 14);
  }

  _hop(dt) {
    const h = this.hop, g = h.entity.group.position;
    h.t += dt / h.dur;
    const k = Math.min(1, h.t), s = k * k * (3 - 2 * k);
    const tx = g.x, ty = topOf(h.entity) + HALF_H, tz = g.z;
    this.pos.set(h.from.x + (tx - h.from.x) * s, h.from.y + (ty - h.from.y) * k + Math.sin(k * Math.PI) * h.arc, h.from.z + (tz - h.from.z) * s);
    if (Math.hypot(tx - h.from.x, tz - h.from.z) > 0.04) this.yaw += wrap(Math.atan2(tx - h.from.x, tz - h.from.z) - this.yaw) * Math.min(1, dt * 12);
    if (k >= 1) { this.hop = null; this.pos.set(tx, ty, tz); this.standingOn = h.entity; this.lastBase.copy(g); this.grounded = true; this.vy = 0; }
  }

  update(dt, t, motion) {
    if (this.point) {
      const p = this.point, tx = p.x, ty = this.floorY + HALF_H, tz = p.z;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      if (Math.hypot(dx, dz) > 0.04) this.yaw += wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 12);
      const k = 1 - Math.pow(0.0004, dt);
      this.pos.x += dx * k; this.pos.y += (ty - this.pos.y) * k; this.pos.z += dz * k;
      if (this.celebT > 0) this.celebT = Math.max(0, this.celebT - dt / 0.4);
    } else if (this.hop) this._hop(dt);
    else this._walk(dt);

    let lift = 0, stretch = 1;
    if (this.hop) stretch += Math.sin(Math.min(1, this.hop.t) * Math.PI) * 0.18;
    else if (!this.grounded) stretch += Math.min(0.14, Math.abs(this.vy) * 0.012);
    if (this.landT > 0) { this.landT = Math.max(0, this.landT - dt / 0.15); stretch -= this.landT * 0.12; }
    if (this.celebrate) lift += Math.abs(Math.sin(t * 6)) * 0.28 * motion + Math.sin(this.celebT * Math.PI) * 0.5;
    if (this.grounded && !this.hop) lift += Math.sin(t * 3) * 0.015 * motion; // idle bob
    this.group.position.set(this.pos.x, this.pos.y + lift, this.pos.z);
    this.group.rotation.y = this.yaw + (this.celebrate ? Math.sin(t * 4) * 0.4 * motion : 0);
    this.mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch)); // squash and stretch
  }
}