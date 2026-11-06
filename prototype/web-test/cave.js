// Cave mouths for the remake canyon. Each 1997 'cave mouth' is a straight cut through the cliff; here a block of
// rock spans the cut (sunk into the cliffs either side, its top following the cliff line) with an irregular arch
// through it, so the cliff carries on over a dark opening and hides the edge of the cave's rock ceiling.
// The rock is subdivided and pushed about by a noise field, and wears the terrain's own triplanar material.
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm } from './terrain.js';

// height of the terrain near a world point: the highest terrain vertex within a short radius, from a spatial hash
// of the mesh's vertices built once (ray casts against the whole terrain were far too slow)
const HASH = new WeakMap(), HC = 32;
export function terrainHeight(terrain, x, z, spread = 1) {
  let H = HASH.get(terrain);
  if (!H) {
    H = new Map(); const p = terrain.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = Math.floor(p.getX(i) / HC) + ',' + Math.floor(p.getZ(i) / HC), y = p.getY(i);
      if (!(H.get(k) >= y)) H.set(k, y);
    }
    HASH.set(terrain, H);
  }
  let best = -Infinity; const cx = Math.floor(x / HC), cz = Math.floor(z / HC);
  for (let dz = -spread; dz <= spread; dz++) for (let dx = -spread; dx <= spread; dx++) { const y = H.get((cx + dx) + ',' + (cz + dz)); if (y > best) best = y; }
  return best === -Infinity ? 0 : best;
}

// x0..x1: the cut through the cliff; zBack: where the cave roof starts; zMin: the cliff face must be at least this far out
// The arch follows 1997's 'cave mouth' tiles (16, 18): a tall round-topped doorway, clean-edged, black inside.
export function buildCavePortal({ terrain, x0, x1, zBack, zMin = 0, archW = 170, archH = 250, seed = 1, wing = 170 }) {
  const cx = (x0 + x1) / 2;
  // the cliff face beside the cut: walk in from the canyon until the rock rises
  const faceAt = (x) => { for (let z = zBack + 900; z > zBack; z -= 8) if (terrainHeight(terrain, x, z, 0) > 200) return z; return zBack + 150; };
  const zFront = Math.max(zMin, faceAt(x0 - 70), faceAt(x1 + 70)) + 12;
  // its top: the cliff tops beside the cut (the tallest few samples a little way back from the face)
  const hs = [];
  for (const x of [x0 - 220, x0 - 140, x0 - 70, x1 + 70, x1 + 140, x1 + 220]) for (const dz of [60, 140, 240]) hs.push(terrainHeight(terrain, x, zFront - dz));
  hs.sort((a, b) => b - a);
  const top = Math.max(520, hs[Math.floor(hs.length * 0.3)] - 25);   // never below the cave roof behind it
  const W = (x1 - x0) + 2 * wing, D = Math.max(120, zFront - zBack);
  const n = (a, b) => fbm(a + seed * 7.3, b - seed * 3.1, 3);

  // outline (x across, y up): a slab with a ragged top, and an irregular arch for a hole
  const s = new THREE.Shape();
  s.moveTo(-W / 2, -70); s.lineTo(W / 2, -70);
  for (let i = 0; i <= 16; i++) { const x = W / 2 - (i / 16) * W; s.lineTo(x, top + n(x / 90, 2) * 40 - Math.abs(x) / W * 30); }
  s.lineTo(-W / 2, -70);
  const hole = new THREE.Path(), spring = archH * 0.5, rw = archW / 2, rh = archH - spring;
  hole.moveTo(rw * (1 + 0.03 * n(1, 1)), -40);
  hole.lineTo(rw * (1 + 0.03 * n(2, 3)), spring);
  for (let i = 1; i < 24; i++) {
    const a = (i / 24) * Math.PI, k = 1 + 0.05 * n(Math.cos(a) * 2, Math.sin(a) * 2 + 5);
    hole.lineTo(Math.cos(a) * rw * k, spring + Math.sin(a) * rh * k);
  }
  hole.lineTo(-rw * (1 + 0.03 * n(4, 1)), spring); hole.lineTo(-rw * (1 + 0.03 * n(5, 2)), -40);
  s.holes.push(hole);

  let g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 4 });
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = new TessellateModifier(26, 8).modify(g);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 0.5);
  // push the rock about: lumps over the face, deeper toward the top, and a bulge out of the front; the walkway
  // through the arch keeps its width
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const front = v.z / D, inArch = Math.abs(v.x) < rw * 1.35 && v.y < archH * 1.2;
    const amp = (inArch ? 6 : 55) * (0.6 + 0.4 * Math.min(1, v.y / top));
    v.x += n(v.y / 80 + v.z / 110, v.x / 95) * amp * (inArch ? 0.4 : 1);
    v.y += n(v.x / 85 + 9, v.z / 85) * amp * 0.5 * (v.y > 0 ? 1 : 0);
    const side = Math.abs(v.x) / (W / 2);                 // the wings fold back into the cliffs
    v.z += (n(v.x / 70 - 4, v.y / 70) * amp + 30 * front * (1 - side) - 90 * front * side * side) * (v.y > -20 ? 1 : 0);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const edge = new Float32Array(p.count).fill(1); g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  const m = new THREE.Mesh(g, terrain.material);
  m.castShadow = m.receiveShadow = true;
  m.position.set(cx, 0, zFront - D);
  m.userData = { kind: 'terrain' };
  // the dark beyond: 1997 paints the doorway black; a void a little way in, seen only from the canyon side
  // (its back face is culled, so the cave cameras looking out still see daylight)
  const vs = new THREE.Shape(); vs.moveTo(rw * 1.1, -2); vs.lineTo(rw * 1.1, spring); vs.absarc(0, spring, rw * 1.1, 0, Math.PI, false); vs.lineTo(-rw * 1.1, -2);
  const vg = new THREE.ShapeGeometry(vs, 24);
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const k = c.getContext('2d');
  const gr = k.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, '#120d09'); gr.addColorStop(0.5, '#060403'); gr.addColorStop(1, '#020101'); k.fillStyle = gr; k.fillRect(0, 0, 4, 64);
  const vt = new THREE.CanvasTexture(c); vt.colorSpace = THREE.SRGBColorSpace;
  { const p = vg.attributes.position, uv = vg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5, p.getY(i) / (spring + rh * 1.1)); }
  const voidM = new THREE.Mesh(vg, new THREE.MeshBasicMaterial({ map: vt, fog: true }));
  voidM.position.set(cx, 0, zFront - Math.min(D * 0.55, 140)); voidM.userData = { kind: 'void' };
  return { mesh: m, void: voidM, zFront, top, archW, archH, cx };
}

