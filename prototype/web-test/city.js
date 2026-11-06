// Kar-es-Taal, the city past the canyon gate (remake). The 1997 city (JABALCIT/JABALSTR wall banks, the intro's
// fly-over) is an adobe kasbah in a desert basin: sand-plaster walls over stone footings, arched barred windows,
// wooden doors and roof beams, balconies and outside stairs, lattice tilework, wall posters, Information Consoles
// in the walls, the Mojo Ladder nightclub, and a blue dome over the doolan quarter. Built here from CC0 scans
// (Poly Haven) and the 1997 textures (posters, the club's sign), in world units like the canyon (~1 unit = 1 cm,
// characters at half scale: Charon ~95 tall).
//
// Layout (x east from the wall, z south):
//   gate plaza with a cistern -> the souk (main street, shaded) -> council square and the domed Council Hall;
//   north: the Jakhari workers' quarter and a construction site; south: a lane to the Mojo Ladder's square.
// Everything else is houses, generated per lot. Walls, roofs etc. are merged per material (few draw calls).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fbm } from './terrain.js';

// ---------------------------------------------------------------- layout
export const CITY = { x0: 6384, x1: 13400, z0: -520, z1: 3820 };
// walkable, paved areas: [x0, z0, x1, z1, kind, name]
export const STREETS = [
  [6384, 1060, 7500, 2300, 'plaza', 'gate plaza'],
  [7500, 1540, 9100, 1860, 'street', 'the souk'],
  [9100, 1470, 10650, 1800, 'street', 'the souk'],
  [10650, 1050, 11350, 2450, 'plaza', 'council square'],
  [6950, 280, 7230, 1060, 'street', 'workers’ row'],
  [6950, 280, 9650, 540, 'street', 'workers’ row'],
  [9380, 540, 9620, 1470, 'street', 'water lane'],
  [8150, -380, 9050, 280, 'site', 'building site'],
  [8250, 1860, 8500, 2720, 'street', 'lantern lane'],
  [8250, 2720, 10500, 2960, 'street', 'lantern lane'],
  [9600, 2960, 10500, 3300, 'plaza', 'Mojo square'],
  [10500, 2300, 10760, 2960, 'street', 'council steps'],
  [6700, 2300, 6920, 3100, 'street', 'well alley'],
  [6700, 2900, 8250, 3100, 'street', 'well alley'],
];
const HALL = [11350, 1150, 12550, 2350];          // the Council Hall's platform
const CLUB = [9640, 3300, 10460, 3720];           // the Mojo Ladder
const CISTERN = [6960, 1680];
const inR = (x, z, r, m = 0) => x >= r[0] - m && x <= r[2] + m && z >= r[1] - m && z <= r[3] + m;
export const onStreet = (x, z, m = 0) => STREETS.some((r) => inR(x, z, r, m));

// ---------------------------------------------------------------- materials
const loader = new THREE.TextureLoader(), tcache = {};
function tx(url, srgb) {
  if (!tcache[url]) { const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; tcache[url] = t; }
  return tcache[url];
}
function pbr(id, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: o.tint ?? 0xffffff, roughness: o.rough ?? 1, metalness: o.metal ?? 0, vertexColors: !!o.vc,
    map: tx(`media/tex/${id}/diff.jpg`, true), normalMap: tx(`media/tex/${id}/nor.jpg`), envMap: o.env || null, envMapIntensity: o.envI ?? 0.5 });
  if (o.roughMap !== false) m.roughnessMap = tx(`media/tex/${id}/rough.jpg`);
  if (o.ns) m.normalScale.set(o.ns, o.ns);
  if (o.side) m.side = o.side;
  return m;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function makeMaterials(renderer) {
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const M = {
    plaster: pbr('clay_plaster', { vc: true }),
    rough: pbr('rough_plaster_broken', { vc: true }),
    fine: pbr('patterned_clay_plaster', { vc: true }),
    stone: pbr('sandstone_blocks_08', { vc: true }),
    wood: pbr('weathered_planks', { vc: true }),
    cloth: pbr('hessian_380', { vc: true, side: THREE.DoubleSide, roughMap: false }),
    metal: new THREE.MeshStandardMaterial({ map: tx('media/tex/metal_plate_02/diff.jpg', true), normalMap: tx('media/tex/metal_plate_02/nor.jpg'), roughness: 0.55, metalness: 0.45, vertexColors: true, envMap: env, envMapIntensity: 0.7 }),
    rust: pbr('rusty_metal_02', { vc: true, metal: 0.3, env }),
    dark: new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1, vertexColors: true }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.6, envMap: env, envMapIntensity: 0.4, vertexColors: true }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a53a, roughness: 0.32, metalness: 1, envMap: env, envMapIntensity: 1.2, vertexColors: true }),
    street: pbr('cobblestone_floor_08', { vc: true }),
    plaza: pbr('red_sandstone_pavement', { vc: true }),
    water: new THREE.MeshStandardMaterial({ color: 0x2f5a5c, roughness: 0.05, metalness: 0.2, envMap: env, envMapIntensity: 1.4, transparent: true, opacity: 0.88 }),
  };
  // glazed blue dome tiles (the intro's dome): a canvas colour map over a tile normal map
  const domeMap = canvasTex(512, 512, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const k = 0.78 + Math.random() * 0.3; g.fillStyle = `rgb(${Math.round(38 * k)},${Math.round(92 * k)},${Math.round(168 * k)})`;
      g.fillRect(x * 32, y * 32, 32, 32);
      if ((x + y) % 4 === 0) { g.fillStyle = 'rgba(230,190,90,0.85)'; g.beginPath(); g.moveTo(x * 32 + 16, y * 32 + 5); g.lineTo(x * 32 + 27, y * 32 + 16); g.lineTo(x * 32 + 16, y * 32 + 27); g.lineTo(x * 32 + 5, y * 32 + 16); g.fill(); }
    }
    g.strokeStyle = '#d8cfb8'; g.lineWidth = 2; for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(512, i * 32); g.stroke(); }
  });
  domeMap.wrapS = domeMap.wrapT = THREE.RepeatWrapping;
  M.dome = new THREE.MeshStandardMaterial({ map: domeMap, normalMap: tx('media/tex/square_tiled_wall/nor.jpg'), roughness: 0.28, metalness: 0.1, envMap: env, envMapIntensity: 1.1, vertexColors: true });
  // lattice tilework (the KARNET still's carved diamond lattice)
  const lat = canvasTex(256, 256, (g) => {
    g.fillStyle = '#b48a5c'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#6e4a2a'; g.lineWidth = 7;
    for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke(); g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke(); }
    g.fillStyle = '#d7b07a'; for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) { g.beginPath(); g.arc(x + 32, y, 8, 0, 7); g.fill(); g.beginPath(); g.arc(x, y + 32, 8, 0, 7); g.fill(); }
  });
  lat.wrapS = lat.wrapT = THREE.RepeatWrapping;
  M.lattice = new THREE.MeshStandardMaterial({ map: lat, normalMap: tx('media/tex/patterned_clay_plaster/nor.jpg'), roughness: 0.85, vertexColors: true });
  // the scans differ a lot in brightness: bring each to the sun-bleached sand of the 1997 city (gains measured
  // against a target colour in linear space; colours above 1 multiply the texture up)
  const gain = { plaster: [3.97, 4.8, 6.58], rough: [1.86, 2.03, 2.53], fine: [2.02, 2.18, 2.02], stone: [1.94, 2.0, 2.11],
    street: [1.45, 1.25, 1.04], plaza: [4.11, 3.48, 2.81], wood: [2.4, 2.1, 1.6], cloth: [1.55, 2.07, 2.97] };
  for (const [k, g] of Object.entries(gain)) M[k].color.setRGB(...g);
  M.env = env;
  return M;
}

