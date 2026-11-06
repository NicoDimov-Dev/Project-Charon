// Man-made parts of the remake canyon: the city wall with its gatehouse, and the city beyond.
// Materials are CC0 scans from Poly Haven (media/tex/<id>/), mapped in world units.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const loader = new THREE.TextureLoader();
const cache = {};
function map(url, srgb) {
  if (!cache[url]) { const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; cache[url] = t; }
  return cache[url];
}
// a PBR material whose textures repeat every `size` world units on each face of a box of w x h x d
function pbr(id, { metal = 0, rough = 1, tint = 0xffffff, env = null, has = ['diff', 'nor', 'rough'] } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: tint, metalness: metal, roughness: rough, envMap: env, envMapIntensity: 0.6 });
  if (has.includes('diff')) m.map = map(`media/tex/${id}/diff.jpg`, true);
  if (has.includes('nor')) { m.normalMap = map(`media/tex/${id}/nor.jpg`); m.normalScale.set(1, 1); }
  if (has.includes('rough')) m.roughnessMap = map(`media/tex/${id}/rough.jpg`);
  if (has.includes('metal')) m.metalnessMap = map(`media/tex/${id}/metal.jpg`);
  return m;
}
// box with UVs in world units / size (so every box shares one texture density)
function box(w, h, d, mat, size = 256) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i) + w / 2, y = pos.getY(i) + h / 2, z = pos.getZ(i) + d / 2, nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z / size, y / size); else if (ny > 0.5) uv.setXY(i, x / size, z / size); else uv.setXY(i, x / size, y / size);
  }
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}