// a chunk of broken cliff rock: a lumpy, faceted stone of radius r, in the terrain's rock material
function chunk(material, r, sx, sy, sz, seed) {
  const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const d = v.clone().normalize();
    const k = 1 + 0.32 * fbm(d.x * 1.6 + seed, d.y * 1.6 + d.z * 1.3 - seed, 3) + 0.12 * fbm(d.x * 5 + seed * 2, d.z * 5 + d.y * 3, 2);
    const flat = Math.max(0.55, 1 - Math.max(0, d.y - 0.55) * 1.4);          // fractured, flattish faces on top
    v.copy(d).multiplyScalar(r * k); v.y *= flat; v.set(v.x * sx, v.y * sy, v.z * sz); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('normal'); const m2 = mergeVertices(g); m2.computeVertexNormals();
  m2.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(m2.attributes.position.count).fill(1), 1));
  const m = new THREE.Mesh(m2, material); m.castShadow = m.receiveShadow = true; return m;
}

// a rockfall choking a portal's arch: broken chunks of the cliff jammed into the opening, the top course stopping
// short so a dark gap shows (there is something behind), and debris spilled out over the ground in front
export function buildRockfall({ portal, material, seed = 5 }) {
  const g = new THREE.Group(); let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const { cx, zFront, archW: w } = portal;
  const put = (x, y, z, rad, sx = 1, sy = 0.85, sz = 0.9) => {
    const c = chunk(material, rad, sx * (0.9 + rnd() * 0.2), sy * (0.9 + rnd() * 0.2), sz, rnd() * 50);
    c.position.set(cx + x, y, zFront + z); c.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5); g.add(c);
  };
  // the jam: three courses filling the arch, the biggest at the bottom, bulging out of the mouth
  put(-w * 0.33, 30, -6, 50, 1.1); put(w * 0.3, 28, -2, 52, 1.05); put(0, 24, 26, 46, 1.3, 0.8, 0.8);
  put(-w * 0.2, 92, -14, 42); put(w * 0.22, 90, -12, 40); put(-w * 0.02, 70, 10, 36, 1.2);
  put(-w * 0.1, 142, -22, 32); put(w * 0.16, 138, -20, 28);
  put(-w * 0.28, 176, -30, 20, 1.2, 0.7);
  // spilled out in front, and small stones scattered further
  put(-w * 0.7, 14, 60, 34, 1.2, 0.6); put(w * 0.78, 12, 50, 30, 1.3, 0.6); put(w * 0.1, 10, 92, 26, 1.2, 0.55);
  for (let i = 0; i < 12; i++) put((rnd() - 0.5) * w * 2.4, 3, 70 + rnd() * 190, 6 + rnd() * 12, 1.2, 0.6);
  return g;
}