// ---------------------------------------------------------------- geometry kit
// Every piece is baked into world space with world-scaled box-projected UVs and a vertex colour, then merged per material.
const S = {};   // material name -> [geometries]
const KEEP_UV = new Set(['posterA', 'posterB', 'door', 'vending', 'mojo', 'screen']);   // pictures, not tiling surfaces
let UVS = 260;  // world units per texture repeat for the current piece
const COL = new THREE.Color();
function bake(geo, mat, pos, rot = null, tint = 0xffffff, uvScale = UVS) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const m = new THREE.Matrix4();
  // rotations: yaw applied last (YXZ), so a tilt is made in the piece's own frame and then turned to its facade
  const e = rot ? new THREE.Euler(rot.x, rot.y, rot.z, 'YXZ') : null;
  m.compose(pos, e ? new THREE.Quaternion().setFromEuler(e) : new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
  const keep = KEEP_UV.has(mat) && g.attributes.uv, uv = keep ? g.attributes.uv.array : new Float32Array(p.count * 2);
  COL.set(tint);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (keep) { /* a picture: its own 0..1 UVs */ }
    else if (ay >= ax && ay >= az) { uv[i * 2] = x / uvScale; uv[i * 2 + 1] = z / uvScale; }
    else if (ax >= az) { uv[i * 2] = z / uvScale; uv[i * 2 + 1] = y / uvScale; }
    else { uv[i * 2] = x / uvScale; uv[i * 2 + 1] = y / uvScale; }
    col[i * 3] = COL.r; col[i * 3 + 1] = COL.g; col[i * 3 + 2] = COL.b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  (S[mat] = S[mat] || []).push(g);
}
// a box (w, h, d) standing on y = 0 at (x, z), turned by ry; taper pulls the top in by that fraction
function block(mat, x, y, z, w, h, d, { ry = 0, tint = 0xffffff, taper = 0, uv } = {}) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  if (taper) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 0.01) { p.setX(i, p.getX(i) * (1 - taper)); p.setZ(i, p.getZ(i) * (1 - taper)); } g.computeVertexNormals(); }
  bake(g, mat, new THREE.Vector3(x, y, z), ry ? new THREE.Euler(0, ry, 0) : null, tint, uv);
}
function cyl(mat, x, y, z, r0, r1, h, { seg = 10, rx = 0, ry = 0, rz = 0, tint = 0xffffff, uv } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, h / 2, 0);
  bake(g, mat, new THREE.Vector3(x, y, z), new THREE.Euler(rx, ry, rz), tint, uv);
}
// an arch outline (width w, height h, spring at s) as a Shape, centred on x = 0, standing on y = 0
function archShape(w, h, s = h - w / 2) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, s);
  sh.absarc(0, s, w / 2, Math.PI, 0, true); sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0); return sh;
}
function archGeo(w, h, depth) { const g = new THREE.ExtrudeGeometry(archShape(w, h, h - Math.min(w / 2, h * 0.45)), { depth, bevelEnabled: false, curveSegments: 6 }); return g; }
// place something on a facade: f = { x, z, nx, nz } a point on the wall and its outward normal; u along the wall
function onWall(f, u, y, out) { return new THREE.Vector3(f.x + f.tx * u + f.nx * out, y, f.z + f.tz * u + f.nz * out); }
const yawOf = (f) => Math.atan2(f.nx, f.nz);       // turns local +z to the facade's outward normal

// a window: a dark arched opening with a surround, an iron grille, a sill; sometimes shutters or a little balcony
function window_(f, u, y, rnd, style) {
  const w = style === 'doolan' ? 54 : 46, h = style === 'doolan' ? 92 : 78, ry = yawOf(f);
  bake(archGeo(w + 16, h + 12, 4), style === 'doolan' ? 'stone' : 'plaster', onWall(f, u, y - 6, 0.5), new THREE.Euler(0, ry, 0), style === 'doolan' ? 0xe8dcc4 : 0xd8c4a4, 120);
  bake(archGeo(w, h, 3), 'dark', onWall(f, u, y, 3.6), new THREE.Euler(0, ry, 0), 0xffffff);
  for (const k of [-0.25, 0, 0.25]) bake(new THREE.BoxGeometry(2.4, h - 8, 2.4).translate(0, (h - 8) / 2, 0), 'iron', onWall(f, u + k * w, y + 2, 7.5), new THREE.Euler(0, ry, 0));
  bake(new THREE.BoxGeometry(w - 4, 2.4, 2.4).translate(0, 0, 0), 'iron', onWall(f, u, y + h * 0.5, 7.5), new THREE.Euler(0, ry, 0));
  bake(new THREE.BoxGeometry(w + 18, 6, 12), 'wood', onWall(f, u, y - 3, 6), new THREE.Euler(0, ry, 0), 0xcaa27a, 90);
  if (style !== 'doolan' && rnd() < 0.3) for (const sgn of [-1, 1])                 // wooden shutters, open
    bake(new THREE.BoxGeometry(w / 2, h * 0.72, 3).translate(0, h * 0.36, 0), 'wood', onWall(f, u + sgn * (w * 0.75 + 6), y + 2, 4), new THREE.Euler(0, ry + sgn * 0.25, 0), rnd() < 0.5 ? 0x9a6b44 : 0x5f7a86, 80);
}
function door_(f, u, rnd, style) {
  const w = style === 'doolan' ? 92 : 74, h = style === 'doolan' ? 170 : 140, ry = yawOf(f);
  bake(archGeo(w + 24, h + 16, 6), 'stone', onWall(f, u, 0, 0.5), new THREE.Euler(0, ry, 0), 0xe0cfb2, 120);
  bake(archGeo(w, h, 4), 'wood', onWall(f, u, 0, 5), new THREE.Euler(0, ry, 0), rnd() < 0.3 ? 0x6b8790 : rnd() < 0.5 ? 0x8a3a2a : 0xb08254, 70);
  for (const k of [0.3, 0.62]) bake(new THREE.BoxGeometry(w - 6, 4, 3), 'iron', onWall(f, u, h * k, 10), new THREE.Euler(0, ry, 0));
  bake(new THREE.BoxGeometry(w + 30, 8, 26), 'stone', onWall(f, u, 0, 10), new THREE.Euler(0, ry, 0), 0xcdb894, 90);   // threshold step
}
// a shop front: a wide dark arch with a cloth awning on poles over it
function shop_(f, u, rnd, out) {
  const w = 120, h = 130, ry = yawOf(f);
  bake(archGeo(w, h, 4), 'dark', onWall(f, u, 0, 2), new THREE.Euler(0, ry, 0));
  bake(archGeo(w + 22, h + 14, 4), 'stone', onWall(f, u, 0, 0.5), new THREE.Euler(0, ry, 0), 0xd6c19c, 120);
  const tint = [0xb8452e, 0xd8b25a, 0x4b6f8e, 0xe8dcc0, 0x7a8f4a][Math.floor(rnd() * 5)];
  const aw = new THREE.PlaneGeometry(w + 40, 90, 1, 4); aw.rotateX(-Math.PI / 2 + 0.38); aw.translate(0, 0, 40);
  bake(aw, 'cloth', onWall(f, u, h + 40, 0), new THREE.Euler(0, ry, 0), tint, 140);
  for (const s of [-1, 1]) cyl('wood', ...onWall(f, u + s * (w / 2 + 16), 0, 80).toArray(), 2.5, 2.5, h + 10, { seg: 6, tint: 0x8a6a48 });
  if (out) out.push(onWall(f, u, 0, 60));
}
function poster_(f, u, y, which) { const P = new THREE.PlaneGeometry(which ? 120 : 110, which ? 63 : 48); bake(P, which ? 'posterB' : 'posterA', onWall(f, u, y, 1.6), new THREE.Euler(0, yawOf(f), 0)); }
function console_(f, u, cons) {
  const ry = yawOf(f);
  bake(new THREE.BoxGeometry(64, 82, 10).translate(0, 41, 0), 'metal', onWall(f, u, 66, 5), new THREE.Euler(0, ry, 0), 0x8a8478);
  bake(new THREE.PlaneGeometry(46, 36), 'screen', onWall(f, u, 120, 10.4), new THREE.Euler(0, ry, 0));
  bake(new THREE.BoxGeometry(70, 6, 18), 'metal', onWall(f, u, 150, 9), new THREE.Euler(0, ry, 0), 0x6a645a);
  cons.push(onWall(f, u, 0, 40));
}
function lamp_(f, u, y, lamps) {
  const ry = yawOf(f);
  bake(new THREE.BoxGeometry(4, 4, 34).translate(0, 0, 17), 'iron', onWall(f, u, y, 0), new THREE.Euler(0, ry, 0));
  lamps.push({ p: onWall(f, u, y - 34, 32), ry });
}

