// Project Charon — web prototype of the Perfect Assassin (1997) opening.
// Geometry, textures, cameras, exits and text all come from the original data files
// (CANYON.WLD, CANDARK.V2, CANFLOOR.LBM, CANFORM.LBM, LOC0000-0003, PASSTEXT.BIN).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const CELL = 256;            // world units per map cell (from the floor renderer's 8.8 fixed-point masks)
const LAYER_H = 256;         // height of each of the two wall layers (camera z is tested against 0x100)
const SUB = 32;              // wall-outline resolution per cell (forms are 64x64; 32 keeps geometry light)
const SPRITE_SCALE = 1.75;   // world units per sprite pixel (tuned against the original screenshots)
const ANG = Math.PI * 2 / 2048;  // engine angle units
const LENS = { k: 1.7 };
const SHOT_T = 0.42;         // seconds for one firing animation
const CHAR_SCALE = 0.5;       // every character (3D models, their sprites/click areas, shadows, Charon's pace) at this size
const HERO_H = 190;          // Charon's height in world units (the 1997 sprite); 3D models are authored at 2.1 m

// ---------------------------------------------------------------- gun effects
// Charon's shots are hitscan, like real bullets: a muzzle flash and the impact, nothing in between.
// Everything is drawn into canvases here, so there are no extra files to load.
function fxTexture(draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const FX_TEX = {};
function fxTextures() {
  if (FX_TEX.glow) return FX_TEX;
  FX_TEX.glow = fxTexture((g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,246,210,0.95)');
    r.addColorStop(0.45, 'rgba(255,170,70,0.45)'); r.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  FX_TEX.flame = fxTexture((g, w, h) => {          // a tapered tongue of flame, base at the bottom
    g.filter = 'blur(3px)';
    const lin = g.createLinearGradient(0, h, 0, 0);
    lin.addColorStop(0, 'rgba(255,255,255,1)'); lin.addColorStop(0.25, 'rgba(255,240,180,1)');
    lin.addColorStop(0.6, 'rgba(255,150,40,0.85)'); lin.addColorStop(1, 'rgba(255,70,0,0)');
    g.fillStyle = lin; g.beginPath(); g.moveTo(w / 2, h - 4);
    g.bezierCurveTo(w * 0.02, h * 0.72, w * 0.30, h * 0.25, w / 2, 4);
    g.bezierCurveTo(w * 0.70, h * 0.25, w * 0.98, h * 0.72, w / 2, h - 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(w / 2, h * 0.78, w * 0.1, h * 0.2, 0, 0, Math.PI * 2); g.fill();
  }, 64, 256);
  FX_TEX.star = fxTexture((g, w, h) => {           // thin uneven spikes for the frontal burst
    g.filter = 'blur(1px)'; g.translate(w / 2, h / 2);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + (i % 2) * 0.2, len = w * (i % 2 ? 0.30 : 0.48);
      const lg = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      lg.addColorStop(0, 'rgba(255,250,220,1)'); lg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(Math.cos(a + 1.5) * 4, Math.sin(a + 1.5) * 4);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.lineTo(Math.cos(a - 1.5) * 4, Math.sin(a - 1.5) * 4); g.fill();
    }
  });
  FX_TEX.smoke = fxTexture((g, w, h) => {
    g.filter = 'blur(6px)';
    for (let i = 0; i < 6; i++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.3, y = h / 2 + (Math.random() - 0.5) * h * 0.3, r = w * (0.18 + Math.random() * 0.12);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    }
  });
  return FX_TEX;
}

// per ammo: multi-purpose (warm), high velocity (hot white-blue, long and thin), explosive (big and orange)
const GUN_FX = [
  { len: 64, wid: 26, core: 52, tint: 0xffd9a0, light: 0xffa040, sparks: 5 },
  { len: 92, wid: 15, core: 40, tint: 0xcfe6ff, light: 0x9fc8ff, sparks: 7 },
  { len: 110, wid: 40, core: 84, tint: 0xffb070, light: 0xff7a20, sparks: 9 },
];

const FX_SLOW = +new URLSearchParams(location.search).get('fxslow') || 1;   // ?fxslow=20 to study the flash

function makeGunFX(scene) {
  const T = fxTextures(), live = [], Y = new THREE.Vector3(0, 1, 0);
  const add = (o, life, tick) => { scene.add(o); live.push({ o, t: 0, life, tick }); };
  const glowMat = (tint, opacity = 1) => new THREE.SpriteMaterial({ map: T.glow, color: tint, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const light = new THREE.PointLight(0xffa040, 0, 420, 1); scene.add(light);
  let lightT = 0;

  const sparks = (pos, dir, n, speed, spread, tint) => {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(glowMat(tint)); s.position.copy(pos); s.renderOrder = 10;
      const v = dir.clone().multiplyScalar(speed * (0.5 + Math.random()))
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(speed * spread));
      const size = 4 + Math.random() * 5;
      add(s, 0.1 + Math.random() * 0.15, (k, dt) => {
        s.position.addScaledVector(v, dt); v.y -= 900 * dt; v.multiplyScalar(1 - 4 * dt);
        s.scale.setScalar(size * (1 - k * 0.6)); s.material.opacity = 1 - k;
      });
    }
  };
  const puff = (pos, tint, size, life, rise) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.smoke, color: tint, transparent: true, opacity: 0, depthWrite: false }));
    s.position.copy(pos); s.material.rotation = Math.random() * 6.28;
    add(s, life, (k, dt) => {
      s.position.y += rise * dt; s.scale.setScalar(size * (0.5 + k * 1.2));
      s.material.opacity = 0.32 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
    });
  };

  return {
    flash(pos, dir, kind = 0, size = 1) {
      const B = GUN_FX[kind] || GUN_FX[0], tint = new THREE.Color(B.tint);
      const P = { ...B, len: B.len * size, wid: B.wid * size, core: B.core * size };
      // three crossed flame petals along the barrel
      const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(Y, dir);
      g.rotateY(Math.random() * Math.PI);
      const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const len = P.len * (0.8 + Math.random() * 0.45), petals = [];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: T.flame, color: tint, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        m.rotation.y = i * Math.PI / 3; m.renderOrder = 11; g.add(m); petals.push(m);
      }
      // two short side vents, like gas escaping a compensator
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(geo, petals[0].material); m.rotation.z = s * 1.25; m.position.y = len * 0.12;
        m.userData.side = true; g.add(m); petals.push(m);
      }
      add(g, 0.075, (k) => {
        const flick = k < 0.45 ? 1 : 0.55;                   // two "frames": full, then a smaller second burst
        for (const m of petals) {
          const L = m.userData.side ? len * 0.35 : len;
          m.scale.set(P.wid * flick * (m.userData.side ? 0.6 : 1), L * flick * (0.9 + Math.random() * 0.2), 1);
          m.material.opacity = 1 - k * 0.7;
        }
      });
      // white-hot core and a star burst facing the camera
      const core = new THREE.Sprite(glowMat(tint)); core.position.copy(pos).addScaledVector(dir, len * 0.15); core.renderOrder = 12;
      add(core, 0.06, (k) => { core.scale.setScalar(P.core * (1.1 - k * 0.6)); core.material.opacity = 1 - k; });
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.star, color: tint, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      star.position.copy(pos).addScaledVector(dir, len * 0.2); star.material.rotation = Math.random() * 6.28; star.renderOrder = 12;
      add(star, 0.05, (k) => { star.scale.setScalar(P.core * 1.5 * (1 - k * 0.4)); star.material.opacity = 1 - k; });
      sparks(pos.clone().addScaledVector(dir, len * 0.3), dir, Math.round(P.sparks * size), 900 * Math.sqrt(size), 0.5, tint);
      puff(pos.clone().addScaledVector(dir, len * 0.25), 0xc8b8a8, P.core * 0.9, 0.55, 40);
      // a short pulse of light on Charon (the canyon itself is unlit, so only the model takes it)
      light.position.copy(pos).addScaledVector(dir, 20 * size); light.color.set(P.light); light.distance = 420 * size; lightT = 0.07;
    },
    impact(pos, kind = 0, toward = null) {
      const P = GUN_FX[kind] || GUN_FX[0], tint = new THREE.Color(P.tint);
      const p = pos.clone(); if (toward) p.add(toward.clone().sub(pos).setY(0).normalize().multiplyScalar(30));
      const f = new THREE.Sprite(glowMat(tint)); f.position.copy(p); f.renderOrder = 12;
      add(f, 0.07, (k) => { f.scale.setScalar(P.core * 1.2 * (1 - k * 0.5)); f.material.opacity = 1 - k; });
      sparks(p, new THREE.Vector3(0, 0.6, 0), P.sparks + 4, 700, 1.4, tint);
      puff(p, 0xb89a78, P.core * 1.4, 0.8, 30);                 // canyon dust
    },
    update(dt) {
      dt /= FX_SLOW;
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i]; e.t += dt; const k = Math.min(1, e.t / e.life);
        e.tick(k, dt);
        if (k >= 1) { scene.remove(e.o); live.splice(i, 1); }
      }
      lightT -= dt; light.intensity = lightT > 0 ? 9 * (lightT / 0.07) : 0;
    },
  };
}

// ---------------------------------------------------------------- 3D models (shared)
// Lights and reflections for the real-time models. They only touch the models: the canyon and the
// sprites use unlit materials. Set up once, the first time a model loads.
let MODEL_ENV = null;
async function modelSetup(scene, renderer) {
  if (MODEL_ENV) return MODEL_ENV;
  MODEL_ENV = (async () => {
    const [{ GLTFLoader }, { RoomEnvironment }, SkeletonUtils] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js'),
      import('three/addons/utils/SkeletonUtils.js')]);
    const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    if (!scene.userData.worldLit) {                          // the remake landscape brings its own sun and sky
      const sun = new THREE.DirectionalLight(0xffe2bf, 2.4); sun.position.set(-300, 600, 250);
      const sky = new THREE.HemisphereLight(0xbfd3ff, 0x8a5a3a, 1.1);
      scene.add(sky, sun, sun.target);
    }
    return { loader: new GLTFLoader(), env, SkeletonUtils };
  })();
  return MODEL_ENV;
}
const contactShadow = (r) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.32, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 1.5; return m;
};

// NPC creatures (media/NAME.glb from tools/models/rig_creature.py): loaded once, cloned per character.
// Clips 'idle', 'walk', 'death'; facing +Z, in metres, scaled to `height` world units.
const CREATURE_CACHE = {};
// A green-yellow pool of blood under a body, like the 1997 Jakari sprites; grows with `grow(k)`.
const bloodPool = (r) => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.filter = 'blur(3px)';
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, d = 18 + Math.random() * 16, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d * 0.7, rr = 16 + Math.random() * 14;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, 'rgba(112,122,22,0.8)'); rg.addColorStop(0.8, 'rgba(84,92,14,0.65)'); rg.addColorStop(1, 'rgba(60,64,8,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  }
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 40); rg.addColorStop(0, 'rgba(128,140,30,0.85)'); rg.addColorStop(1, 'rgba(90,100,14,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 2; m.userData.r = r; return m;
};

async function loadCreature(name, height, scene, renderer, tint = null, opt = {}) {
  height *= CHAR_SCALE;
  const S = await modelSetup(scene, renderer);
  if (!CREATURE_CACHE[name]) CREATURE_CACHE[name] = S.loader.loadAsync(`media/${name}.glb?${Date.now()}`);
  const gltf = await CREATURE_CACHE[name];
  const model = S.SkeletonUtils.clone(gltf.scene), root = new THREE.Group();
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.setScalar(height / (box.max.y - box.min.y)); root.add(model);
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.material = o.material.clone();      // own material: hit flash, tint
    o.material.envMap = S.env; o.material.envMapIntensity = 0.5;
    if (tint) o.material.color.set(tint);
    mats.push(o.material);
  });
  root.add(contactShadow(height * (opt.shadow || 0.85)));
  let pool = null;
  if (opt.pool) { pool = bloodPool(opt.pool.r * CHAR_SCALE); pool.position.z = (opt.pool.z || 0) * CHAR_SCALE; root.add(pool); }
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const clip of gltf.animations) acts[clip.name.toLowerCase()] = mixer.clipAction(clip);
  if (acts.death) { acts.death.setLoop(THREE.LoopOnce); acts.death.clampWhenFinished = true; }
  let walkSpeed = 300;                                              // world units/s with the walk clip at 1x
  model.traverse((o) => { if (o.userData.walk_stride_m) walkSpeed = o.userData.walk_stride_m / o.userData.walk_cycle_s * model.scale.x; });
  let cur = null;
  const clips = { idle: 'idle', walk: 'walk', death: 'death', ...(opt.clips || {}) };
  if (acts[clips.death]) { acts[clips.death].setLoop(THREE.LoopOnce); acts[clips.death].clampWhenFinished = true; }
  const play = (n, fade = 0.25) => {
    const a = acts[clips[n] || n] || acts[clips.idle]; if (!a || a === cur) return a;
    a.reset().play(); if (cur) a.crossFadeFrom(cur, fade, false);
    cur = a; return a;
  };
  const idle = play('idle'); if (idle) idle.time = Math.random() * idle.getClip().duration;
  return { root, mixer, acts, play, walkSpeed, fixed: !!opt.fixed, pool,
    flash: (k) => mats.forEach((m) => m.emissive.setScalar(k)) };
}

