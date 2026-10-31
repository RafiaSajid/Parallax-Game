import * as THREE from 'three';
import { SceneManager } from './SceneManager.js';
import { AssetManager, disposeOwned } from './AssetManager.js';
import { ASSET_REGISTRY } from './assetRegistry.js';
import { parseLevel } from './LevelLoader.js';
import { PuzzleState } from './PuzzleState.js';
import { Interaction } from './Interaction.js';
import { Indicators } from './Indicators.js';
import { Particles } from './Particles.js';
import { Sfx } from './Sfx.js';
import { CubeEntity, PlateEntity, PortalEntity } from './entities.js';
import { PALETTE } from './procedural.js';
import { S } from './GameFlow.js';
import { Avatar } from './Avatar.js';
import { createAvatarParts, makeDefaultSkinCanvas, DEFAULT_CAP } from './AvatarSkin.js';

// Glue between separate concerns:
//   PuzzleState = rules   Interaction = pointer raycasting   entities = visuals   Sfx/Particles = feedback
const AXES = { x: new THREE.Vector3(1, 0, 0), z: new THREE.Vector3(0, 0, 1) };
const MOVE = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
const TURN = { q: ['z', 1], e: ['z', -1], r: ['x', 1], f: ['x', -1] };

export class Game {
  constructor({ canvas, container, levelDef, settings = {}, avatar = {}, flow, onMove = () => {}, onTime = () => {}, onStatus = () => {}, onSolved = () => {}, onError = () => {} }) {
    this.canvas = canvas; this.container = container;
    this.level = parseLevel(levelDef);
    this.state = new PuzzleState(this.level);
    this.settings = { quality: 'medium', reduced_motion: false, invert_controls: false, volume: 70, camera_mode: 'overview', ...settings };
    this.avatarInput = avatar; this.avatarParts = null; this.avatar = null;
    this.flow = flow; this.onMove = onMove; this.onTime = onTime; this.onStatus = onStatus; this.onSolved = onSolved; this.onError = onError;
    this.assets = new AssetManager(ASSET_REGISTRY);
    this.sfx = new Sfx(this.settings.volume / 100, this.settings.sound_enabled !== false);
    this.abort = new AbortController(); // one signal removes every listener on dispose
    this.clock = new THREE.Clock();
    this.disposed = false; this.pendingSolved = false; this.pendingComplete = false; this.ready = false;
    this.time = 0; this.running = false; this.playTime = 0; this.lastTenth = -1;
    this.queued = null; this.lastStatus = '';
    this.sm = null; this.interaction = null; this.indicators = null; this.fx = null;
    this.world = null; this.actors = null; this.decor = [];
    this.cubes = []; this.byId = new Map(); this.plates = []; this.portal = null;
    this.content = new THREE.Box3();
  }

  async init(onProgress) {
    const s = this.settings;
    this.sm = new SceneManager(this.canvas, this.container, { quality: s.quality, reducedMotion: s.reduced_motion, invert: s.invert_controls });
    this.sm.setMode(s.camera_mode);
    await this.assets.preload(onProgress);
    if (this.disposed) return;
    this.avatarParts = createAvatarParts(this.avatarInput.skinCanvas || makeDefaultSkinCanvas(), this.avatarInput.capColor || DEFAULT_CAP);
    this.interaction = new Interaction({
      canvas: this.canvas, signal: this.abort.signal, getCamera: () => this.sm.camera, isEnabled: () => this.canAct(),
      onHover: (id) => { this.indicators.setHover(id === null ? null : this.byId.get(id)?.group ?? null); this.canvas.style.cursor = id === null ? '' : 'pointer'; },
      onSelect: (id) => {
        this.indicators.setSelected(id === null ? null : this.byId.get(id)?.group ?? null);
        if (id !== null) this.avatar?.rideCube(this.byId.get(id)); // the character hops onto the newly selected cube
        if (id !== null && this.ready) this.sfx.play('select');
        this.status();
      },
    });
    this.indicators = new Indicators(this.sm.scene);
    this.fx = new Particles(this.sm.scene);
    this.buildWorld();
    const { width, depth } = this.level;
    this.sm.frameBox(this.content, new THREE.Vector3((width - 1) / 2, 0.3, (depth - 1) / 2));
    this.buildActors();
    this.interaction.select(this.cubes[0]?.id ?? null);
    this.ready = true;
    this.bind();
    this.clock.start();
    this.sm.renderer.setAnimationLoop(() => this.tick()); // the only render loop
  }

