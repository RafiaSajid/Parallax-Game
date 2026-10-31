// Minimal stand-in for 'three' so pure interaction logic can be tested in Node.
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
export class Raycaster {
  static script = () => []; static calls = 0;
  setFromCamera(ndc) { this.ndc = ndc; }
  intersectObjects(objs, recursive, out = []) { Raycaster.calls++; out.push(...Raycaster.script(this.ndc, objs)); return out; }
}