// The city wall as 1997 has it (CANYON.WLD, 'city wall' tiles 8 and 20): one long face of grey stone blocks at
// x = face, the gate a single dark doorway one cell wide (z gate[0]..gate[1]) recessed a cell deep (to face + T),
// and, seen from the gate camera, a rounded tower on the doorway's near (south) side. The notice and the keypad
// hang on the face north of the doorway (game.js puts them there). Nothing stands out in front of the wall.
export function buildCityWall({ renderer, face = 6144, z0 = -260, z1 = 3330, height = 640, gate = [1280, 1536], T = 256 }) {
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const stone = pbr('rough_block_wall', { tint: 0xb9b4ac });
  const dark = pbr('rough_block_wall', { tint: 0x55524e });
  const steel = pbr('rusty_metal_shutter', { metal: 0.5, rough: 0.8, env, tint: 0x9c948a });
  const g = new THREE.Group();
  const [pa, pb] = gate, PW = pb - pa, SPRING = 210;                     // doorway width, arch springing
  const S = 300;                                                         // stone texture repeat (world units)
  // the wall body either side of the doorway
  for (const [a, b] of [[z0, pa], [pb, z1]]) { const seg = box(T, height, b - a, stone, S); seg.position.set(face + T / 2, height / 2, (a + b) / 2); g.add(seg); }
  // over the doorway: the wall above a round arch (the spandrels, shape in z, y), extruded through the wall
  const sh = new THREE.Shape(); sh.moveTo(0, SPRING); sh.lineTo(0, height); sh.lineTo(PW, height); sh.lineTo(PW, SPRING);
  sh.absarc(PW / 2, SPRING, PW / 2, 0, Math.PI, false);
  const ag = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 18 });
  { const p = ag.attributes.position, uv = ag.attributes.uv, n = ag.attributes.normal;
    for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i), x = p.getZ(i); uv.setXY(i, Math.abs(n.getZ(i)) > 0.5 ? z / S : x / S, y / S); } }
  const arch = new THREE.Mesh(ag, stone); arch.castShadow = arch.receiveShadow = true;
  arch.rotation.y = -Math.PI / 2; arch.position.set(face + T, 0, pa); g.add(arch);      // shape x -> world z, extrude -> world -x
  // a coping course along the top and a plinth at the foot, slightly proud of the face
  const len = z1 - z0;
  const cope = box(T + 24, 34, len, stone, S); cope.position.set(face + T / 2 - 12, height + 17, (z0 + z1) / 2); g.add(cope);
  const plinth = box(30, 60, pa - z0, stone, S); plinth.position.set(face - 15, 30, (z0 + pa) / 2); g.add(plinth);
  const plinth2 = box(30, 60, z1 - pb, stone, S); plinth2.position.set(face - 15, 30, (pb + z1) / 2); g.add(plinth2);
  // the tower on the doorway's south side: a round bastion, taller than the wall, with a slit window and a
  // battered (flared) foot
  const TR = 190, tz = pb + TR + 10, tx = face + 40, TH = height + 220;
  const tg = new THREE.CylinderGeometry(TR, TR * 1.12, TH, 40, 6, true);
  { const p = tg.attributes.position, uv = tg.attributes.uv;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); uv.setXY(i, (a + Math.PI) * TR / S, (p.getY(i) + TH / 2) / S); } }
  const tower = new THREE.Mesh(tg, stone); tower.castShadow = tower.receiveShadow = true; tower.position.set(tx, TH / 2, tz); g.add(tower);
  const tcap = new THREE.Mesh(new THREE.CylinderGeometry(TR + 14, TR + 14, 34, 40), stone); tcap.position.set(tx, TH + 17, tz); tcap.castShadow = true; g.add(tcap);
  const troof = new THREE.Mesh(new THREE.CircleGeometry(TR + 14, 40), dark); troof.rotation.x = -Math.PI / 2; troof.position.set(tx, TH + 34.5, tz); g.add(troof);
  for (let i = 0; i < 12; i++) {                                         // merlons round the tower top
    const a = (i / 12) * Math.PI * 2, m = box(46, 50, 40, stone, S); m.position.set(tx + Math.cos(a) * (TR + 2), TH + 34 + 25, tz + Math.sin(a) * (TR + 2)); m.rotation.y = -a; g.add(m);
  }
  for (const [y, a] of [[TH * 0.62, Math.PI * 0.86], [TH * 0.36, Math.PI * 0.98]]) {    // slit windows facing the canyon
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(26, 110), new THREE.MeshBasicMaterial({ color: 0x0a0908 }));
    slit.position.set(tx + Math.cos(a) * (TR + 4), y, tz + Math.sin(a) * (TR + 4)); slit.rotation.y = Math.PI / 2 - a; g.add(slit);
  }
  // merlons along the wall top
  for (let z = z0 + 40; z < z1; z += 120) {
    if (z > tz - TR - 30 && z < tz + TR + 30) continue;
    const m = box(36, 54, 60, stone, S); m.position.set(face - 2, height + 34 + 27, z); g.add(m);
  }
  // the gate: an iron-bound door set back in the doorway that rises into the wall when opened (userData.open())
  const dx = face + 60;
  const door = box(14, SPRING + PW / 2, PW + 20, steel, 160); door.position.set(dx, (SPRING + PW / 2) / 2, (pa + pb) / 2); g.add(door);
  let doorT = -1; g.userData.passage = [face - 30, pa + 12, face + T + 20, pb - 12];
  g.userData.open = () => { if (doorT < 0) doorT = 0; };
  let lastT = 0;
  g.userData.tick = (t) => {
    if (doorT >= 0 && doorT < 1) { doorT = Math.min(1, doorT + Math.min(0.05, t - lastT) / 3.2); const k = doorT * doorT * (3 - 2 * doorT); door.position.y = (SPRING + PW / 2) / 2 + k * (SPRING + PW / 2 + 10); }
    lastT = t;
  };
  return g;
}