  /* ---------- build ---------- */
  buildWorld() { // static scenery: built once
    const { width, depth } = this.level, a = this.assets;
    const w = this.world = new THREE.Group(); this.sm.scene.add(w);
    const box = this.content;
    box.set(new THREE.Vector3(-0.9, -0.7, -0.9), new THREE.Vector3(width - 0.1, 1.1, depth - 0.1)); // room incl. base slab and walls
    const base = a.kit.base(width, depth); base.position.set((width - 1) / 2, -0.45, (depth - 1) / 2); w.add(base);
    for (const f of this.level.floors) { const o = a.create('floor', (f.x + f.z) % 2); o.position.set(f.x, 0, f.z); w.add(o); }
    const walls = new THREE.Group(); // walls can hide a cube behind them, so they are ray occluders (one group, not per mesh)
    for (const p of this.level.walls) { const o = a.create('wall'); o.position.set(p.x, 0, p.z); walls.add(o); }
    w.add(walls); this.interaction.registerOccluder(walls);

    // Decorative objects are NOT registered with Interaction: they cannot be selected or block clicks.
    const spots = [[-2.2, 2.6, -2.0], [width + 1.2, 3.2, -1.4], [-1.9, 1.7, depth + 0.4], [width + 1.5, 2.0, depth * 0.6], [(width - 1) / 2, 4.4, -3.2]];
    spots.forEach((p, i) => {
      const o = a.create('decor', i); o.position.set(...p); w.add(o);
      this.decor.push({ o, y: p[1], phase: i * 1.7, spin: 0.25 + i * 0.07 });
      box.expandByPoint(new THREE.Vector3(p[0] - 0.5, p[1] - 0.6, p[2] - 0.5)); box.expandByPoint(new THREE.Vector3(p[0] + 0.5, p[1] + 0.6, p[2] + 0.5));
    });
    [[-1.8, 1.6, -1.6], [width + 0.8, 1.6, -1.9]].forEach((p, i) => {
      const o = a.create('pillar'); o.position.set(...p); w.add(o);
      this.decor.push({ o, y: p[1], phase: i * 2.3 + 1, spin: 0, amp: 0.1 });
      box.expandByPoint(new THREE.Vector3(p[0] - 0.4, p[1] - 1.9, p[2] - 0.4)); box.expandByPoint(new THREE.Vector3(p[0] + 0.4, p[1] + 1.9, p[2] + 0.4));
    });
    w.add(a.kit.stars(this.sm.q.stars)); // stars are far background and intentionally not part of the framing box
  }

  buildActors() { // gameplay objects: rebuilt on restart
    const a = this.assets, lv = this.level;
    const g = this.actors = new THREE.Group(); this.sm.scene.add(g);
    this.plates = lv.plates.map((p) => { const e = new PlateEntity(a.create('plate'), p); g.add(e.group); return e; });
    this.portal = new PortalEntity(a.create('portal'), lv.portal); g.add(this.portal.group);
    this.byId = new Map();
    this.cubes = lv.cubes.map((c) => {
      const e = new CubeEntity(c.id, a.createCube(), [c.x, c.z], c.mark);
      e.onSettled = (cube) => this.verify(cube);
      g.add(e.group); this.byId.set(c.id, e);
      this.interaction.register(e.group, c.id); // explicit registry of interactive objects
      return e;
    });
    this.avatar = new Avatar(this.avatarParts); g.add(this.avatar.group); // cosmetic: not registered with Interaction
    this.avatar.rideCube(this.cubes[0], true);
    this.sm.setFollowTarget(this.avatar.pos); // the smoothed position (without the hop), so the camera does not bounce
  }

