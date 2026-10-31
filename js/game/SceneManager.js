import * as THREE from 'three';
import { PALETTE } from './procedural.js';

const DIR = new THREE.Vector3(0.55, 1.05, 1.0).normalize(); // fixed angled camera: from front-right, above
const FOLLOW_OFFSET = new THREE.Vector3(3.0, 4.4, 5.6);       // third-person camera sits behind and above the character (same heading, so controls stay consistent)
const QUALITY = { low: { dpr: 1, shadow: 512, aa: false, stars: 40 }, medium: { dpr: 1.5, shadow: 1024, aa: true, stars: 90 }, high: { dpr: 2, shadow: 2048, aa: true, stars: 140 } };

export class SceneManager {
  constructor(canvas, container, { quality = 'medium', reducedMotion = false, invert = false } = {}) {
    this.q = QUALITY[quality] ?? QUALITY.medium;
    this.container = container; this.reducedMotion = reducedMotion; this.invert = invert ? -1 : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.aa, powerPreference: 'high-performance' }); // throws if WebGL is unavailable
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.dpr));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.q.shadow > 512 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1; // keeps pastel colours true

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.bg);
    this.scene.fog = new THREE.Fog(PALETTE.bg, 20, 50);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9ec, 1.25));
    this.key = new THREE.DirectionalLight(0xfff1dc, 2.0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.03;
    this.scene.add(this.key, this.key.target);

    this.center = new THREE.Vector3(); this.radius = 8;
    this.basePos = new THREE.Vector3(); this.right = new THREE.Vector3(1, 0, 0); this.up = new THREE.Vector3(0, 1, 0);
    this.offset = new THREE.Vector2(); this.pointer = new THREE.Vector2();
    this.mode = 'overview'; this.followTarget = null; this.snap = true;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.wantPos = new THREE.Vector3(); this.wantLook = new THREE.Vector3();
    this.box = null; this.tmp = new THREE.Vector3(); this.tmpR = new THREE.Vector3(); this.tmpU = new THREE.Vector3(); this.corner = new THREE.Vector3();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
  }

  // Frames the camera so EVERY corner of `box` (room + scenery) is visible at any window size, looking at `target`.
  frameBox(box, target) {
    this.box = box.clone(); this.center.copy(target); this.snap = true;
    this.radius = box.getSize(new THREE.Vector3()).length() / 2;
    this.key.position.copy(target).add(new THREE.Vector3(6, 11, 5)); this.key.target.position.copy(target);
    const s = Math.hypot(this.box.max.x - this.box.min.x, this.box.max.z - this.box.min.z) / 2 + 1, c = this.key.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 40; c.updateProjectionMatrix();
    this.fit();
  }

  fit() {
    if (!this.box) return;
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * 0.9; // 10% margin for the HUD
    const th = tv * this.camera.aspect;
    const fwd = this.tmp.copy(DIR).negate();
    const right = this.tmpR.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
    const up = this.tmpU.crossVectors(right, fwd).normalize();
    const { min, max } = this.box; let dist = 1;
    for (let i = 0; i < 8; i++) {
      this.corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(this.center);
      const x = this.corner.dot(right), y = this.corner.dot(up), zc = this.corner.dot(DIR); // zc: how far toward the camera
      dist = Math.max(dist, zc + Math.abs(x) / th, zc + Math.abs(y) / tv);
    }
    dist += 0.6; // room for the parallax shift
    this.basePos.copy(this.center).addScaledVector(DIR, dist);
    this.camera.position.copy(this.basePos); this.camera.lookAt(this.center); this.camera.updateMatrix();
    this.right.setFromMatrixColumn(this.camera.matrix, 0); this.up.setFromMatrixColumn(this.camera.matrix, 1);
    this.scene.fog.near = dist * 1.1; this.scene.fog.far = dist * 1.1 + 30;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.fit();
  }

  setPointer(nx, ny) { this.pointer.set(nx, ny); } // -1..1, a gentle parallax shift of the camera

  // 'overview': the whole room from a fixed angle. 'follow': a third-person camera that trails the player's character.
  setMode(mode) { this.mode = mode === 'follow' ? 'follow' : 'overview'; }
  setFollowTarget(vec3) { this.followTarget = vec3; } // a live Vector3 (the avatar's position)

  render(dt) {
    const k = 1 - Math.pow(0.002, dt), m = this.reducedMotion ? 0 : 1;
    this.offset.x += (this.pointer.x * 0.6 * this.invert * m - this.offset.x) * k;
    this.offset.y += (this.pointer.y * 0.35 * this.invert * m - this.offset.y) * k;
    if (this.mode === 'follow' && this.followTarget) {
      this.wantLook.copy(this.followTarget); this.wantLook.y += 0.2;
      this.wantPos.copy(this.wantLook).add(FOLLOW_OFFSET);
    } else { this.wantPos.copy(this.basePos); this.wantLook.copy(this.center); }
    this.wantPos.addScaledVector(this.right, this.offset.x).addScaledVector(this.up, this.offset.y);
    if (this.snap) { this.camPos.copy(this.wantPos); this.camLook.copy(this.wantLook); this.snap = false; }
    else { const c = 1 - Math.pow(0.0008, dt); this.camPos.lerp(this.wantPos, c); this.camLook.lerp(this.wantLook, c); } // smooth moves and mode changes
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