// ---------------------------------------------------------------- buildings
function house(lot, rnd, ctx) {
  const [x0, z0, x1, z1] = lot, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const district = cx > 10300 || cz > 2500 ? 'doolan' : cz < 1000 ? 'worker' : 'souk';
  const edge = x0 <= CITY.x0 + 5 || x1 >= CITY.x1 - 5 || z0 <= CITY.z0 + 5 || z1 >= CITY.z1 - 5;
  let storeys = district === 'doolan' ? 2 + Math.floor(rnd() * 3) : district === 'worker' ? 1 + Math.floor(rnd() * 2.6) : 2 + Math.floor(rnd() * 2);
  if (edge) storeys += 1;
  const SH = 175, H = storeys * SH;
  const wallMat = district === 'worker' ? 'rough' : district === 'doolan' && rnd() < 0.5 ? 'fine' : 'plaster';
  const warm = district === 'doolan' ? [0xffffff, 0xfff6e8, 0xfaf0e0, 0xfff2dc] : [0xfff4e2, 0xffecd4, 0xf6e0c4, 0xffe8cc, 0xf2dcc0, 0xffffff];
  const tint = warm[Math.floor(rnd() * warm.length)];
  // footing, body (tapering a touch, as mud walls do), a setback upper storey on some
  block('stone', cx, 0, cz, w + 6, 34 + rnd() * 30, d + 6, { tint: 0xf0e2c8, uv: 90 });
  const split = storeys >= 3 && rnd() < 0.55;
  const lowH = split ? (storeys - 1) * SH : H;
  block(wallMat, cx, 0, cz, w, lowH, d, { tint, taper: 0.012, uv: 150 });
  const roofs = [[x0, z0, x1, z1, lowH]];
  if (split) {
    const fx = 0.55 + rnd() * 0.25, fz = 0.55 + rnd() * 0.25, ux = rnd() < 0.5 ? x0 : x1 - w * fx, uz = rnd() < 0.5 ? z0 : z1 - d * fz;
    block(wallMat, ux + w * fx / 2, lowH, uz + d * fz / 2, w * fx, SH, d * fz, { tint, taper: 0.02, uv: 150 });
    roofs.push([ux, uz, ux + w * fx, uz + d * fz, H]);
  }
  // parapets round each roof, crenellated on the doolan houses and the tall edge houses
  for (const [a, b, c, e, y] of roofs) {
    const pw = 12, ph = 34;
    block(wallMat, (a + c) / 2, y, b + pw / 2, c - a, ph, pw, { tint, uv: 150 }); block(wallMat, (a + c) / 2, y, e - pw / 2, c - a, ph, pw, { tint, uv: 150 });
    block(wallMat, a + pw / 2, y, (b + e) / 2, pw, ph, e - b, { tint, uv: 150 }); block(wallMat, c - pw / 2, y, (b + e) / 2, pw, ph, e - b, { tint, uv: 150 });
    if (district === 'doolan' || (edge && rnd() < 0.6)) {
      for (let t = a + 30; t < c - 20; t += 46) { block(wallMat, t, y + ph, b + pw / 2, 20, 18, pw, { tint }); block(wallMat, t, y + ph, e - pw / 2, 20, 18, pw, { tint }); }
      for (let t = b + 30; t < e - 20; t += 46) { block(wallMat, a + pw / 2, y + ph, t, pw, 18, 20, { tint }); block(wallMat, c - pw / 2, y + ph, t, pw, 18, 20, { tint }); }
    }
    // roof clutter
    const rx = (q) => a + 40 + q * (c - a - 80), rz = (q) => b + 40 + q * (e - b - 80);
    const k = rnd();
    if (k < 0.22) { const X = rx(rnd()), Z = rz(rnd()); cyl('metal', X, y, Z, 34, 34, 70, { seg: 14, tint: 0xa8a090 }); cyl('metal', X, y + 70, Z, 34, 4, 14, { seg: 14, tint: 0x9a9284 }); for (const s of [-1, 1]) cyl('iron', X + s * 24, y - 20, Z, 2.5, 2.5, 20, { seg: 5 }); }
    else if (k < 0.38) { const X = rx(rnd()), Z = rz(rnd()); cyl('rust', X, y, Z, 16, 16, 120, { seg: 10 }); for (let i = 0; i < 6; i++) cyl('metal', X, y + 30 + i * 14, Z, 30, 30, 3, { seg: 12, tint: 0xbab2a4 }); cyl('iron', X, y + 120, Z, 1.6, 1.6, 60, { seg: 4 }); ctx.condensers.push([X, y + 180, Z]); }
    else if (k < 0.52) { const X = rx(rnd()), Z = rz(rnd()); cyl('iron', X, y, Z, 2, 1.2, 160 + rnd() * 120, { seg: 5 }); }
    else if (k < 0.68 && c - a > 160 && e - b > 160) {                        // a cloth shade on poles over the roof terrace
      const X = rx(0.5), Z = rz(0.5), sw = Math.min(160, c - a - 60), sd = Math.min(140, e - b - 60);
      for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl('wood', X + p * sw / 2, y, Z + q * sd / 2, 2.4, 2.4, 110, { seg: 5, tint: 0x8a6a48 });
      const cl = new THREE.PlaneGeometry(sw + 10, sd + 10, 6, 6); cl.rotateX(-Math.PI / 2);
      const cp = cl.attributes.position; for (let i = 0; i < cp.count; i++) cp.setY(i, -8 * (1 - (2 * cp.getX(i) / sw) ** 2) * (1 - (2 * cp.getZ(i) / sd) ** 2));
      bake(cl, 'cloth', new THREE.Vector3(X, y + 110, Z), null, [0xd8c8a8, 0xb8452e, 0x4b6f8e, 0xc8a050][Math.floor(rnd() * 4)], 140);
    }
    if (district === 'doolan' && rnd() < 0.18 && c - a > 200 && e - b > 200) {   // a small tiled dome
      const r = Math.min(c - a, e - b) * 0.28; const dm = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dm.scale(1, 1.15, 1);
      cyl(wallMat, (a + c) / 2, y, (b + e) / 2, r, r, 30, { seg: 20, tint }); bake(dm, 'dome', new THREE.Vector3((a + c) / 2, y + 30, (b + e) / 2), null, 0xffffff, r * 2);
      cyl('gold', (a + c) / 2, y + 30 + r * 1.15, (b + e) / 2, 5, 1, 34, { seg: 6 });
    }
  }
  // facades: only on the sides that face a street or square
  const faces = [
    { x: cx, z: z0, nx: 0, nz: -1, tx: 1, tz: 0, len: w }, { x: cx, z: z1, nx: 0, nz: 1, tx: -1, tz: 0, len: w },
    { x: x0, z: cz, nx: -1, nz: 0, tx: 0, tz: -1, len: d }, { x: x1, z: cz, nx: 1, nz: 0, tx: 0, tz: 1, len: d }];
  for (const f of faces) {
    const probe = (u) => onStreet(f.x + f.tx * u + f.nx * 50, f.z + f.tz * u + f.nz * 50);
    if (!probe(0) && !probe(f.len * 0.3) && !probe(-f.len * 0.3)) continue;
    const span = f.len - 90, n = Math.max(1, Math.floor(span / 165)), step = span / n;
    const slots = []; for (let i = 0; i < n; i++) slots.push(-span / 2 + step * (i + 0.5));
    const streetName = STREETS.find((r) => inR(f.x + f.nx * 50, f.z + f.nz * 50, r));
    const kind = streetName ? streetName[4] : 'street';
    // ground floor: a door, shop fronts on the souk and the plazas, consoles and posters here and there
    const di = Math.floor(rnd() * slots.length);
    slots.forEach((u, i) => {
      if (!probe(u)) return;
      if (i === di) door_(f, u, rnd, district);
      else if ((streetName && streetName[5] === 'the souk' || kind === 'plaza') && rnd() < 0.55 && district !== 'doolan') shop_(f, u, rnd, ctx.stallSpots);
      else if (rnd() < 0.5) window_(f, u, 70, rnd, district);
      else if (rnd() < 0.3 && kind !== 'site') console_(f, u, ctx.consoles);
      else if (rnd() < 0.5) poster_(f, u, 95 + rnd() * 40, rnd() < 0.5);
      if (rnd() < 0.22) lamp_(f, u + step / 2, 205, ctx.lamps);
    });
    // upper storeys: windows, a balcony now and then
    for (let s = 1; s < storeys; s++) {
      const y = s * SH + 52;
      if (split && s === storeys - 1) break;
      slots.forEach((u) => {
        if (!probe(u)) return;
        if (rnd() < 0.82) window_(f, u, y, rnd, district);
        if (s === 1 && rnd() < 0.12 && district !== 'worker') {                   // a wooden balcony
          const ry = yawOf(f);
          bake(new THREE.BoxGeometry(120, 8, 50), 'wood', onWall(f, u, y - 12, 25), new THREE.Euler(0, ry, 0), 0x9a7450, 90);
          for (let q = -55; q <= 55; q += 11) cyl('wood', ...onWall(f, u + q, y - 8, 47).toArray(), 1.6, 1.6, 46, { seg: 4, tint: 0x7a5636 });
          bake(new THREE.BoxGeometry(120, 5, 5), 'wood', onWall(f, u, y + 38, 47), new THREE.Euler(0, ry, 0), 0x7a5636);
          for (const q of [-50, 50]) bake(new THREE.BoxGeometry(6, 30, 40), 'wood', onWall(f, u + q, y - 44, 20), new THREE.Euler(0.55, ry, 0), 0x7a5636);
        }
      });
      if (district === 'doolan') bake(new THREE.BoxGeometry(f.len - 10, 26, 4), 'lattice', onWall(f, 0, s * SH - 6, 2), new THREE.Euler(0, yawOf(f), 0), 0xffffff, 120);
    }
    // roof beams (vigas) poking out under the parapet
    const roofY = (split ? lowH : H) - 20;
    for (let u = -f.len / 2 + 30; u < f.len / 2 - 20; u += 58) {
      if (!probe(u)) continue;
      const p = onWall(f, u, roofY, 0);
      cyl('wood', p.x, p.y, p.z, 3.8, 3.4, 24, { seg: 7, rx: Math.PI / 2, ry: yawOf(f), tint: 0x8a6440, uv: 60 });
    }
  }
  ctx.picks.push([cx, z0, z1, x0, x1, H]);
}