// The keycode panel on the city wall (1997 'city wall' tile 20 shows it set into the stone): a recessed steel
// box with a lit display and 12 keys, built facing +z, centred on its face at (0, 0, 0).
export function buildWallKeypad({ renderer }) {
  const env = envOf(renderer);
  const body = pbr('metal_plate_02', { metal: 0.35, rough: 0.6, env, tint: 0x8a857c, has: ['diff', 'nor', 'rough', 'metal'] });
  const g = new THREE.Group(), W = 56, H = 78;
  mesh(scaleUV(new THREE.BoxGeometry(W + 10, H + 10, 6), 1 / 100), body, g, 0, 0, -1);
  mesh(new THREE.BoxGeometry(W, H, 2), new THREE.MeshStandardMaterial({ color: 0x1a1918, roughness: 0.6 }), g, 0, 0, 2.2);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const k = c.getContext('2d');
  k.fillStyle = '#04141a'; k.fillRect(0, 0, 256, 128); k.fillStyle = '#7fe8ff'; k.font = 'bold 22px monospace'; k.fillText('ENTER CODE', 16, 36);
  k.strokeStyle = '#5fd0ee'; k.lineWidth = 3; for (let i = 0; i < 6; i++) k.strokeRect(14 + i * 39, 60, 32, 44);
  const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.PlaneGeometry(44, 22), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 1.4 }), g, 0, 22, 3.4).castShadow = false;
  const kd = new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.45, metalness: 0.4 });
  for (let i = 0; i < 12; i++) mesh(new THREE.BoxGeometry(11, 8, 3), kd, g, ((i % 3) - 1) * 14, 0 - Math.floor(i / 3) * 10.5, 4);
  const led = mesh(new THREE.SphereGeometry(2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a2010, emissive: 0x3dff6a, emissiveIntensity: 3 }), g, 20, -36, 3.5); led.castShadow = false;
  return { group: g, face: { center: new THREE.Vector3(0, 0, 4), width: W, height: H } };
}

// ---------------------------------------------------------------- gate forecourt props
// Both are built facing +z (toward the viewer) standing on y = 0, in world units (~1 unit = 1 cm).
const scaleUV = (geo, k) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return geo; };
const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
const image = (url) => new THREE.ImageLoader().loadAsync(url);
let ENV = null;
const envOf = (renderer) => (ENV = ENV || new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
function hazardTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#161512'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#c9961a';
  for (let i = -2; i < 18; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 0); g.fill(); }
  g.globalAlpha = 0.35; for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#6b5a3a'; g.fillRect(Math.random() * 256, Math.random() * 32, 1 + Math.random() * 3, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

