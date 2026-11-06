// 3D props for the remake canyon: scanned rocks (CC0, Poly Haven) in place of the 1997 rock sprites,
// and rubble scattered along the feet of the cliffs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = {};
// a model sitting on y = 0 (media/models/<id>.glb, reduced by tools/models/decimate_props.py), centred on x/z, with its size recorded
export function rockModel(id) {
  if (!cache[id]) cache[id] = loader.loadAsync(`media/models/${id}.glb`).then((g) => {
    const m = g.scene; let tris = 0;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
    const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -b.min.y, -c.z);
    const wrap = new THREE.Group(); wrap.add(m);
    wrap.userData.size = b.getSize(new THREE.Vector3()); wrap.userData.tris = tris;
    return wrap;
  });
  return cache[id];
}
// an instance `width` world units across (height follows the model, capped), turned and sunk a little
export async function placeRock(id, x, z, width, rot = 0, { sink = 0.1, squash = 1, y = 0 } = {}) {
  const base = await rockModel(id);
  const r = base.clone(true), s = base.userData.size, k = width / Math.max(s.x, s.z);
  r.scale.set(k, k * squash, k); r.rotation.y = rot;
  r.position.set(x, y - sink * s.y * k * squash, z);
  return r;
}
// 1997 rock sprites (CANYON sprite index) -> model
export const SPRITE_ROCK = { 0: 'namaqualand_boulder_04', 1: 'namaqualand_boulder_06', 2: 'namaqualand_boulder_02', 3: 'boulder_01' };
export const RUBBLE = ['namaqualand_boulder_03', 'stone_01', 'rock_09', 'namaqualand_boulder_06'];

// ---------------------------------------------------------------- the metal cask (1997 sprites 4 and 5)
const tl = new THREE.TextureLoader(), tcache = {};
const tx = (u, srgb) => { if (!tcache[u]) { const t = tl.load(u); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; tcache[u] = t; } return tcache[u]; };
function caskMats() {
  const steel = new THREE.MeshStandardMaterial({ map: tx('media/tex/metal_plate_02/diff.jpg', true), normalMap: tx('media/tex/metal_plate_02/nor.jpg'),
    roughnessMap: tx('media/tex/metal_plate_02/rough.jpg'), metalness: 0.3, roughness: 0.65, color: 0xb8b0a6 });   // mostly diffuse: the cave has nothing to reflect
  const dark = steel.clone(); dark.color.set(0x55514c);
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#151515'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#e0b81a';
  for (let y = -64; y < 256; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 32); g.lineTo(64, y + 52); g.lineTo(0, y + 20); g.fill(); }
  const ht = new THREE.CanvasTexture(c); ht.colorSpace = THREE.SRGBColorSpace;
  const hazard = new THREE.MeshStandardMaterial({ map: ht, metalness: 0.3, roughness: 0.6 });
  const cable = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: 0.5 });
  return { steel, dark, hazard, cable };
}
let MATS = null;
// a cask `width` world units across, standing on y = 0; broken = split open, lid off, parts strewn
export function buildCask(width, broken = false) {
  MATS = MATS || caskMats();
  const { steel, dark, hazard, cable } = MATS, r = width * 0.42, h = width * 0.55, g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (!broken) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, h, 40), steel), 0, h / 2, 0);
    const lid = add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel), 0, h, 0); lid.scale.y = 0.42;
    for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, width * 0.018, 8, 48), dark), 0, width * 0.04 + i * width * 0.045, 0).rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, width * 0.016, 8, 48), dark), 0, h * 0.98, 0).rotation.x = Math.PI / 2;
    for (const a of [-0.45, 0.45]) { const s = add(new THREE.Mesh(new THREE.BoxGeometry(width * 0.06, h * 0.85, width * 0.02), hazard), Math.sin(a) * r, h * 0.5, Math.cos(a) * r); s.rotation.y = a; }
    const handle = add(new THREE.Mesh(new THREE.TorusGeometry(width * 0.14, width * 0.018, 8, 24, Math.PI), dark), 0, h * 0.55, r * 1.04); handle.rotation.z = Math.PI;
    add(new THREE.Mesh(new THREE.BoxGeometry(width * 0.4, width * 0.07, width * 0.3), dark), 0, h + r * 0.4, 0);
    for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.BoxGeometry(width * 0.28, width * 0.012, width * 0.035), hazard), 0, h + r * 0.44, -width * 0.08 + i * width * 0.08);
  } else {
    const half = (sign) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, h, 32, 1, true, 0, Math.PI), steel); m.material = steel.clone(); m.material.side = THREE.DoubleSide; return m; };
    const a = add(half(), -width * 0.08, r * 0.6, 0); a.rotation.set(0, 0.3, Math.PI / 2 - 0.15);
    const b = add(half(), width * 0.22, r * 0.45, width * 0.1); b.rotation.set(Math.PI, -0.4, Math.PI / 2 + 0.25);
    const lid = add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark), -width * 0.42, r * 0.3, -width * 0.2); lid.scale.y = 0.42; lid.rotation.set(1.2, 0.4, 0.3);
    for (let i = 0; i < 9; i++) { const f = add(new THREE.Mesh(new THREE.BoxGeometry(width * (0.05 + Math.random() * 0.08), width * 0.015, width * (0.04 + Math.random() * 0.07)), i % 3 ? steel : hazard), (Math.random() - 0.5) * width * 1.1, width * 0.01, (Math.random() - 0.5) * width * 0.8); f.rotation.y = Math.random() * 6; }
    for (let i = 0; i < 4; i++) {
      const pts = []; for (let k = 0; k < 6; k++) pts.push(new THREE.Vector3((k / 5 - 0.5) * width * 0.7, width * 0.02 + Math.sin(k * 1.3 + i) * width * 0.04 + (k === 0 ? r * 0.4 : 0), (Math.random() - 0.5) * width * 0.4));
      add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, width * 0.008, 6), cable), 0, 0, 0);
    }
  }
  return g;
}
// the same reflections as the character models, so the cask reads in the dark cave
export function setCaskEnv(env) { MATS = MATS || caskMats(); for (const m of Object.values(MATS)) { m.envMap = env; m.envMapIntensity = 0.9; m.needsUpdate = true; } }
