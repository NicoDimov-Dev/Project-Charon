// Remake terrain for the canyon: one continuous, lit landscape in place of the 1997 block walls and tiled floor.
//
// The 1997 map is two layers of 256-unit wall blocks on a 64x64 grid (masks at 8 units per pixel). Here:
//  - everything the player can reach (flood fill from seeds) is floor; everything else is rock, including
//    open cells nobody can reach, so the canyon is surrounded by landscape rather than flat plains;
//  - wall density is blurred and turned into a distance into rock, which rounds the block outlines;
//  - height rises steeply from the floor to the two 1997 layer heights (with a ledge), then keeps
//    climbing into hills behind, with noise on the rims and on the cliff lines;
//  - a triplanar shader paints cliffs with sandstone from the sides and the ground with sand from above,
//    each mixed with a second material by large-scale noise so the tiling doesn't read;
//  - a sun with shadows, so cliffs shade the canyon floor.
import * as THREE from 'three';

// ---------------------------------------------------------------- noise
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- fields
export function blur(src, w, h, passes = 3) {
  let a = src, b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; b[i] = (a[i] + (x > 0 ? a[i - 1] : a[i]) + (x < w - 1 ? a[i + 1] : a[i])) / 3;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; a[i] = (b[i] + (y > 0 ? b[i - w] : b[i]) + (y < h - 1 ? b[i + w] : b[i])) / 3;
    }
  }
  return a;
}
// chamfer distance (in cells) from every inside cell to the nearest outside cell
export function distanceInside(inside, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? INF : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue; let m = d[i];
    if (x > 0) m = Math.min(m, d[i - 1] + 1);
    if (y > 0) { m = Math.min(m, d[i - w] + 1); if (x > 0) m = Math.min(m, d[i - w - 1] + D); if (x < w - 1) m = Math.min(m, d[i - w + 1] + D); }
    d[i] = m;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue; let m = d[i];
    if (x < w - 1) m = Math.min(m, d[i + 1] + 1);
    if (y < h - 1) { m = Math.min(m, d[i + w] + 1); if (x < w - 1) m = Math.min(m, d[i + w + 1] + D); if (x > 0) m = Math.min(m, d[i + w - 1] + D); }
    d[i] = m;
  }
  return d;
}

// flood fill of open 8-unit pixels from world-space seeds
export function reachable(mask, N, px, seeds) {
  const R = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0;
  for (const [x, z] of seeds) {
    const sx = Math.floor(x / px), sz = Math.floor(z / px);
    if (sx < 0 || sz < 0 || sx >= N || sz >= N) continue;
    const i = sz * N + sx; if (mask[i] || R[i]) continue; R[i] = 1; q[qt++] = i;
  }
  while (qh < qt) {
    const i = q[qh++], x = i % N, y = (i - x) / N;
    if (x > 0 && !mask[i - 1] && !R[i - 1]) { R[i - 1] = 1; q[qt++] = i - 1; }
    if (x < N - 1 && !mask[i + 1] && !R[i + 1]) { R[i + 1] = 1; q[qt++] = i + 1; }
    if (y > 0 && !mask[i - N] && !R[i - N]) { R[i - N] = 1; q[qt++] = i - N; }
    if (y < N - 1 && !mask[i + N] && !R[i + N]) { R[i + N] = 1; q[qt++] = i + N; }
  }
  return R;
}

// ---------------------------------------------------------------- textures
const TEX = {};
function tex(url, srgb) {
  if (!TEX[url]) {
    const t = new THREE.TextureLoader().load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    TEX[url] = t;
  }
  return TEX[url];
}
const set = (id) => ({ diff: tex(`media/tex/${id}/diff.jpg`, true), nor: tex(`media/tex/${id}/nor.jpg`) });   // colour + normal is all the triplanar shader reads

