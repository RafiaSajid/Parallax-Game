// A draggable, spinnable 3D toy made from a .glb model, used on the landing, login and signup pages.
// If the model file is missing or cannot be loaded (or the 3D library is unreachable) the CSS cube toy is used instead.
import { initToy } from './toy.js';

export const MODELS = {
  planet: 'assets/models/cute_cat_in_cute_banana.glb', // landing page
  cat: 'assets/models/cute_cat_in_cute_banana.glb',             // login and signup pages
};

export async function initModelToy(slot, key) {
  const url = MODELS[key];
  let T, gltf;
  try {
    T = await import('three');
    const { createGltfLoader } = await import('./game/gltf.js');
    gltf = await (await createGltfLoader()).loadAsync(url);
  } catch (err) {
    console.warn(`[toy] ${url} could not be loaded, showing the cube instead.`, err?.message || err);
    initToy(slot);
    return null;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'model-toy'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'A 3D toy. Drag to move it anywhere, Shift and drag to spin it, press Space to spin it.');
  document.body.append(canvas);

  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.toneMapping = T.NeutralToneMapping;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1, 0.1, 50); camera.position.set(0, 0.1, 4.6);
  scene.add(new T.HemisphereLight(0xffffff, 0xffd9ec, 1.7));
  const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 3, 4); scene.add(sun);

  // Recentre and scale whatever model was supplied so it always fits the frame.
  const model = gltf.scene, box = new T.Box3().setFromObject(model);
  const size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
  model.position.sub(center);
  const holder = new T.Group(); holder.add(model); holder.scale.setScalar(2.2 / (Math.max(size.x, size.y, size.z) || 1));
  const pivot = new T.Group(); pivot.add(holder); scene.add(pivot);
  let mixer = null;
  if (gltf.animations?.length) { mixer = new T.AnimationMixer(model); mixer.clipAction(gltf.animations[0]).play(); }

  const ac = new AbortController(), { signal } = ac;
  let x = 0, y = 0, rotX = 0.15, rotY = -0.4, spinV = 0, held = false, moved = false, shiftSpin = false, userMoved = false, sx = 0, sy = 0, lx = 0, ly = 0, dirty = true;
  const dim = () => canvas.clientWidth || 200;
  const clamp = () => { x = Math.min(Math.max(x, 0), innerWidth - dim()); y = Math.min(Math.max(y, 0), innerHeight - dim()); };
  const home = () => { const r = slot.getBoundingClientRect(); x = r.left + (r.width - dim()) / 2; y = r.top + (r.height - dim()) / 2; clamp(); dirty = true; };

  canvas.addEventListener('pointerdown', (e) => {
    held = true; moved = false; shiftSpin = e.shiftKey; sx = lx = e.clientX; sy = ly = e.clientY;
    canvas.classList.add('is-held'); canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (!held) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
    moved = true;
    if (shiftSpin) { rotY += dx * 0.014; rotX = Math.max(-1, Math.min(1, rotX + dy * 0.014)); spinV = dx * 0.5; }
    else { x += dx; y += dy; clamp(); userMoved = true; dirty = true; rotY += dx * 0.012; rotX = Math.max(-1, Math.min(1, rotX + dy * 0.01)); spinV = dx * 0.4; } // it tumbles as it travels
  }, { signal });
  const release = () => { if (!held) return; held = false; canvas.classList.remove('is-held'); if (!moved && !reduced) spinV = 9; }; // tap = spin
  canvas.addEventListener('pointerup', release, { signal }); canvas.addEventListener('pointercancel', release, { signal });
  canvas.addEventListener('keydown', (e) => {
    const step = 24, k = e.key;
    if (k === ' ' || k.toLowerCase() === 'r') { e.preventDefault(); spinV = 9; return; }
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
    if (!d) return;
    e.preventDefault(); x += d[0]; y += d[1]; clamp(); userMoved = true; dirty = true; spinV = d[0] * 0.3;
  }, { signal });

  const resize = () => { const w = dim(); renderer.setSize(w, canvas.clientHeight || w, false); camera.aspect = w / (canvas.clientHeight || w); camera.updateProjectionMatrix(); userMoved ? (clamp(), dirty = true) : home(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas); window.addEventListener('resize', resize, { signal });
  resize(); home();

  let prev = performance.now();
  renderer.setAnimationLoop((now) => { // the only render loop on the page
    const dt = Math.min((now - prev) / 1000, 0.05); prev = now;
    if (!reduced) {
      rotY += (held ? 0 : spinV + 0.45) * dt; spinV *= Math.pow(0.12, dt); // coast to a stop, then idle-spin gently
      if (!held) rotX += (0.15 - rotX) * Math.min(1, dt * 2);
    }
    pivot.rotation.set(rotX, rotY, 0);
    mixer?.update(dt);
    if (dirty) { canvas.style.transform = `translate(${x}px, ${y}px)`; dirty = false; }
    renderer.render(scene, camera);
  });
  window.addEventListener('pagehide', () => { renderer.setAnimationLoop(null); ac.abort(); ro.disconnect(); renderer.dispose(); }, { once: true });
  return { canvas };
}
