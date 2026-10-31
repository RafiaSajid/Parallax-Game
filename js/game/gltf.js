// One place that builds a GLTFLoader that also understands Draco-compressed models (common in downloaded .glb files).
// The Draco decoder comes from the same pinned jsDelivr path as Three.js and is only fetched when a model needs it.
const DRACO_PATH = 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/';

export async function createGltfLoader() {
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/loaders/DRACOLoader.js'),
  ]);
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH);
  loader.setDRACOLoader(draco);
  loader.dracoLoader = draco; // kept so callers can dispose it
  return loader;
}