// ---------------------------------------------------------------- landmarks
function cistern(ctx) {
  const [X, Z] = CISTERN;
  const ring = new THREE.LatheGeometry([new THREE.Vector2(150, 0), new THREE.Vector2(176, 0), new THREE.Vector2(178, 48), new THREE.Vector2(168, 58), new THREE.Vector2(150, 54), new THREE.Vector2(148, 10)], 48);
  bake(ring, 'stone', new THREE.Vector3(X, 0, Z), null, 0xe2d0ae, 120);
  const W = new THREE.CircleGeometry(150, 48); W.rotateX(-Math.PI / 2); ctx.water.push([W, new THREE.Vector3(X, 38, Z)]);
  cyl('stone', X, 0, Z, 26, 22, 130, { seg: 16, tint: 0xd8c6a2 });
  const bowl = new THREE.LatheGeometry([new THREE.Vector2(10, 0), new THREE.Vector2(62, 14), new THREE.Vector2(66, 24), new THREE.Vector2(56, 22), new THREE.Vector2(10, 10)], 32);
  bake(bowl, 'stone', new THREE.Vector3(X, 130, Z), null, 0xe0cdaa, 90);
  cyl('gold', X, 150, Z, 6, 3, 40, { seg: 8 });
  for (let i = 0; i < 4; i++) {                                                        // lamp posts round the basin
    const a = i * Math.PI / 2 + Math.PI / 4, px = X + Math.cos(a) * 250, pz = Z + Math.sin(a) * 250;
    cyl('stone', px, 0, pz, 16, 13, 26, { seg: 10, tint: 0xe0cdaa }); cyl('iron', px, 26, pz, 4, 3, 200, { seg: 8 });
    bake(new THREE.BoxGeometry(4, 4, 30).translate(0, 0, 15), 'iron', new THREE.Vector3(px, 222, pz), new THREE.Euler(0, Math.atan2(X - px, Z - pz) + Math.PI, 0));
    ctx.lamps.push({ p: new THREE.Vector3(px - Math.sin(Math.atan2(X - px, Z - pz)) * 30, 188, pz - Math.cos(Math.atan2(X - px, Z - pz)) * 30), ry: 0 });
    ctx.blockers.push([px, pz, 24]);
  }
  ctx.blockers.push([X, Z, 190]); ctx.picks.push([X, Z - 178, Z + 178, X - 178, X + 178, 60, 'cistern']);
  ctx.spray.push(new THREE.Vector3(X, 170, Z));
}
function councilHall(ctx) {
  const [x0, z0, x1, z1] = HALL, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // stepped platform, west stairs to the square
  for (let i = 0; i < 4; i++) block('stone', cx + i * 10, i * 20, cz, x1 - x0 - i * 40 + 40, 20, z1 - z0 - i * 40 + 40, { tint: 0xe6d6b8, uv: 160 });
  const bx0 = x0 + 160, bx1 = x1 - 60, bz0 = z0 + 100, bz1 = z1 - 100, bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
  block('fine', bcx, 80, bcz, bx1 - bx0, 430, bz1 - bz0, { tint: 0xf2e6d0, taper: 0.01, uv: 320 });
  block('lattice', bcx, 470, bcz, bx1 - bx0 + 6, 40, bz1 - bz0 + 6, { uv: 120 });
  block('stone', bcx, 510, bcz, bx1 - bx0 + 30, 22, bz1 - bz0 + 30, { tint: 0xe6d6b8 });
  // drum and the great blue dome
  const R = 300;
  cyl('fine', bcx, 532, bcz, R + 10, R, 150, { seg: 48, tint: 0xf2e6d0, uv: 320 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; bake(archGeo(46, 96, 3), 'dark', new THREE.Vector3(bcx + Math.cos(a) * (R + 1), 556, bcz + Math.sin(a) * (R + 1)), new THREE.Euler(0, Math.PI / 2 - a, 0)); }
  cyl('gold', bcx, 682, bcz, R + 14, R + 14, 12, { seg: 48 });
  const dm = new THREE.SphereGeometry(R, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); dm.scale(1, 1.18, 1);
  bake(dm, 'dome', new THREE.Vector3(bcx, 694, bcz), null, 0xffffff, 140);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const rib = new THREE.TorusGeometry(R + 2, 3.5, 6, 40, Math.PI / 2); rib.rotateZ(0); rib.rotateY(a); rib.scale(1, 1.18, 1); bake(rib, 'gold', new THREE.Vector3(bcx, 694, bcz)); }
  cyl('gold', bcx, 694 + R * 1.18 - 6, bcz, 18, 4, 60, { seg: 10 }); const orb = new THREE.SphereGeometry(16, 12, 8); bake(orb, 'gold', new THREE.Vector3(bcx, 694 + R * 1.18 + 64, bcz));
  cyl('gold', bcx, 694 + R * 1.18 + 78, bcz, 2.5, 1, 70, { seg: 5 });
  // corner towers with small domes
  for (const [tx, tz] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]]) {
    cyl('fine', tx, 80, tz, 66, 56, 640, { seg: 20, tint: 0xf2e6d0, uv: 320 });
    cyl('lattice', tx, 640, tz, 58, 58, 34, { seg: 20, uv: 120 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bake(archGeo(18, 44, 3), 'dark', new THREE.Vector3(tx + Math.cos(a) * 57, 676, tz + Math.sin(a) * 57), new THREE.Euler(0, Math.PI / 2 - a, 0)); }
    cyl('fine', tx, 674, tz, 58, 58, 56, { seg: 20, tint: 0xf2e6d0 });
    const sd = new THREE.SphereGeometry(62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); sd.scale(1, 1.3, 1); bake(sd, 'dome', new THREE.Vector3(tx, 730, tz), null, 0xffffff, 60);
    cyl('gold', tx, 730 + 80, tz, 6, 1, 40, { seg: 6 });
  }
  // the west entrance: a tall gilded arch, steps, two lamps
  const f = { x: bx0, z: bcz, nx: -1, nz: 0, tx: 0, tz: -1, len: bz1 - bz0 };
  bake(archGeo(250, 330, 8), 'gold', onWall(f, 0, 80, 0.5), new THREE.Euler(0, yawOf(f), 0));
  bake(archGeo(220, 310, 8), 'dark', onWall(f, 0, 80, 3), new THREE.Euler(0, yawOf(f), 0));
  bake(new THREE.PlaneGeometry(150, 150), 'door', onWall(f, 0, 155, 11.5), new THREE.Euler(0, yawOf(f), 0));
  for (const s of [-1, 1]) { cyl('stone', bx0 - 40, 80, bcz + s * 170, 22, 18, 300, { seg: 12, tint: 0xe6d6b8 }); ctx.lamps.push({ p: new THREE.Vector3(bx0 - 40, 395, bcz + s * 170), ry: 0, post: true }); }
  for (let i = 0; i < 8; i++) { const u = (i / 7 - 0.5) * (bz1 - bz0 - 260); if (Math.abs(u) < 200) continue; window_(f, u, 220, () => 0.9, 'doolan'); }
  for (const [nx, nz, len, X, Z] of [[0, -1, bx1 - bx0, bcx, bz0], [0, 1, bx1 - bx0, bcx, bz1], [1, 0, bz1 - bz0, bx1, bcz]]) {
    const g = { x: X, z: Z, nx, nz, tx: -nz, tz: nx, len };
    for (let i = 0; i < 6; i++) { window_(g, (i / 5 - 0.5) * (len - 240), 220, () => 0.9, 'doolan'); }
  }
  ctx.picks.push([cx, z0, z1, x0, x1, 900, 'the Council Hall']);
}
function mojoLadder(ctx) {
  const [x0, z0, x1, z1] = CLUB, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = 3 * 175 + 30;
  block('stone', cx, 0, cz, x1 - x0 + 6, 50, z1 - z0 + 6, { tint: 0x9a8a78 });
  // painted a deep oxblood (the 1997 club's front), weathered by the plaster under it
  const red = 0xe89a80;
  block('plaster', cx, 0, cz, x1 - x0, H, z1 - z0, { tint: red, taper: 0.01, uv: 150 });
  for (const zz of [z0 + 6, z1 - 6]) block('plaster', cx, H, zz, x1 - x0, 34, 12, { tint: red });
  for (const xx of [x0 + 6, x1 - 6]) block('plaster', xx, H, cz, 12, 34, z1 - z0, { tint: red });
  // the roof: a lit rooftop bar under a cloth, condensers, a mast with a red light
  block('wood', cx - 120, H, cz + 40, 260, 10, 180, { tint: 0x9a7450 });
  for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl('wood', cx - 120 + p * 120, H, cz + 40 + q * 80, 2.5, 2.5, 120, { seg: 5, tint: 0x7a5636 });
  const cl = new THREE.PlaneGeometry(270, 190, 4, 4); cl.rotateX(-Math.PI / 2); bake(cl, 'cloth', new THREE.Vector3(cx - 120, H + 120, cz + 40), null, 0x9a2a2a, 140);
  cyl('rust', cx + 200, H, cz + 100, 16, 16, 110, { seg: 10 }); cyl('rust', cx + 260, H, cz - 60, 16, 16, 110, { seg: 10 });
  cyl('iron', cx + 280, H, cz + 150, 2.5, 1.5, 260, { seg: 5 }); ctx.neon.push(new THREE.Vector3(cx + 280, H + 262, cz + 150));
  const f = { x: cx, z: z0, nx: 0, nz: -1, tx: 1, tz: 0, len: x1 - x0 };
  // the door: the 1997 steel door, under a canopy
  bake(new THREE.PlaneGeometry(130, 130), 'door', onWall(f, 0, 65, 1.5), new THREE.Euler(0, yawOf(f), 0));
  bake(new THREE.BoxGeometry(220, 10, 90), 'metal', onWall(f, 0, 176, 45), new THREE.Euler(0, yawOf(f), 0), 0x3a3634);
  // the sign: the 1997 logo on a board, a neon frame, glowing
  bake(new THREE.BoxGeometry(400, 190, 10), 'iron', onWall(f, 0, 230, 5), new THREE.Euler(0, yawOf(f), 0));
  bake(new THREE.PlaneGeometry(380, 170), 'mojo', onWall(f, 0, 315, 10.4), new THREE.Euler(0, yawOf(f), 0));
  for (const [u, y, w, h] of [[0, 228, 400, 6], [0, 412, 400, 6], [-200, 230, 6, 186], [200, 230, 6, 186]]) bake(new THREE.BoxGeometry(w, h, 6).translate(0, h / 2, 0), 'neon', onWall(f, u, y, 12), new THREE.Euler(0, yawOf(f), 0));
  ctx.neon.push(onWall(f, 0, 320, 120));
  // the vending machine, posters, a ladder up the front (the club's name)
  bake(new THREE.PlaneGeometry(190, 95).translate(0, 47.5, 0), 'vending', onWall(f, -270, 2, 1.5), new THREE.Euler(0, yawOf(f), 0));
  for (const u of [-330, 250, 330]) poster_(f, u, 110, u > 0);
  for (const u of [-250, 250]) window_(f, u, 260, () => 0.9, 'souk');
  // a tall wooden ladder leaning up the front to the roof bar (the club's name)
  const lean = 0.16, LL = H / Math.cos(lean) + 30, lry = yawOf(f);
  for (const s2 of [-24, 24]) bake(new THREE.BoxGeometry(5, LL, 5).translate(0, LL / 2, 0), 'wood', onWall(f, 310 + s2, 0, Math.sin(lean) * LL + 4), new THREE.Euler(-lean, lry, 0), 0xa07a50, 80);
  for (let y = 30; y < LL - 10; y += 34) bake(new THREE.BoxGeometry(48, 3.5, 3.5), 'wood', onWall(f, 310, Math.cos(lean) * y, Math.sin(lean) * (LL - y) + 4), new THREE.Euler(0, lry, 0), 0x8a6a48, 80);
  ctx.picks.push([cx, z0, z1, x0, x1, H, 'the Mojo Ladder']);
}
function buildingSite(ctx, rnd) {
  // a house going up in the workers' quarter: walls to half height, scaffolding, a crane, materials
  const [x0, z0, x1, z1] = [8300, -300, 8780, 120], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  block('stone', cx, 0, cz, x1 - x0, 40, z1 - z0, { tint: 0xc8b490 });
  for (const [x, z, w, d, h] of [[cx, z0 + 10, x1 - x0, 20, 300], [x0 + 10, cz, 20, z1 - z0, 240], [x1 - 10, cz - 60, 20, z1 - z0 - 120, 360], [cx - 120, z1 - 10, 220, 20, 180]])
    block('rough', x, 0, z, w, h, d, { tint: 0xcaa880, uv: 300 });
  // scaffold along the south side
  for (let x = x0 - 10; x <= x1 + 10; x += 80) for (const z of [z1 + 30, z1 + 90]) cyl('wood', x, 0, z, 3, 3, 420, { seg: 5, tint: 0x9a7a54 });
  for (const y of [140, 280, 410]) { block('wood', cx, y, z1 + 60, x1 - x0 + 40, 6, 70, { tint: 0xb08a5c, uv: 120 }); block('wood', cx, y + 50, z1 + 92, x1 - x0 + 40, 4, 4, { tint: 0x8a6a48 }); }
  for (let x = x0; x < x1; x += 160) { const br = new THREE.CylinderGeometry(2, 2, 200, 4); br.rotateZ(0.7); bake(br, 'wood', new THREE.Vector3(x + 70, 210, z1 + 92), null, 0x8a6a48); }
  // the crane: a lattice mast, a jib, a hook
  const mx = 8960, mz = -180, MH = 980;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl('rust', mx + a * 22, 0, mz + b * 22, 3.5, 3.5, MH, { seg: 5 });
  for (let y = 40; y < MH; y += 70) { block('rust', mx, y, mz - 22, 44, 3, 3); block('rust', mx, y, mz + 22, 44, 3, 3); block('rust', mx - 22, y, mz, 3, 3, 44); block('rust', mx + 22, y, mz, 3, 3, 44); }
  block('rust', mx - 360, MH, mz, 980, 26, 26, {}); block('metal', mx + 170, MH - 60, mz, 90, 80, 70, { tint: 0x8a7a60 });
  cyl('iron', mx - 620, MH - 300, mz, 1.2, 1.2, 300, { seg: 4 }); block('iron', mx - 620, MH - 330, mz, 30, 30, 30);
  // materials lying about
  for (let i = 0; i < 5; i++) block('stone', 8250 + rnd() * 700, 0, 160 + rnd() * 100, 60 + rnd() * 40, 30, 40 + rnd() * 30, { tint: 0xd6c09a, ry: rnd() * 3 });
  for (let i = 0; i < 4; i++) block('wood', 8900 + rnd() * 120, i * 8, 100 + rnd() * 120, 180, 8, 18, { ry: 0.3 + rnd() * 0.2, tint: 0xb08a5c });
  ctx.models.push(['wooden_crate_02', new THREE.Vector3(8220, 0, 200), 0.3, 60], ['wooden_crate_02', new THREE.Vector3(8270, 0, 230), 1.1, 55], ['wooden_crate_02', new THREE.Vector3(8240, 55, 210), 0.7, 50],
    ['Barrel_01', new THREE.Vector3(9000, 0, 180), 0, 50], ['Barrel_01', new THREE.Vector3(9030, 0, 230), 0, 50], ['wooden_ladder', new THREE.Vector3(8500, 0, z1 + 40), 0, 240, 0.25]);
  ctx.blockers.push([cx, cz, 300], [mx, mz, 60]); ctx.picks.push([cx, z0, z1 + 100, x0, x1, 420, 'a house going up']);
}
function market(ctx, rnd) {
  // stalls: a table under a slanted cloth on poles, wares on the table
  const stall = (X, Z, ry) => {
    const q = new THREE.Euler(0, ry, 0), at = (u, v, y) => new THREE.Vector3(X + Math.cos(ry) * u + Math.sin(ry) * v, y, Z - Math.sin(ry) * u + Math.cos(ry) * v);
    bake(new THREE.BoxGeometry(150, 8, 70), 'wood', at(0, 0, 72), q, 0xa07a50, 90);
    for (const [u, v] of [[-68, -28], [68, -28], [-68, 28], [68, 28]]) cyl('wood', ...at(u, v, 0).toArray(), 3, 3, 72, { seg: 5, tint: 0x7a5636 });
    for (const [u, v, h] of [[-80, -45, 190], [80, -45, 190], [-80, 45, 160], [80, 45, 160]]) cyl('wood', ...at(u, v, 0).toArray(), 2.5, 2.5, h, { seg: 5, tint: 0x8a6a48 });
    const cl = new THREE.PlaneGeometry(190, 110, 4, 2); cl.rotateX(-Math.PI / 2 + 0.27);
    bake(cl, 'cloth', at(0, 0, 176), q, [0xb8452e, 0xd8b25a, 0x4b6f8e, 0xe8dcc0, 0x7a8f4a, 0x9a5a8a][Math.floor(rnd() * 6)], 140);
    const wares = ['ceramic_vase_01', 'ceramic_vase_03', 'antique_ceramic_vase_01', 'brass_pot_01', 'wooden_bucket_01'];
    for (let i = 0; i < 4; i++) ctx.models.push([wares[Math.floor(rnd() * wares.length)], at(-55 + i * 36, (rnd() - 0.5) * 30, 76), rnd() * 6, 18 + rnd() * 12]);
    ctx.models.push(['wooden_crate_02', at(95 + rnd() * 20, -20, 0), rnd(), 42], ['ceramic_vase_03', at(-100, 30, 0), 0, 42]);
    for (const u of [-45, 45]) { const q = at(u, -12, 0); ctx.blockers.push([q.x, q.z, 30]); }      // the table, against its wall
    ctx.picks.push([X, Z - 60, Z + 60, X - 90, X + 90, 180, 'a market stall']);
  };
  // gate plaza: rows of stalls along its north and south sides, clear of the walkway from the gate
  for (let x = 6600; x < 7400; x += 230) { stall(x, 1150, 0); stall(x + 100, 2210, Math.PI); }
  // the souk: stalls against the walls, alternating sides
  for (let x = 7700; x < 10500; x += 420) { const n = x < 9100; stall(x, (n ? 1540 : 1470) + 52, 0); stall(x + 210, (n ? 1860 : 1800) - 52, Math.PI); }
  // tea stall in council square: tables and stools
  for (const [X, Z] of [[10800, 1250], [10950, 1330], [10820, 2250], [10980, 2180]]) {
    ctx.models.push(['round_wooden_table_01', new THREE.Vector3(X, 0, Z), rnd() * 6, 70]);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + rnd(); ctx.models.push(['wooden_stool_01', new THREE.Vector3(X + Math.cos(a) * 55, 0, Z + Math.sin(a) * 55), rnd() * 6, 40]); }
    ctx.blockers.push([X, Z, 70]);
  }
  // planters and barrels about the streets
  for (const [X, Z] of [[6500, 1110], [6500, 2240], [7450, 1110], [7450, 2240], [10700, 1100], [10700, 2400], [9650, 3010], [10450, 3010]]) { ctx.models.push(['planter_pot_clay', new THREE.Vector3(X, 0, Z), 0, 60]); ctx.blockers.push([X, Z, 40]); }
  // shade cloths strung across the souk
  for (let x = 7650; x < 10500; x += 380) {
    const r = STREETS.find((s) => s[5] === 'the souk' && x >= s[0] && x < s[2]); const wz = r[3] - r[1];
    const cl = new THREE.PlaneGeometry(150, wz + 40, 3, 10); cl.rotateX(-Math.PI / 2);
    const p = cl.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, -40 * (1 - (2 * p.getZ(i) / (wz + 40)) ** 2) + 10 * Math.sin(p.getX(i) / 40));
    bake(cl, 'cloth', new THREE.Vector3(x, 400, (r[1] + r[3]) / 2), new THREE.Euler(0, (rnd() - 0.5) * 0.3, 0), [0xd8c8a8, 0xb8452e, 0xc8a050, 0x4b6f8e][Math.floor(rnd() * 4)], 140);
  }
}