  setCameraMode(mode) { this.sm.setMode(mode); }

  restart() {
    if (!this.sm || this.disposed) return;
    this.queued = null; this.pendingSolved = false; this.pendingComplete = false; // the flow state is reset by GameFlow.restart()
    this.running = false; this.playTime = 0; this.lastTenth = -1; this.onTime(0);
    this.interaction.clearInteractive(); // drops selection/hover and unregisters the old cubes first
    this.sm.scene.remove(this.actors); disposeOwned(this.actors);
    this.state.reset();
    this.buildActors();
    this.interaction.select(this.cubes[0]?.id ?? null);
    this.onMove(0); this.status();
  }

  /* ---------- actions (rules decide, visuals follow) ---------- */
  canAct() { return !this.disposed && this.flow.canManipulate; } // only in the PLAYING state
  get busy() { return this.cubes.some((c) => c.busy); }

  request(action) {
    if (!this.canAct()) return;
    if (this.busy) { this.queued = action; return; } // keep one buffered action so quick key presses are not lost
    this.perform(action);
  }
  undo() { this.request({ type: 'undo' }); }
  setSound(on) { this.sfx.setEnabled(on); }

  perform(a) {
    const st = this.state;
    let r;
    if (a.type === 'undo') { r = st.undo(); if (!r.ok) return; this.interaction.select(r.id); }
    else if (a.type === 'move') r = st.move(a.id, a.dx, a.dz);
    else r = st.rotate(a.id, a.axis, a.dir);
    const cube = this.byId.get(a.type === 'undo' ? r.id : a.id);
    if (!r.ok) { if (a.type === 'move') { cube?.bump(a.dx, a.dz); this.sfx.play('bump'); } return; } // illegal: rules reject it, nothing changes
    if (r.type === 'move') cube.slide(r.dx, r.dz); else cube.turn(AXES[r.axis], r.dir);
    this.sfx.play(a.type === 'undo' ? 'undo' : r.type === 'move' ? 'slide' : 'turn');
    if (!r.undo) this.running = true; // the clock starts with your first real action
    this.onMove(st.moves);
    if (st.solved) { this.flow.solve(); this.pendingSolved = true; this.interaction.deselect(); } // PLAYING -> SOLVED: input locks immediately
    this.status();
  }

  // Development safety net: the animated cube must end up facing the way the rules think it does.
  verify(cube) {
    const m = this.state.cubes.get(cube.id)?.mark, d = cube.markDirection();
    if (m && Math.abs(d.x - m[0]) + Math.abs(d.y - m[1]) + Math.abs(d.z - m[2]) > 0.05) console.warn(`[puzzle] cube ${cube.id}: visual mark direction differs from rules`, d.toArray(), m);
  }

  objective() {
    const st = this.state;
    if (st.solved) return 'Room complete!';
    const n = st.platesOnCount(), m = st.plateCount;
    if (n < m) return m === 1 ? 'Step 1: rest a cube on the plate with its amber face UP.' : `Step 1: rest a cube on EACH plate, amber face UP (${n}/${m} lit).`;
    return 'Step 2: the portal is open! Slide a spare cube into it.';
  }

  status() {
    const st = this.state, id = this.interaction?.selectedId ?? null;
    const selection = id === null ? 'No cube selected. Click a cube.' : `Cube ${id} selected · amber face ${st.cubes.get(id).mark[1] === 1 ? 'UP' : 'not up'}`;
    const objective = this.objective();
    const key = objective + '|' + selection;
    if (key !== this.lastStatus) { this.lastStatus = key; this.onStatus({ objective, selection }); } // only when it changes
  }

