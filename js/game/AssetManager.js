import * as THREE from 'three';
import { createGltfLoader } from './gltf.js';
import { ProceduralKit } from './procedural.js';

const asArray = (m) => (Array.isArray(m) ? m : [m]);

// Disposes only resources flagged userData.own (per-instance). Shared kit resources are disposed by the kit.
export function disposeOwned(root) {
  root.traverse((o) => {
    if (o.geometry?.userData?.own) o.geometry.dispose();
    if (o.material) asArray(o.material).forEach((m) => { if (m.userData.own) m.dispose(); });
  });
}

export class AssetManager {
  constructor(registry) {
    this.registry = registry;
    this.kit = new ProceduralKit();
    this.templates = new Map();
    this.status = {}; // id -> 'glb' | 'fallback' | 'procedural' (inspect in the console: game.assets.status)
  }

  async preload(onProgress) {
    const ids = Object.keys(this.registry);
    const withFile = ids.filter((id) => this.registry[id].file);
    ids.filter((id) => !this.registry[id].file).forEach((id) => { this.status[id] = 'procedural'; });
    if (!withFile.length) return;
    const loader = await createGltfLoader();
    let done = 0;
    await Promise.all(withFile.map(async (id) => {
      const def = this.registry[id];
      try {
        const gltf = await loader.loadAsync(def.file);
        this.templates.set(id, this._normalize(gltf.scene, def));
        this.status[id] = 'glb';
      } catch (err) {
        console.warn(`[assets] "${id}": could not load ${def.file}, using procedural fallback.`, err?.message || err);
        this.status[id] = 'fallback';
      }
      onProgress?.(++done, withFile.length);
    }));
  }

  // Recenters/scales a model so its pivot and size are predictable, then applies the registry's default transform.
  _normalize(scene, def) {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const k = (def.fit ? def.fit / (Math.max(size.x, size.y, size.z) || 1) : 1) * (def.scale ?? 1);
    scene.position.sub(center); // model now centered on the origin
    if (def.anchor === 'bottom') scene.position.y += size.y / 2;
    if (def.anchor === 'top') scene.position.y -= size.y / 2;
    scene.traverse((o) => { if (o.isMesh) { o.castShadow = def.castShadow !== false; o.receiveShadow = true; } });
    const holder = new THREE.Group(); holder.scale.setScalar(k); holder.add(scene);
    const outer = new THREE.Group(); outer.add(holder);
    outer.position.fromArray(def.position ?? [0, 0, 0]);
    const r = (def.rotation ?? [0, 0, 0]).map((d) => THREE.MathUtils.degToRad(d));
    outer.rotation.set(r[0], r[1], r[2]);
    const wrap = new THREE.Group(); wrap.add(outer); // wrap keeps the default transform separate from gameplay transforms
    return wrap;
  }

  create(id, arg) {
    const tpl = this.templates.get(id);
    if (tpl) {
      const c = tpl.clone(true);
      if (this.registry[id].uniqueMaterials) {
        c.traverse((o) => {
          if (!o.isMesh) return;
          o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
          asArray(o.material).forEach((m) => { m.userData.own = true; });
        });
      }
      return c;
    }
    return this.kit[id](arg);
  }

  // Cubes always carry a marked face on local +Y. A model can supply its own node named "Mark"; otherwise one is added.
  createCube() {
    const o = this.create('cube');
    if (!o.getObjectByName('Mark')) o.add(this.kit.markOverlay((this.registry.cube.fit ?? 0.82) / 2));
    return o;
  }

  dispose() {
    this.templates.forEach((t) => t.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) asArray(o.material).forEach((m) => { Object.values(m).forEach((v) => v?.isTexture && v.dispose()); m.dispose(); });
    }));
    this.templates.clear();
    this.kit.dispose();
  }
}