// ---------------------------------------------------------------- lots
function lots(rnd) {
  const out = [], min = 170;
  const split = (r, depth) => {
    const [a, b, c, d] = r, w = c - a, h = d - b;
    if ((w < 640 && h < 640 && depth > 2) || depth > 9) { out.push(r); return; }
    const t = 0.35 + rnd() * 0.3;
    if (w > h) { const m = Math.round(a + w * t); split([a, b, m, d], depth + 1); split([m, b, c, d], depth + 1); }
    else { const m = Math.round(b + h * t); split([a, b, c, m], depth + 1); split([a, m, c, d], depth + 1); }
  };
  split([CITY.x0, CITY.z0, CITY.x1, CITY.z1], 0);
  const ov = (r, s) => r[0] < s[2] && r[2] > s[0] && r[1] < s[3] && r[3] > s[1];
  const holes = [...STREETS.map((s) => s.slice(0, 4)), HALL, CLUB, [8150, -520, 9200, 300]];
  const res = [];
  for (let r of out) {
    let ok = true;
    for (let guard = 0; guard < 12; guard++) {
      const s = holes.find((h) => ov(r, h)); if (!s) break;
      const opts = [[r[0], r[1], s[0], r[3]], [s[2], r[1], r[2], r[3]], [r[0], r[1], r[2], s[1]], [r[0], s[3], r[2], r[3]]]
        .filter((q) => q[2] - q[0] >= min && q[3] - q[1] >= min);
      if (!opts.length) { ok = false; break; }
      opts.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1])); r = opts[0];
    }
    if (ok && !holes.some((h) => ov(r, h))) res.push(r);
  }
  // close the gaps left where a thin sliver between a lot and a street was dropped: grow each side out to a street
  // that lies within reach, so the houses front the streets
  const sx = STREETS.map((s) => s.slice(0, 4));
  for (const l of res) {
    const xo = (s) => s[0] < l[2] - 40 && s[2] > l[0] + 40, zo = (s) => s[1] < l[3] - 40 && s[3] > l[1] + 40;
    const near = (list, f) => list.length ? f(...list) : null;
    const s3 = near(sx.filter((s) => xo(s) && s[1] >= l[3] && s[1] - l[3] < 230).map((s) => s[1]), Math.min); if (s3 != null) l[3] = s3;
    const s1 = near(sx.filter((s) => xo(s) && s[3] <= l[1] && l[1] - s[3] < 230).map((s) => s[3]), Math.max); if (s1 != null) l[1] = s1;
    const s2 = near(sx.filter((s) => zo(s) && s[0] >= l[2] && s[0] - l[2] < 230).map((s) => s[0]), Math.min); if (s2 != null) l[2] = s2;
    const s0 = near(sx.filter((s) => zo(s) && s[2] <= l[0] && l[0] - s[2] < 230).map((s) => s[2]), Math.max); if (s0 != null) l[0] = s0;
  }
  return res;
}