// The city's entry terminal: a pedestal kiosk with a tilted control face (lit display, 12 keys under glass),
// hood, status light, ID slot and a conduit into the ground. Returns { group, face } where face = { center, normal-tilt }
// so the caller can lay its click area over the control face; group.userData.tick(t) blinks the light.
export function buildEntryTerminal({ renderer }) {
  const env = envOf(renderer);
  const body = pbr('metal_plate_02', { metal: 0.3, rough: 0.6, env, tint: 0xb4aea4, has: ['diff', 'nor', 'rough', 'metal'] });
  const dark = pbr('metal_plate_02', { metal: 0.35, rough: 0.5, env, tint: 0x5a5852, has: ['diff', 'nor', 'rough', 'metal'] });
  const rust = pbr('rusty_metal_02', { metal: 0.4, rough: 0.85, env, tint: 0xc9b8a6 });
  const conc = pbr('concrete_slab_wall', { tint: 0xd9c6ae });
  const g = new THREE.Group();
  // footing with a hazard edge and anchor bolts
  mesh(scaleUV(new THREE.BoxGeometry(120, 22, 100), 1 / 160), conc, g, 0, 11, 0);
  const hz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.75 });
  for (const [w, x, z, r] of [[120, 0, 50.2, 0], [120, 0, -50.2, Math.PI], [100, 60.2, 0, Math.PI / 2], [100, -60.2, 0, -Math.PI / 2]]) {
    const p = mesh(new THREE.PlaneGeometry(w, 7), hz, g, x, 17, z); p.rotation.y = r; p.material.map.repeat.set(w / 60, 1);
  }
  for (const [x, z] of [[-48, -38], [48, -38], [-48, 38], [48, 38]]) {
    mesh(new THREE.CylinderGeometry(5, 5, 3, 6), dark, g, x, 23.5, z); mesh(new THREE.CylinderGeometry(1.8, 1.8, 7, 8), dark, g, x, 26, z);
  }
  // body: a side profile (z, y) extruded across x, with a waist, a jutting chin and a control face tilted back
  const P = [[-30, 22], [26, 22], [20, 118], [42, 140], [16, 238], [-4, 258], [-30, 258]];
  const s = new THREE.Shape(); P.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  const eg = new THREE.ExtrudeGeometry(s, { depth: 72, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2 });
  eg.translate(0, 0, -36); eg.rotateY(-Math.PI / 2); scaleUV(eg, 1 / 120); eg.computeVertexNormals();
  mesh(eg, body, g);
  // armour panels on the sides, rusted, with bolts
  for (const sx of [-1, 1]) {
    const pa = mesh(scaleUV(new THREE.BoxGeometry(3, 84, 40), 1 / 120), rust, g, sx * 38.5, 70, -4);
    for (const [y, z] of [[32, -20], [32, 12], [108, -20], [108, 12]]) mesh(new THREE.SphereGeometry(1.6, 8, 6), dark, g, sx * 40.5, y, z);
    pa.rotation.z = 0;
  }
  // control face frame: (z, y) from the chin (42,140) to the brow (16,238)
  const fc = new THREE.Vector3(0, 189, 29), up = new THREE.Vector3(0, 98, -26).normalize(), nrm = new THREE.Vector3(0, 26, 98).normalize();
  const tilt = -Math.atan2(26, 98);
  const onFace = (x, u, d) => fc.clone().addScaledVector(up, u).addScaledVector(nrm, d).setX(x);
  const plate = (w, h, d, mat, x, u, dz) => { const m = mesh(new THREE.BoxGeometry(w, h, d), mat, g); m.position.copy(onFace(x, u, dz)); m.rotation.x = tilt; return m; };
  plate(64, 90, 3, dark, 0, 0, 1);
  // display: a canvas drawn as a city-gate entry screen, emissive
  const c = document.createElement('canvas'); c.width = 512; c.height = 288; const cg = c.getContext('2d');
  const drawScreen = (blink) => {
    const gr = cg.createLinearGradient(0, 0, 0, 288); gr.addColorStop(0, '#061a22'); gr.addColorStop(1, '#020a0e'); cg.fillStyle = gr; cg.fillRect(0, 0, 512, 288);
    cg.fillStyle = '#0f3a48'; cg.fillRect(0, 0, 512, 46); cg.fillStyle = '#7fe8ff'; cg.font = 'bold 26px monospace'; cg.textAlign = 'left'; cg.fillText('KAR-ES-TAAL  //  GATE 01', 18, 32);
    cg.fillStyle = '#5fd0ee'; cg.font = '22px monospace'; cg.fillText('CITIZEN ENTRY', 18, 92); cg.fillStyle = '#3d9cb4'; cg.fillText('ENTER IDENTITY NUMBER:', 18, 128);
    cg.strokeStyle = '#5fd0ee'; cg.lineWidth = 3;
    for (let i = 0; i < 6; i++) { cg.strokeRect(22 + i * 74, 150, 60, 64); }
    if (blink) { cg.fillStyle = '#9ff4ff'; cg.fillRect(34, 200, 36, 6); }
    cg.fillStyle = '#ff5a3a'; cg.font = '18px monospace'; cg.fillText('ACCESS RESTRICTED - UNAUTHORISED ENTRY IS AN OFFENCE', 18, 260);
    cg.globalAlpha = 0.12; cg.fillStyle = '#000'; for (let y = 0; y < 288; y += 4) cg.fillRect(0, y, 512, 2); cg.globalAlpha = 1;
  };
  drawScreen(true);
  const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
  const screen = mesh(new THREE.PlaneGeometry(52, 29), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 1.6, roughness: 0.3 }), g);
  screen.position.copy(onFace(0, 22, 2.6)); screen.rotation.x = tilt; screen.castShadow = false;
  plate(58, 3, 4, body, 0, 38.5, 3); plate(58, 3, 4, body, 0, 5.5, 3); plate(3, 36, 4, body, -27.5, 22, 3); plate(3, 36, 4, body, 27.5, 22, 3);
  // keys: 3 x 4, labelled, with a recessed well
  const keyMat = (label) => {
    const k = document.createElement('canvas'); k.width = k.height = 64; const kg = k.getContext('2d');
    kg.fillStyle = '#2b2b2a'; kg.fillRect(0, 0, 64, 64); kg.fillStyle = label === 'OK' ? '#7dff9a' : label === 'C' ? '#ff7a5a' : '#d8e6ea';
    kg.font = `bold ${label.length > 1 ? 26 : 36}px sans-serif`; kg.textAlign = 'center'; kg.textBaseline = 'middle'; kg.fillText(label, 32, 34);
    const t = new THREE.CanvasTexture(k); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0x334044, roughness: 0.45, metalness: 0.3 });
  };
  plate(46, 46, 1.5, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), 0, -21, 2.2);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  keys.forEach((l, i) => {
    const kx = (i % 3 - 1) * 13.5, ku = -6 - Math.floor(i / 3) * 10;
    const km = keyMat(l), kd = new THREE.MeshStandardMaterial({ color: 0x2b2b2a, roughness: 0.45, metalness: 0.3 });
    const k = mesh(new THREE.BoxGeometry(11, 8, 3), [kd, kd, kd, kd, km, kd], g); k.position.copy(onFace(kx, ku, 3.6)); k.rotation.x = tilt;
  });
  // glass over the face, catching the sky
  const glass = mesh(new THREE.PlaneGeometry(62, 88), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.12, envMap: env, envMapIntensity: 1.4, clearcoat: 1 }), g);
  glass.position.copy(onFace(0, 0, 6)); glass.rotation.x = tilt; glass.castShadow = false;
  // hood over the face
  const hood = mesh(scaleUV(new THREE.BoxGeometry(80, 4, 34), 1 / 120), body, g, 0, 258, 22); hood.rotation.x = 0.12;
  for (const sx of [-1, 1]) { const ch = mesh(new THREE.BoxGeometry(3, 26, 30), body, g, sx * 38.5, 246, 24); ch.rotation.x = tilt; }
  // ID slot, status light, maker's plate
  plate(30, 5, 4, dark, 0, -46, 3); mesh(new THREE.BoxGeometry(22, 1.2, 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), g).position.copy(onFace(0, -46, 5.2));
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0a2010, emissive: 0x3dff6a, emissiveIntensity: 3 });
  const led = mesh(new THREE.SphereGeometry(2.2, 12, 8), ledMat, g); led.position.copy(onFace(26, -46, 4)); led.castShadow = false;
  const lp = mesh(new THREE.PlaneGeometry(30, 9), new THREE.MeshStandardMaterial({ map: (() => {
    const k = document.createElement('canvas'); k.width = 256; k.height = 76; const kg = k.getContext('2d');
    kg.fillStyle = '#b9b2a2'; kg.fillRect(0, 0, 256, 76); kg.fillStyle = '#2a2622'; kg.font = 'bold 22px sans-serif'; kg.fillText('CIVIC SECURITY', 14, 32); kg.font = '17px sans-serif'; kg.fillText('ACCESS TERMINAL  MK.IV', 14, 60);
    const t = new THREE.CanvasTexture(k); t.colorSpace = THREE.SRGBColorSpace; return t; })(), metalness: 0.6, roughness: 0.45, envMap: env }), g, 0, 92, 25.4);
  lp.rotation.x = Math.atan2(6, 96) * 0;   // the waist is near-vertical
  // conduit from the back into the ground
  const conduit = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 70, -30), new THREE.Vector3(0, 52, -50), new THREE.Vector3(6, 26, -62), new THREE.Vector3(10, 0, -66)]);
  mesh(scaleUV(new THREE.TubeGeometry(conduit, 20, 5, 10), 0.3), rust, g);
  mesh(new THREE.CylinderGeometry(7.5, 7.5, 8, 12), dark, g, 0, 70, -31).rotation.x = Math.PI / 2;
  // a cool spill from the display
  const glow = new THREE.PointLight(0x7fd8ff, 1.6, 200, 1.6); glow.position.copy(onFace(0, 10, 40)); g.add(glow);
  let last = -1;
  g.userData.tick = (t) => {
    ledMat.emissiveIntensity = (t % 1.6) < 0.12 ? 0.4 : 3;
    const b = Math.floor(t * 2) % 2; if (b !== last) { last = b; drawScreen(!!b); st.needsUpdate = true; }
  };
  return { group: g, face: { center: fc.clone(), tilt, width: 64, height: 98 } };
}

