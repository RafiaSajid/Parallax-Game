import * as THREE from 'three';

// The player's character is a cylinder. Its body is a small painted canvas wrapped around it; the top and bottom are one colour.
// The canvas aspect (2:1) matches the body's circumference : height, so brush strokes are round on the model.
export const SKIN_W = 256, SKIN_H = 128;
export const AVATAR_R = 0.18, AVATAR_H = Math.PI * AVATAR_R; // circumference / height = 2
export const DEFAULT_CAP = '#FF8FC2';

export function drawDefaultSkin(ctx) {
  const W = SKIN_W, H = SKIN_H, cx = W / 2, cy = H * 0.42;
  ctx.fillStyle = '#FFD166'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#FFE29A'; ctx.fillRect(0, H * 0.74, W, H * 0.26);
  const oval = (x, y, rx, ry, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  oval(cx - 42, cy + 16, 11, 7, '#FF8FC2'); oval(cx + 42, cy + 16, 11, 7, '#FF8FC2'); // blush
  oval(cx - 22, cy, 7, 10, '#2B2350'); oval(cx + 22, cy, 7, 10, '#2B2350');           // eyes
  oval(cx - 20, cy - 4, 2.5, 3, '#FFFFFF'); oval(cx + 24, cy - 4, 2.5, 3, '#FFFFFF');  // sparkle
  ctx.strokeStyle = '#2B2350'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy + 8, 12, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); // smile
}

export function makeDefaultSkinCanvas() {
  const c = document.createElement('canvas'); c.width = SKIN_W; c.height = SKIN_H;
  drawDefaultSkin(c.getContext('2d')); return c;
}

// Decodes a saved PNG data URL into a canvas of the standard size. Rejects if the image cannot be read.
export function loadSkinCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = SKIN_W; c.height = SKIN_H; c.getContext('2d').drawImage(img, 0, 0, SKIN_W, SKIN_H); resolve(c); };
    img.onerror = () => reject(new Error('The saved character image could not be read.'));
    img.src = dataUrl;
  });
}

export function createSkinTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.offset.x = 0.5; // puts the middle of the canvas (the face) toward the cylinder's +Z front
  t.anisotropy = 4;
  return t;
}

// Builds the cylinder. The caller owns (and must dispose) the returned geometry, materials and texture.
export function createAvatarParts(canvas, capHex = DEFAULT_CAP) {
  const texture = createSkinTexture(canvas);
  const geo = new THREE.CylinderGeometry(AVATAR_R, AVATAR_R, AVATAR_H, 40, 1); // material groups: 0 side, 1 top, 2 bottom
  const side = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
  const cap = new THREE.MeshStandardMaterial({ color: capHex, roughness: 0.6 });
  return { texture, geo, side, cap, dispose() { texture.dispose(); geo.dispose(); side.dispose(); cap.dispose(); } };
}