// ---------------------------------------------------------------- the basin
// The city sits in a hollow: flat inside the city (a little below its streets), rising to cliffs all round
// except where the canyon wall stands; same triplanar rock and sand as the canyon.
function basin(material) {
  const X0 = CITY.x0 - 60, X1 = CITY.x1 + 2200, Z0 = CITY.z0 - 2200, Z1 = CITY.z1 + 2200, step = 24;
  const w = Math.ceil((X1 - X0) / step) + 1, h = Math.ceil((Z1 - Z0) / step) + 1;
  const pos = new Float32Array(w * h * 3), edge = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = X0 + i * step, Z = Z0 + j * step, q = j * w + i;
    const dx = Math.max(0, X - CITY.x1), dz = Math.max(0, CITY.z0 - Z, Z - CITY.z1);
    const d = Math.hypot(dx, dz) + fbm(X / 500, Z / 500, 3) * 120 - 60;
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // sheer cliff, a ledge, a second cliff, then hills: the canyon's profile, so its rock texture takes over
    let y = ss(60, 120, d) * 380 + ss(200, 250, d) * 300 + ss(700, 1600, d) * 500;
    y += ss(60, 200, d) * (fbm(X / 260, Z / 260, 4) * 110 + fbm(X / 80, Z / 80, 3) * 26);
    let x = X, z = Z;
    if (d > 40 && d < 900) { x += fbm(X / 200 + 4, Z / 200, 3) * 55; z += fbm(X / 200, Z / 200 + 9, 3) * 55; }
    if (d <= 0) y = -2 + fbm(X / 700, Z / 700, 2) * 1.5;
    pos.set([x, y, z], q * 3); edge[q] = 1 - ss(-260, 40, d);
  }
  const idx = []; for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i; idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(w * h * 2), 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = m.castShadow = true; return m;
}