// Triplanar MeshStandardMaterial: sides use the cliff pair, the top uses the ground pair.
export function triplanarMaterial({ cliffA, cliffB, groundA, groundB, cliffScale = 1 / 420, groundScale = 1 / 330, tint = 1, pave = null }) {
  // pave: { id, rect: [x0, z0, x1, z1] } paving painted onto the ground inside a rect, with a ragged edge
  const A = set(cliffA), B = set(cliffB), C = set(groundA), D = set(groundB);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint, tint, tint), roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tCA: { value: A.diff }, tCAn: { value: A.nor }, tCB: { value: B.diff }, tCBn: { value: B.nor },
      tGA: { value: C.diff }, tGAn: { value: C.nor }, tGB: { value: D.diff }, tGBn: { value: D.nor },
      cS: { value: cliffScale }, gS: { value: groundScale },
      tPV: { value: pave ? tex(`media/tex/${pave.id}/diff.jpg`, true) : C.diff }, uPV: { value: new THREE.Vector4(...(pave ? pave.rect : [0, 0, -1, -1])) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; attribute float aEdge; varying float vEdge;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vEdge = aEdge;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP; varying vec3 vWN; varying float vEdge;
uniform sampler2D tCA, tCAn, tCB, tCBn, tGA, tGAn, tGB, tGBn, tPV; uniform float cS, gS; uniform vec4 uPV;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fb(vec2 p){ return 0.5*n2(p) + 0.3*n2(p*2.1) + 0.2*n2(p*4.3); }
vec3 TPN; float TPcliff; float TPmix; float TPgmix;
// whiteout-blended triplanar normal of one texture pair
vec3 triN(sampler2D nA, sampler2D nB, float k, vec3 p, vec3 n, vec3 w, float s){
  vec3 tx = mix(texture2D(nA, p.zy*s).xyz, texture2D(nB, p.zy*s*0.9).xyz, k)*2.0-1.0;
  vec3 ty = mix(texture2D(nA, p.xz*s).xyz, texture2D(nB, p.xz*s*0.9).xyz, k)*2.0-1.0;
  vec3 tz = mix(texture2D(nA, p.xy*s).xyz, texture2D(nB, p.xy*s*0.9).xyz, k)*2.0-1.0;
  tx = vec3(tx.xy + n.zy, abs(tx.z)*n.x); ty = vec3(ty.xy + n.xz, abs(ty.z)*n.y); tz = vec3(tz.xy + n.xy, abs(tz.z)*n.z);
  return normalize(tx.zyx*w.x + ty.xzy*w.y + tz.xyz*w.z);
}
vec3 triC(sampler2D a, sampler2D b, float k, vec3 p, vec3 w, float s){
  vec3 cx = mix(texture2D(a, p.zy*s).rgb, texture2D(b, p.zy*s*0.9).rgb, k);
  vec3 cy = mix(texture2D(a, p.xz*s).rgb, texture2D(b, p.xz*s*0.9).rgb, k);
  vec3 cz = mix(texture2D(a, p.xy*s).rgb, texture2D(b, p.xy*s*0.9).rgb, k);
  return cx*w.x + cy*w.y + cz*w.z;
}`)
      .replace('#include <map_fragment>', `
  vec3 N0 = normalize(vWN);
  vec3 bw = pow(abs(N0), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  // cliff vs ground: by slope, with a ragged edge
  float rag = fb(vWP.xz / 140.0);
  TPcliff = smoothstep(0.55, 0.82, 1.0 - N0.y + (rag - 0.5) * 0.25);
  TPmix = smoothstep(0.35, 0.65, fb(vWP.xz / 1400.0 + vec2(vWP.y / 900.0)));
  TPgmix = smoothstep(0.3, 0.7, fb(vWP.xz / 1100.0 + 7.3));
  vec3 cliffC = triC(tCA, tCB, TPmix, vWP, bw, cS);
  vec3 grndC = mix(texture2D(tGA, vWP.xz * gS).rgb, texture2D(tGB, vWP.xz * gS * 0.8).rgb, TPgmix);
  // large-scale tone variation breaks the repeat further
  grndC *= 0.85 + 0.3 * fb(vWP.xz / 600.0);
  // toward the cliffs: rockier, darker scree and shade
  float ed = vEdge * (0.7 + 0.6 * fb(vWP.xz / 180.0));
  grndC = mix(grndC, texture2D(tGB, vWP.xz * gS * 1.3).rgb * 0.8, clamp(ed, 0.0, 1.0) * 0.7);
  grndC *= 1.0 - 0.32 * clamp(ed * ed, 0.0, 1.0);
  // paving inside uPV, worn at its edge where sand drifts over
  if (uPV.z > uPV.x) {
    vec2 lo = vWP.xz - uPV.xy, hi = uPV.zw - vWP.xz;
    float edge = min(min(lo.x, lo.y), min(hi.x, hi.y));
    float pv = smoothstep(0.0, 160.0, edge + (fb(vWP.xz / 90.0) - 0.5) * 220.0);
    vec3 pc = texture2D(tPV, vWP.xz / 380.0).rgb * vec3(0.95, 0.86, 0.74);
    grndC = mix(grndC, pc, pv * (1.0 - 0.45 * smoothstep(0.55, 0.8, fb(vWP.xz / 60.0))));
  }
  cliffC *= 0.88 + 0.24 * fb(vWP.xz / 500.0 + vWP.y / 300.0);
  diffuseColor.rgb *= mix(grndC, cliffC, TPcliff);
  vec3 gtn = mix(texture2D(tGAn, vWP.xz * gS).xyz, texture2D(tGBn, vWP.xz * gS * 0.8).xyz, TPgmix) * 2.0 - 1.0;
  vec3 gN = normalize(N0 + vec3(gtn.x, 0.0, gtn.y) * 0.9);         // top-down normal map on the ground
  TPN = normalize(mix(gN, triN(tCAn, tCBn, TPmix, vWP, N0, bw, cS), TPcliff));`)
      .replace('#include <normal_fragment_maps>', `normal = normalize((viewMatrix * vec4(TPN, 0.0)).xyz);`);
  };
  m.customProgramCacheKey = () => 'triplanar-' + cliffA + groundA;
  return m;
}

// ---------------------------------------------------------------- build
// masks: [layer0, layer1] 8-unit occupancy (N x N); seeds: world points that are reachable floor
export function buildTerrain({ masks, N, px = 8, seeds, step = 16, margin = 1600, H1 = 270, H2 = 280, flat = [], pave = null, sinkX = Infinity }) {
  // sinkX: open ground east of this is dropped out of sight (another mesh, the city's, covers it)
  // flat: world rects [x0, z0, x1, z1] kept as open ground (where buildings stand)
  const isFlat = (X, Z) => flat.some(([a, b, c, d]) => X >= a && X <= c && Z >= b && Z <= d);
  const R = reachable(masks[0], N, px, seeds);
  // region: reachable floor bounding box plus margin
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let i = 0; i < N * N; i++) if (R[i]) { const x = i % N, y = (i - x) / N; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const X0 = x0 * px - margin, Z0 = y0 * px - margin, X1 = (x1 + 1) * px + margin, Z1 = (y1 + 1) * px + margin;
  const w = Math.ceil((X1 - X0) / step) + 1, h = Math.ceil((Z1 - Z0) / step) + 1;
  const s1 = new Float32Array(w * h), s2 = new Float32Array(w * h);
  const k = step / px;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let open = 0, up = 0, n = 0;
    for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
      const mx = Math.floor((X0 + i * step) / px) + a - (k >> 1), mz = Math.floor((Z0 + j * step) / px) + b - (k >> 1);
      n++;
      if (mx < 0 || mz < 0 || mx >= N || mz >= N) { up++; continue; }
      const q = mz * N + mx;
      if (R[q]) open++; else if (masks[1][q] || !masks[0][q]) up++;   // unreachable open ground counts as high ground
    }
    s1[j * w + i] = 1 - open / n; s2[j * w + i] = up / n;
    if (isFlat(X0 + i * step, Z0 + j * step)) { s1[j * w + i] = 0; s2[j * w + i] = 0; }
  }
  blur(s1, w, h, 2); blur(s2, w, h, 3);
  const in1 = new Uint8Array(w * h), in2 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { in1[i] = s1[i] > 0.5; in2[i] = s2[i] > 0.5; }
  const d1 = distanceInside(in1, w, h), d2 = distanceInside(in2, w, h);
  const out1 = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) out1[i] = in1[i] ? 0 : 1;
  const dFloor = distanceInside(out1, w, h);                 // floor: distance out from the cliffs

  const pos = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), wallness = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = j * w + i;
    let X = X0 + i * step, Z = Z0 + j * step;
    const e1 = d1[q] * step, e2 = d2[q] * step;
    // a cliff with a ledge part way up, then the upper layer, then hills behind
    let y = H1 * (0.62 * ss(0, 26, e1) + 0.38 * ss(34, 70, e1)) + H2 * (0.55 * ss(0, 30, e2) + 0.45 * ss(40, 90, e2));
    const hill = Math.max(0, e1 - 260);
    y += Math.min(900, hill * 0.55) * (0.6 + 0.4 * fbm(X / 1800, Z / 1800, 3));
    const wall = ss(4, 40, e1); wallness[q] = wall;
    y += wall * (fbm(X / 420, Z / 420, 4) * 70 + fbm(X / 120, Z / 120, 3) * 18);
    if (!e1) y = fbm(X / 900, Z / 900, 3) * 3 - 1;                    // the canyon floor: gentle, near 0
    if (!e1 && X > sinkX) y = -60;
    // bend the cliff lines sideways so they stop following the grid
    const jit = ss(6, 60, e1) * 26;
    X += fbm(X / 260 + 11, Z / 260, 3) * jit; Z += fbm(X / 260, Z / 260 + 23, 3) * jit;
    // carve depth into the faces: push them back into the rock (never out into the canyon) by a
    // varying amount, leaving buttresses, alcoves and gullies; more toward the top
    if (e1 > 0 && i > 0 && j > 0 && i < w - 1 && j < h - 1) {
      let gx = d1[q + 1] - d1[q - 1], gz = d1[q + w] - d1[q - w]; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
      const recess = Math.max(0, fbm(X / 380 + 5, Z / 380 - 9, 3) + 0.15) * 95 + Math.max(0, fbm(X / 140, Z / 140, 2)) * 30;
      const k = ss(2, 30, e1) * (1 - ss(120, 260, e1)) * (0.6 + 0.4 * ss(0, 400, y));
      X += gx * recess * k; Z += gz * recess * k;
    }
    pos[q * 3] = X; pos[q * 3 + 1] = y; pos[q * 3 + 2] = Z;
    uv[q * 2] = i / (w - 1); uv[q * 2 + 1] = j / (h - 1);
  }
  const idx = new Uint32Array((w - 1) * (h - 1) * 6); let t = 0;
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const edgeA = new Float32Array(w * h);
  for (let q = 0; q < w * h; q++) edgeA[q] = in1[q] ? 1 : 1 - ss(0, 220, dFloor[q] * step);
  g.setAttribute('aEdge', new THREE.BufferAttribute(edgeA, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mat = triplanarMaterial({ cliffA: 'cliff_side', cliffB: 'rock_face_03', groundA: 'gravelly_sand', groundB: 'rocky_trail_02', pave });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.userData = { kind: 'terrain' };
  // points along the feet of the cliffs (just inside the rock), for scattering rubble
  const edges = [];
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const q = j * w + i, e = d1[q] * step;
    if (e > 0 && e <= step * 1.5 && !isFlat(X0 + i * step, Z0 + j * step)) edges.push([pos[q * 3], pos[q * 3 + 2]]);
  }
  return { mesh, bounds: { X0, Z0, X1, Z1 }, reach: R, edges };
}

// sun + sky light for the whole level, with shadows over the play area
export function addSun(scene, renderer, bounds) {
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cx = (bounds.X0 + bounds.X1) / 2, cz = (bounds.Z0 + bounds.Z1) / 2, span = Math.max(bounds.X1 - bounds.X0, bounds.Z1 - bounds.Z0) / 2;
  const sun = new THREE.DirectionalLight(0xffe0b8, 3.0);
  sun.position.set(cx - 2600, 4200, cz + 1500); sun.target.position.set(cx, 0, cz);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 100, far: 12000 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 2;
  const sky = new THREE.HemisphereLight(0xa9c4ff, 0x7a5236, 0.9);
  scene.add(sun, sun.target, sky);
  return { sun, sky };
}

// A rock ceiling over the cave rooms (and the passages into them), arched over each room, with a few
// round openings deep inside the rooms. Vertices inside an opening slide out onto its rim, so the edge
// (and the sunlight it lets in) is smooth rather than stepped. `open(X, Z)`: is a world point cave floor.
export function buildCaveCeiling({ open, x0, z0, x1, z1, step = 16, base = 250, arch = 0.55, maxArch = 170, maxHoles = 4 }) {
  const w = Math.ceil((x1 - x0) / step) + 1, h = Math.ceil((z1 - z0) / step) + 1;
  const inside = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) inside[j * w + i] = open(x0 + i * step, z0 + j * step) ? 1 : 0;
  const din = distanceInside(inside, w, h);
  const out = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) out[i] = inside[i] ? 0 : 1;
  const dout = distanceInside(out, w, h);
  // openings: deep inside rooms, far apart, chosen by a noise score
  const cand = [];
  for (let j = 0; j < h; j += 3) for (let i = 0; i < w; i += 3) {
    const q = j * w + i; if (din[q] * step < 170) continue;
    const X = x0 + i * step, Z = z0 + j * step; cand.push([fbm(X / 500 + 3.1, Z / 500 - 1.7, 3) + din[q] * step / 2000, X, Z, din[q] * step]);
  }
  cand.sort((A, B) => B[0] - A[0]);
  const holes = [];
  for (const [, X, Z, e] of cand) {
    if (holes.length >= maxHoles) break;
    if (holes.some(([hx, hz]) => Math.hypot(hx - X, hz - Z) < 1100)) continue;
    holes.push([X, Z, Math.min(130, 60 + e * 0.25)]);
  }
  const rimR = (H, ang) => H[2] * (1 + 0.28 * fbm(Math.cos(ang) * 1.7 + H[0] / 300, Math.sin(ang) * 1.7 + H[1] / 300, 3));
  const pos = new Float32Array(w * h * 3), keep = new Uint8Array(w * h), inHole = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = j * w + i; let X = x0 + i * step, Z = z0 + j * step; const e = din[q] * step;
    keep[q] = dout[q] * step < 140 ? 1 : 0;
    let y = base + Math.min(maxArch, e * arch) + fbm(X / 300, Z / 300, 4) * 45 - Math.max(0, fbm(X / 90, Z / 90, 2)) * 40;
    for (const H of holes) {
      const dx = X - H[0], dz = Z - H[1], d = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), r = rimR(H, ang);
      if (d < r) { inHole[q] = 1; X = H[0] + Math.cos(ang) * r; Z = H[1] + Math.sin(ang) * r; }
      if (d < r * 1.8) y += (1 - Math.max(0, d - r) / (r * 0.8)) * 70;      // the roof thins up toward the opening
    }
    pos.set([X, y, Z], q * 3);
  }
  const idx = [];
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    if (!(keep[a] && keep[b] && keep[c] && keep[d])) continue;
    if (inHole[a] && inHole[b] && inHole[c] && inHole[d]) continue;
    idx.push(a, b, c, b, d, c);                                                       // faces down
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = triplanarMaterial({ cliffA: 'rock_face_04', cliffB: 'rock_face_03', groundA: 'rock_face_04', groundB: 'rock_face_04', cliffScale: 1 / 300, groundScale: 1 / 300, tint: 0.8 });
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  // dim warm fill spread over the rooms, away from the openings, so rock and floor read in the dark
  const fills = [];
  for (const [, X, Z, e] of cand.slice().sort((A, B) => B[3] - A[3])) {
    if (e < 120) continue;
    if (holes.some(([hx, hz]) => Math.hypot(hx - X, hz - Z) < 700) || fills.some(([fx, fz]) => Math.hypot(fx - X, fz - Z) < 650)) continue;
    fills.push([X, Z]); if (fills.length >= 12) break;
  }
  return { mesh: m, holes, fills };
}

// a soft shaft of light falling through a cave opening, and the light it brings
export function lightShaft(x, z, r, top = 380) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x2 = c.getContext('2d');
  const gr = x2.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,236,200,0.55)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
  x2.fillStyle = gr; x2.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.5, top, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.22 }));
  shaft.position.set(x, top / 2, z); g.add(shaft);
  const pl = new THREE.PointLight(0xffd2a0, 14, 1700, 1); pl.position.set(x, 90, z); g.add(pl);
  return g;
}