// A weathered enamel notice board on two footed steel posts, with a pointer plate toward the terminal.
// lines: [{ text, font, color }]. Returns { group, face: { center, width, height } }.
// wall: true hangs it flat on a wall (no posts, no pointer), its back at z = -3.
export async function buildNoticeBoard({ renderer, title = 'KAR-ES-TAAL', lines = [], pointer = 'IDENTITY CHECK  →', pointerFlip = false, wall = false }) {
  const env = envOf(renderer);
  const steel = pbr('metal_plate_02', { metal: 0.35, rough: 0.6, env, tint: 0x8d8981, has: ['diff', 'nor', 'rough', 'metal'] });
  const rust = pbr('rusty_metal_02', { metal: 0.4, rough: 0.85, env, tint: 0xb9a896 });
  const conc = pbr('concrete_slab_wall', { tint: 0xd9c6ae });
  const g = new THREE.Group(), W = 210, H = 126, Y = 200;
  const grime = await image('media/tex/rusty_metal_02/diff.jpg');
  // the enamel face, painted, then aged: rust bleeding from the rivets, chips, grime toward the bottom, sun fade
  const face = (w, h, paint) => {
    const c = document.createElement('canvas'); c.width = Math.round(w * 6); c.height = Math.round(h * 6); const k = c.getContext('2d'), CW = c.width, CH = c.height;
    paint(k, CW, CH);
    k.globalCompositeOperation = 'multiply'; k.globalAlpha = 0.35; k.drawImage(grime, 0, 0, grime.width * 0.5, grime.height * 0.5 * CH / CW, 0, 0, CW, CH);
    k.globalAlpha = 1; const gd = k.createLinearGradient(0, 0, 0, CH); gd.addColorStop(0, 'rgba(255,250,235,1)'); gd.addColorStop(0.7, 'rgba(235,225,205,1)'); gd.addColorStop(1, 'rgba(150,120,90,1)'); k.fillStyle = gd; k.fillRect(0, 0, CW, CH);
    k.globalCompositeOperation = 'source-over';
    const rivet = (x, y) => {
      const rg = k.createLinearGradient(x, y, x, y + CH * 0.35); rg.addColorStop(0, 'rgba(110,52,18,0.55)'); rg.addColorStop(1, 'rgba(110,52,18,0)');
      k.fillStyle = rg; k.beginPath(); k.moveTo(x - 7, y); k.quadraticCurveTo(x - 3, y + CH * 0.2, x - 1, y + CH * 0.35); k.lineTo(x + 2, y + CH * 0.33); k.quadraticCurveTo(x + 4, y + CH * 0.15, x + 7, y); k.fill();
      k.fillStyle = '#3a3530'; k.beginPath(); k.arc(x, y, 15, 0, 7); k.fill(); k.fillStyle = '#9a9488'; k.beginPath(); k.arc(x - 3, y - 3, 9, 0, 7); k.fill();
    };
    { const m = Math.min(40, CH * 0.22); for (const [x, y] of [[m, m], [CW - m, m], [m, CH - m], [CW - m, CH - m]]) rivet(x, y); }
    for (let i = 0; i < 26; i++) {               // paint chips showing rust
      const edge = Math.random() < 0.85, x = edge && Math.random() < 0.3 ? (Math.random() < 0.5 ? Math.random() * 30 : CW - Math.random() * 30) : Math.random() * CW, y = edge ? (Math.random() < 0.5 ? Math.random() * 26 : CH - Math.random() * 34) : Math.random() * CH, r = 3 + Math.random() * 8;
      k.fillStyle = `rgba(${90 + Math.random() * 40},${45 + Math.random() * 20},20,0.85)`; k.beginPath();
      for (let a = 0; a < 6.28; a += 0.8) k.lineTo(x + Math.cos(a) * r * (0.5 + Math.random()), y + Math.sin(a) * r * (0.5 + Math.random())); k.fill();
    }
    k.strokeStyle = 'rgba(255,255,255,0.18)'; k.lineWidth = 1;   // fine scratches
    for (let i = 0; i < 40; i++) { const x = Math.random() * CW, y = Math.random() * CH, a = Math.random() * 6.28, l = 10 + Math.random() * 60; k.beginPath(); k.moveTo(x, y); k.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); k.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  const main = face(W, H, (k, CW, CH) => {
    k.fillStyle = '#e8e2d2'; k.fillRect(0, 0, CW, CH);
    k.fillStyle = '#9c1c16'; k.fillRect(0, 0, CW, CH * 0.27);
    k.fillStyle = '#f2ece0'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.font = `bold ${CH * 0.16}px "Arial Black", Arial, sans-serif`; k.fillText(title, CW / 2, CH * 0.145);
    k.strokeStyle = '#9c1c16'; k.lineWidth = 6; k.strokeRect(14, CH * 0.27 + 10, CW - 28, CH * 0.73 - 24);
    let y = CH * 0.42;
    for (const l of lines) { k.fillStyle = l.color || '#1c2a4a'; k.font = l.font || `bold ${CH * 0.085}px Arial, sans-serif`; k.fillText(l.text, CW / 2, y); y += (l.gap || CH * 0.13); }
  });
  const enamel = new THREE.MeshStandardMaterial({ map: main, normalMap: map('media/tex/rusty_metal_02/nor.jpg'), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.5, metalness: 0.1, envMap: env, envMapIntensity: 0.5 });
  const panel = mesh(new THREE.BoxGeometry(W, H, 2.5), [steel, steel, steel, steel, enamel, steel], g, 0, Y, 0);
  // angle-iron frame and a rain lip
  for (const [w, h, x, y] of [[W + 8, 5, 0, Y + H / 2 + 1.5], [W + 8, 5, 0, Y - H / 2 - 1.5], [5, H + 8, -W / 2 - 1.5, Y], [5, H + 8, W / 2 + 1.5, Y]]) mesh(scaleUV(new THREE.BoxGeometry(w, h, 6), 1 / 100), rust, g, x, y, 0.5);
  const lip = mesh(scaleUV(new THREE.BoxGeometry(W + 20, 3, 16), 1 / 100), steel, g, 0, Y + H / 2 + 6, 4); lip.rotation.x = 0.25;
  if (wall) {                                      // bolted to the stone: four lugs, and rust streaking below
    for (const [x, y] of [[-W / 2 + 14, Y + H / 2 + 4], [W / 2 - 14, Y + H / 2 + 4], [-W / 2 + 14, Y - H / 2 - 4], [W / 2 - 14, Y - H / 2 - 4]]) mesh(new THREE.BoxGeometry(12, 10, 5), rust, g, x, y, -1);
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 128; const sk = sc.getContext('2d');
    for (let i = 0; i < 14; i++) { const x = Math.random() * 64, gr = sk.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(90,45,15,0.55)'); gr.addColorStop(1, 'rgba(90,45,15,0)'); sk.fillStyle = gr; sk.fillRect(x, 0, 1 + Math.random() * 3, 40 + Math.random() * 88); }
    const stt = new THREE.CanvasTexture(sc); stt.colorSpace = THREE.SRGBColorSpace;
    const streak = mesh(new THREE.PlaneGeometry(W - 20, 90), new THREE.MeshBasicMaterial({ map: stt, transparent: true, depthWrite: false }), g, 0, Y - H / 2 - 48, -1.5); streak.castShadow = false;
    return { group: g, face: { center: new THREE.Vector3(0, Y, 1.4), width: W, height: H } };
  }
  // posts: square tube on concrete footings, with brackets clamping the board
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 22);
    mesh(scaleUV(new THREE.BoxGeometry(9, Y + H / 2 + 4, 9), 1 / 100), steel, g, x, (Y + H / 2 + 4) / 2, -7);
    mesh(scaleUV(new THREE.CylinderGeometry(16, 19, 14, 14), 1 / 100), conc, g, x, 7, -7);
    mesh(new THREE.BoxGeometry(12, 4, 12), steel, g, x, Y + H / 2 + 6, -7);
    for (const by of [Y + H / 2 - 18, Y - H / 2 + 18]) { mesh(new THREE.BoxGeometry(16, 9, 4), rust, g, x, by, -3); for (const bx of [-4, 4]) mesh(new THREE.CylinderGeometry(1.4, 1.4, 4, 6), steel, g, x + bx, by, -0.5).rotation.x = Math.PI / 2; }
  }
  // pointer plate below the board
  const ptex = face(110, 22, (k, CW, CH) => {
    k.fillStyle = '#1d2f55'; k.fillRect(0, 0, CW, CH); k.fillStyle = '#efe9da'; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.font = `bold ${CH * 0.5}px Arial, sans-serif`; k.fillText(pointer, CW / 2, CH * 0.54);
  });
  const pm = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.55, metalness: 0.1, envMap: env, envMapIntensity: 0.5 });
  const pp = mesh(new THREE.BoxGeometry(110, 22, 2), [steel, steel, steel, steel, pm, steel], g, pointerFlip ? -30 : 30, Y - H / 2 - 30, -1);
  pp.rotation.z = (pointerFlip ? 1 : -1) * 0.02;
  return { group: g, face: { center: new THREE.Vector3(0, Y, 1.4), width: W, height: H } };
}

