// "Customize" panel: paint your cylinder in 3D, then save it to your account.
// Loaded on demand (dynamic import) so the profile page works even if the 3D library cannot be reached.
import * as THREE from 'three';
import { h, showMsg, friendlyError, describeError } from './core.js';
import { getAvatar, saveAvatar } from './data.js';
import { SKIN_W, SKIN_H, DEFAULT_CAP, drawDefaultSkin, loadSkinCanvas, createAvatarParts } from './game/AvatarSkin.js';

const SWATCHES = ['#FF5FA2', '#FFC531', '#45D6BE', '#7B5CFA', '#4DA3FF', '#FF8A3D', '#2B2350', '#FFFFFF', '#FFD166', '#B69BFF'];
const MAX_URL = 140000; // the database accepts up to 150000 characters
const MAX_UNDO = 15;

export function openCustomizer(userId, opener) {
  return new Promise((resolve) => {
    const ac = new AbortController(), { signal } = ac;
    let color = SWATCHES[0], size = 10, dirty = false, loaded = false, raf = 0, last = null, mode = null, rotX = 0, spin = 0;
    const history = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- panel ---------- */
    const view = h('canvas', { class: 'cz-view', 'aria-label': 'Your cylinder. Drag on it to paint, drag the background to turn it.' });
    const colorIn = h('input', { type: 'color', id: 'cz-color', value: color });
    const sizeIn = h('input', { type: 'range', id: 'cz-size', min: 2, max: 40, step: 1, value: size });
    const dot = h('span', { class: 'cz-dot', 'aria-hidden': 'true' });
    const capIn = h('input', { type: 'color', id: 'cz-cap', value: DEFAULT_CAP.toLowerCase() });
    const spinIn = h('input', { type: 'checkbox', id: 'cz-spin', checked: !reduced });
    const msg = h('div', { class: 'msg msg-info', role: 'status' }, 'Loading your character…');
    const swatches = SWATCHES.map((c) => { const b = h('button', { type: 'button', class: 'cz-swatch', 'aria-label': `Paint colour ${c}` }); b.style.background = c; b.addEventListener('click', () => setColor(c)); return b; });
    const btn = (label, fn, cls = 'btn btn-sm') => h('button', { type: 'button', class: cls, onclick: fn }, label);
    const saveBtn = btn('Save to my account', () => save(), 'btn btn-primary'); saveBtn.disabled = true;
    const undoBtn = btn('Undo stroke', () => undo()); undoBtn.disabled = true;

    const overlay = h('div', { class: 'cz-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cz-title' },
      h('div', { class: 'card customizer' },
        h('div', { class: 'cz-head' }, h('h2', { id: 'cz-title' }, 'Customize your character'), btn('Close', () => close(), 'btn btn-ghost btn-sm')),
        h('div', { class: 'cz-body' },
          h('div', { class: 'cz-stage' }, view,
            h('div', { class: 'row cz-turn' }, btn('◀ Turn', () => { spin -= Math.PI / 6; }), btn('Turn ▶', () => { spin += Math.PI / 6; }),
              h('label', { class: 'check', for: 'cz-spin' }, spinIn, ' Auto-spin')),
            h('p', { class: 'hint' }, 'Drag on the cylinder to paint. Drag the background to turn it.')),
          h('div', { class: 'cz-tools' },
            h('div', { class: 'field' }, h('label', { for: 'cz-color' }, 'Brush colour (any colour)'), h('div', { class: 'row' }, colorIn, h('div', { class: 'cz-swatches' }, swatches))),
            h('div', { class: 'field' }, h('label', { for: 'cz-size' }, 'Brush size ', dot), sizeIn),
            h('div', { class: 'field' }, h('label', { for: 'cz-cap' }, 'Top and bottom colour'), capIn),
            h('div', { class: 'row' }, btn('Fill body', () => fillBody()), undoBtn, btn('Reset to smiley', () => resetFace())),
            msg, saveBtn))));
    document.body.append(overlay);

    /* ---------- painting surface ---------- */
    const skin = document.createElement('canvas'); skin.width = SKIN_W; skin.height = SKIN_H;
    const ctx = skin.getContext('2d'); drawDefaultSkin(ctx);

    /* ---------- 3D preview ---------- */
    const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.2, 5.2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9ec, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(2, 3, 4); scene.add(key);
    const parts = createAvatarParts(skin, DEFAULT_CAP);
    const mesh = new THREE.Mesh(parts.geo, [parts.side, parts.cap, parts.cap]); mesh.scale.setScalar(3.6);
    const tilt = new THREE.Group(); tilt.rotation.x = 0.32; tilt.add(mesh); scene.add(tilt);
    const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const resize = () => { const w = Math.max(1, view.clientWidth), hgt = Math.max(1, view.clientHeight); renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(view); resize();

    let prev = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - prev) / 1000, 0.05); prev = now;
      if (spinIn.checked && mode === null && !reduced) spin += dt * 0.6;
      mesh.rotation.y += (spin - mesh.rotation.y) * Math.min(1, dt * 10);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    /* ---------- tools ---------- */
    const paintDot = () => { dot.style.width = dot.style.height = Math.max(4, size) + 'px'; dot.style.background = color; };
    function setColor(c) { color = c; colorIn.value = c.toLowerCase(); paintDot(); }
    colorIn.addEventListener('input', () => setColor(colorIn.value), { signal });
    sizeIn.addEventListener('input', () => { size = Number(sizeIn.value); paintDot(); }, { signal });
    capIn.addEventListener('input', () => { parts.cap.color.set(capIn.value); dirty = true; }, { signal });
    paintDot();

    const touch = () => { parts.texture.needsUpdate = true; dirty = true; };
    const snapshot = () => { history.push(ctx.getImageData(0, 0, SKIN_W, SKIN_H)); if (history.length > MAX_UNDO) history.shift(); undoBtn.disabled = false; };
    function undo() { const s = history.pop(); if (!s) return; ctx.putImageData(s, 0, 0); touch(); undoBtn.disabled = history.length === 0; }
    function fillBody() { snapshot(); ctx.fillStyle = color; ctx.fillRect(0, 0, SKIN_W, SKIN_H); touch(); }
    function resetFace() { snapshot(); drawDefaultSkin(ctx); capIn.value = DEFAULT_CAP.toLowerCase(); parts.cap.color.set(DEFAULT_CAP); touch(); }

    // Brush marks are drawn three times (-width, 0, +width) so strokes wrap seamlessly around the back of the cylinder.
    const stamp = (p) => { ctx.fillStyle = color; for (const dx of [-SKIN_W, 0, SKIN_W]) { ctx.beginPath(); ctx.arc(p.x + dx, p.y, size / 2, 0, Math.PI * 2); ctx.fill(); } };
    const line = (a, b) => {
      if (Math.abs(a.x - b.x) > SKIN_W / 2) { stamp(b); return; } // jumped across the seam: start a new mark
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round';
      for (const dx of [-SKIN_W, 0, SKIN_W]) { ctx.beginPath(); ctx.moveTo(a.x + dx, a.y); ctx.lineTo(b.x + dx, b.y); ctx.stroke(); }
    };
    // Screen position -> position on the painting canvas, using the cylinder's own UV coordinates. Only the body can be painted.
    function pick(e) {
      const r = view.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera); tilt.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit || !hit.uv || hit.face?.materialIndex !== 0) return null;
      return { x: ((hit.uv.x + 0.5) % 1) * SKIN_W, y: (1 - hit.uv.y) * SKIN_H }; // +0.5 matches the texture offset that centres the face
    }
    view.addEventListener('pointerdown', (e) => {
      if (!loaded || (e.pointerType === 'mouse' && e.button !== 0)) return;
      view.setPointerCapture(e.pointerId);
      const p = pick(e);
      if (p) { mode = 'paint'; snapshot(); stamp(p); touch(); last = p; } else { mode = 'turn'; last = { x: e.clientX }; }
    }, { signal });
    view.addEventListener('pointermove', (e) => {
      if (mode === 'paint') { const p = pick(e); if (p) { if (last) line(last, p); else stamp(p); touch(); } last = p; }
      else if (mode === 'turn') { spin += (e.clientX - last.x) * 0.012; last = { x: e.clientX }; }
    }, { signal });
    const stop = () => { mode = null; last = null; };
    view.addEventListener('pointerup', stop, { signal }); view.addEventListener('pointercancel', stop, { signal });

    /* ---------- save / close ---------- */
    async function save() {
      const url = skin.toDataURL('image/png');
      if (url.length > MAX_URL) { showMsg(msg, 'error', 'This painting is too detailed to save. Use "Fill body" or a larger brush to simplify it.'); return; }
      saveBtn.disabled = true; showMsg(msg, 'info', 'Saving…');
      try {
        await saveAvatar(url, capIn.value.toUpperCase());
        dirty = false; showMsg(msg, 'success', 'Saved to your account. Your character will appear in the game.'); // only after the database accepted it
      } catch (err) {
        console.error('[avatar] save failed', err);
        showMsg(msg, 'error', `NOT saved: ${friendlyError(err)} (${describeError(err)})`);
      } finally { saveBtn.disabled = false; }
    }
    function close() {
      if (dirty && !window.confirm('Discard your unsaved changes?')) return;
      cancelAnimationFrame(raf); ro.disconnect(); ac.abort();
      renderer.dispose(); parts.dispose(); overlay.remove();
      opener?.focus?.(); resolve();
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }, { signal });

    /* ---------- load the saved character ---------- */
    (async () => {
      try {
        const row = await getAvatar(userId);
        if (row?.skin_png) { try { const c = await loadSkinCanvas(row.skin_png); ctx.clearRect(0, 0, SKIN_W, SKIN_H); ctx.drawImage(c, 0, 0); } catch (e) { showMsg(msg, 'error', 'Your saved painting could not be read, so you are starting from the smiley.'); } }
        if (row?.cap_color) { capIn.value = row.cap_color.toLowerCase(); parts.cap.color.set(row.cap_color); }
        parts.texture.needsUpdate = true; loaded = true; saveBtn.disabled = false;
        if (!msg.classList.contains('msg-error')) showMsg(msg, 'info', 'Pick a colour and paint. Nothing is saved until you press Save.');
      } catch (err) {
        console.error('[avatar] load failed', err);
        showMsg(msg, 'error', `Could not load your saved character: ${friendlyError(err)} (${describeError(err)}). Saving is turned off so nothing is overwritten. Close this panel and try again.`);
      }
    })();
    colorIn.focus();
  });
}
