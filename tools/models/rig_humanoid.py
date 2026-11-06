"""Blender: normalise an image-to-3D humanoid, build a Mixamo-named skeleton and skin it.

blender -b --factory-startup -P tools/models/rig_humanoid.py -- MODEL.glb OUT.blend [--height 2.1] [--cannon R]

Assumes: one mesh, standing, facing -Y, arms hanging clear of the body (A-pose-ish).
Joint heights are measured from the mesh where possible and otherwise taken from
human proportions (fractions of total height). His right is -X.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
H = float(argv[argv.index('--height') + 1]) if '--height' in argv else 2.1
cannon = argv[argv.index('--cannon') + 1] if '--cannon' in argv else None
# elbow, wrist and fingertip heights as fractions of height (Charon's by default; long-armed creatures differ)
ARM_F = [float(x) for x in argv[argv.index('--arm') + 1].split(',')] if '--arm' in argv else [0.635, 0.51, 0.435]
RIG_NAME = argv[argv.index('--name') + 1] if '--name' in argv else 'CharonRig'
# optional: no arm weights within this distance of the centre line (harness straps, chest armour)
TORSO_X = float(argv[argv.index('--torso-x') + 1]) if '--torso-x' in argv else None
# optional: where the arm zone starts (|x|); default is just inside the elbow/wrist. Long hands that hang
# beside the thighs need it set between the legs' outer edge and the fingers.
ARM_X = float(argv[argv.index('--arm-x') + 1]) if '--arm-x' in argv else None
# optional: below this height, split the mesh into connected pieces; outer pieces are arms (no leg
# weights), inner ones legs (no arm weights). For hands that hang beside the thighs.
SPLIT_Z = float(argv[argv.index('--split-z') + 1]) if '--split-z' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
body.name = 'Body'
for o in list(bpy.context.scene.objects):
    if o is not body and o.type != 'MESH':
        bpy.data.objects.remove(o)
body.parent = None

# ---- normalise: apply transform, scale to H, feet on Z=0, centred on X/Y
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co = np.empty(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
s = H / (co[:, 2].max() - co[:, 2].min())
co[:, 2] -= co[:, 2].min(); co *= s
co[:, 0] -= (co[:, 0].max() + co[:, 0].min()) / 2
co[:, 1] -= (co[:, 1].max() + co[:, 1].min()) / 2
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
V = co

def near(x, z, dx=0.06, dz=0.015, xr=None):
    m = np.abs(V[:, 2] - z) < dz
    m &= (V[:, 0] > xr[0]) & (V[:, 0] < xr[1]) if xr else np.abs(V[:, 0] - x) < dx
    p = V[m]
    return Vector((p[:, 0].mean(), p[:, 1].mean(), z)) if len(p) else Vector((x, 0, z))

def limb_centre(side, z, inner):
    """Centre of the outermost run (the arm) on one side at height z, beyond |x| > inner."""
    xr = (-9, -inner) if side < 0 else (inner, 9)
    return near(0, z, xr=xr)

h = lambda f: f * H          # proportion of height
J = {}
EL_C = {}
sh = Vector((0, (near(0.14 * H, h(0.785), dx=0.03).y + near(-0.14 * H, h(0.785), dx=0.03).y) / 2, 0))
for side, pre in ((1, 'Left'), (-1, 'Right')):
    # arms: separated from the torso below ~0.71 H
    J[pre + 'Shoulder'] = (Vector((side * 0.03 * H, sh.y, h(0.82))), Vector((side * 0.135 * H, sh.y, h(0.795))))
    el = limb_centre(side, h(ARM_F[0]), 0.12 * H)
    EL_C[pre] = el.copy()                      # centre of the arm at the elbow (the cannon's axis runs from here)
    # hinge the elbow near the back of the arm (the olecranon), not its centre: a deep fold then
    # meets at one sharp point behind, with the fronts overlapping, instead of a rounded double knuckle
    ring = V[(np.abs(V[:, 2] - el.z) < 0.02) & ((V[:, 0] * side) > 0.12 * H)]
    if len(ring):
        el.y = ring[:, 1].max() - 0.025
    wr = limb_centre(side, h(ARM_F[1]), 0.15 * H)
    he = limb_centre(side, h(ARM_F[2]), 0.15 * H)
    J[pre + 'Arm'] = (J[pre + 'Shoulder'][1], el)
    J[pre + 'ForeArm'] = (el, wr)
    J[pre + 'Hand'] = (wr, Vector((he.x, he.y, he.z - 0.02)))
    # legs
    hip = Vector((side * 0.06 * H, 0, h(0.47)))
    hip.y = near(hip.x, hip.z, dx=0.05).y
    LEG_X = 0.22 * H                           # inside the arms: long-armed creatures' hands hang at knee height
    kn = near(0, h(0.305), xr=(0, LEG_X) if side > 0 else (-LEG_X, 0))
    an = near(0, h(0.065), xr=(0, LEG_X) if side > 0 else (-LEG_X, 0))
    foot = V[(V[:, 2] < 0.06) & ((V[:, 0] > 0) if side > 0 else (V[:, 0] < 0))]
    toe = Vector((foot[:, 0].mean(), foot[:, 1].min() + 0.01, 0.03))
    heel_y = foot[:, 1].max()
    ball = Vector((toe.x, heel_y + (toe.y - heel_y) * 0.72, 0.035))
    kn.y = min(kn.y, hip.y)       # knees slightly forward
    J[pre + 'UpLeg'] = (hip, kn)
    J[pre + 'Leg'] = (kn, an)
    J[pre + 'Foot'] = (an, ball)
    J[pre + 'ToeBase'] = (ball, toe)

def torso(z):
    return near(0, z, dx=0.08)
pts = [h(0.49), h(0.56), h(0.64), h(0.72), h(0.86), h(0.905), H]
names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
for i, n in enumerate(names):
    a, b = torso(pts[i]), torso(pts[i + 1]) if i + 1 < len(pts) - 1 else Vector((0, torso(pts[i]).y, pts[i + 1]))
    a.x = b.x = 0
    J[n] = (a, b)
# the spine runs straight from the hips to the neck: averaging the torso's depth is thrown off by
# anything hanging in front of the chest (tentacles, a beard, gear)
y0, y1 = J['Hips'][0].y, J['Neck'][0].y
z0, z1 = J['Hips'][0].z, J['Neck'][0].z
for n in ('Hips', 'Spine', 'Spine1', 'Spine2'):
    a, b = J[n]
    a.y = y0 + (y1 - y0) * (a.z - z0) / (z1 - z0); b.y = y0 + (y1 - y0) * (b.z - z0) / (z1 - z0)
parent = {'Spine': 'Hips', 'Spine1': 'Spine', 'Spine2': 'Spine1', 'Neck': 'Spine2', 'Head': 'Neck'}
for pre in ('Left', 'Right'):
    parent.update({pre + 'Shoulder': 'Spine2', pre + 'Arm': pre + 'Shoulder', pre + 'ForeArm': pre + 'Arm',
                   pre + 'Hand': pre + 'ForeArm', pre + 'UpLeg': 'Hips', pre + 'Leg': pre + 'UpLeg',
                   pre + 'Foot': pre + 'Leg', pre + 'ToeBase': pre + 'Foot'})
connected = {'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
             'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'}

# ---- armature
arm_d = bpy.data.armatures.new(RIG_NAME)
rig = bpy.data.objects.new(RIG_NAME, arm_d)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
order = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] + \
        [p + n for p in ('Left', 'Right') for n in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')]
for n in order:
    eb = arm_d.edit_bones.new(n)
    eb.head, eb.tail = J[n]
    if n in parent:
        eb.parent = arm_d.edit_bones[parent[n]]
        if n in connected:
            eb.use_connect = True
    # roll: keep each bone's local Z pointing to world -Y (forward) where possible
    eb.align_roll(Vector((0, -1, 0)) if abs((eb.tail - eb.head).normalized().y) < 0.8 else Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode='OBJECT')
for n in order:
    print('BONE', n, tuple(round(c, 3) for c in arm_d.bones[n].head_local), tuple(round(c, 3) for c in arm_d.bones[n].tail_local))

# ---- skin: heat weights on a welded proxy, then transfer to the textured mesh
proxy = body.copy(); proxy.data = body.data.copy(); proxy.name = 'WeightProxy'
bpy.context.scene.collection.objects.link(proxy)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = proxy; proxy.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0008)
bpy.ops.object.mode_set(mode='OBJECT')
print('proxy verts', len(proxy.data.vertices))
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
cnt = {g.index: 0 for g in proxy.vertex_groups}
for v in proxy.data.vertices:
    for e in v.groups:
        if e.weight > 0.05: cnt[e.group] += 1
print('verts per bone:', {g.name: cnt[g.index] for g in proxy.vertex_groups})

if SPLIT_Z:
    import bmesh
    bm = bmesh.new(); bm.from_mesh(proxy.data); bm.verts.ensure_lookup_table()
    low = np.array([v.co.z < SPLIT_Z for v in bm.verts]); comp = np.full(len(bm.verts), -1); comps = []
    for v in bm.verts:
        if not low[v.index] or comp[v.index] >= 0: continue
        cid = len(comps); stack = [v]; comp[v.index] = cid; mem = []
        while stack:
            u = stack.pop(); mem.append(u.index)
            for e in u.link_edges:
                w = e.other_vert(u)
                if low[w.index] and comp[w.index] < 0: comp[w.index] = cid; stack.append(w)
        comps.append(mem)
    pco = np.array([v.co[:] for v in bm.verts]); bm.free()
    pinv = {g.index: g.name for g in proxy.vertex_groups}
    arm_set = {p + n for p in ('Left', 'Right') for n in ('Arm', 'ForeArm', 'Hand')}
    leg_set = {p + n for p in ('Left', 'Right') for n in ('UpLeg', 'Leg', 'Foot', 'ToeBase')} | {'Hips'}
    for mem in comps:
        if len(mem) < 50: continue
        mx = float(np.abs(pco[mem, 0]).mean()); is_arm = mx > 0.2 * H
        print('piece below %.2f: %6d verts, mean |x| %.2f -> %s' % (SPLIT_Z, len(mem), mx, 'arm' if is_arm else 'leg'))
        ban = leg_set if is_arm else arm_set
        for i in mem:
            for g in proxy.data.vertices[i].groups:
                if pinv[g.group] in ban: g.weight = 0.0
for g in proxy.vertex_groups:
    body.vertex_groups.new(name=g.name)
dt = body.modifiers.new('wt', 'DATA_TRANSFER')
dt.object = proxy; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}
dt.vert_mapping = 'NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.modifier_apply(modifier='wt')
bpy.data.objects.remove(proxy)

# ---- region clean-up: no leg weights on the arms, no arm weights on thighs/torso sides
gi = {g.name: g.index for g in body.vertex_groups}
arm_bones = {p + n for p in ('Left', 'Right') for n in ('Arm', 'ForeArm', 'Hand')}
leg_bones = {p + n for p in ('Left', 'Right') for n in ('UpLeg', 'Leg', 'Foot', 'ToeBase')}
inv = {i: n for n, i in gi.items()}
arm_x = {s: min(abs(J[p + 'Arm'][1].x), abs(J[p + 'ForeArm'][1].x)) - 0.07 for s, p in ((1, 'Left'), (-1, 'Right'))}
if ARM_X: arm_x = {1: ARM_X, -1: ARM_X}

def metal_per_vertex():
    """Metallic value per vertex, sampled from the texture that feeds Principled 'Metallic'
    (directly or through a Separate Color node). Lets hard-surface parts be told from skin."""
    mat = body.data.materials[0] if body.data.materials else None
    if not mat or not mat.use_nodes:
        return None
    img = chan = None
    for l in mat.node_tree.links:
        if l.to_node.type == 'BSDF_PRINCIPLED' and l.to_socket.name == 'Metallic':
            n = l.from_node
            if n.type == 'TEX_IMAGE':
                img, chan = n.image, 0
            elif n.type == 'SEPARATE_COLOR':
                chan = {'Red': 0, 'Green': 1, 'Blue': 2}[l.from_socket.name]
                src = n.inputs['Color'].links
                img = src[0].from_node.image if src and src[0].from_node.type == 'TEX_IMAGE' else None
    if img is None:
        return None
    w, hgt = img.size
    px = np.empty(w * hgt * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(hgt, w, 4)[:, :, chan]
    uv = np.empty(len(body.data.loops) * 2); body.data.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    lv = np.empty(len(body.data.loops), np.int64); body.data.loops.foreach_get('vertex_index', lv)
    xs = np.clip((uv[:, 0] % 1) * w, 0, w - 1).astype(int); ys = np.clip((uv[:, 1] % 1) * hgt, 0, hgt - 1).astype(int)
    m = np.zeros(len(body.data.vertices)); np.maximum.at(m, lv, px[ys, xs])
    return m
metal = metal_per_vertex() if cannon else None
if metal is not None:
    print('metal verts (>0.5):', int((metal > 0.5).sum()))

for v in body.data.vertices:
    x, z = v.co.x, v.co.z
    side = 1 if x > 0 else -1
    pre = 'Left' if side > 0 else 'Right'
    on_arm = abs(x) > arm_x[side] and h(ARM_F[2]) - 0.08 < z < h(0.70)
    in_leg_zone = z < h(0.47)
    below = SPLIT_Z and z < SPLIT_Z               # arm vs leg there was settled by connectivity on the proxy
    for g in list(v.groups):
        n = inv[g.group]
        if on_arm and not below and (n in leg_bones or n in ('Hips', 'Spine')):
            g.weight = 0.0
        if on_arm and n in arm_bones and not n.startswith(pre):
            g.weight = 0.0
        if not on_arm and not below and in_leg_zone and n in arm_bones:
            g.weight = 0.0
        if TORSO_X and abs(x) < TORSO_X and n in arm_bones:
            g.weight = 0.0
    # cannon (rigid on the forearm): everything below the elbow, plus the cannon's metal that
    # reaches back past the elbow onto the upper arm (else it smears when the elbow folds)
    elbow_z = J[pre + 'ForeArm'][0].z
    cannon_side = cannon and side == (-1 if cannon == 'R' else 1) and abs(x) > arm_x[side]
    past_elbow_metal = metal is not None and metal[v.index] > 0.5 and elbow_z <= z < elbow_z + 0.18
    if cannon_side and ((on_arm and z < elbow_z + 0.01) or past_elbow_metal):
        for g in v.groups:
            g.weight = 0.0
        body.vertex_groups[pre + 'ForeArm'].add([v.index], 1.0, 'REPLACE')
bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)

# anything left without a bone: nearest bone segment allowed for its region
def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length
fixed = 0
for v in body.data.vertices:
    if any(g.weight > 0 for g in v.groups):
        continue
    x, z = v.co.x, v.co.z
    side = 1 if x > 0 else -1; pre = 'Left' if side > 0 else 'Right'
    on_arm = abs(x) > arm_x[side] and h(ARM_F[2]) - 0.08 < z < h(0.70)
    if SPLIT_Z and z < SPLIT_Z:
        best = min(order, key=lambda n: seg_dist(v.co, *J[n]))
        body.vertex_groups[best].add([v.index], 1.0, 'REPLACE'); fixed += 1; continue
    allowed = [n for n in order if (n.startswith(pre) and n[len(pre):] in ('Arm', 'ForeArm', 'Hand'))] if on_arm else \
              [n for n in order if n not in arm_bones]
    best = min(allowed, key=lambda n: seg_dist(v.co, *J[n]))
    body.vertex_groups[best].add([v.index], 1.0, 'REPLACE'); fixed += 1
print('fallback-assigned verts', fixed)
# normalise and limit to 4 influences
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
unweighted = sum(1 for v in body.data.vertices if not any(g.weight > 0 for g in v.groups))
print('unweighted verts', unweighted)

# ---- cannon muzzle markers: two unweighted bones on the forearm, at the cannon tip and further along
# the bore. The game reads the muzzle position and barrel direction from them.
if cannon:
    pre = 'Right' if cannon == 'R' else 'Left'
    sd = -1 if cannon == 'R' else 1
    arm_v = V[(V[:, 0] * sd > arm_x[sd]) & (V[:, 2] < J[pre + 'ForeArm'][0].z) & (V[:, 2] > h(0.35))]
    zmin = arm_v[:, 2].min()
    tipv = arm_v[arm_v[:, 2] < zmin + 0.02]
    tip = Vector(tipv.mean(axis=0)); tip.z = zmin
    axis = (tip - EL_C[pre]).normalized()
    print('MUZZLE tip', tuple(round(c, 3) for c in tip), 'axis', tuple(round(c, 3) for c in axis))
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_d.edit_bones
    m1 = eb.new(pre + 'Muzzle'); m1.head = tip; m1.tail = tip + axis * 0.1; m1.parent = eb[pre + 'ForeArm']
    m2 = eb.new(pre + 'MuzzleAim'); m2.head = tip + axis * 0.1; m2.tail = tip + axis * 0.2; m2.parent = m1
    for b in (m1, m2):
        b.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)

body.parent = rig
mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
bpy.ops.wm.save_as_mainfile(filepath=out)
print('SAVED', out)