// city towers beyond the wall: tall slabs and a dome, hazed by the fog
export function buildCitySkyline({ x0 = 6900, z0 = -600, z1 = 3700, seed = 7 }) {
  const g = new THREE.Group();
  // low, pale buildings: seen over the wall from the gate, not standing above the canyon cliffs elsewhere
  const plate = pbr('rusty_metal_02', { metal: 0.3, rough: 0.8, tint: 0xd8cbbb });
  const conc = pbr('concrete_slab_wall', { tint: 0xe4d2bb });
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const z = z0 + rnd() * (z1 - z0), x = x0 + rnd() * 2600, w = 260 + rnd() * 420, d = 260 + rnd() * 420, h = 380 + rnd() * 520;
    const b = box(w, h, d, rnd() < 0.5 ? plate : conc, 300); b.position.set(x, h / 2, z); g.add(b);
    if (rnd() < 0.35) { const s = box(w * 0.5, h * 0.35, d * 0.5, plate, 300); s.position.set(x, h + h * 0.175, z); g.add(s); }
    if (rnd() < 0.3) { const a = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 300), plate); a.position.set(x, h + 150, z); g.add(a); }
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), conc);
  dome.position.set(x0 + 1700, 0, (z0 + z1) / 2 - 300); dome.castShadow = true; g.add(dome);
  return g;
}
