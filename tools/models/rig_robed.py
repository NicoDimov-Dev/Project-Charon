"""Blender: rig and animate a robed figure (the Doolan) whose robe reaches the floor and whose hands
are held together at the chest, so there are no free legs or hanging arms to find.

blender -b --factory-startup -P tools/models/rig_robed.py -- MODEL.glb OUT.glb [--height 2.35] [--tris 60000] [--test DIR]

A spine chain (Root, Hips, Spine, Chest, Neck, Head) is weighted smoothly by height, so the robe,
the body and the steepled hands move as one soft column. Clips: idle (breath, head sway), talk (nods,
small bows), walk (a gliding shuffle, the robe swaying). Faces -Y; its left is +X.
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Euler, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
H = float(argv[argv.index('--height') + 1]) if '--height' in argv else 2.35
TRIS = int(argv[argv.index('--tris') + 1]) if '--tris' in argv else 60000
test = os.path.abspath(argv[argv.index('--test') + 1]) if '--test' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]; body.name = 'Body'
for o in list(bpy.context.scene.objects):
    if o is not body: bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
if tris > TRIS:
    d = body.modifiers.new('d', 'DECIMATE'); d.ratio = TRIS / tris; bpy.ops.object.modifier_apply(modifier='d')
print('tris', tris, '->', sum(len(p.vertices) - 2 for p in body.data.polygons))
co = np.empty(len(body.data.vertices) * 3); body.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
co[:, 2] -= co[:, 2].min(); co *= H / co[:, 2].max()
co[:, 0] -= (co[:, 0].max() + co[:, 0].min()) / 2; co[:, 1] -= (co[:, 1].max() + co[:, 1].min()) / 2
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()

# spine chain along the body's centre line (y from the mean depth at each height)
def cy(z):
    m = np.abs(co[:, 2] - z) < 0.03 * H
    return float(co[m, 1].mean()) if m.any() else 0.0
chain = [('Root', 0.0, 0.42), ('Hips', 0.42, 0.52), ('Spine', 0.52, 0.66), ('Chest', 0.66, 0.80), ('Neck', 0.80, 0.86), ('Head', 0.86, 1.0)]
arm = bpy.data.armatures.new('RobedRig'); rig = bpy.data.objects.new('RobedRig', arm)
bpy.context.scene.collection.objects.link(rig); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
prev = None
for n, a, b in chain:
    e = arm.edit_bones.new(n); e.head = Vector((0, cy(a * H + 0.01), a * H)); e.tail = Vector((0, cy(b * H - 0.01), b * H))
    e.align_roll(Vector((0, -1, 0)))
    if prev: e.parent = prev; e.use_connect = True
    prev = e

# --arms: the model hangs its arms free (A-pose). Joints as fractions of height, measured on the mesh:
# shoulder, elbow, wrist (cuff end) and finger tip, on the model's left (+X); mirrored for the right.
ARMS = '--arms' in argv
SIDES = (('Left', 1), ('Right', -1))
J = {'S': (0.120, 0.760), 'E': (0.210, 0.635), 'W': (0.300, 0.505), 'T': (0.312, 0.440)}
def arm_y(x, z):                                         # mean depth of the sleeve around (x, z)
    m = (np.abs(co[:, 2] - z * H) < 0.02 * H) & (np.abs(co[:, 0] - x * H) < 0.03 * H)
    return float(co[m, 1].mean()) if m.any() else 0.0
if ARMS:
    JP = {k: Vector((x * H, arm_y(x, z), z * H)) for k, (x, z) in J.items()}
    for side, s in SIDES:
        P3 = {k: Vector((v.x * s, v.y, v.z)) for k, v in JP.items()}
        prev = arm.edit_bones['Chest']
        for n, a, b in (('UpperArm', 'S', 'E'), ('ForeArm', 'E', 'W'), ('Hand', 'W', 'T')):
            e = arm.edit_bones.new(side + n); e.head = P3[a]; e.tail = P3[b]; e.align_roll(Vector((0, -1, 0)))
            e.parent = prev; e.use_connect = n != 'UpperArm'; prev = e
bpy.ops.object.mode_set(mode='OBJECT')

# weights: each vertex blends between the two spine bones whose middles bracket its height; with --arms,
# sleeve and hand vertices go (smoothly, near the shoulder) to the arm chain instead
mids = [((a + b) / 2) * H for _, a, b in chain]
groups = {n: body.vertex_groups.new(name=n) for n, _, _ in chain}
if ARMS:
    for side, _ in SIDES:
        for n in ('UpperArm', 'ForeArm', 'Hand'): groups[side + n] = body.vertex_groups.new(name=side + n)
# the body's outer edge (fraction of H) below the armpit, where a gap separates it from the sleeve
EDGE = [(0.43, 0.15), (0.46, 0.14), (0.50, 0.132), (0.54, 0.123), (0.58, 0.113), (0.62, 0.099), (0.66, 0.101), (0.69, 0.106)]
def smooth(a, b, x): t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def arm_share(x, z):                                     # x, z as fractions of H, x >= 0
    if z < 0.43: return 0.0
    if z < 0.69:
        e = float(np.interp(z, [p[0] for p in EDGE], [p[1] for p in EDGE]))
        return 1.0 if x > e + 0.006 else 0.0
    return smooth(0.095, 0.15, x) * (1 - smooth(0.80, 0.84, z))
def seg_t(p, a, b):
    d = b - a; return max(0.0, min(1.0, (p - a).dot(d) / d.length_squared))
for v in body.data.vertices:
    z = v.co.z; wsp = {}
    if z <= mids[0]: wsp['Root'] = 1.0
    elif z >= mids[-1]: wsp['Head'] = 1.0
    else:
        for k in range(len(mids) - 1):
            if mids[k] <= z < mids[k + 1]:
                t = smooth(mids[k], mids[k + 1], z); wsp[chain[k][0]] = 1 - t; wsp[chain[k + 1][0]] = t; break
    a = arm_share(abs(v.co.x) / H, z / H) if ARMS else 0.0
    if a > 0:
        side = 'Left' if v.co.x > 0 else 'Right'; s = 1 if v.co.x > 0 else -1
        S, E, W, T = (Vector((JP[k].x * s, JP[k].y, JP[k].z)) for k in 'SEWT')
        p = v.co
        # nearest point along the chain, then blend across the elbow and the wrist
        u = seg_t(p, S, E); f = seg_t(p, E, W)
        dE = (p - (S + (E - S) * u)).length; dF = (p - (E + (W - E) * f)).length
        if z / H < 0.505 - 0.004 and abs(p.x) / H > 0.24: wa = {'Hand': 1.0}
        else:
            k = smooth(-0.025 * H, 0.025 * H, dE - dF)       # > 0: nearer the forearm
            wa = {'UpperArm': 1 - k, 'ForeArm': k}
            if z / H < 0.53: wa = {'ForeArm': 1.0}
        for n, w in wa.items(): groups[side + n].add([v.index], w * a, 'REPLACE')
    for n, w in wsp.items():
        if w * (1 - a) > 0: groups[n].add([v.index], w * (1 - a), 'REPLACE')
body.parent = rig
m = body.modifiers.new('Armature', 'ARMATURE'); m.object = rig
rig['walk_stride_m'] = 1.1; rig['walk_cycle_s'] = 32 / 30

# ---- clips (world-frame Euler degrees at each bone's rest orientation; X+ tips forward (it faces -Y), Z+ turns to its left)
P = rig.pose.bones
for pb in P: pb.rotation_mode = 'QUATERNION'
def rot(n, x=0, y=0, z=0):
    pb = P[n]; R = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()
    r = pb.bone.matrix_local.to_3x3(); pb.rotation_quaternion = (r.inverted() @ R @ r).to_quaternion()
def move(n, x=0, y=0, z=0): P[n].location = P[n].bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))
def reset():
    for pb in P: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
def key(f):
    for pb in P: pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
def action(name):
    rig.animation_data_create(); a = bpy.data.actions.new(name); a.use_fake_user = True; rig.animation_data.action = a

def aim_bone(name, d, twist=0.0):
    """Point a pose bone along armature-space direction d, keeping its head where its parent put it."""
    bpy.context.view_layer.update()
    pb = P[name]; rest = pb.bone
    Rw = (rest.tail_local - rest.head_local).normalized().rotation_difference(d.normalized()).to_matrix()
    if twist: Rw = Matrix.Rotation(math.radians(twist), 3, d.normalized()) @ Rw
    m = (Rw @ rest.matrix_local.to_3x3()).to_4x4(); m.translation = pb.head.copy(); pb.matrix = m
# hands together in front of the chest (the 1997 Doolan's pose), carried with the chest; open = parting them
HOLD = {'elbow': (0.42, -0.45, -0.78), 'wrist': (0.072, -0.170, 0.665), 'tip': (0.006, -0.200, 0.745), 'twist': -70}
def hold_arms(open=0.0, lift=0.0):
    if not ARMS: return
    bpy.context.view_layer.update()
    C = P['Chest']; R = (C.matrix @ C.bone.matrix_local.inverted()); R3 = R.to_3x3()
    for side, s in SIDES:
        ex, ey, ez = HOLD['elbow']; aim_bone(side + 'UpperArm', R3 @ Vector((ex * s, ey - 0.15 * lift, ez + 0.1 * lift)))
        wx, wy, wz = HOLD['wrist']; w = R @ Vector(((wx + 0.06 * open) * s * H, wy * H, (wz + 0.02 * lift) * H))
        bpy.context.view_layer.update(); aim_bone(side + 'ForeArm', w - P[side + 'ForeArm'].head)
        tx, ty, tz = HOLD['tip']; tp = R @ Vector(((tx + 0.10 * open) * s * H, (ty + 0.02 * open) * H, (tz + 0.02 * lift) * H))
        bpy.context.view_layer.update(); aim_bone(side + 'Hand', tp - P[side + 'Hand'].head, HOLD['twist'] * s)
def idle(t):
    reset(); b = math.sin(t * 2 * math.pi); s = math.sin(t * 2 * math.pi * 0.5)
    rot('Chest', -1.2 * b); rot('Spine', -0.6 * b); rot('Neck', 1.5 * b, 0, 3 * s); rot('Head', 2 * math.sin(t * 6.28 + 1), 0, 4 * s)
    hold_arms(lift=0.15 * b)
def talk(t):
    reset(); p = t * 2 * math.pi
    rot('Spine', 3 + 2 * math.sin(p)); rot('Chest', 2 * math.sin(p + 0.5), 0, 3 * math.sin(p * 0.5))
    rot('Neck', 6 * max(0, math.sin(p * 2)) ** 2, 0, 5 * math.sin(p)); rot('Head', 4 * math.sin(p * 2 + 0.6), 3 * math.sin(p), 6 * math.sin(p + 1))
    hold_arms(open=max(0, math.sin(p + 0.8)) ** 2, lift=0.3 * max(0, math.sin(p + 0.8)))
def walk(t):
    reset(); p = t * 2 * math.pi
    move('Root', 0, 0, -0.01 * H * abs(math.cos(p)))
    rot('Root', 0, 2.5 * math.sin(p), 0); rot('Hips', 0, -1.5 * math.sin(p), 4 * math.sin(p))
    rot('Spine', 4, 0, -3 * math.sin(p)); rot('Chest', 1, 1 * math.sin(p), -2 * math.sin(p)); rot('Head', -3, 0, 2 * math.sin(p))
    hold_arms()

# death, after the 1997 DOOLDEAD frames: hands flung up palms out as he recoils, the knees go (the body sinks into
# the robe), he folds forward over them and settles face down in a heap
def arms_to(a):
    if not ARMS: return
    bpy.context.view_layer.update()
    C = P['Chest']; R = (C.matrix @ C.bone.matrix_local.inverted()); R3 = R.to_3x3()
    for side, s in SIDES:
        ex, ey, ez = a['elbow']; aim_bone(side + 'UpperArm', R3 @ Vector((ex * s, ey, ez)))
        wx, wy, wz = a['wrist']; bpy.context.view_layer.update(); aim_bone(side + 'ForeArm', R @ Vector((wx * s * H, wy * H, wz * H)) - P[side + 'ForeArm'].head)
        tx, ty, tz = a['tip']; bpy.context.view_layer.update(); aim_bone(side + 'Hand', R @ Vector((tx * s * H, ty * H, tz * H)) - P[side + 'Hand'].head, a['twist'] * s)
ARM_UP = {'elbow': (0.80, -0.20, 0.10), 'wrist': (0.200, -0.110, 0.900), 'tip': (0.200, -0.150, 0.985), 'twist': 20}
ARM_CLUTCH = {'elbow': (0.35, -0.55, -0.75), 'wrist': (0.090, -0.170, 0.640), 'tip': (0.030, -0.150, 0.600), 'twist': -60}
ARM_TUCK = {'elbow': (0.45, -0.75, -0.45), 'wrist': (0.120, -0.200, 0.560), 'tip': (0.070, -0.170, 0.500), 'twist': -40}
#        t      Root z   Root y  Hips   Spine  Chest  Neck   Head  arms
DK = [(0.00,  0.00,   0.00,    0,    0,     0,     0,     0,   HOLD),           # pitch: + bends forward in this rig
      (0.16,  0.00,   0.025,  -3,   -6,   -10,    -8,   -16,   ARM_UP),
      (0.32, -0.04,   0.03,    0,   -2,    -4,    -4,    -6,   ARM_UP),
      (0.55, -0.25,   0.01,    8,    8,     2,     4,     6,   ARM_CLUTCH),
      (0.78, -0.33,  -0.03,   60,   18,     8,     8,    12,   ARM_TUCK),
      (1.00, -0.37,  -0.06,   72,   16,     8,     6,    10,   ARM_TUCK)]
def death(t):
    reset()
    for i in range(len(DK) - 1):
        if DK[i][0] <= t <= DK[i + 1][0]: a, b = DK[i], DK[i + 1]; break
    else: a = b = DK[-1]
    u = 0 if b[0] == a[0] else (t - a[0]) / (b[0] - a[0]); u = u * u * (3 - 2 * u)
    L = lambda k: a[k] + (b[k] - a[k]) * u
    move('Root', 0, L(2) * H, L(1) * H)
    rot('Hips', L(3)); rot('Spine', L(4)); rot('Chest', L(5)); rot('Neck', L(6)); rot('Head', L(7))
    A, B = a[8], b[8]
    arms_to({k: (tuple(x + (y - x) * u for x, y in zip(A[k], B[k])) if k != 'twist' else A[k] + (B[k] - A[k]) * u) for k in A})

if test:
    os.makedirs(test, exist_ok=True); scn = bpy.context.scene; scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 360; scn.render.resolution_y = 520
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = H * 1.15
    cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
    sd = bpy.data.lights.new('S', 'SUN'); sd.energy = 3; sun = bpy.data.objects.new('S', sd); scn.collection.objects.link(sun); sun.rotation_euler = (0.9, 0, -0.5)
    for tag, f in (('idle', lambda: idle(0.25)), ('talk', lambda: talk(0.3)), ('walk', lambda: walk(0.25)), ('death1', lambda: death(0.18)), ('death2', lambda: death(0.5)), ('death3', lambda: death(0.75)), ('death4', lambda: death(1.0))):
        f(); bpy.context.view_layer.update()
        for vn, ang in (('front', 30), ('side', 90)):
            a = math.radians(ang); cam.location = (-math.sin(a) * 8, -math.cos(a) * 8, H / 2); cam.rotation_euler = (math.radians(90), 0, -a)
            scn.render.filepath = os.path.join(test, f'{tag}_{vn}.png'); bpy.ops.render.render(write_still=True)

action('idle'); [ (idle(f / 90), key(f)) for f in range(0, 91, 6) ]
action('talk'); [ (talk(f / 60), key(f)) for f in range(0, 61, 3) ]
action('walk'); [ (walk(f / 32), key(f)) for f in range(0, 33, 2) ]
action('death'); [ (death(f / 54), key(f)) for f in range(0, 55, 2) ]
reset(); rig.animation_data.action = None
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_skins=True, export_yup=True, export_force_sampling=True, export_extras=True, export_image_format='JPEG')
print('EXPORTED', out, os.path.getsize(out) // 1024, 'KB')