// ---------------------------------------------------------------- build
export async function buildCity({ renderer, terrainMaterial, seed = 1997 }) {
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (const k of Object.keys(S)) delete S[k];
  const M = makeMaterials(renderer);
  const tex = (u) => { const t = tx(u, true); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  M.posterA = new THREE.MeshStandardMaterial({ map: tex('media/city/posters_a.png'), roughness: 0.9, vertexColors: true });
  M.posterB = new THREE.MeshStandardMaterial({ map: tex('media/city/posters_b.png'), roughness: 0.9, vertexColors: true });
  M.door = new THREE.MeshStandardMaterial({ map: tex('media/city/steel_door.png'), roughness: 0.6, metalness: 0.3, vertexColors: true });
  M.vending = new THREE.MeshStandardMaterial({ map: tex('media/city/vending.png'), emissiveMap: tex('media/city/vending.png'), emissive: 0x553322, roughness: 0.5, vertexColors: true });
  // the club's sign: the 1997 logo's red lettering keyed off its wall, redrawn as neon on a dark board
  const logo = await new THREE.ImageLoader().loadAsync('media/city/mojo_logo.png');
  const sign = canvasTex(760, 340, (g, W, H) => {
    g.fillStyle = '#120708'; g.fillRect(0, 0, W, H);
    const c = document.createElement('canvas'); c.width = logo.width; c.height = logo.height; const k = c.getContext('2d'); k.drawImage(logo, 0, 0);
    const d = k.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) { const r = px[i], gg = px[i + 1], b = px[i + 2]; const red = r > 90 && r > gg * 1.7 && r > b * 1.7; px[i] = 255; px[i + 1] = red ? 70 : 0; px[i + 2] = red ? 80 : 0; px[i + 3] = red ? 255 : 0; }
    k.putImageData(d, 0, 0);
    g.shadowColor = '#ff2a3a'; g.shadowBlur = 26; g.drawImage(c, 40, 20, W - 80, H - 40); g.shadowBlur = 12; g.drawImage(c, 40, 20, W - 80, H - 40);
  });
  M.mojo = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.6, vertexColors: true });
  M.neon = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2a3a, emissiveIntensity: 4, vertexColors: true });
  // Information Console screens: the KARNET service, blue text on dark
  const scr = canvasTex(256, 200, (g) => {
    g.fillStyle = '#04121c'; g.fillRect(0, 0, 256, 200); g.fillStyle = '#0d3a52'; g.fillRect(0, 0, 256, 34);
    g.fillStyle = '#8fe2ff'; g.font = 'bold 22px monospace'; g.fillText('KAR-NET', 12, 25);
    g.fillStyle = '#5cc2e6'; g.font = '15px monospace'; ['INFORMATION SERVICE', '> CITIZENS', '> PLACES', '> NOTICES', 'SELECT:_'].forEach((s, i) => g.fillText(s, 12, 62 + i * 28));
  });
  M.screen = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: 1.3, roughness: 0.3, vertexColors: true });

  const ctx = { picks: [], blockers: [], lamps: [], consoles: [], stallSpots: [], models: [], water: [], neon: [], spray: [], condensers: [] };
  const L = lots(rnd);
  for (const lot of L) house(lot, rnd, ctx);
  cistern(ctx); councilHall(ctx); mojoLadder(ctx); buildingSite(ctx, rnd); market(ctx, rnd);
  // paving: the streets and squares (the building site stays sand)
  STREETS.forEach((s, i) => {
    if (s[4] === 'site') return;
    const g = new THREE.PlaneGeometry(s[2] - s[0], s[3] - s[1]); g.rotateX(-Math.PI / 2);
    bake(g, s[4] === 'plaza' ? 'plaza' : 'street', new THREE.Vector3((s[0] + s[2]) / 2, 1.2 + i * 0.04, (s[1] + s[3]) / 2), null, s[4] === 'plaza' ? 0xf4e2c8 : 0xeedcc0, s[4] === 'plaza' ? 150 : 110);
  });

  const group = new THREE.Group();
  for (const [k, list] of Object.entries(S)) {
    const geo = mergeGeometries(list, false); if (!geo) continue;
    const mesh = new THREE.Mesh(geo, M[k]); mesh.castShadow = !['street', 'plaza', 'dark', 'screen', 'neon', 'mojo', 'posterA', 'posterB'].includes(k); mesh.receiveShadow = true;
    mesh.name = 'city-' + k; group.add(mesh);
  }
  for (const [g, p] of ctx.water) { const w = new THREE.Mesh(g, M.water); w.position.copy(p); group.add(w); }
  // lamps: hanging lanterns (model) with a warm glow (no light; the city is in daylight)
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb35a, emissiveIntensity: 2.2 });
  for (const l of ctx.lamps) { ctx.models.push(['Lantern_01', l.p.clone(), l.ry, l.post ? 70 : 34]); const b = new THREE.Mesh(new THREE.SphereGeometry(l.post ? 9 : 5, 8, 6), glow); b.position.copy(l.p).add(new THREE.Vector3(0, l.post ? 28 : 14, 0)); group.add(b); }
  for (const n of ctx.neon) { const pl = new THREE.PointLight(0xff3040, 2.2, 700, 1.4); pl.position.copy(n); group.add(pl); }
  // props: CC0 models (media/models), cloned per placement and scaled to a height
  const gl = new GLTFLoader(), cache = {};
  const model = (id) => (cache[id] = cache[id] || gl.loadAsync(`media/models/${id}.glb`).then((g) => {
    const m = g.scene; m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const b = new THREE.Box3().setFromObject(m); m.userData.h = b.max.y - b.min.y; m.userData.y0 = b.min.y; return m;
  }));
  await Promise.all(ctx.models.map(async ([id, p, ry, h, lean = 0]) => {
    try {
      const base = await model(id), m = base.clone(true), k = h / base.userData.h;
      m.scale.setScalar(k); m.position.set(p.x, p.y - base.userData.y0 * k, p.z); m.rotation.set(lean, ry, 0, 'YXZ'); group.add(m);
    } catch (e) { console.warn('city prop', id, e); }
  }));
  const ground = basin(terrainMaterial); group.add(ground);

  // picking: a box per building/landmark, unseen; the streets as named floor
  const name = (n) => new Proxy([], { get: (t, p) => (p === 'length' ? 1 : n) });
  const pick = [];
  const byName = {};
  for (const [cx, z0, z1, x0, x1, H, nm = 'house'] of ctx.picks) {
    const g = new THREE.BoxGeometry(x1 - x0, H, z1 - z0); g.translate((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    (byName[nm] = byName[nm] || []).push(g);
  }
  for (const [nm, list] of Object.entries(byName)) { const m = new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.visible = false; m.userData = { kind: 'wall', faceName: name(nm) }; pick.push(m); group.add(m); }
  for (const s of STREETS) {
    const g = new THREE.PlaneGeometry(s[2] - s[0], s[3] - s[1]); g.rotateX(-Math.PI / 2); g.translate((s[0] + s[2]) / 2, 2, (s[1] + s[3]) / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); m.visible = false; m.userData = { kind: 'floor', faceName: name(s[5]) }; pick.push(m); group.add(m);
  }
  // the moisture spray over the cistern: a soft drifting mist
  const mistTex = canvasTex(64, 64, (g) => { const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); });
  const mist = [];
  for (const p of ctx.spray) for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.35 }));
    s.userData = { p, ph: i / 14 }; s.scale.setScalar(60); group.add(s); mist.push(s);
  }
  group.userData.tick = (t) => {
    for (const s of mist) {
      const k = (t * 0.35 + s.userData.ph) % 1, a = s.userData.ph * 40;
      s.position.set(s.userData.p.x + Math.cos(a) * k * 120, s.userData.p.y + k * 60 - k * k * 160, s.userData.p.z + Math.sin(a) * k * 120);
      s.material.opacity = 0.35 * Math.sin(k * Math.PI); s.scale.setScalar(40 + k * 90);
    }
  };
  return {
    group, pick, blockers: ctx.blockers, streets: STREETS, bounds: { X0: CITY.x0 - 60, Z0: CITY.z0 - 2200, X1: CITY.x1 + 2200, Z1: CITY.z1 + 2200 },
    contains: (x, z) => x >= CITY.x0 - 10 && x <= CITY.x1 && z >= CITY.z0 && z <= CITY.z1,
    stats: { lots: L.length, meshes: group.children.length }, lots: L,
  };
}