// ?hero3d=NAME: a rigged real-time model (media/NAME.glb from tools/models) replaces the Charon sprites.
// Needs actions 'idle', 'walk' and 'aim'; the model faces +Z and is measured in metres.
async function loadHero3D(name, renderer, scene) {
  const S = await modelSetup(scene, renderer);
  const gltf = await S.loader.loadAsync(`media/${name}.glb?${Date.now()}`);
  const model = gltf.scene, root = new THREE.Group();
  model.updateMatrixWorld(true);                 // skinned bounds need the bones' world matrices
  const box = new THREE.Box3().setFromObject(model, true);
  model.scale.setScalar(HERO_H * CHAR_SCALE / (box.max.y - box.min.y));  root.add(model);
  model.traverse((o) => {
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.material.envMap = S.env; o.material.envMapIntensity = 0.55; }
  });
  root.add(contactShadow(48 * CHAR_SCALE));
  const mixer = new THREE.AnimationMixer(model), acts = {};
  for (const clip of gltf.animations) acts[clip.name.toLowerCase()] = mixer.clipAction(clip);
  // Walking pace comes from the clip itself (stride measured in Blender, exported as extras), so feet don't slide.
  const WALK_RATE = 1.1;                        // playback speed of the walk clip; raise for a brisker Charon
  let walkSpeed = 520 * CHAR_SCALE;
  model.traverse((o) => { if (o.userData.walk_stride_m) walkSpeed = o.userData.walk_stride_m / o.userData.walk_cycle_s * model.scale.x * WALK_RATE; });
  for (const n of ['walk', 'walk_ready']) if (acts[n]) acts[n].timeScale = WALK_RATE;
  // double-click: the same walk, faster. The clip plays FAST_WALK times quicker and he covers ground FAST_WALK
  // times quicker, so the feet still match the ground. (Its own copy of the clip, so its rate is independent.)
  const FAST_WALK = 1.45;
  const jogSpeed = walkSpeed * FAST_WALK;
  if (acts.walk) { acts.walk_fast = mixer.clipAction(acts.walk.getClip().clone()); acts.walk_fast.timeScale = WALK_RATE * FAST_WALK; }
  if (acts.aim) { acts.aim.setLoop(THREE.LoopOnce); acts.aim.clampWhenFinished = true; }
  let cur = null;
  const play = (n) => {
    const a = acts[n] || acts[n.replace('_ready', '')] || acts.idle; if (!a || a === cur) return;
    a.reset().play();
    const gait = (x) => x === acts.walk || x === acts.walk_fast;
    if (cur && gait(a) && gait(cur)) a.time = cur.time;          // walk <-> fast walk: keep the step, just change pace
    if (cur) a.crossFadeFrom(cur, n === 'aim' ? 0.08 : 0.3, false);
    cur = a;
  };
  // head's rest orientation (model facing +Z, before any clip plays): its forward is +Z here
  const headB = model.getObjectByName('Head'), neckB = model.getObjectByName('Neck'), chestB = model.getObjectByName('Spine2');
  root.updateMatrixWorld(true);
  const headRestInv = headB ? headB.getWorldQuaternion(new THREE.Quaternion()).invert() : null;
  play('idle');
  // Muzzle position and barrel direction, from two marker bones the rig puts at the cannon tip and
  // further along its bore (tools/models/rig_humanoid.py). Without them, fall back to forearm -> hand.
  const tipB = model.getObjectByName('RightMuzzle'), aimB = model.getObjectByName('RightMuzzleAim');
  const hand = tipB || model.getObjectByName('RightHand'), fore = tipB ? aimB : model.getObjectByName('RightForeArm');
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const muzzle = () => {
    if (!hand || !fore) return null;
    root.updateMatrixWorld(true);
    hand.getWorldPosition(va); fore.getWorldPosition(vb);
    if (tipB) return { pos: va.clone(), dir: vb.clone().sub(va).normalize() };
    const dir = va.clone().sub(vb).normalize();
    return { pos: va.clone().addScaledVector(dir, 0.21 * model.scale.x), dir };
  };
  // Point the cannon at a world target by turning the whole arm at the shoulder, on top of the
  // 'aim' clip, weighted by how far that clip has blended in (so it eases in and out with it).
  const upper = model.getObjectByName('RightArm'), qp = new THREE.Quaternion(), qi = new THREE.Quaternion();
  const MAX_TURN = 1.25;                                       // ~70 degrees either way
  const aimAt = (target) => {
    const w = acts.aim ? acts.aim.getEffectiveWeight() : 0;
    if (!upper || !hand || w < 0.01) return;
    for (let it = 0; it < 2; it++) {                           // twice: turning the arm moves the muzzle a little
      const m = muzzle(), want = target.clone().sub(m.pos).normalize();
      const full = new THREE.Quaternion().setFromUnitVectors(m.dir, want);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(full.w)));
      const f = (ang > MAX_TURN ? MAX_TURN / ang : 1) * (it ? 1 : w);
      const q = new THREE.Quaternion().slerpQuaternions(qi.identity(), full, f);
      upper.parent.getWorldQuaternion(qp);                     // apply in world space about the shoulder
      upper.quaternion.premultiply(qp).premultiply(q).premultiply(qp.invert());
      if (w < 0.99) break;                                     // while blending, one weighted pass is enough
    }
  };
  const aimWeight = () => (acts.aim ? acts.aim.getEffectiveWeight() : 0);

  // rotate a bone by a world-space rotation about its own joint
  const qw = new THREE.Quaternion();
  const rotWorld = (bone, q) => { bone.parent.getWorldQuaternion(qw); bone.quaternion.premultiply(qw).premultiply(q).premultiply(qw.invert()); };
  const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

  // Recoil: a sharp kick that settles. The cannon arm jerks up at the shoulder, the chest rocks back
  // and the body shifts back a little. kick(strength) on each shot; applied after the arm is on target.
  const RECOIL = { arm: 0.1, chest: 0.012, shove: 0.008 };              // radians, radians, metres at full kick
  let kickT = 9, kickS = 0;
  const kick = (s = 1) => { kickT = 0; kickS = s; };
  const recoil = (dt) => {
    kickT += dt;
    const r = kickS * (kickT < 0.02 ? kickT / 0.02 : Math.exp(-(kickT - 0.02) / 0.06));
    if (r < 0.002 || !upper) { model.position.set(0, 0, 0); return; }
    root.updateMatrixWorld(true);
    const f = Z.clone().applyQuaternion(root.quaternion);                     // facing
    const m = muzzle();                                                       // mostly the arm: ~6 degrees up
    if (m) { const ax = m.dir.clone().cross(UP); if (ax.lengthSq() > 1e-4) rotWorld(upper, new THREE.Quaternion().setFromAxisAngle(ax.normalize(), RECOIL.arm * r)); }
    if (chestB) rotWorld(chestB, new THREE.Quaternion().setFromAxisAngle(f.clone().cross(UP).normalize(), RECOIL.chest * r));
    model.position.copy(f).multiplyScalar(-RECOIL.shove * r * model.scale.x);   // metres back
  };

  // Look at the target: neck takes 40% of the turn, the head the rest; capped, eased with the aim.
  const LOOK_MAX = 1.05;                                                  // ~60 degrees
  const look = (target) => {
    const w = aimWeight();
    if (!headB || !neckB || w < 0.01) return;
    root.updateMatrixWorld(true);
    const hq = headB.getWorldQuaternion(new THREE.Quaternion()).multiply(headRestInv);
    const fwd = Z.clone().applyQuaternion(hq);
    const want = target.clone().sub(headB.getWorldPosition(new THREE.Vector3())).normalize();
    const full = new THREE.Quaternion().setFromUnitVectors(fwd, want);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(full.w)));
    const amt = (ang > LOOK_MAX ? LOOK_MAX / ang : 1) * w;
    rotWorld(neckB, new THREE.Quaternion().slerpQuaternions(qi.identity(), full, amt * 0.4));
    rotWorld(headB, new THREE.Quaternion().slerpQuaternions(qi.identity(), full, amt * 0.6));
  };

  // Per frame. The mixer only writes a bone when the clip's value changed since its last write, so
  // during a held pose our offsets would survive and pile up frame after frame. Restore the clean
  // animated pose first, run the mixer, snapshot it, then layer: arm onto the target, recoil, and
  // the head last (so the gaze holds through the kick).
  const layered = [upper, chestB, neckB, headB].filter(Boolean);
  const clean = layered.map((b) => b.quaternion.clone());
  const update = (dt, target) => {
    layered.forEach((b, i) => b.quaternion.copy(clean[i]));
    mixer.update(dt);
    layered.forEach((b, i) => clean[i].copy(b.quaternion));
    if (target) aimAt(target);
    recoil(dt);
    if (target) look(target);
  };
  return { root, play, walkSpeed, jogSpeed, muzzle, aimWeight, kick, update, clips: Object.keys(acts) };
}
// C00SHOT frames: 0 gun up, 3 fires high, 4 recovers high; 1-2 level aim, 5 fires level, 6 recovers; 8 aims low, 7 fires low
const SHOT_SEQ = { high: [0, 3, 3, 4], level: [2, 5, 5, 6], low: [8, 7, 7, 8] };

const T = {
  place: 'the desert canyon',
  comms: { COMMS4: 'Charon!\nI have a contract for you, assassin.', COMMS5: 'I know you have lost your memory but ...',
           COMMS6: 'you are still the Perfect Assassin and we need your services.',
           SPACE: 'I am Ul D-Grak. Seek me at the Carteele on the planet Kar-Naq and I shall give you the details.' },
};
const INTRO = ['FLYBY', 'FLYBY2', 'INTRO0', 'COMMS1', 'COMMS2', 'COMMS3', 'COMMS4', 'COMMS5', 'COMMS6', 'SPACE', 'INTRO5', 'INTRO6', 'ENDINTRO'];

const $ = (s) => document.querySelector(s);
const ui = { label: $('#hover'), say: $('#say'), note: $('#note'), loc: $('#loc'), cam: $('#cam'), sub: $('#subtitle'), ammo: $('#ammo'), tools: $('#tools'),
             shield: $('#shield'), intro: $('#intro'), video: $('#video'), start: $('#start'), skip: $('#skip'), loading: $('#loading') };

function b64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function loadTex(url, opts = {}) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter; t.generateMipmaps = !opts.nearest;
    t.anisotropy = 8; res(t);
  }, undefined, rej));
}

// ---------------------------------------------------------------- world build
async function buildWorld(name) {
  const W = await (await fetch(`data/${name}.json`)).json();
  const masks = [], blockMeshes = [];          // 8-unit wall masks per layer; the 1997 floor/wall meshes
  const P = b64(W.planes), F = b64(W.forms);
  const cell = (p, x, y) => (x < 0 || y < 0 || x > 63 || y > 63) ? 0 : P[p * 4096 + y * 64 + x];
  const form = (f, px, py) => F[f * 4096 + py * 64 + px];
  // remake textures (data/NAME_*_hd.png, same layouts at a larger scale) unless ?tex=orig; each falls back to 1997's
  const HD = new URLSearchParams(location.search).get('tex') !== 'orig';
  const [floorTex, wallTex, spriteTex, skyTex] = await Promise.all(['floor', 'walls', 'sprites', 'sky'].map(async (k) => {
    if (HD) { try { const t = await loadTex(`data/${name}_${k}_hd.png`); t.userData.hd = true; return t; } catch (e) { /* none yet */ } }
    return loadTex(`data/${name}_${k}.png`, { nearest: k === 'sky' });
  }));
  wallTex.wrapS = THREE.ClampToEdgeWrapping;
  const group = new THREE.Group();
  const pick = [];               // meshes that answer hover
  const names = W.names;

  // floor: one quad per cell, UVs into the 320x200 tile sheet (5 tiles of 64 per row)
  {
    const pos = [], uv = [], idx = [], faceName = [];
    let v = 0;
    const e = 0.5 / 320, ev = 0.5 / 200;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const t = cell(7, x, y) & 0x1f;
      const u0 = (t % 5) * 64 / 320 + e, u1 = ((t % 5) * 64 + 64) / 320 - e;
      const v0 = 1 - (Math.floor(t / 5) * 64) / 200 - ev, v1 = 1 - (Math.floor(t / 5) * 64 + 64) / 200 + ev;
      const X0 = x * CELL, X1 = X0 + CELL, Z0 = y * CELL, Z1 = Z0 + CELL;
      pos.push(X0, 0, Z0, X1, 0, Z0, X1, 0, Z1, X0, 0, Z1);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      faceName.push(names.floor[t] || 'sand', names.floor[t] || 'sand');
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: floorTex, side: THREE.DoubleSide }));
    m.userData = { kind: 'floor', faceName }; group.add(m); pick.push(m); blockMeshes.push(m);
  }

  // walls: two stacked layers; each cell is empty, solid, or a "form" (64x64 outline bitmap, 4 rotations, 2 mirrors)
  const N = 64 * SUB;
  const solidA = new Uint8Array(N * N);
  for (let layer = 0; layer < 2; layer++) {
    const pt = layer ? 4 : 1, p2 = pt + 1, p3 = pt + 2;
    const mask = layer ? new Uint8Array(N * N) : solidA; masks.push(mask);
    const own = new Int16Array(N * N).fill(-1);     // packed cell index for texture lookup
    const uAt = new Int8Array(N * N).fill(-1);      // form edge texture column (0..63) or -1
    for (let cy = 0; cy < 64; cy++) for (let cx = 0; cx < 64; cx++) {
      const t = cell(pt, cx, cy), type = (t >> 5) & 3;
      if (type === 0 || type === 3) continue;
      const aux = cell(p3, cx, cy);
      for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
        const gi = (cy * SUB + sy) * N + cx * SUB + sx;
        if (type === 1) { mask[gi] = 1; own[gi] = cy * 64 + cx; continue; }
        // shaped: map local pixel through rotation/mirror into the form bitmap
        let lx = Math.floor((sx + 0.5) * 64 / SUB), ly = Math.floor((sy + 0.5) * 64 / SUB);
        if (aux & 0x40) lx = 63 - lx;
        if (aux & 0x80) ly = 63 - ly;
        let fx, fy;
        switch (t & 3) { case 0: fx = lx; fy = ly; break; case 1: fx = ly; fy = 63 - lx; break;
                         case 2: fx = 63 - lx; fy = 63 - ly; break; default: fx = 63 - ly; fy = lx; }
        const f = aux & 0x3f;
        if (f >= W.nforms) continue;
        const c = form(f, fx, fy);
        if (c) { mask[gi] = 1; own[gi] = cy * 64 + cx; if (c >= 2 && f < 15) uAt[gi] = c - 2; }
      }
    }
    // emit boundary faces between solid and empty sub-pixels
    const pos = [], uv = [], idx = [], faceName = [];
    let v = 0;
    const nt = W.nwall, sw = 1 / nt;
    const z0 = layer * LAYER_H, z1 = z0 + LAYER_H, s = CELL / SUB;
    const quad = (ax, ay, bx, by, gi, axis, along, border) => {
      const ci = own[gi], cx = ci & 63, cy = ci >> 6, t = cell(pt, cx, cy), type = (t >> 5) & 3;
      let tex, u;
      if (type === 1) {
        tex = axis === 'x' ? cell(p2, cx, cy) : cell(p3, cx, cy);
        u = along; if ((axis === 'x' && (t & 1)) || (axis === 'y' && (t & 2))) u = SUB - 1 - u;
        u = u / SUB;
      } else {
        tex = cell(p2, cx, cy);
        u = (!border && uAt[gi] >= 0) ? uAt[gi] / 64 : along / SUB;
      }
      tex = Math.min(tex, nt - 1);
      const du = 1 / SUB, U0 = (tex + u) * sw, U1 = (tex + Math.min(1, u + du)) * sw;
      pos.push(ax, z0, ay, bx, z0, by, bx, z1, by, ax, z1, ay);
      uv.push(U0, 0, U1, 0, U1, 1, U0, 1);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
      const nm = names.walls[tex] || 'rock';
      faceName.push(nm, nm);
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gi = y * N + x; if (!mask[gi]) continue;
      const X = x * s, Y = y * s, lx = x % SUB, ly = y % SUB;
      // faces point from the solid pixel toward the empty neighbour; winding keeps front faces outward
      if (y > 0 && !mask[gi - N]) quad(X + s, Y, X, Y, gi, 'y', SUB - 1 - lx, ly === 0);                // north
      if (y < N - 1 && !mask[gi + N]) quad(X, Y + s, X + s, Y + s, gi, 'y', lx, ly === SUB - 1);       // south
      if (x > 0 && !mask[gi - 1]) quad(X, Y, X, Y + s, gi, 'x', ly, lx === 0);                        // west
      if (x < N - 1 && !mask[gi + 1]) quad(X + s, Y + s, X + s, Y, gi, 'x', SUB - 1 - ly, lx === SUB - 1); // east
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.DoubleSide }));
    m.userData = { kind: 'wall', faceName }; group.add(m); pick.push(m); blockMeshes.push(m);
  }

  // map objects (rocks, casks): plane0 bit7 + plane8 low 5 bits = sprite index + 1, high 3 bits = position in cell
  const SPOT = [[128, 128], [64, 64], [128, 64], [192, 64], [64, 128], [192, 128], [64, 192], [192, 192]];
  const sw = spriteTex.image.width, sh = spriteTex.image.height;
  const atlasK = sw / (Math.max(...W.sprites.map((r) => r[0] + r[2])) + 1);     // 1 for 1997's sheet, 4 for the HD one
  const objSprite = (i, X, Y, Z = 0, scale = 1) => {
    const [sx, sy, w, h] = W.sprites[i];
    const tex = spriteTex.clone(); tex.needsUpdate = true;
    tex.repeat.set(w * atlasK / sw, h * atlasK / sh); tex.offset.set(sx * atlasK / sw, 1 - (sy + h) * atlasK / sh);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.05 })); spr.center.set(0.5, 0.06);
    spr.position.set(X, Z, Y); spr.scale.set(w * SPRITE_SCALE * scale, h * SPRITE_SCALE * scale, 1);
    spr.userData = { kind: 'object', sprite: i, name: names.sprites[i] || 'rock', radius: w * SPRITE_SCALE * scale * 0.35 };
    return spr;
  };
  const objects = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const o = cell(8, x, y), i = (o & 0x1f) - 1;
    if (i < 0 || i >= W.sprites.length) continue;
    // plane-0 bit 7 flags the canyon's own objects; the cave's rocks (rows 1-3, seen from its cameras C3/C4
    // in the 1997 game) carry no flag, so rock sprites (0-3) are taken anywhere west of the city wall too
    if (!(cell(0, x, y) & 0x80) && !(i <= 3 && x < 24)) continue;
    const [ox, oy] = SPOT[o >> 5];
    let zn = cell(9, x, y) & 0xf; if (zn & 8) zn -= 16;
    const spr = objSprite(i, x * CELL + ox, y * CELL + oy, Math.max(0, zn) * 16);
    group.add(spr); pick.push(spr); objects.push(spr);
  }

  // walk grid: 4 nodes per cell; blocked by any solid lower-layer sub-pixel, then by the footprint of every live blocker
  const G = 256, walkBase = new Uint8Array(G * G), walk = new Uint8Array(G * G);
  const k = SUB / 4;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let free = 1;
    for (let yy = -1; yy <= k && free; yy++) for (let xx = -1; xx <= k; xx++) {
      const sx = gx * k + xx, sy = gy * k + yy;
      if (sx < 0 || sy < 0 || sx >= N || sy >= N || solidA[sy * N + sx]) { free = 0; break; }
    }
    walkBase[gy * G + gx] = free;
  }
  const blockers = new Set(objects);
  const rebuildWalk = () => {
    walk.set(walkBase);
    for (const o of blockers) {
      const X = o.position.x, Y = o.position.z, r = o.userData.radius + 40;
      for (let gy = Math.floor((Y - r) / 64); gy <= Math.floor((Y + r) / 64); gy++)
        for (let gx = Math.floor((X - r) / 64); gx <= Math.floor((X + r) / 64); gx++) {
          if (gx < 0 || gy < 0 || gx >= G || gy >= G) continue;
          const dx = gx * 64 + 32 - X, dy = gy * 64 + 32 - Y;
          if (dx * dx + dy * dy < r * r) walk[gy * G + gx] = 0;
        }
    }
  };
  rebuildWalk();
  // open (v = 1) or close (0) the walk grid over a world rect: the remake's city past the gate
  const setWalk = (x0, z0, x1, z1, v) => {
    for (let gy = Math.max(0, Math.ceil((z0 - 32) / 64)); gy <= Math.min(G - 1, Math.floor((z1 - 32) / 64)); gy++)
      for (let gx = Math.max(0, Math.ceil((x0 - 32) / 64)); gx <= Math.min(G - 1, Math.floor((x1 - 32) / 64)); gx++) walkBase[gy * G + gx] = v;
  };
  return { W, group, pick, skyTex, walk, G, objects, objSprite, blockers, rebuildWalk, setWalk, masks, N, blockMeshes };
}

