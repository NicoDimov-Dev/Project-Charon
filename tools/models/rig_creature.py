"""Blender: rig a many-legged creature (the pra'min) from an image-to-3D mesh.

blender -b --factory-startup -P tools/models/rig_creature.py -- MODEL.glb OUT.blend [--height 1.85] [--tris 70000]

Assumes: one mesh, standing on its leg tips, facing -Y, legs separate from each other near the
ground. Leg tips are found by clustering the vertices just above the ground (top view); each leg
gets a hip bone (body -> knee) and a shin bone (knee -> tip). A body bone carries the shell, and
two fang bones are added if mandible tips are found at the front. Its left is +X.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
H = float(argv[argv.index('--height') + 1]) if '--height' in argv else 1.85
TRIS = int(argv[argv.index('--tris') + 1]) if '--tris' in argv else 70000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
body.name = 'Body'
for o in list(bpy.context.scene.objects):
    if o is not body: bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---- decimate (keeps UVs); image-to-3D meshes are far denser than a game creature needs
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
if tris > TRIS:
    d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = TRIS / tris
    bpy.ops.object.modifier_apply(modifier='dec')
print('tris', tris, '->', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ---- normalise: height H, on the ground, centred
co = np.empty(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
co[:, 2] -= co[:, 2].min(); co *= H / co[:, 2].max()
co[:, 0] -= (co[:, 0].max() + co[:, 0].min()) / 2; co[:, 1] -= (co[:, 1].max() + co[:, 1].min()) / 2
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
V = co

def clusters(mask, cell=0.03, min_n=30):
    p = V[mask]; idx = np.where(mask)[0]
    ij = np.floor(p[:, :2] / cell).astype(int)
    occ = {}
    for k, c in enumerate(map(tuple, ij)): occ.setdefault(c, []).append(k)
    seen, res = set(), []
    for c in occ:
        if c in seen: continue
        stack, mem = [c], []; seen.add(c)
        while stack:
            a, b = stack.pop(); mem += occ[(a, b)]
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    n = (a + da, b + db)
                    if n in occ and n not in seen: seen.add(n); stack.append(n)
        if len(mem) >= min_n: res.append(p[mem])
    return res

# ---- legs: clusters touching the ground
tips = [Vector((c[:, 0].mean(), c[:, 1].mean(), 0.0)) for c in clusters(V[:, 2] < 0.08 * H)]
cy = float(np.mean([t.y for t in tips]))
centre = Vector((0, cy, 0))
legs = []
for side, sname in ((1, 'L'), (-1, 'R')):
    mine = sorted([t for t in tips if t.x * side > 0], key=lambda t: t.y)     # front (-Y) to back
    for i, t in enumerate(mine):
        legs.append((f'Leg{sname}{i + 1}', t))
print('legs', [(n, tuple(round(c, 2) for c in t)) for n, t in legs])

# ---- fangs: small clusters near the front centre that stop short of the ground
fangs = []
band = (V[:, 2] > 0.17 * H) & (V[:, 2] < 0.27 * H) & (np.abs(V[:, 0]) < 0.15 * H) & (V[:, 1] < cy - 0.3 * H)
for c in clusters(band, min_n=60):
    lo = c[np.argmin(c[:, 2])]
    fangs.append(Vector(lo))
if fangs:                                   # symmetric creature: take the frontmost fang and mirror it
    f0 = min(fangs, key=lambda f: f.y)
    fangs = [Vector((abs(f0.x), f0.y, f0.z)), Vector((-abs(f0.x), f0.y, f0.z))]
print('fangs', [tuple(round(x, 2) for x in f) for f in fangs])

# ---- armature
arm_d = bpy.data.armatures.new('CreatureRig')
rig = bpy.data.objects.new('CreatureRig', arm_d)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
b = eb.new('Body'); b.head = Vector((0, cy + 0.25 * H, 0.5 * H)); b.tail = Vector((0, cy - 0.25 * H, 0.5 * H))
J = {}
for name, t in legs:
    out_dir = Vector((t.x, t.y - cy, 0)).normalized()
    knee = Vector((t.x, t.y, 0.44 * H)) - out_dir * 0.04 * H
    hip = Vector((t.x * 0.42, cy + (t.y - cy) * 0.5, 0.45 * H))
    h = eb.new(name + 'Hip'); h.head = hip; h.tail = knee; h.parent = eb['Body']
    s = eb.new(name + 'Shin'); s.head = knee; s.tail = t + Vector((0, 0, 0.01)); s.parent = h; s.use_connect = True
    J[name] = (hip, knee, t)
for f, sname in zip(fangs, ('FangL', 'FangR')):
    root_pt = f + Vector((0, 0.16 * H, 0.14 * H))
    fb = eb.new(sname); fb.head = root_pt; fb.tail = f; fb.parent = eb['Body']
for e in eb:
    e.align_roll(Vector((0, 0, 1)) if abs((e.tail - e.head).normalized().z) < 0.8 else Vector((0, -1, 0)))
bpy.ops.object.mode_set(mode='OBJECT')

# ---- skin: heat weights on a welded proxy, transferred to the textured mesh
proxy = body.copy(); proxy.data = body.data.copy(); proxy.name = 'WeightProxy'
bpy.context.scene.collection.objects.link(proxy)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = proxy; proxy.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.001)
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for g in proxy.vertex_groups: body.vertex_groups.new(name=g.name)
dt = body.modifiers.new('wt', 'DATA_TRANSFER')
dt.object = proxy; dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'NEAREST'
dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.modifier_apply(modifier='wt')
bpy.data.objects.remove(proxy)

# ---- clean-up: the shell is rigid on the body; each leg only moves its own side's verts
gi = {g.name: g.index for g in body.vertex_groups}; inv = {i: n for n, i in gi.items()}
shell_z = 0.52 * H
bodyg = body.vertex_groups['Body']
for v in body.data.vertices:
    if v.co.z > shell_z:
        for g in v.groups: g.weight = 0.0
        bodyg.add([v.index], 1.0, 'REPLACE'); continue
    side = 'L' if v.co.x > 0 else 'R'
    for g in v.groups:
        n = inv[g.group]
        if n.startswith('Leg') and n[3] != side and abs(v.co.x) > 0.1 * H: g.weight = 0.0
bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
for v in body.data.vertices:
    if not any(g.weight > 0 for g in v.groups): bodyg.add([v.index], 1.0, 'REPLACE')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
cnt = {n: 0 for n in gi}
for v in body.data.vertices:
    for g in v.groups:
        if g.weight > 0.3: cnt[inv[g.group]] += 1
print('verts per bone', cnt)

body.parent = rig
m = body.modifiers.new('Armature', 'ARMATURE'); m.object = rig
rig['height_m'] = H
bpy.ops.wm.save_as_mainfile(filepath=out)
print('SAVED', out)
