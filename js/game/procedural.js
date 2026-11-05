import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PALETTE = {
  bg: 0xaee0ff,                       // sky
  floorA: 0xfff4dd, floorB: 0xffe3c2, // cream / peach checker
  base: 0x7b5cfa,                     // violet slab
  wall: 0xff8fc2, cap: 0xffffff,      // bubblegum walls with marshmallow tops
  cube: 0x45d6be,                     // mint cubes
  mark: 0xffc531,                     // sunny yellow: the marked face and the plate glow
  portal: 0x7b5cfa,                   // violet portal
  select: 0x2b2350, hover: 0x7b5cfa,  // ink selection ring, violet hover ring (both readable on cream)
  arrow: 0xff3d8b,
  confetti: [0xff5fa2, 0xffc531, 0x45d6be, 0x7b5cfa],
  deco: [0xff5fa2, 0xffc531, 0x45d6be],
};
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08, ...extra });
const own = (r) => { r.userData.own = true; return r; }; // flagged resources are disposed with the object that owns them
const mesh = (g, m, cast = true, receive = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = receive; return o; };

// Procedural placeholders. Geometries/materials are shared between instances and disposed once by dispose().
export class ProceduralKit {
  constructor() {
    this.g = {
      tile: new THREE.BoxGeometry(0.97, 0.2, 0.97), wall: new THREE.BoxGeometry(0.98, 0.9, 0.98), cap: new THREE.BoxGeometry(1, 0.07, 1),
      cube: new RoundedBoxGeometry(0.82, 0.82, 0.82, 3, 0.07), mark: new THREE.BoxGeometry(0.5, 0.03, 0.5),
      pad: new THREE.CylinderGeometry(0.42, 0.46, 0.06, 32), core: new THREE.CylinderGeometry(0.3, 0.3, 0.05, 32),
      plateRing: new THREE.TorusGeometry(0.36, 0.02, 8, 40), portalRing: new THREE.TorusGeometry(0.46, 0.045, 12, 48),
      portalArc: new THREE.TorusGeometry(0.3, 0.02, 8, 40, Math.PI * 1.4), disc: new THREE.CircleGeometry(0.43, 40),
      pillar: new THREE.BoxGeometry(0.5, 3.2, 0.5), strip: new THREE.BoxGeometry(0.52, 0.1, 0.52),
      deco: [new THREE.OctahedronGeometry(0.3), new THREE.TetrahedronGeometry(0.34), new THREE.IcosahedronGeometry(0.26)],
    };
    this.m = {
      floorA: std(PALETTE.floorA, { roughness: 0.85 }), floorB: std(PALETTE.floorB, { roughness: 0.85 }), base: std(PALETTE.base, { roughness: 0.9 }),
      wall: std(PALETTE.wall), cap: std(PALETTE.cap, { roughness: 0.5 }),
      cube: std(PALETTE.cube, { roughness: 0.45 }), mark: std(PALETTE.mark, { emissive: PALETTE.mark, emissiveIntensity: 0.55, roughness: 0.4 }),
      pad: std(0x5b3df5), deco: PALETTE.deco.map((c) => std(c, { emissive: c, emissiveIntensity: 0.12, flatShading: true })),
      pillar: std(0xb69bff), strip: std(PALETTE.mark, { emissive: PALETTE.mark, emissiveIntensity: 0.9 }),
    };
  }
  floor(alt) { const o = mesh(this.g.tile, alt ? this.m.floorB : this.m.floorA, false, true); o.position.y = -0.1; return o; }
  wall() {
    const g = new THREE.Group();
    const body = mesh(this.g.wall, this.m.wall); body.position.y = 0.45;
    const cap = mesh(this.g.cap, this.m.cap, false, false); cap.position.y = 0.935;
    g.add(body, cap); return g;
  }
  base(w, d) {
    const geo = own(new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8));
    const o = mesh(geo, this.m.base, false, true); o.position.y = -0.45; return o;
  }
  markOverlay(half = 0.41) { const o = mesh(this.g.mark, this.m.mark, false, false); o.name = 'Mark'; o.position.y = half + 0.005; return o; }
  cube() { const g = new THREE.Group(); g.add(mesh(this.g.cube, this.m.cube)); g.add(this.markOverlay()); return g; }
  plate() {
    const g = new THREE.Group();
    const core = own(std(0xffc2dc, { emissive: PALETTE.mark, emissiveIntensity: 0.15, roughness: 0.5 }));
    const ring = own(std(0xffc2dc, { emissive: PALETTE.mark, emissiveIntensity: 0.15, roughness: 0.5 }));
    const pad = mesh(this.g.pad, this.m.pad, false, true); pad.position.y = 0.03;
    const c = mesh(this.g.core, core, false, true); c.position.y = 0.075; c.name = 'Glow';
    const r = mesh(this.g.plateRing, ring, false, false); r.rotation.x = Math.PI / 2; r.position.y = 0.1; r.name = 'Glow';
    g.add(pad, c, r); g.userData.glowMats = [core, ring]; return g;
  }
  portal() {
    const g = new THREE.Group();
    const frame = own(std(0xb69bff, { emissive: PALETTE.portal, emissiveIntensity: 0.2, roughness: 0.4 }));
    const discMat = own(new THREE.MeshBasicMaterial({ color: PALETTE.portal, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    const arcMat = own(new THREE.MeshBasicMaterial({ color: PALETTE.portal, transparent: true, opacity: 0.55 }));
    const pad = mesh(this.g.pad, this.m.pad, false, true); pad.position.y = 0.03; pad.scale.set(1.15, 1, 1.15);
    const ring = mesh(this.g.portalRing, frame); ring.position.y = 0.62; ring.name = 'Glow';
    const disc = mesh(this.g.disc, discMat, false, false); disc.position.y = 0.62;
    const arc = mesh(this.g.portalArc, arcMat, false, false); arc.position.y = 0.62; arc.position.z = 0.01;
    g.add(pad, ring, disc, arc);
    g.userData = { glowMats: [frame], disc, discMat, spin: [arc] }; return g;
  }
  pillar() {
    const g = new THREE.Group();
    const strip = mesh(this.g.strip, this.m.strip, false, false); strip.position.y = 1.65;
    g.add(mesh(this.g.pillar, this.m.pillar), strip);
    return g;
  }
  decor(i = 0) { return mesh(this.g.deco[i % 3], this.m.deco[i % 3], false, false); }
  stars(count) {
    const pos = new Float32Array(count * 3); let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const r = 16 + rnd() * 16, th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 1.5 - 0.5);
      pos.set([r * Math.sin(ph) * Math.cos(th), Math.abs(r * Math.cos(ph)) * 0.8 + 1, r * Math.sin(ph) * Math.sin(th)], i * 3);
    }
    const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = own(new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.9, depthWrite: false }));
    return new THREE.Points(geo, mat);
  }
  dispose() {
    for (const v of Object.values(this.g).flat()) v.dispose();
    for (const m of Object.values(this.m).flat()) m.dispose();
  }
}