// ---------------------------------------------------------------- sky
// The sky sheet is 640 wide, but only the first 512 columns hold sky (the rest is black padding). The engine wraps
// it with the camera yaw, one 512-pixel strip per 512 angle units, so a full turn shows it four times. A dome that
// follows the camera reproduces that, and the sheet's top row colour fills everything above it.
function buildSky(src) {
  // 1997's sky is 512 px of image in a 640 px sheet; a remake panorama is used whole, mirrored at its ends
  const hd = !!src.userData.hd, img = src.image, W = hd ? img.width : Math.min(512, img.width), H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, 2).data;
  let r = 0, gg = 0, b = 0; for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4, top = new THREE.Color(`rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = hd ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; t.repeat.set(hd ? 2 : 4, 1); t.magFilter = THREE.LinearFilter;
  // a band from below the horizon up to ~38 degrees; walls and floor hide the lower part
  const R = 30000, up = R * Math.tan(38 * Math.PI / 180), down = R * 0.15;
  const geo = new THREE.CylinderGeometry(R, R, up + down, 64, 1, true);
  geo.translate(0, (up - down) / 2, 0);
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.renderOrder = -1; dome.frustumCulled = false;
  dome.onBeforeRender = (r, s, cam) => dome.position.copy(cam.position);
  return { dome, top };
}

// ---------------------------------------------------------------- pathfinding (A* on the walk grid)
function findPath(world, sx, sy, tx, ty) {
  const { walk, G } = world;
  const id = (x, y) => y * G + x;
  const near = (x, y) => {                              // nearest walkable node to a clicked point
    if (walk[id(x, y)]) return [x, y];
    for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < G && ny < G && walk[id(nx, ny)]) return [nx, ny];
    }
    return null;
  };
  const a = near(sx, sy), b = near(tx, ty); if (!a || !b) return null;
  const g = new Float32Array(G * G).fill(Infinity), from = new Int32Array(G * G).fill(-1), closed = new Uint8Array(G * G);
  const open = [[0, id(a[0], a[1])]]; g[open[0][1]] = 0;
  const goal = id(b[0], b[1]);
  const h = (i) => Math.hypot((i % G) - b[0], Math.floor(i / G) - b[1]);
  let steps = 0;
  while (open.length && steps++ < 60000) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const cx = cur % G, cy = Math.floor(cur / G);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
      const ni = id(nx, ny); if (!walk[ni] || closed[ni]) continue;
      if (dx && dy && (!walk[id(cx + dx, cy)] || !walk[id(cx, cy + dy)])) continue;
      const ng = g[cur] + (dx && dy ? 1.4142 : 1);
      if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; open.push([ng + h(ni), ni]); }
    }
  }
  if (from[goal] < 0 && goal !== id(a[0], a[1])) return null;
  const path = []; let c = goal;
  while (c >= 0) { path.push([(c % G) * 64 + 32, Math.floor(c / G) * 64 + 32]); c = from[c]; }
  path.reverse();
  // string-pull: drop nodes that a straight walk can skip
  const clear = (p, q) => {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 24);
    for (let i = 0; i <= n; i++) { const x = p[0] + (q[0] - p[0]) * i / n, y = p[1] + (q[1] - p[1]) * i / n;
      if (!walk[id(Math.floor(x / 64), Math.floor(y / 64))]) return false; }
    return true;
  };
  const out = [path[0]]; let i = 0;
  while (i < path.length - 1) { let j = path.length - 1; while (j > i + 1 && !clear(path[i], path[j])) j--; out.push(path[j]); i = j; }
  return out;
}

// ---------------------------------------------------------------- sprite sheets (rows = frames, columns = views)
// Bump when sheets are re-exported, so a cached PNG of the old layout is never paired with new JSON.
const SHEET_V = 'v7';
async function sheet(name) {
  const meta = await (await fetch(`media/${name}.json?${SHEET_V}`)).json();
  const tex = await loadTex(`media/${name}.png?${SHEET_V}`);
  return { meta, tex };
}
// The original stores frames top-aligned, each with its own height, and stands every frame on its own bottom
// edge. meta.gap[frame][view] is the empty space under a frame inside its cell; ground sprites drop by that much.
// Sheets rendered by tools/sprites carry world_scale and a fixed ground anchor instead: no per-frame drop, and the
// horizontal anchor is the character's own origin rather than the cell centre.
function sheetSprite(S, scale = SPRITE_SCALE, cy = 0.02, ground = true, k = 1) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.05, depthWrite: ground }));
  spr.center.set(0.5, cy);
  spr.userData.setSheet = ({ meta, tex }) => {
    const t = tex.clone(); t.needsUpdate = true;
    spr.material.map = t; spr.material.needsUpdate = true; spr.userData.sheet = meta;
    const rendered = meta.world_scale != null, s = (rendered ? meta.world_scale : scale) * k, c0 = rendered ? 0 : cy;
    const ax = rendered && meta.anchor_in_cell ? meta.anchor_in_cell[0] / meta.cell_w : 0.5;
    spr.scale.set(meta.cell_w * s, meta.cell_h * s, 1);
    spr.userData.cell = (view, frame, flip = false) => {
      t.repeat.set((flip ? -1 : 1) / meta.views, 1 / meta.frames);
      t.offset.set((view + (flip ? 1 : 0)) / meta.views, 1 - (frame + 1) / meta.frames);
      spr.center.x = flip ? 1 - ax : ax;
      if (ground && meta.gap) spr.center.y = c0 + meta.gap[frame][view] / meta.cell_h;
    };
    spr.userData.cell(0, 0);
  };
  spr.userData.setSheet(S);
  return spr;
}

// ---------------------------------------------------------------- level data
// PICKUPS.BIN instances 0-10 (32-byte records at 0x3F6): item = LIST0002 index, owner = CHARACTS instance carrying it.
// Conversation item topics <0,n> refer to these instance numbers, not to item types.
const PICKUPS = [
  { i: 0, item: 2, owner: 215 },                         // jakhari pipe, on the dead jakhari by the start
  { i: 1, item: 64, owner: 2, qty: 2 },                  // explosive shells, on the dead pra'min kommando
  { i: 2, item: 7, x: 2432, y: 2144, under: 'boulder' }, // Porta-Spa, flag 0x80: hidden under the boulder in cell (9,8)
  { i: 3, item: 62, x: 1648, y: 704, qty: 4, in: 'cask' }, // ammo cache in the sealed metal cask, left cave
  { i: 4, item: 9, x: 4736, y: 640, qty: 100 },          // shield charger, sealed cave
  { i: 5, item: 62, x: 4736, y: 768, qty: 2 },
  { i: 6, item: 62, x: 4864, y: 672, qty: 2 },
  { i: 7, item: 10, owner: 3 },                          // folded paper, carried by the komms pra'min
  { i: 8, item: 11, owner: 1 },                          // torn paper, carried by G'Ssett Kasse
  { i: 10, item: 0, owner: 6 },                          // doolan sidearm, Ich'Flah keeps it
];
const AMMO = [{ item: null, dmg: 4, speed: 3600 }, { item: 62, dmg: 9, speed: 6500 }, { item: 64, dmg: 16, speed: 3000 }];
const EXAMINE = new Set([2, 7, 9, 10, 11]);              // items with a PU#### close-up clip
const GATE_CODE = '158758';                              // torn paper "15" + folded paper "758"
const HEADS = { 7: { atlas: 'h02', voice: (v) => 'GURGLE' + (1 + 'AEIOSU'.indexOf(v)) }, 8: { atlas: 'h01', voice: (v) => 'DOOLAN' + (v === 'S' ? 'S' : v) } };
const CHARON_SET = [{ atlas: 'charon2', voice: (v) => 'CHARON' + v + '2' },   // meek
                    { atlas: 'charon0', voice: (v) => 'CHARON' + v },         // normal
                    { atlas: 'charon1', voice: (v) => 'CHARON' + v + '1' }];  // aggressive

// ---------------------------------------------------------------- sound
const SFX = {};
function sfx(name, vol = 0.6) {
  try {
    if (!SFX[name]) SFX[name] = new Audio(`media/sfx/${name}.mp3`);
    const a = SFX[name].cloneNode(); a.volume = vol; a.play().catch(() => {});
  } catch (e) { /* audio is optional */ }
}

// ---------------------------------------------------------------- talking heads (rest pose + A/E/I/O/S/U viseme clips)
const ATLAS = {};
function atlas(key) {
  if (!ATLAS[key]) ATLAS[key] = Promise.all([
    fetch(`media/talk/${key}.json`).then((r) => r.json()),
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `media/talk/${key}.jpg`; }),
  ]).then(([meta, img]) => ({ meta, img }));
  return ATLAS[key];
}
class Head {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.a = null; this.timer = 0; }
  async use(set) { this.set = set; this.a = await atlas(set.atlas); this.frame(0); }
  frame(i) {
    if (!this.a) return;
    const { meta, img } = this.a;
    this.g.drawImage(img, (i % meta.cols) * meta.w, Math.floor(i / meta.cols) * meta.h, meta.w, meta.h, 0, 0, meta.w, meta.h);
  }
  stop() { clearTimeout(this.timer); this.frame(0); }
  // one viseme per word (its first vowel), each clip played at double speed with the matching voice syllable
  say(text, done) {
    this.stop();
    const vis = text.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).slice(0, 22).map((w) => {
      const m = w.toLowerCase().match(/[aeiou]/); return !m || /^s/i.test(w) && w.length < 4 ? 'S' : m[0].toUpperCase();
    });
    // time-based, so a slow frame rate shortens the mouth movement instead of stretching the line
    const dur = vis.map((v) => Math.min(16, this.a ? this.a.meta.vis[v][1] : 16) * 21);   // ms: clip at double speed
    const t0 = performance.now(); let lastK = -1;
    const step = () => {
      let t = performance.now() - t0, k = 0;
      while (k < vis.length && t >= dur[k]) t -= dur[k++];
      if (!this.a || k >= vis.length) { this.frame(0); done && done(); return; }
      const [s0, n] = this.a.meta.vis[vis[k]];
      if (k !== lastK && this.set.voice) { lastK = k; sfx(this.set.voice(vis[k]), 0.45); }
      this.frame(s0 + Math.min(n - 1, Math.floor(t / 21)));
      this.timer = setTimeout(step, 40);
    };
    step();
  }
}

// ---------------------------------------------------------------- picking
// Three.js picks sprites by their whole rectangle; a click should only land on a sprite's visible pixels.
const ALPHA = new Map();
function opaqueAt(spr, uv) {
  const t = spr.material.map, img = t && t.image;
  if (!img || !uv) return true;
  let c = ALPHA.get(img);
  if (!c) {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    c = { a: g.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height }; ALPHA.set(img, c);
  }
  const x = Math.floor((t.offset.x + uv.x * t.repeat.x) * c.w), y = Math.floor((1 - (t.offset.y + uv.y * t.repeat.y)) * c.h);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {     // a 2px margin so thin sprites stay clickable
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < c.w && yy < c.h && c.a[(yy * c.w + xx) * 4 + 3] > 100) return true;
  }
  return false;
}
const solidHits = (hits) => hits.filter((h) => !h.object.isSprite || opaqueAt(h.object, h.uv));

// ---------------------------------------------------------------- game
async function main() {
  const renderer = new THREE.WebGLRenderer({ canvas: $('#view'), antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 110, 45000);

  const world = await buildWorld('CANYON');
  scene.add(world.group);
  // remake landscape (terrain.js) unless ?world=orig; the 1997 meshes stay, unseen, for picking and names
  if (new URLSearchParams(location.search).get('world') !== 'orig') {
    const T = await import('./terrain.js');
    const Wd = world.W, seeds = [Wd.start.pos, ...Wd.npcs.map((n) => [n.x, n.y])];
    for (const L of Object.values(Wd.locations)) for (const l of L.links) seeds.push(l.arrive);
    const t0 = performance.now();
    // the city wall stands across the east end (cells 24-25, rows 1-10, gatehouse at row 6); the city lies behind it
    const WALL_X = 24 * 256;
    // passages through the canyon's north cliff into the cave, where the 1997 'cave mouth' cells are
    const MOUTHS = [[2620, 700, 2800, 1150], [3880, 700, 4060, 1190]];
    const terrain = T.buildTerrain({ masks: world.masks, N: world.N, seeds,
      flat: [[WALL_X, -99999, 99999, 99999], [WALL_X - 300, 1460, WALL_X, 1880], ...MOUTHS],
      pave: { id: 'concrete_floor_worn_001', rect: [WALL_X - 1000, 1180, WALL_X + 40, 2160] }, sinkX: WALL_X + 300 });   // the gate forecourt
    scene.add(terrain.mesh); world.terrain = terrain;
    const S = await import('./structures.js');
    const cityWall = S.buildCityWall({ renderer, face: WALL_X });
    scene.add(cityWall); world.cityWall = cityWall;
    world.animated = [cityWall];
    world.blockMeshes.forEach((m) => { m.visible = false; });
    world.lights = T.addSun(scene, renderer, terrain.bounds);
    // the cave: rooms reached from the canyon's cave links, roofed over (passages included)
    // the doorway cells are only partly solid, so close them for this search or it leaks into the canyon
    const caveLinks = Object.values(Wd.locations)[0].links.filter((l) => l.to === 1);
    const shut = world.masks[0].slice();
    for (const l of caveLinks) for (let z = l.cell[1] * 32; z < l.cell[1] * 32 + 32; z++) for (let x = l.cell[0] * 32; x < l.cell[0] * 32 + 32; x++) shut[z * world.N + x] = 1;
    const caveR = T.reachable(shut, world.N, 8, caveLinks.map((l) => [l.arrive[0], l.arrive[1] - 100]));
    // the roof covers only the part of each passage inside the cliff (row 3), not the canyon in front
    const inMouth = (X, Z) => MOUTHS.some(([a, b, c]) => X >= a && X <= c && Z >= 700 && Z <= 990);
    const caveOpen = (X, Z) => { const i = Math.floor(Z / 8) * world.N + Math.floor(X / 8); return (X >= 0 && Z >= 0 && caveR[i]) || inMouth(X, Z); };
    let cx0 = 1e9, cz0 = 1e9, cx1 = -1e9, cz1 = -1e9;
    for (let i = 0; i < caveR.length; i++) if (caveR[i]) { const X = (i % world.N) * 8, Z = Math.floor(i / world.N) * 8; cx0 = Math.min(cx0, X); cx1 = Math.max(cx1, X); cz0 = Math.min(cz0, Z); cz1 = Math.max(cz1, Z); }
    for (const [a, , c] of MOUTHS) { cx0 = Math.min(cx0, a); cx1 = Math.max(cx1, c); }
    // 1997's cave has no openings in its roof: its only 'pool of light' floor tiles are the two mouth cells
    // (10,3) and (15,3), daylight reaching in from the canyon; the rest is evenly dim (soft fills)
    const ceiling = T.buildCaveCeiling({ open: caveOpen, x0: cx0 - 300, z0: cz0 - 300, x1: cx1 + 300, z1: cz1 + 300, maxHoles: 0 });
    scene.add(ceiling.mesh);
    for (const [fx, fz] of ceiling.fills) { const l = new THREE.PointLight(0xd9a070, 9, 1500, 1); l.position.set(fx, 220, fz); scene.add(l); }
    for (const [a, , c] of MOUTHS) {
      const l = new THREE.SpotLight(0xffe2b8, 22, 900, 0.75, 0.6, 1); l.position.set((a + c) / 2, 260, 1080);
      l.target.position.set((a + c) / 2, 0, 820); scene.add(l, l.target);
    }
    console.info('cave openings', ceiling.holes.length, 'fill lights', ceiling.fills.length);
    world.inCave = caveOpen;
    world.lights.cave = new THREE.AmbientLight(0xd8b090, 0); scene.add(world.lights.cave);
    // cave mouths (cave.js): a rock portal with an arch over each cut, hiding the ceiling's edge
    const CV = await import('./cave.js'); world.CV = CV;
    world.portals = MOUTHS.map(([a, , c], i) => CV.buildCavePortal({ terrain: terrain.mesh, x0: a, x1: c, zBack: 930, zMin: 1140, seed: i + 1 }));
    for (const P of world.portals) scene.add(P.mesh, P.void);
    // Kar-es-Taal past the gate (city.js): its streets join the walk grid once the gate opens
    if (new URLSearchParams(location.search).get('city') !== '0') {
      const C = await import('./city.js');
      const city = await C.buildCity({ renderer, terrainMaterial: terrain.mesh.material });
      scene.add(city.group); world.city = city; world.animated.push(city.group);
      world.pick.push(...city.pick);
      world.setWalk(C.CITY.x0 - 20, C.CITY.z0, 99999, C.CITY.z1, 0);
      for (const s of city.streets) world.setWalk(s[0], s[1], s[2], s[3], 1);
      for (const [x, z, r] of city.blockers) world.blockers.add({ position: new THREE.Vector3(x, 0, z), userData: { radius: r } });
      world.rebuildWalk();
      // the sun's shadows now cover the city too
      const B = { X0: Math.min(terrain.bounds.X0, city.bounds.X0), Z0: Math.min(terrain.bounds.Z0, city.bounds.Z0), X1: Math.max(terrain.bounds.X1, city.bounds.X1), Z1: Math.max(terrain.bounds.Z1, city.bounds.Z1) };
      const sun = world.lights.sun, scx = (B.X0 + B.X1) / 2, scz = (B.Z0 + B.Z1) / 2, span = Math.max(B.X1 - B.X0, B.Z1 - B.Z0) / 2;
      sun.position.set(scx - 2600, 4200, scz + 1500); sun.target.position.set(scx, 0, scz);
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span }); sun.shadow.camera.updateProjectionMatrix();
      console.info('city', city.stats);
    }
    scene.userData.worldLit = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene.fog = new THREE.Fog(0xd2ad86, 4500, 16000);
    console.info('terrain built in', Math.round(performance.now() - t0), 'ms', terrain.mesh.geometry.attributes.position.count, 'verts');
  }
  const sky = buildSky(world.skyTex);
  scene.background = sky.top; scene.add(sky.dome);
  const W = world.W;

  // ?hero=NAME swaps in sheets rendered by tools/sprites (NAME_WALK, NAME_IDLE); anything missing falls back to 1997's.
  const HERO = new URLSearchParams(location.search).get('hero');
  const heroSheet = async (anim, fallback) => {
    if (HERO) { try { return await sheet(`${HERO}_${anim}`); } catch (e) { /* not rendered yet */ } }
    return fallback ? sheet(fallback) : null;
  };
  const [walkS, idleS, shotS, expS, sparkS, boltS] = await Promise.all([heroSheet('WALK', 'C00WALK'), heroSheet('IDLE', null),
    ...['C00SHOT', 'EXP3', 'EXP1', 'FIREBALL'].map(sheet)]);
  const charon = sheetSprite(walkS, SPRITE_SCALE, 0.02, true, CHAR_SCALE);
  const charonIdle = idleS ? sheetSprite(idleS, SPRITE_SCALE, 0.02, true, CHAR_SCALE) : null;
  const charonShot = sheetSprite(shotS, SPRITE_SCALE, 0.02, true, CHAR_SCALE); charonShot.visible = false;
  scene.add(charon, charonShot); if (charonIdle) { charonIdle.visible = false; scene.add(charonIdle); }
  let idleT = 0;
  const hero = { x: W.start.pos[0], y: W.start.pos[1], dir: Math.PI / 2, path: [], onArrive: null, goal: null, shootT: 0, aimHold: 0 };
  const HERO3D = new URLSearchParams(location.search).get('hero3d');
  let hero3d = null;
  if (HERO3D) {
    try { hero3d = await loadHero3D(HERO3D, renderer, scene); scene.add(hero3d.root); hero3d.root.rotation.y = Math.PI / 2 - hero.dir; }
    catch (e) { console.warn('hero3d: could not load', HERO3D, e); }
  }

  // ------------------------------------------------ text
  const TX = W.text, LIST = W.lists;
  const clean = (s) => (s || '').replace(/<[^>]*>/g, '').replace(/%/g, ' ').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
  const fill = (s, n) => clean(s).replace('[]', n);
  const verb = (i) => clean(TX[i]) + ' ';      // 1997's hover verbs: 22 Talk to, 23 Call to, 25 Pick up, 26 Use, 28 Read
  const itemName = (id) => clean(TX[LIST.LIST0002 + id]) || `item ${id}`;
  const placeName = (n) => clean(TX[LIST.LIST0003 + n]);
  const personName = (n) => clean(TX[LIST.LIST0005 + n]);
  const typeName = (t) => clean(TX[LIST.LIST0001 + t]) || 'stranger';
  const pickup = (i) => PICKUPS.find((p) => p.i === i);
  const topicName = (t, n) => {
    const s = t === 0 ? (pickup(n) ? itemName(pickup(n).item) : '') : t === 1 ? personName(n) : t === 2 ? placeName(n) : clean(TX[LIST.LIST0004 + n]);
    return s || `topic ${t}.${n}`;
  };

  // ------------------------------------------------ flags and Charon's kit
  const flags = { visitedCave: false, komms: 'waiting', gateFavour: false, gateOpen: false };
  const inv = new Map();                       // item id -> quantity (papers, pipe, Porta-Spa, charger)
  const ammo = { sel: 0, stock: [Infinity, 0, 0] };
  const known = new Map();                     // Ethereal Cortex: topics Charon has heard
  const learn = (line) => { for (const m of (line || '').matchAll(/<([0-3]),(\d+)>/g)) known.set(`${m[1]}.${m[2]}`, [+m[1], +m[2]]); };
  learn('<2,0><3,8>');                         // he knows where he is, and who hired him
  const takePickup = (p) => {
    p.taken = true;
    known.set(`0.${p.i}`, [0, p.i]);
    if (p.item === 62) { ammo.stock[1] += p.qty || 1; renderHud(); return fill(TX[135], ammo.stock[1]); }
    if (p.item === 64) { ammo.stock[2] += p.qty || 1; renderHud(); return fill(TX[136], ammo.stock[2]); }
    inv.set(p.item, (inv.get(p.item) || 0) + 1); renderHud();
    return itemName(p.item);
  };

  // ------------------------------------------------ locations, cameras, exits
  let locId = W.start.loc, loc = W.locations[locId], camIdx = -1, lastCell = null, linksArmed = true;
  const reachable = Object.keys(W.locations).map(Number).filter((n) => n !== 3);   // LOC0003 is an alternate state of LOC0000
  const inZones = (l, cx, cy) => l.zones.some(([zx, zy, zw, zh]) => cx >= zx && cx < zx + zw && cy >= zy && cy < zy + zh);
  const exitDir = (link) => {
    const dx = link.arrive[0] - (link.cell[0] * CELL + 128), dy = link.arrive[1] - (link.cell[1] * CELL + 128);
    const d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d];
  };
  const sealed = new Set(['15,3']);            // the second cave is sealed by smugglers until blasted open
  const linkOpen = (l) => W.locations[l.to] && l.to !== 3 && !sealed.has(l.cell.join(','));

  const exitGroup = new THREE.Group(); scene.add(exitGroup);
  const chevron = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(120,180,255,0.95)'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const o of [0, 34]) { g.beginPath(); g.moveTo(34 + o, 24); g.lineTo(70 + o, 64); g.lineTo(34 + o, 104); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const showExits = () => {
    exitGroup.clear();
    for (const link of loc.links) {
      if (!linkOpen(link)) continue;
      const [dx, dy] = exitDir(link);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshBasicMaterial({ map: chevron, transparent: true, depthWrite: false, opacity: 0.85 }));
      m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.rotation.y = -Math.atan2(dy, dx);
      m.position.set(link.cell[0] * CELL + 128, 3, link.cell[1] * CELL + 128);
      m.userData = { kind: 'exit', link }; exitGroup.add(m);
    }
  };
  const linkAt = (cx, cy) => loc.links.find((l) => l.cell[0] === cx && l.cell[1] === cy && linkOpen(l));

  const setCamera = (c) => {
    if (window.__camLock) return;                         // debug: a free camera set from the console
    const [x, y, z, yaw, pitch, , focal] = c;
    camera.position.set(x, z, y);
    const a = yaw * ANG, p = pitch * ANG;
    camera.lookAt(x + Math.cos(a) * Math.cos(p), z - Math.sin(p), y + Math.sin(a) * Math.cos(p));
    camera.userData.focal = focal;
    fit();
  };
  const fit = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const hf = 2 * Math.atan(LENS.k * 512 / (camera.userData.focal || 1134));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / camera.aspect));
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', fit);
  const enterLocation = (id) => {
    const from = locId;
    locId = id; loc = W.locations[id]; camIdx = -1; showExits();
    ui.loc.textContent = placeName(id === 3 ? 0 : id);
    if (id === 1) flags.visitedCave = true;
    if (id === 0 && from === 1 && flags.visitedCave && flags.komms === 'waiting') kommsRunPast();
  };
  const updateLocation = () => {
    const cx = Math.floor(hero.x / CELL), cy = Math.floor(hero.y / CELL);
    if (!lastCell || lastCell[0] !== cx || lastCell[1] !== cy) {
      lastCell = [cx, cy];
      const link = linkAt(cx, cy);
      if (!link) linksArmed = true;
      else if (linksArmed) {
        const [dx, dy] = exitDir(link), goal = hero.goal, then = hero.onArrive;
        enterLocation(link.to);
        hero.x = link.arrive[0]; hero.y = link.arrive[1];
        lastCell = [Math.floor(hero.x / CELL), Math.floor(hero.y / CELL)];
        linksArmed = !linkAt(lastCell[0], lastCell[1]);
        const ahead = goal && ((goal[0] - hero.x) * dx + (goal[1] - hero.y) * dy) > 64;
        if (ahead) walkTo(goal[0], goal[1], then);
        else walkTo(hero.x + dx * 200, hero.y + dy * 200);
      }
    }
    if (!inZones(loc, lastCell[0], lastCell[1])) {
      const other = reachable.find((n) => inZones(W.locations[n], lastCell[0], lastCell[1]));
      if (other != null && other !== locId) enterLocation(other);
    }
    let zi = loc.zones.findIndex(([zx, zy, zw, zh]) => lastCell[0] >= zx && lastCell[0] < zx + zw && lastCell[1] >= zy && lastCell[1] < zy + zh);
    if (zi < 0) zi = camIdx >= 0 ? loc.zones.findIndex((z) => z[4] === camIdx) : 0;
    const ci = loc.zones[Math.max(0, zi)][4];
    if (ci !== camIdx) {
      camIdx = ci; setCamera(loc.cams[ci] || loc.camera);
      ui.cam.textContent = `LOC ${String(locId).padStart(4, '0')} · CAM ${ci + 1}/${loc.cams.length}`;
    }
  };

  // ------------------------------------------------ HUD: shield, ammo, tool buttons
  const renderHud = () => {
    ui.ammo.innerHTML = AMMO.map((a, i) => {
      const q = ammo.stock[i];
      return `<button type="button" data-ammo="${i}" aria-pressed="${ammo.sel === i}" title="${clean(TX[705 + i])}" ${q <= 0 ? 'class="empty"' : ''}>`
        + `<kbd>${i + 1}</kbd>${['MP', 'HV', 'EX'][i]}<span>${q === Infinity ? '∞' : q}</span></button>`;
    }).join('');
  };
  const selectAmmo = (i, quiet) => {
    i = (i + 3) % 3;
    if (ammo.stock[i] <= 0) { if (!quiet) note(clean(TX[133])); return; }
    ammo.sel = i; renderHud(); if (!quiet) note(clean(TX[130 + i]));
  };
  ui.ammo.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) selectAmmo(+b.dataset.ammo); });
  renderHud();

  // ------------------------------------------------ messages
  let sayTimer = 0, noteTimer = 0;
  const say = (text) => {                      // Charon's remarks and search results
    ui.say.textContent = text; ui.say.hidden = false;
    clearTimeout(sayTimer); sayTimer = setTimeout(() => (ui.say.hidden = true), 2200 + text.length * 45);
  };
  const note = (text) => {                     // system lines: ammo, pickups
    ui.note.textContent = text; ui.note.hidden = false;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => (ui.note.hidden = true), 2600);
  };

  // ------------------------------------------------ Charon's shield
  const life = { shield: 100, dead: false };
  const setShield = (v) => { life.shield = Math.max(0, Math.min(100, v)); ui.shield.style.setProperty('--v', life.shield / 100); };
  const hurt = (n) => {
    if (life.dead) return;
    setShield(life.shield - n); sfx('BHIT', 0.5);
    document.body.classList.remove('hit'); void document.body.offsetWidth; document.body.classList.add('hit');
    if (life.shield <= 0) { life.dead = true; hero.path = []; sfx('SCREAM'); $('#dead').hidden = false; document.body.classList.remove('combat'); $('#mode').hidden = true; }
  };
  $('#retry').addEventListener('click', () => location.reload());

  // ------------------------------------------------ characters (CHARACTS.BIN instances on this map)
  const SHEETS = {};
  const getSheet = async (file) => { const n = file.replace(/\.PC$/i, ''); if (!SHEETS[n]) SHEETS[n] = sheet(n); return SHEETS[n]; };
  const npcs = [];
  // 1997 walk sheet -> real-time model. Heights from the sprites (Charon's 116 px = 190 units).
  // The komms pra'min shares the kommando's model, tinted toward its brown hide, until it has its own.
  const NPC_MODELS = {
    // k: this character's size on top of CHAR_SCALE (the pra'min run smaller than the rest)
    KMNDOWLK: { file: 'PRAMIN', height: 167, k: 0.7 },
    KOMMWALK: { file: 'PRAMIN', height: 150, tint: 0xd8a888, k: 0.7 },
    // the Jakari lie wounded after the ambush: 'wounded' loops while alive, 'dying' ends in the dead pose
    // the Doolans (Ich'Flah at the gate): robed, so a spine-only rig (tools/models/rig_robed.py); 'talk' in conversation
    DOOLWLK: { file: 'DOOLAN', height: 213, opt: { shadow: 0.35 } },
    JKWOUND: { file: 'JAKARI', height: 199, opt: { clips: { idle: 'wounded', death: 'dying' }, fixed: true, shadow: 0.6, pool: { r: 120, z: 60 } } },
  };
  const NPC3D_ON = new URLSearchParams(location.search).has('npc3d') ? new URLSearchParams(location.search).get('npc3d') !== '0' : !!HERO3D;
  const DEAD_AT_START = new Set([0, 2, 215, 219]);     // bodies left from the ambush
  const SPAWNED = new Set([3, 4, 5]);                  // group 21: the komms pra'min and the two it radios for
  for (const inst of W.npcs) {
    const [walkF, , , deadF] = inst.sprites;
    const wS = await getSheet(walkF);
    const dS = deadF !== '0' ? await getSheet(deadF) : null;
    const M = NPC3D_ON && NPC_MODELS[walkF.replace(/\.PC$/i, '')];
    const spr = sheetSprite(wS, SPRITE_SCALE, 0.02, true, CHAR_SCALE * ((M && M.k) || 1)); scene.add(spr);
    const npc = { inst, id: inst.id, type: inst.type, x: inst.x, y: inst.y, dir: Math.PI / 2, hp: Math.max(1, inst.hp),
      wS, dS, spr, hostile: inst.type === 0, state: DEAD_AT_START.has(inst.id) ? 'dead' : 'idle', active: !SPAWNED.has(inst.id),
      t: Math.random() * 2, anim: 0, cool: 1 + Math.random(), conv: W.convs[inst.conv] || null, met: false, introduced: false,
      searched: false, path: [], hitT: 0 };
    spr.userData.kind = 'npc'; spr.userData.npc = npc;
    // a real-time model in place of the sprite; the sprite stays, unseen, as the pick/hover target
    if (M) {
      try {
        npc.m3d = await loadCreature(M.file, M.height * (M.k || 1), scene, renderer, M.tint, M.opt);
        scene.add(npc.m3d.root);
        spr.material.colorWrite = false; spr.material.depthWrite = false;
        npc.m3d.root.rotation.y = Math.PI / 2 - npc.dir + (npc.m3d.fixed ? (npc.id * 2.39) % (Math.PI * 2) : 0);
        if (npc.state === 'dead') { const a = npc.m3d.play('death', 0); a.time = a.getClip().duration; }
      } catch (e) { console.warn('npc model', M.file, e); }
    }
    npcs.push(npc);
  }
  // drive an NPC's 3D model from the same state the sprite uses
  const updateNpcModel = (n, dt, walking) => {
    const m = n.m3d, r = m.root;
    r.visible = n.active;
    const px = r.position.x, pz = r.position.z;
    r.position.set(n.x, 0, n.y);
    const speed = dt > 0 ? Math.hypot(n.x - px, n.y - pz) / dt : 0;
    if (n.state === 'dead' || n.state === 'dying') m.play('death', 0.15);
    else if (walking) { const a = m.play('walk', 0.2); if (a) a.timeScale = Math.min(4, Math.max(0.6, speed / m.walkSpeed)); }
    else if (m.acts.talk && typeof dlg !== 'undefined' && dlg.npc === n) m.play('talk', 0.35);
    else m.play('idle', 0.3);
    if (m.pool) m.pool.scale.setScalar(n.state === 'dead' ? 1.35 : n.state === 'dying' ? Math.min(1.35, m.pool.scale.x + dt * 0.25) : 1);
    if (!m.fixed && n.state !== 'dead' && n.state !== 'dying') {
      let turn = (Math.PI / 2 - n.dir) - r.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      r.rotation.y += turn * Math.min(1, dt * 6);
    }
    m.flash(n.hitT > 0 ? 0.5 * n.hitT / 0.2 : 0);
    m.mixer.update(dt);
  };
  const npcById = (id) => npcs.find((n) => n.id === id);
  const npcName = (n) => n.introduced ? personName(n.id) : typeName(n.type);
  const cellAt = (spr, meta, i) => spr.userData.cell(i % meta.views, Math.floor(i / meta.views));
  // facing toward the camera as a fraction of a turn: 0 = facing the camera, 0.25 = facing screen right, 0.5 = away
  const npcView = (npc) => {
    const toCam = Math.atan2(camera.position.z - npc.y, camera.position.x - npc.x);
    let rel = npc.dir - toCam; rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return (1 - rel / (2 * Math.PI)) % 1;
  };
  // Pick a sheet column for that facing. A 'mirrored' sheet (9 or 5 views) stores the turn from front through
  // screen-right to back; the other half is the same images flipped.
  const faceCell = (spr, meta, turn, frame) => {
    const full = meta.mirrored ? (meta.views - 1) * 2 : meta.views;
    const v = Math.round(turn * full) % full;
    if (meta.mirrored && v >= meta.views) spr.userData.cell(full - v, frame, true);
    else spr.userData.cell(v, frame);
  };
  const clearShot = (ax, ay, bx, by) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 48);
    for (let i = 1; i < n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      if (!world.walk[Math.floor(y / 64) * world.G + Math.floor(x / 64)]) return false; }
    return true;
  };
  const npcPath = (n, X, Y) => { const p = findPath(world, Math.floor(n.x / 64), Math.floor(n.y / 64), Math.floor(X / 64), Math.floor(Y / 64)); n.path = p ? p.slice(1) : []; };

  // komms pra'min: runs past once Charon comes back out of the cave; if it gets away it radios two kommandos in
  const kommsRunPast = () => {
    const k = npcById(3); if (!k) return;
    flags.komms = 'running'; k.active = true; k.x = 1600; k.y = 1700; k.route = [[2900, 1450], [4550, 1800]];
    npcPath(k, ...k.route.shift());
  };
  const kommsEscaped = () => {
    const k = npcById(3); flags.komms = 'escaped'; k.active = false; k.path = [];
    setTimeout(() => {
      if (life.dead) return;
      flags.komms = 'returned';
      for (const id of [4, 5]) { const n = npcById(id); n.active = true; n.state = 'alert'; }
      if (k.state !== 'dead') { k.active = true; k.x = 4300; k.y = 2300; k.state = 'idle'; }
    }, 7000);
  };

  // ------------------------------------------------ props: rocks, the cask, the sealed cave, ground pickups, wall hotspots
  // a 3D cask in place of the cask sprites (sealed 4, broken 5); the sprite stays, unseen, for picking
  let PR3 = null;
  const attachCask = (PR, spr) => {
    const c = PR.buildCask(spr.scale.x * 0.82, spr.userData.sprite === 5);
    c.position.set(spr.position.x, 0, spr.position.z); c.rotation.y = 0.5; scene.add(c);
    spr.userData.model3d = c; spr.material.colorWrite = false; spr.material.depthWrite = false;
  };
  const props = [];
  const addProp = (spr, o) => { Object.assign(spr.userData, { kind: 'prop' }, o); props.push(spr); if (PR3 && (spr.userData.sprite === 4 || spr.userData.sprite === 5)) attachCask(PR3, spr); if (!world.group.children.includes(spr)) world.group.add(spr); world.pick.includes(spr) || world.pick.push(spr); return spr; };
  for (const o of world.objects) addProp(o, { hp: o.userData.name === 'boulder' ? 3 : 2 });
  const cask = addProp(world.objSprite(4, 1648, 704, 0), { hp: 1, cask: true });
  world.blockers.add(cask);
  const rubble = addProp(world.objSprite(2, 3968, 1070, 0, 2.4), { hp: 1, explosiveOnly: true, name: 'sealed cave mouth' });
  rubble.userData.radius = 170; world.blockers.add(rubble); world.rebuildWalk();
  // remake: 3D scanned rocks in place of the 1997 rock sprites (the sprite stays, unseen, for picking,
  // blocking and damage), and rubble along the feet of the cliffs
  if (world.terrain) {
    const PR = await import('./props.js'); PR3 = PR;
    PR.setCaskEnv((await modelSetup(scene, renderer)).env);
    await Promise.all(props.map(async (spr, i) => {
      if (spr.userData.sprite === 4 || spr.userData.sprite === 5) { attachCask(PR, spr); return; }
      const id = PR.SPRITE_ROCK[spr.userData.sprite]; if (!id) return;
      const r = await PR.placeRock(id, spr.position.x, spr.position.z, spr.scale.x * 0.95, (i * 2.39) % 6.28, { squash: 0.9 });
      scene.add(r); spr.userData.model3d = r;
      spr.material.colorWrite = false; spr.material.depthWrite = false;
    }));
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const E = world.terrain.edges, n = Math.min(90, E.length);
    await Promise.all(Array.from({ length: n }, async () => {
      const [x, z] = E[Math.floor(rnd() * E.length)], big = rnd() < 0.25;
      const r = await PR.placeRock(PR.RUBBLE[Math.floor(rnd() * PR.RUBBLE.length)], x, z, big ? 120 + rnd() * 160 : 30 + rnd() * 70, rnd() * 6.28, { sink: 0.3, squash: 0.6 + rnd() * 0.5 });
      scene.add(r);
    }));
    // the sealed mouth: a rockfall choking the second portal's arch, in place of the single boulder;
    // the explosive that clears the prop takes all of it
    if (world.portals) {
      const P = world.portals[1];
      const fall = world.CV.buildRockfall({ portal: P, material: world.terrain.mesh.material });
      if (rubble.userData.model3d) scene.remove(rubble.userData.model3d);
      scene.add(fall); rubble.userData.model3d = fall;
      rubble.position.x = P.cx; rubble.position.z = P.zFront + 30; world.rebuildWalk();
    }
  }
  const removeProp = (spr) => {
    if (spr.userData.model3d) scene.remove(spr.userData.model3d);
    world.group.remove(spr); props.splice(props.indexOf(spr), 1);
    world.pick.splice(world.pick.indexOf(spr), 1); world.blockers.delete(spr); world.rebuildWalk();
  };

  const OBJ = {};
  const objTex = (id) => OBJ[id] || (OBJ[id] = loadTex(`media/obj/OBJ${String(id).padStart(4, '0')}.png`));
  const ground = [];
  const dropPickup = async (p, X = p.x, Y = p.y) => {
    const t = await objTex(p.item);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.05 })); spr.center.set(0.5, 0.05);
    spr.scale.set(t.image.width * 1.5, t.image.height * 1.5, 1); spr.position.set(X, 0, Y);
    spr.userData = { kind: 'pickup', p, name: itemName(p.item) }; scene.add(spr); ground.push(spr);
  };
  for (const p of PICKUPS) if (p.x != null && !p.under && !p.in) dropPickup(p);

  // the notice and the keycode panel sit on the city wall beside Ich'Flah: find the wall face by casting east
  const hot = [];
  const wallPoint = (Y) => {
    const r = new THREE.Raycaster(new THREE.Vector3(5950, 170, Y), new THREE.Vector3(1, 0, 0), 0, 1500);
    const h = r.intersectObjects(world.pick.filter((m) => m.userData.kind === 'wall'), false)[0];
    return h ? h.point : new THREE.Vector3(6141, 170, Y);
  };
  const plaque = (tex, w, h, Y, name, action) => {
    const p = wallPoint(Y);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(p.x - 3, 170, p.z); m.rotation.y = -Math.PI / 2;
    m.userData = { kind: 'hotspot', name, action }; scene.add(m); hot.push(m);
  };
  const noticeTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 150; const g = c.getContext('2d');
    g.fillStyle = '#d9d4c6'; g.fillRect(0, 0, 256, 150); g.strokeStyle = '#5c574c'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 144);
    g.textAlign = 'center'; g.fillStyle = '#a01818'; g.font = 'bold 22px sans-serif'; g.fillText('Kar-es-Taal', 128, 44);
    g.font = 'bold 15px sans-serif'; g.fillText('RESTRICTED ACCESS', 128, 76);
    g.fillStyle = '#1d3a8a'; g.font = '13px sans-serif'; g.fillText('Citizens only.', 128, 102); g.fillText('Use your identity number.', 128, 124);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  plaque(noticeTex, 150, 88, 980, 'notice', () => openNotice());
  plaque(await loadTex('media/KEYPAD.png'), 64, 48, 1170, 'keycode entry panel', () => openKeypad());
  // remake: as in 1997 both hang on the city wall north of the doorway (the notice at z 980, the keypad at 1170);
  // the flat hotspot planes give way to a weathered notice panel and a keypad set into the stone, the planes
  // staying on as invisible click areas over their faces
  if (world.terrain) {
    const [notice, keypad] = hot;
    const { buildWallKeypad, buildNoticeBoard } = await import('./structures.js');
    const mount = (hs, g, f, y) => {               // hang g on the wall where the hotspot is, facing the canyon (-x)
      const p = hs.position; g.position.set(p.x - 1, y, p.z); g.rotation.y = -Math.PI / 2; scene.add(g);
      scene.remove(hs); g.add(hs); hs.material.visible = false;
      hs.geometry = new THREE.PlaneGeometry(f.width, f.height); hs.scale.set(1, 1, 1); hs.position.copy(f.center).add(new THREE.Vector3(0, 0, 4)); hs.rotation.set(0, 0, 0);
      return { x: p.x - 120, z: p.z, dir: 0 };     // walking up to it: stand in front, face east
    };
    const pad = buildWallKeypad({ renderer });
    keypad.userData.approach = mount(keypad, pad.group, pad.face, 150);
    const board = await buildNoticeBoard({ renderer, wall: true, title: 'KAR-ES-TAAL', lines: [
      { text: 'RESTRICTED ACCESS', color: '#9c1c16', font: 'bold 96px "Arial Black", Arial, sans-serif', gap: 128 },
      { text: 'Citizens only.', color: '#1c2a4a', font: 'bold 74px Arial, sans-serif', gap: 96 },
      { text: 'Use your identity number.', color: '#1c2a4a', font: 'bold 74px Arial, sans-serif', gap: 112 },
      { text: 'BY ORDER OF THE CIVIC COUNCIL', color: '#5a5448', font: 'bold 38px Arial, sans-serif' }] });
    board.group.scale.setScalar(0.75);
    notice.userData.approach = mount(notice, board.group, board.face, 175 - board.face.center.y * 0.75);
  }

  // ------------------------------------------------ overlays
  const overlays = ['#talk', '#panel', '#notice', '#keypad', '#examine', '#dead', '#end'];
  const anyOverlay = () => overlays.some((s) => !$(s).hidden);
  const paused = () => !$('#title').hidden || !ui.intro.hidden || anyOverlay();
  const closeAll = () => { closeTalk(); for (const s of ['#panel', '#notice', '#keypad', '#examine']) $(s).hidden = true; $('#pu').pause(); };

  const panel = (title, html, bind) => {
    $('#panel-title').textContent = title; $('#panel-body').innerHTML = html; $('#panel').hidden = false; hero.path = [];
    bind && bind($('#panel-body'));
  };
  $('#panel-close').addEventListener('click', () => ($('#panel').hidden = true));
  const icon = (id) => `<img src="media/obj/OBJ${String(id).padStart(4, '0')}.png" alt="">`;
  const openInventory = () => {
    const rows = [...inv.entries()].filter(([, q]) => q > 0);
    const ammoRows = [1, 2].filter((i) => ammo.stock[i] > 0).map((i) => `<li class="ammo">${icon(AMMO[i].item)}<b>${fill(TX[134 + i], ammo.stock[i])}</b></li>`);
    panel(clean(TX[33]), `<ul class="inv">${rows.map(([id]) =>
      `<li>${icon(id)}<b>${itemName(id)}</b><span>${EXAMINE.has(id) ? `<button type="button" data-ex="${id}">${clean(TX[69]).trim()}</button>` : ''}`
      + `${id === 9 ? '<button type="button" data-use="9">Use</button>' : ''}</span></li>`).join('')}${ammoRows.join('')}`
      + `<li class="ammo"><b>${clean(TX[134])}</b></li></ul>${rows.length ? '' : '<p class="dim">Nothing carried yet.</p>'}`, (b) => {
      b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-ex]'), u = e.target.closest('[data-use]');
        if (x) examine(+x.dataset.ex);
        if (u) { inv.delete(9); setShield(100); sfx('CHARGER1'); $('#panel').hidden = true; note('Shield recharged'); }
      });
    });
  };
  const examine = (id) => {
    $('#panel').hidden = true; $('#examine').hidden = false; $('#examine-name').textContent = itemName(id);
    const v = $('#pu'); v.src = `media/pu/PU${String(id).padStart(4, '0')}.mp4`; v.play().catch(() => {});
  };
  $('#examine').addEventListener('click', () => { $('#examine').hidden = true; $('#pu').pause(); });
  const KIND = [[712, 0], [713, 1], [714, 2], [715, 3]];
  const openCortex = () => panel(clean(TX[34]), KIND.map(([s, t]) => {
    const items = [...known.values()].filter(([tt]) => tt === t);
    return `<h3>${clean(TX[s]).replace(/^List known /, '')}</h3><p>${items.length ? items.map(([tt, n]) => `<span class="chip">${topicName(tt, n)}</span>`).join(' ') : '<span class="dim">—</span>'}</p>`;
  }).join(''));
  const openMission = () => panel(clean(TX[708]), `<p class="mission">${T.comms.SPACE}</p><p class="dim">Find a way into the city of Kar-es-Taal.</p>`);
  const openMenu = () => panel(clean(TX[702]), `<div class="menu"><button type="button" data-m="resume">Resume</button><button type="button" data-m="restart">Restart</button></div>`
    + `<dl class="keys"><dt>Click</dt><dd>walk, or the action named under the pointer</dd><dt>Right-click</dt><dd>combat mode on or off; in combat, click fires at the sight</dd>`
    + `<dt>1 2 3 · wheel</dt><dd>multi-purpose, high velocity, explosive</dd><dt>I C M</dt><dd>inventory, Ethereal Cortex, mission reminder</dd><dt>Esc</dt><dd>close a panel, or this menu</dd></dl>`, (b) => {
    b.addEventListener('click', (e) => { const m = e.target.closest('[data-m]'); if (!m) return; if (m.dataset.m === 'restart') location.reload(); else $('#panel').hidden = true; });
  });
  ui.tools.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ({ inv: openInventory, cortex: openCortex, mission: openMission, menu: openMenu })[b.dataset.tool]();
  });

  const openNotice = () => {
    learn(TX.slice(90, 99).join(''));
    $('#notice-text').innerHTML = [91, 93, 95, 97].map((i) => `<p class="${/c,224/.test(TX[i]) ? 'red' : 'blue'}">${clean(TX[i])}</p>`).join('');
    $('#notice').hidden = false;
  };
  $('#notice').addEventListener('click', () => ($('#notice').hidden = true));

  let code = '';
  const openKeypad = () => { code = ''; $('#kp-disp').textContent = '______'; $('#keypad').hidden = false; };
  $('#keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) { if (e.target.id === 'keypad') $('#keypad').hidden = true; return; }
    const k = b.dataset.k; sfx('BEEP', 0.35);
    if (k === 'x') { $('#keypad').hidden = true; return; }
    if (k === 'c') code = code.slice(0, -1); else if (code.length < 6) code += k;
    $('#kp-disp').textContent = code.padEnd(6, '_');
    if (code.length === 6) setTimeout(() => {
      if (code === GATE_CODE) { $('#keypad').hidden = true; openGate(); }
      else { $('#kp-disp').textContent = 'DENIED'; sfx('CLUNK'); setTimeout(() => { code = ''; $('#kp-disp').textContent = '______'; }, 900); }
    }, 250);
  });
  const openGate = () => {
    flags.gateOpen = true; sfx('CLANG');
    if (!world.city || !world.cityWall || !world.cityWall.userData.open) { $('#end').hidden = false; return; }
    // the remake: the gate rises and the way into Kar-es-Taal opens
    world.cityWall.userData.open();
    setTimeout(() => {
      const [a, b, c, d] = world.cityWall.userData.passage; world.setWalk(a, b, c, d, 1); world.rebuildWalk(); note('City of Kar-es-Taal');
      // the tunnel mouth becomes a click target: 1997's wall mesh (unseen, still used for picking) stands across it,
      // so a click into the gateway would otherwise land on that wall and go nowhere
      const gw = new THREE.Mesh(new THREE.BoxGeometry(c - a, 380, d - b), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      gw.position.set((a + c) / 2, 190, (b + d) / 2); gw.visible = false; gw.updateMatrixWorld();
      gw.userData = { kind: 'gateway', mid: (b + d) / 2, out: a - 160, in: c + 260 };
      world.pick.push(gw);
    }, 2600);
  };
  $('#end-restart').addEventListener('click', () => location.reload());

  // ------------------------------------------------ conversation: two talking heads over the dialogue bar
  const headC = new Head($('#p-charon')), headN = new Head($('#p-npc'));
  const dlg = { npc: null, verb: 1, filter: -1, attitude: 1, busy: false };
  const VERB = [TX[30], TX[31], TX[32], TX[137]];   // Who is / What is / Where is / Give me
  const fmtLine = (raw) => {
    const html = (raw || '').replace(/([\w'’-]+)<([0-3]),(\d+)>/g, '\u0001$1\u0002');
    return clean(html).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      .replace(/\u0001/g, '<em>').replace(/\u0002/g, '</em>');
  };
  const exchange = (question, answer, after) => {
    headC.stop(); headN.stop();               // a new question cuts off whoever is talking
    dlg.busy = true; $('#dlg-q').textContent = question; $('#dlg-line').innerHTML = '';
    const reply = () => {
      learn(answer); $('#dlg-line').innerHTML = fmtLine(answer); renderTopics();
      headN.say(answer, () => { dlg.busy = false; after && after(); if (/<8>/.test(answer)) setTimeout(closeTalk, 1200); });
    };
    if (question) headC.say(question, reply); else reply();
  };
  const compass = (fx, fy, tx, ty) => {      // TX 60-67 run West, SouthWest, South ... NorthWest; map y grows south
    const deg = Math.atan2(ty - fy, tx - fx) * 180 / Math.PI;
    return clean(TX[60 + ((Math.round((180 - deg) / 45) % 8) + 8) % 8]);
  };
  const PLACE_AT = { 0: [3200, 1700], 1: [2200, 700], 2: [5800, 1900] };
  const fallback = (t, v, n) => {          // engine fallbacks (strings 37-45, 60-67, 139-141, LIST0007) where the table has no row
    const npc = dlg.npc, dunno = () => TX[4912 + Math.floor(Math.random() * 8)];
    if (v === 3) {
      const p = t === 0 && pickup(n);
      if (p && (p.taken || inv.has(p.item))) return TX[139];
      if (p && p.owner === npc.id) return TX[141];
      return TX[140];
    }
    // subjects (LIST0004): 1997's STOPICS.BIN gives everyone the same few lines per subject and verb, one picked
    // at random (e.g. "Where is the Mojo Ladder?" -> "The Mojo Ladder's in the back streets to the east.")
    if (t === 3 && W.stopics && W.stopics[n] && v < 3) { const [s, c] = W.stopics[n][v]; if (s) return TX[s + Math.floor(Math.random() * c)]; }
    // people: byte 77 of each CHARACTS instance is what anyone says to "Who is <them>" (Dah'Mon Targ: 262-263)
    if (t === 1 && v === 0 && W.whois && W.whois[n] && npcById(n) !== npc) { const [s, c] = W.whois[n]; return TX[s + Math.floor(Math.random() * c)]; }
    if (v === 2 && t === 2 && PLACE_AT[n]) return compass(npc.x, npc.y, ...PLACE_AT[n]) + '.';
    if (v === 2 && t === 1) {
      const o = npcById(n); if (!o) return dunno();
      if (o === npc) return TX[709];
      if (o.state === 'dead') return personName(n) + TX[44];
      return Math.hypot(o.x - npc.x, o.y - npc.y) < 1600 ? personName(n) + TX[45] : compass(npc.x, npc.y, o.x, o.y) + '.';
    }
    if (v === 2 && t === 0) {
      const p = pickup(n); if (!p) return dunno();
      if (p.taken) return TX[40];
      if (p.owner === npc.id) return TX[39];
      if (p.owner != null) { const o = npcById(p.owner); return o ? npcName(o) + TX[41] : TX[42]; }
      return TX[42];
    }
    return dunno();
  };
  const ask = (t, n) => {
    const npc = dlg.npc; if (!npc) return;
    const q = clean(VERB[dlg.verb]) + ' ' + topicName(t, n) + '?';
    const row = npc.conv && npc.conv.table.find(([tt, v, nn]) => tt === t && v === dlg.verb && nn === n);
    exchange(q, row ? TX[row[3]] : fallback(t, dlg.verb, n));
  };
  const offer = (id) => {
    const npc = dlg.npc; if (!npc) return;
    const q = clean(TX[128]) + ' ' + itemName(id) + '.';
    if (npc.id === 6 && id === 7) {
      inv.delete(7); flags.gateFavour = true;
      exchange(q, TX[127], () => { note('Ich’Flah keys his forged code into the panel.'); setTimeout(openGate, 1600); });
    } else exchange(q, TX[141]);
  };
  const renderTopics = () => {
    $('#dlg-verbs').querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === dlg.verb)));
    $('#dlg-filter').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.f === dlg.filter)));
    $('#dlg-att').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.a === dlg.attitude)));
    const list = [...known.values()].filter(([t]) => dlg.filter < 0 || t === dlg.filter).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    $('#dlg-topics').innerHTML = list.map(([t, n]) => `<button type="button" data-t="${t}" data-n="${n}" class="k${t}">`
      + `${t === 0 && pickup(n) ? icon(pickup(n).item) : ''}${topicName(t, n)}</button>`).join('');
    const items = [...inv.entries()].filter(([, q]) => q > 0);
    $('#dlg-offer').innerHTML = items.length ? `<span>${clean(TX[128]).trim()}</span>` + items.map(([id]) => `<button type="button" data-give="${id}">${icon(id)}${itemName(id)}</button>`).join('') : '';
  };
  const openTalk = async (npc) => {
    const head = HEADS[npc.type];
    if (!head) { say(clean(TX[4912 + Math.floor(Math.random() * 8)])); return; }
    dlg.npc = npc; hero.path = [];
    $('#dlg-name').textContent = npcName(npc); $('#talk').hidden = false; ui.label.hidden = true;
    await Promise.all([headC.use(CHARON_SET[dlg.attitude]), headN.use(head)]);
    renderTopics();
    const g = npc.conv;
    const line = !g ? TX[4901] : g.count > 1 ? TX[g.greeting + Math.floor(Math.random() * g.count)] : TX[g.greeting];
    npc.met = true; exchange('', line);
  };
  function closeTalk() { if (!dlg.npc) return; dlg.npc = null; dlg.busy = false; headC.stop(); headN.stop(); $('#talk').hidden = true; }
  $('#dlg-verbs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'dlg-who') {
      const npc = dlg.npc; if (!npc) return;
      npc.introduced = true; known.set(`1.${npc.id}`, [1, npc.id]); $('#dlg-name').textContent = npcName(npc);
      exchange(clean(TX[47]), TX[36] + personName(npc.id) + '.');
    } else { dlg.verb = +b.dataset.v; renderTopics(); }
  });
  $('#dlg-filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { dlg.filter = +b.dataset.f; renderTopics(); } });
  $('#dlg-att').addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; dlg.attitude = +b.dataset.a; renderTopics(); await headC.use(CHARON_SET[dlg.attitude]); });
  $('#dlg-topics').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(+b.dataset.t, +b.dataset.n); });
  $('#dlg-offer').addEventListener('click', (e) => { const b = e.target.closest('[data-give]'); if (b) offer(+b.dataset.give); });
  $('#dlg-bye').addEventListener('click', closeTalk);

  // ------------------------------------------------ pointer: what is under it, and what a click would do
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const hit = (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const live = npcs.filter((n) => n.active && n.spr.visible).map((n) => n.spr);
    const hits = solidHits(ray.intersectObjects([...world.pick, ...exitGroup.children, ...live, ...ground, ...hot], false));
    if (!hits.length) return null;
    let h = hits[0];
    // the open gateway wins over 1997's unseen wall across it
    const gwi = hits.findIndex((x) => x.object.userData.kind === 'gateway');
    if (gwi >= 0 && hits.slice(0, gwi).every((x) => x.object.userData.kind === 'wall' && !(world.city && world.city.pick.includes(x.object)))) h = hits[gwi];
    if (h.object.userData.kind === 'gateway') return { kind: 'gateway', gw: h.object, point: h.point };
    const ex = hits.find((x) => x.object.userData.kind === 'exit');
    if (ex && h.object.userData.kind === 'floor' && ex.distance < h.distance + 20) h = ex;
    const o = h.object, u = o.userData;
    if (u.kind === 'exit') return { kind: 'exit', link: u.link, point: h.point };
    if (u.kind === 'floor') {
      const l = linkAt(Math.floor(h.point.x / CELL), Math.floor(h.point.z / CELL));
      if (l) return { kind: 'exit', link: l, point: h.point };
      return { kind: 'floor', name: u.faceName[h.faceIndex], point: h.point };
    }
    if (u.kind === 'wall') return { kind: 'wall', name: u.faceName[h.faceIndex], point: h.point };
    if (u.kind === 'npc') return { kind: 'npc', npc: u.npc, point: h.point };
    if (u.kind === 'prop') return { kind: 'prop', prop: o, point: h.point };
    if (u.kind === 'pickup') return { kind: 'pickup', spr: o, point: h.point };
    if (u.kind === 'hotspot') return { kind: 'hotspot', spot: o, point: h.point };
    return null;
  };
  // the default action, as the original shows it in the label line
  const intent = (h) => {
    if (!h) return null;
    switch (h.kind) {
      case 'floor': case 'wall': return { label: h.name, cursor: 'default', run: () => walkTo(h.point.x, h.point.z) };
      case 'gateway': {                                   // through the gate, whichever way Charon is facing it
        const u = h.gw.userData, inside = hero.x > (u.out + u.in) / 2;
        return { label: inside ? placeName(0) : 'Kar-es-Taal', cursor: 'pointer', run: () => walkTo(inside ? u.out : u.in, u.mid) };
      }
      case 'exit': return { label: placeName(h.link.to), cursor: 'pointer', run: () => walkTo(h.link.cell[0] * CELL + 128, h.link.cell[1] * CELL + 128) };
      case 'prop': return { label: h.prop.userData.name, cursor: 'default', run: () => walkTo(h.point.x, h.point.z) };
      case 'pickup': return { label: verb(25) + h.spr.userData.name, cursor: 'pointer', run: () => approach(h.spr.position.x, h.spr.position.z, 60, () => {
        const msg = takePickup(h.spr.userData.p); scene.remove(h.spr); ground.splice(ground.indexOf(h.spr), 1); sfx('CLUNK', 0.4); note(msg); }) };
      case 'hotspot': return { label: verb(h.spot.userData.name === 'notice' ? 28 : 26) + h.spot.userData.name, cursor: 'pointer',
        run: () => { const ap = h.spot.userData.approach;      // the remake mounts them on the gatehouse's south face
          approach(ap ? ap.x : h.spot.position.x - 160, ap ? ap.z : h.spot.position.z, 40, () => { hero.dir = ap ? ap.dir : 0; h.spot.userData.action(); }); } };
      case 'npc': {
        const n = h.npc;
        // 1997: 'Dead X' from afar, 'Search dead X' once Charon stands over the body; the living are 'Call to X'
        // however close Charon is (checked on the doolan and the tortured jakhari, stage 1)
        const near = Math.hypot(n.x - hero.x, n.y - hero.y) < 150;
        if (n.state === 'dead' || n.state === 'dying') return { label: verb(near && !n.searched ? 72 : 71) + npcName(n), cursor: 'pointer',
          run: () => approach(n.x, n.y, 150, () => search(n)) };
        if (n.hostile || n.type === 3) return { label: npcName(n), cursor: 'default', run: () => walkTo(n.x, n.y) };
        return { label: verb(23) + npcName(n), cursor: 'pointer', run: () => approach(n.x, n.y, 230, () => openTalk(n)) };
      }
    }
    return null;
  };
  const search = (n) => {
    const loot = PICKUPS.filter((p) => p.owner === n.id && !p.taken);
    n.searched = true;
    if (!loot.length) { say(clean(TX[73]) + ' ' + clean(TX[74])); return; }
    say(clean(TX[73]) + ' ' + loot.map((p) => itemName(p.item)).join(' and '));      // 1997: "Search yields a jakhari pipe"
    loot.forEach((p) => { const m = takePickup(p); if (p.item === 62 || p.item === 64) note(m); });
  };

  function walkTo(X, Y, then) {
    const p = findPath(world, Math.floor(hero.x / 64), Math.floor(hero.y / 64), Math.floor(X / 64), Math.floor(Y / 64));
    hero.path = p ? p.slice(1) : []; hero.onArrive = then || null; hero.goal = [X, Y];
    if (!hero.path.length && then) then();
  }
  const approach = (X, Y, r, then) => {
    const face = () => { hero.dir = Math.atan2(Y - hero.y, X - hero.x); then(); };
    const dx = hero.x - X, dy = hero.y - Y, d = Math.hypot(dx, dy) || 1;
    if (d <= r + 50) face(); else walkTo(X + dx / d * r, Y + dy / d * r, face);
  };

  // ------------------------------------------------ combat
  const shots = [], blasts = [];
  const fire = (h) => {
    if (life.dead) return;
    if (ammo.stock[ammo.sel] <= 0) { note(clean(TX[133])); selectAmmo(0, true); return; }
    if (ammo.stock[ammo.sel] !== Infinity) { ammo.stock[ammo.sel]--; if (!ammo.stock[ammo.sel]) setTimeout(() => { note(clean(TX[133])); selectAmmo(0, true); }, 300); }
    renderHud();
    hero.path = []; hero.onArrive = null;
    let tx = h.point.x, tz = h.point.z, ty = Math.max(20, h.point.y);
    if (h.npc) { tx = h.npc.x; tz = h.npc.y; ty = 90 * CHAR_SCALE; }
    if (h.prop) { tx = h.prop.position.x; tz = h.prop.position.z; ty = 50; }
    hero.dir = Math.atan2(tz - hero.y, tx - hero.x); hero.shootT = SHOT_T;
    const pitch = Math.atan2(ty - 150 * CHAR_SCALE, Math.hypot(tx - hero.x, tz - hero.y));      // the gun sits ~150 units up (full size)
    hero.aim = pitch > 0.22 ? 'high' : pitch < -0.22 ? 'low' : 'level';
    const start = new THREE.Vector3(hero.x + Math.cos(hero.dir) * 70 * CHAR_SCALE, 150 * CHAR_SCALE, hero.y + Math.sin(hero.dir) * 70 * CHAR_SCALE);
    const end = new THREE.Vector3(tx, ty, tz);
    hero.aimPoint = end;                                       // the 3D Charon turns his cannon arm onto it
    // hitscan: no projectile. The shot goes off once the cannon has swung level (the 3D model needs a beat).
    shots.push({ bolt: null, start, end, wait: hero3d ? 0.1 : 0.05, kind: ammo.sel, target: h.npc || h.prop || null, from: 'charon' });
  };
  const gunFX = makeGunFX(scene);
  const blast = (p, big) => {
    const s = sheetSprite(big ? expS : sparkS, big ? 2.2 : 0.9, big ? 0.08 : 0.45, false);
    s.position.copy(p).add(camera.position.clone().sub(p).setY(0).normalize().multiplyScalar(45));   // in front of what it hit
    scene.add(s); blasts.push({ s, t: 0, n: (big ? expS : sparkS).meta.frames });
    sfx(big ? 'EXPLODE' : 'BLOWLITE', big ? 0.6 : 0.3);
  };
  const damageProp = (pr, kind) => {
    const u = pr.userData;
    if (u.explosiveOnly && kind !== 2) return;
    u.hp -= kind === 2 ? 3 : 1;
    pr.material.color.setScalar(2); setTimeout(() => pr.material.color.setScalar(1), 120);
    if (u.hp > 0) return;
    if (u.cask && u.sprite === 4) {                               // sealed -> broken metal cask
      const b = world.objSprite(5, pr.position.x, pr.position.z, 0); removeProp(pr);
      addProp(b, { hp: 1, cask: true }); world.blockers.add(b); world.rebuildWalk(); sfx('CRUNCH'); return;
    }
    blast(pr.position.clone().setY(30), true); removeProp(pr); sfx('DEBRIS', 0.5);
    if (u.cask) dropPickup(pickup(3), pr.position.x, pr.position.z + 40);
    if (pr === rubble) { sealed.delete('15,3'); showExits(); }
    const under = PICKUPS.find((p) => p.under && !p.taken && !p.shown && Math.hypot(p.x - pr.position.x, p.y - pr.position.z) < 200);
    if (under) { under.shown = true; dropPickup(under); }
  };
  const hitNpc = (n, dmg) => {
    n.hp -= dmg; n.hitT = 0.2; if (n.hostile) n.state = 'alert';
    if (n.hp <= 0) {
      n.state = 'dying'; n.anim = 0; n.path = []; sfx(n.type === 7 ? 'GURGLE6' : 'SPLAT', 0.6);
      if (dlg.npc === n) closeTalk();
      if (n.id === 3 && flags.komms === 'running') flags.komms = 'killed';
    }
  };

  // ------------------------------------------------ pointer feedback: a ring where Charon is headed, a glow on what the pointer is over
  const marker = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(120,180,255,1)'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.globalAlpha = 0.6; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.t = 0; scene.add(m); return m;
  })();
  const markAt = (X, Y) => { marker.position.set(X, 4, Y); marker.userData.t = 0; marker.visible = true; };
  const updateMarker = (dt) => {
    if (!marker.visible) return;
    const u = marker.userData; u.t += dt;
    const pop = Math.min(1, u.t / 0.18), s = 1.5 - 0.5 * pop;              // drops in, then sits and breathes
    marker.scale.setScalar(s * (1 + 0.06 * Math.sin(u.t * 6)));
    marker.material.opacity = 0.9 * pop;
    if (!hero.path.length || life.dead) marker.visible = false;
  };
  // The glow mixes the lit pixels toward white in the shader. Multiplying the colour (as the hit flash does) cannot
  // brighten already-saturated art such as Ich'Flah's red robe.
  let glow = null;
  const liftOf = (mat) => {
    if (!mat.userData.lift) {
      const lift = mat.userData.lift = { value: 0 };
      mat.onBeforeCompile = (s) => {
        s.uniforms.lift = lift;
        s.fragmentShader = 'uniform float lift;\n' + s.fragmentShader.replace('#include <opaque_fragment>',
          '#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), lift);');
      };
      mat.customProgramCacheKey = () => 'lift'; mat.needsUpdate = true;
    }
    return mat.userData.lift;
  };
  const glowOf = (h) => !h ? null : h.kind === 'npc' ? h.npc.spr : h.kind === 'prop' ? h.prop : h.kind === 'pickup' ? h.spr : h.kind === 'hotspot' ? h.spot : null;
  const setGlow = (o) => {
    if (o === glow) return;
    const set = (obj, v) => { liftOf(obj.material).value = v; obj.material.uniformsNeedUpdate = true; };   // custom uniforms only re-upload when flagged
    if (glow) set(glow, 0);
    glow = o;
    if (glow) set(glow, 0.04);     // linear space: a small mix already reads as a clear lift on screen
  };

  // ------------------------------------------------ combat mode: right-click arms the gun, left-click then fires at the sight
  // The original swaps the pointer for its sight (SHOOTPTR.LBM); SHTDOPTR.LBM is used here over something that can be hit.
  let combat = false, lastPointer = null;
  const SIGHT = 'url(media/SHOOTPTR.png) 20 20, crosshair', SIGHT_ON = 'url(media/SHTDOPTR.png) 20 20, crosshair';
  const shootable = (h) => h && ((h.kind === 'npc' && h.npc.state !== 'dead' && h.npc.state !== 'dying') || h.kind === 'prop');
  const setCombat = (on) => {
    if (on === combat || (on && life.dead)) return;
    combat = on; document.body.classList.toggle('combat', on); $('#mode').hidden = !on;
    if (on) { hero.path = []; hero.onArrive = null; }
    sfx(on ? 'CLUNK' : 'BEEP', 0.3);
    if (lastPointer) canvas.dispatchEvent(new PointerEvent('pointermove', lastPointer));
  };
  const aimLabel = (h) => {
    if (!h) return null;
    const target = h.kind === 'npc' ? npcName(h.npc) : h.kind === 'prop' ? h.prop.userData.name : null;
    return { label: target ? 'Shoot ' + target : 'Fire', cursor: shootable(h) ? SIGHT_ON : SIGHT };
  };

  const canvas = $('#view');
  let hover = null;
  canvas.addEventListener('pointermove', (e) => {
    lastPointer = { clientX: e.clientX, clientY: e.clientY };
    if (paused()) { setGlow(null); return; }
    const h = hit(e);
    hover = combat ? aimLabel(h) : intent(h);
    setGlow(hover && (!combat || shootable(h)) ? glowOf(h) : null);
    ui.label.textContent = hover ? hover.label : ''; ui.label.hidden = !hover;
    canvas.style.cursor = combat ? (hover ? hover.cursor : SIGHT) : hover ? hover.cursor : 'default';
  });
  canvas.addEventListener('pointerleave', () => { ui.label.hidden = true; setGlow(null); });
  canvas.addEventListener('click', (e) => {
    if (life.dead || paused()) return;
    const h = hit(e); if (!h) return;
    if (combat) fire(h);
    else {
      hero.run = false;                                        // a double-click upgrades this walk to a fast walk
      const it = intent(h); it && it.run();
      if (it && (h.kind === 'floor' || h.kind === 'wall' || h.kind === 'exit') && hero.path.length) {
        const [X, Y] = hero.path[hero.path.length - 1]; markAt(X, Y);
      }
    }
    setTimeout(() => canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY })), 400);   // relabel what is under the pointer now
  });
  canvas.addEventListener('dblclick', () => { if (!combat && !life.dead && !paused() && hero.path.length) hero.run = true; });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (life.dead || paused()) return; setCombat(!combat); });
  canvas.addEventListener('wheel', (e) => { if (!paused()) { let i = ammo.sel; do i = (i + Math.sign(e.deltaY) + 3) % 3; while (ammo.stock[i] <= 0 && i !== ammo.sel); selectAmmo(i); } }, { passive: true });
  addEventListener('keydown', (e) => {
    if (!ui.intro.hidden || !$('#title').hidden) return;
    if (e.key === 'Escape') { if (anyOverlay()) { if ($('#dead').hidden && $('#end').hidden) closeAll(); } else if (combat) setCombat(false); else openMenu(); return; }
    if (!$('#keypad').hidden && /^[0-9]$/.test(e.key)) { $(`#keypad [data-k="${e.key}"]`).click(); return; }
    if (anyOverlay()) return;
    if (/^[1-3]$/.test(e.key)) selectAmmo(+e.key - 1);
    else if (/^[iI]$/.test(e.key)) openInventory();
    else if (/^[cC]$/.test(e.key)) openCortex();
    else if (/^[mM]$/.test(e.key)) openMission();
    else if (e.key === '`') ui.cam.hidden = !ui.cam.hidden;
  });

  // ------------------------------------------------ loop
  enterLocation(locId);
  let last = performance.now(), animT = 0;
  let inCity = false, cityWalls = [], camYaw = 0; const cityCam = new THREE.Vector3(), cityLook = new THREE.Vector3(), camRay = new THREE.Raycaster();
  const tick = (now) => {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    const hold = paused();
    let moving = false;
    if (hero.path.length && hero.shootT <= 0 && !hold) {
      const [tx, ty] = hero.path[0], dx = tx - hero.x, dy = ty - hero.y, d = Math.hypot(dx, dy), step = (hero.run ? (hero3d ? hero3d.jogSpeed : 780 * CHAR_SCALE) : (hero3d ? hero3d.walkSpeed : 520 * CHAR_SCALE)) * dt;
      hero.dir = Math.atan2(dy, dx);
      if (d <= step) { hero.x = tx; hero.y = ty; hero.path.shift(); if (!hero.path.length && hero.onArrive) { const f = hero.onArrive; hero.onArrive = null; f(); } }
      else { hero.x += dx / d * step; hero.y += dy / d * step; }
      moving = true;
    }
    updateLocation();
    // inside Kar-es-Taal there are no 1997 cameras: a camera follows Charon from above and behind
    if (world.city && world.city.contains(hero.x, hero.y)) {
      if (!inCity) { inCity = true; ui.loc.textContent = 'Kar-es-Taal'; camera.userData.focal = 760; fit(); cityCam.set(hero.x - 520, 640, hero.y + 560); cityLook.set(hero.x, 40, hero.y); cityWalls = world.city.pick.filter((m) => m.userData.kind === 'wall'); if (world.cityWall) cityWalls.push(world.cityWall); }
      if (!window.__camLock) {
        // the kasbah's lanes are narrow: if a house stands between Charon and the camera, come in closer and steeper
        const head = new THREE.Vector3(hero.x, 70, hero.y);
        // the usual view is from the south-west; when that is walled off (just inside the gate, say) swing round to
        // a side that is clear, and only if none is, come in steeper
        const at = (yaw, s) => {
          const ox = -520 * s, oz = 560 * s, cs = Math.cos(yaw), sn = Math.sin(yaw);
          return new THREE.Vector3(hero.x + ox * cs - oz * sn, 640 + (1 - s) * 260, hero.y + ox * sn + oz * cs);
        };
        const clear = (c) => { const d = c.clone().sub(head), len = d.length(); camRay.set(head, d.divideScalar(len)); camRay.far = len; return !camRay.intersectObjects(cityWalls, true).length; };
        let want = null;
        search: for (const s of [1, 0.8, 0.62]) for (const yaw of [0, camYaw, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
          const c = at(yaw, s); if (clear(c)) { want = c; camYaw = yaw; break search; }
        }
        if (!want) for (const s of [0.46, 0.32, 0.2]) { want = at(camYaw, s); if (clear(want)) break; }
        const k = 1 - Math.exp(-dt * 3);
        cityCam.lerp(want, k); cityLook.lerp(head.setY(40), k);
        camera.position.copy(cityCam); camera.lookAt(cityLook);
      }
    } else if (inCity) { inCity = false; camIdx = -1; lastCell = null; ui.loc.textContent = placeName(locId === 3 ? 0 : locId); }
    if (world.animated) for (const o of world.animated) o.userData.tick && o.userData.tick(now / 1000);
    if (world.lights) {                                   // the open sky barely reaches into the cave
      const inC = world.inCave && world.inCave(hero.x, hero.y), k = Math.min(1, dt * 2.5);
      world.lights.sky.intensity += ((inC ? 0.45 : 0.9) - world.lights.sky.intensity) * k;
      // 1997's cave is dim but evenly lit (floor and walls read everywhere): a warm ambient while inside
      if (world.lights.cave) world.lights.cave.intensity += ((inC ? 0.5 : 0) - world.lights.cave.intensity) * k;
      renderer.toneMappingExposure += ((inC ? 1.35 : 1.05) - renderer.toneMappingExposure) * k;
    }
    const toCam = Math.atan2(camera.position.z - hero.y, camera.position.x - hero.x);
    let rel = hero.dir - toCam; rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const view = (16 - Math.round(rel / (Math.PI / 8))) % 16;
    animT = moving ? animT + dt * 15 : 0;
    charon.position.set(hero.x, 0, hero.y); charonShot.position.copy(charon.position);
    if (charonIdle) { charonIdle.position.copy(charon.position); charonIdle.visible = false; }
    if (hero.shootT > 0) {
      hero.shootT -= dt;
      // C00SHOT: 9 frames x 8 directions, turning the same way as C00WALK's 16 views.
      // The 9 frames are three shots, high, level and low; play only the one aimed.
      const d8 = Math.round(view / 2) % 8, seq = SHOT_SEQ[hero.aim || 'level'];
      const fr = seq[Math.min(seq.length - 1, Math.floor((SHOT_T - hero.shootT) / SHOT_T * seq.length))];
      charonShot.userData.cell(d8, fr);
      charonShot.visible = true; charon.visible = false;
    } else if (!moving && charonIdle) {
      idleT += dt * 4; charonShot.visible = false; charon.visible = false; charonIdle.visible = true;
      charonIdle.userData.cell(view, Math.floor(idleT) % idleS.meta.frames);
    } else { charonShot.visible = false; charon.visible = true; charon.userData.cell(view, Math.floor(animT) % walkS.meta.frames); }
    if (hero3d) {
      charon.visible = charonShot.visible = false; if (charonIdle) charonIdle.visible = false;
      const r = hero3d.root; r.position.set(hero.x, 0, hero.y);
      let turn = (Math.PI / 2 - hero.dir) - r.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      r.rotation.y += turn * Math.min(1, dt * (hero.shootT > 0 ? 30 : 12));
      if (hero.shootT > 0) hero.aimHold = 0.7; else hero.aimHold = Math.max(0, hero.aimHold - dt);
      // interaction mode: cannon down; combat mode: high-ready (raised beside the head), level to fire
      const mode = combat ? '_ready' : '';
      if (!hero.path.length) hero.run = false;
      hero3d.play(hero.shootT > 0 || (hero.aimHold > 0 && !moving) ? 'aim' : moving && hero.run && !combat ? 'walk_fast' : (moving ? 'walk' : 'idle') + mode);
      hero3d.update(dt, hero.aimPoint);
    }

    for (const n of npcs) {
      n.spr.visible = n.active; if (n.m3d) n.m3d.root.visible = n.active;
      if (!n.active) continue;
      n.spr.position.set(n.x, 0, n.y);
      if (n.state === 'dead' || n.state === 'dying') {
        const S = n.dS; if (!S) { n.spr.visible = false; continue; }
        if (n.spr.userData.sheet !== S.meta) {
          n.spr.userData.setSheet(S);
          if (n.state === 'dead') n.anim = S.meta.frames - 1;
        }
        const total = S.meta.frames;            // the fall plays its frames in the body's own direction
        if (n.state === 'dying') { n.anim += dt * 11; if (n.anim >= total - 1) { n.anim = total - 1; n.state = 'dead'; } }
        if (S.meta.views > 1) faceCell(n.spr, S.meta, npcView(n), Math.floor(n.anim));
        else cellAt(n.spr, S.meta, Math.floor(n.anim));
        n.spr.material.color.setScalar(1);
        if (n.m3d) updateNpcModel(n, dt, false);
        continue;
      }
      const dx = hero.x - n.x, dy = hero.y - n.y, dist = Math.hypot(dx, dy) || 1;
      let walking = false;
      if (!hold && n.path.length) {                       // scripted runs (the komms pra'min)
        const [tx, ty] = n.path[0], ex = tx - n.x, ey = ty - n.y, d = Math.hypot(ex, ey), step = 420 * dt;
        n.dir = Math.atan2(ey, ex); walking = true;
        if (d <= step) { n.x = tx; n.y = ty; n.path.shift();
          if (!n.path.length && n.route) { if (n.route.length) npcPath(n, ...n.route.shift()); else if (n.id === 3 && flags.komms === 'running') kommsEscaped(); } }
        else { n.x += ex / d * step; n.y += ey / d * step; }
      } else if (n.hostile && !life.dead && !hold) {
        const sees = dist < 2300 && clearShot(n.x, n.y, hero.x, hero.y);
        if (sees) n.state = 'alert';
        if (n.state === 'alert') {
          n.dir = Math.atan2(dy, dx);
          if (dist > 700 && sees) { const sp = 260 * dt, nx = n.x + dx / dist * sp, ny = n.y + dy / dist * sp;
            if (world.walk[Math.floor(ny / 64) * world.G + Math.floor(nx / 64)]) { n.x = nx; n.y = ny; walking = true; } }
          n.cool -= dt;
          if (sees && n.cool <= 0) {
            n.cool = 1.4 + Math.random() * 1.2;
            const start = new THREE.Vector3(n.x + dx / dist * 90 * CHAR_SCALE, 70 * CHAR_SCALE, n.y + dy / dist * 90 * CHAR_SCALE);
            const miss = (Math.random() - 0.5) * 140, end = new THREE.Vector3(hero.x - dy / dist * miss, 110 * CHAR_SCALE, hero.y + dx / dist * miss);
            const bolt = sheetSprite(boltS, 2.6, 0.5, false); bolt.position.copy(start); scene.add(bolt);
            shots.push({ bolt, start, end, t: 0, dur: start.distanceTo(end) / 2600, kind: 0, from: 'npc', dmg: 6 });
            sfx('SHOOT1', 0.25);
          }
        }
      } else if (n.type === 3 && dist < 1500 && !hold) {    // komms pra'min never fights, keeps its distance
        n.dir = Math.atan2(-dy, -dx); const sp = 160 * dt, nx = n.x - dx / dist * sp, ny = n.y - dy / dist * sp;
        if (world.walk[Math.floor(ny / 64) * world.G + Math.floor(nx / 64)]) { n.x = nx; n.y = ny; walking = true; }
      } else if (dist < 900) n.dir = Math.atan2(dy, dx);
      if (n.type === 7) { n.anim += dt * 4; cellAt(n.spr, n.wS.meta, Math.floor(n.anim) % (n.wS.meta.views * n.wS.meta.frames)); }
      else { n.anim = walking ? n.anim + dt * 10 : 0; faceCell(n.spr, n.wS.meta, npcView(n), Math.floor(n.anim) % n.wS.meta.frames); }
      n.spr.material.color.setScalar(n.hitT > 0 ? 2.2 : 1);
      if (n.m3d) updateNpcModel(n, dt, walking);
      if (n.hitT > 0) n.hitT -= dt;
    }
    if (dlg.npc && Math.hypot(dlg.npc.x - hero.x, dlg.npc.y - hero.y) > 600) closeTalk();

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.bolt) {                                          // enemy bolts still fly, so they can be seen coming
        s.t += dt / Math.max(0.05, s.dur);
        s.bolt.position.lerpVectors(s.start, s.end, Math.min(1, s.t));
        s.bolt.userData.cell(0, Math.floor(now / 60) % boltS.meta.frames);
        if (s.t < 1) continue;
        scene.remove(s.bolt);
      } else {                                               // Charon's hitscan shot: flash and impact together
        s.wait -= dt; if (s.wait > 0) continue;
        // the flash leaves along the barrel as posed; the arm has been turned onto the target
        const mz = hero3d && hero3d.muzzle();
        if (mz) { gunFX.flash(mz.pos, mz.dir, s.kind, 2.1 * CHAR_SCALE); hero3d.kick([1, 0.8, 1.6][s.kind] || 1); }   // arm cannon: a much bigger bore than the 1997 pistol
        else gunFX.flash(s.start, s.end.clone().sub(s.start).normalize(), s.kind, 1);
        gunFX.impact(s.end, s.kind, camera.position);
        sfx('SHOOT1', 0.45);
      }
      shots.splice(i, 1);
      const big = s.kind === 2; blast(s.end, big);
      if (s.from === 'npc') { if (Math.hypot(s.end.x - hero.x, s.end.z - hero.y) < 120) hurt(s.dmg); continue; }
      const dmg = AMMO[s.kind].dmg, splash = big ? 300 : 90;
      for (const n of npcs) {
        if (!n.active || n.state === 'dead' || n.state === 'dying') continue;
        const d = Math.hypot(s.end.x - n.x, s.end.z - n.y);
        if (n === s.target || d < splash) hitNpc(n, n === s.target ? dmg : Math.round(dmg / 2));
      }
      for (const pr of [...props]) {
        const d = Math.hypot(s.end.x - pr.position.x, s.end.z - pr.position.z);
        if (pr === s.target || d < (big ? 320 : pr.userData.radius + 40)) damageProp(pr, s.kind);
      }
    }
    gunFX.update(dt);
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i]; b.t += dt * 14;
      if (b.t >= b.n) { scene.remove(b.s); blasts.splice(i, 1); } else b.s.userData.cell(0, Math.floor(b.t));
    }
    updateMarker(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  ui.loading.hidden = true;
  requestAnimationFrame(tick);
  return { npcs, openTalk, known, life, walkTo, hero, setCamera, world, LENS, fit, camera, scene, ammo, inv, flags, props, ground, hot, PICKUPS,
    debugFire: (x, y, k = 0) => { ammo.sel = k; if (ammo.stock[k] <= 0) ammo.stock[k] = 5; hero.shootT = 0; const n = npcs.find((m) => Math.hypot(m.x - x, m.y - y) < 60);
      const pr = props.find((p) => Math.hypot(p.position.x - x, p.position.z - y) < 80); fire({ point: new THREE.Vector3(x, 60, y), npc: n && n.state !== 'dead' ? n : null, prop: pr || null }); },
    screenOf: (x, y, h = 60) => { const v = new THREE.Vector3(x, h, y).project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z < 1]; },
    teleport: (x, y) => { hero.x = x; hero.y = y; hero.path = []; lastCell = null; },
    hits: (x, y) => { mouse.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
      return solidHits(ray.intersectObjects([...world.pick, ...npcs.filter((n) => n.active).map((n) => n.spr), ...ground, ...hot], false)).slice(0, 4).map((h) => [h.object.userData.kind, h.object.userData.name || (h.object.userData.npc && h.object.userData.npc.id), Math.round(h.distance), h.point.toArray().map(Math.round)]); },
    probe: (x, y) => { const it = intent(hit({ clientX: x, clientY: y })); return it && it.label; },
    status: () => ({ loc: locId, cam: camIdx, x: Math.round(hero.x), y: Math.round(hero.y), moving: hero.path.length, shield: life.shield, ammo: ammo.stock.slice(), inv: [...inv.keys()], komms: flags.komms }) };
}

// ---------------------------------------------------------------- intro
function playIntro(onDone) {
  let i = 0;
  ui.intro.hidden = false;
  const done = () => { ui.video.onended = null; ui.video.pause(); ui.video.removeAttribute('src'); ui.video.load(); ui.intro.hidden = true; ui.sub.hidden = true; onDone(); };
  const next = () => {
    if (i >= INTRO.length) return done();
    const n = INTRO[i++];
    ui.video.src = `media/${n}.mp4`;
    ui.sub.textContent = T.comms[n] || ''; ui.sub.hidden = !T.comms[n];
    ui.video.play().catch(() => {});
  };
  ui.video.onended = next;
  ui.video.onerror = next;
  ui.skip.onclick = done;
  addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && !ui.intro.hidden) { removeEventListener('keydown', esc); done(); } });
  next();
}

window.__startGame = (withIntro) => { $('#title').hidden = true; if (withIntro) playIntro(() => {}); };
if (window.__startPending && window.__startPending() !== null) window.__startGame(window.__startPending());
const game = main().catch((err) => { window.__fail && window.__fail(err); throw err; });
window.__game = game;