  /* ---------- input ---------- */
  bind() {
    const { signal } = this.abort;
    window.addEventListener('keydown', (e) => this.onKey(e), { signal });
    window.addEventListener('blur', () => this.interaction.setHover(null), { signal });
    this.canvas.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.sm.setPointer(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
    }, { signal });
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onError('The graphics context was lost. Refresh the page to continue.'); }, { signal });
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !this.canAct()) return;
    if (/^(input|select|textarea)$/i.test(e.target?.tagName ?? '')) return;
    const k = e.key.toLowerCase(), id = this.interaction.selectedId;
    if (MOVE[k] || TURN[k]) {
      e.preventDefault();
      if (id === null) return; // nothing selected: keys do nothing (the panel says so)
      if (MOVE[k]) this.request({ type: 'move', id, dx: MOVE[k][0], dz: MOVE[k][1] });
      else this.request({ type: 'turn', id, axis: TURN[k][0], dir: TURN[k][1] });
    } else if (k === 'z') { e.preventDefault(); this.undo(); }
    else if (/^[1-9]$/.test(k) && this.byId.has(k)) this.interaction.select(k);
  }

  /* ---------- loop ---------- */
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05), step = this.flow.frozen ? 0 : dt;
    if (this.flow.state === S.PAUSED || this.flow.state === S.MENU) this.queued = null;
    const motion = this.settings.reduced_motion ? 0 : 1;
    this.time += step;
    if (this.running && this.flow.state === S.PLAYING) { // the clock stops on pause, menu, solve and completion
      this.playTime += step;
      const tenth = Math.floor(this.playTime * 10);
      if (tenth !== this.lastTenth) { this.lastTenth = tenth; this.onTime(this.playTime); }
    }
    this.cubes.forEach((c) => c.update(step));
    if (!this.busy) {
      this.syncPlates();
      if (this.pendingSolved) {
        this.pendingSolved = false; this.pendingComplete = true;
        const c = this.state.cubeAt(this.level.portal.x, this.level.portal.z);
        this.byId.get(c?.id)?.vanish();
        this.fx.burst(this.level.portal.x, 0.7, this.level.portal.z, 48, PALETTE.confetti, 3.4);
        this.sfx.play('win');
      } else if (this.pendingComplete) { // the cube has been swallowed: SOLVED -> COMPLETE
        this.pendingComplete = false;
        this.avatar.standAt(this.level.portal.x, this.level.portal.z);
        if (this.flow.finish()) this.onSolved({ moves: this.state.moves, timeSeconds: this.playTime });
      } else if (this.queued && this.canAct()) { const a = this.queued; this.queued = null; this.perform(a); }
    }
    this.plates.forEach((p) => p.update(step, this.time, motion)); this.portal.update(step, this.time, motion);
    this.avatar.update(step, this.time, motion);
    for (const d of this.decor) {
      d.o.position.y = d.y + Math.sin(this.time * 0.6 + d.phase) * (d.amp ?? 0.18) * motion;
      d.o.rotation.y += step * d.spin * motion;
    }
    this.interaction.update();
    this.indicators.update(this.time, motion);
    this.fx.update(step);
    this.sm.render(dt);
  }

  // Visuals follow the rules once cubes settle; changes trigger feedback exactly once.
  syncPlates() {
    this.plates.forEach((p, i) => {
      const on = this.state.plateOn(i);
      if (on === p.active) return;
      p.setActive(on);
      if (on) { this.fx.burst(p.cell.x, 0.15, p.cell.z, 18, PALETTE.confetti); this.sfx.play('plateOn'); } else this.sfx.play('plateOff');
    });
    const open = this.state.portalOpen;
    if (open !== this.portal.open) {
      this.portal.setOpen(open);
      if (open) { this.fx.burst(this.level.portal.x, 0.7, this.level.portal.z, 24, PALETTE.confetti, 2.6); this.sfx.play('portalOpen'); }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.interaction?.dispose();
    this.sfx.dispose();
    this.avatarParts?.dispose();
    if (this.sm) {
      this.sm.renderer.setAnimationLoop(null);
      this.sm.scene.traverse((o) => {
        if (o.geometry?.userData?.own) o.geometry.dispose();
        if (o.material) [].concat(o.material).forEach((m) => { if (m.userData.own) m.dispose(); });
      });
      this.sm.scene.clear();
      this.assets.dispose();
      this.sm.dispose();
    }
  }
}
