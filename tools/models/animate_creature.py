"""Blender: key idle / walk / death on a rig from rig_creature.py, render checks, export a game GLB.

blender -b --factory-startup RIG.blend -P tools/models/animate_creature.py -- OUT.glb [--test DIR]

Legs are moved by where their tips should go: each hip turns so its tip lands on a target
(rest tip + offset), which works for legs pointing any way. The walk is an alternating tetrapod
gait: L1 R2 L3 R4 step together, then R1 L2 R3 L4.
"""
import bpy, sys, os, math
from mathutils import Euler, Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(argv[0])
test_dir = os.path.abspath(argv[argv.index('--test') + 1]) if '--test' in argv else None

rig = bpy.data.objects['CreatureRig']
body = bpy.data.objects['Body']
P = rig.pose.bones
H = rig.get('height_m', 1.85)
for pb in P: pb.rotation_mode = 'QUATERNION'
LEGS = sorted({b.name[:5] for b in rig.data.bones if b.name.startswith('Leg')})
GROUP_A = {'LegL1', 'LegR2', 'LegL3', 'LegR4'}

def setq(name, q):
    """World-frame rotation q applied at the bone's rest orientation (in its parent's posed frame)."""
    pb = P[name]; rest = pb.bone.matrix_local.to_3x3()
    pb.rotation_quaternion = (rest.inverted() @ q.to_matrix() @ rest).to_quaternion()

def rot(name, x=0, y=0, z=0):
    setq(name, Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_quaternion())

def reset():
    for pb in P: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

def move(name, x=0, y=0, z=0):
    P[name].location = P[name].bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))

def leg_to(leg, off, curl=0.0):
    """Turn the hip so the tip moves by `off` (world, metres, from rest); curl folds the shin under."""
    hb = rig.data.bones[leg + 'Hip']; sb = rig.data.bones[leg + 'Shin']
    hip, tip = hb.head_local, sb.tail_local
    r0 = tip - hip; r1 = r0 + off
    setq(leg + 'Hip', r0.rotation_difference(r1))
    if curl:
        ax = (sb.tail_local - sb.head_local).cross(Vector((0, 0, 1)))
        if ax.length > 1e-4:
            setq(leg + 'Shin', Quaternion(ax.normalized(), -curl))

def key(f):
    for pb in P:
        pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)

def new_action(name):
    rig.animation_data_create()
    a = bpy.data.actions.new(name); a.use_fake_user = True
    rig.animation_data.action = a
    return a

STEP = 0.16 * H          # half a stance stroke (tip travels 2*STEP backwards per stance)
LIFT = 0.10 * H

def walk_pose(t):
    reset()
    for leg in LEGS:
        u = (t + (0 if leg in GROUP_A else 0.5)) % 1.0
        if u < 0.5:                                   # stance: tip sweeps from front to back on the ground
            dy = -STEP + 2 * STEP * (u / 0.5); dz = 0.0
        else:                                         # swing: lift and bring it forward again
            s = (u - 0.5) / 0.5
            dy = STEP - 2 * STEP * (0.5 - 0.5 * math.cos(math.pi * s)); dz = LIFT * math.sin(math.pi * s)
        leg_to(leg, Vector((0, dy, dz)))
    p = t * 2 * math.pi
    move('Body', 0, 0, -0.012 * H * abs(math.cos(2 * p)))
    rot('Body', 1.2 * math.sin(2 * p), 1.5 * math.sin(p), 2.0 * math.sin(p))
    for f, sg in (('FangL', 1), ('FangR', -1)):
        if f in P: rot(f, 0, 0, sg * 6 * math.sin(2 * p))

def idle_pose(t):
    reset()
    b = math.sin(t * 2 * math.pi)
    move('Body', 0, 0, -0.008 * H * (1 + b) / 2)
    rot('Body', 0.8 * b, 0, 0)
    for i, leg in enumerate(LEGS):                    # small restless shifts, out of phase
        w = math.sin(t * 2 * math.pi + i * 1.7)
        leg_to(leg, Vector((0, 0.012 * H * w, 0.006 * H * max(0.0, w))))
    for f, sg in (('FangL', 1), ('FangR', -1)):
        if f in P: rot(f, 0, 0, sg * 10 * max(0.0, math.sin(t * 4 * math.pi)) ** 2)

def death_pose(k):
    """k 0..1: the legs give, the shell drops to the ground and tips, the legs curl up."""
    reset()
    e = 1 - (1 - min(1.0, k)) ** 2
    move('Body', 0, 0, -0.30 * H * e)
    rot('Body', -10 * e, 8 * e, 0)
    for leg in LEGS:
        hb = rig.data.bones[leg + 'Hip']; sb = rig.data.bones[leg + 'Shin']
        inward = Vector((-(sb.tail_local.x), 0, 0)).normalized() * 0.2 * H
        leg_to(leg, (inward + Vector((0, 0, 0.32 * H))) * e, curl=1.1 * e)
    for f, sg in (('FangL', 1), ('FangR', -1)):
        if f in P: rot(f, 0, 0, sg * 25 * e)

def measure_stride(n):
    """Metres the body travels per walk cycle: each leg's stance stroke, twice per cycle."""
    return 2 * (2 * STEP)

# ---------------------------------------------------------------- checks
if test_dir:
    os.makedirs(test_dir, exist_ok=True)
    scn = bpy.context.scene; scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 520; scn.render.resolution_y = 360
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = 4.6
    cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
    sd = bpy.data.lights.new('S', 'SUN'); sd.energy = 3
    sun = bpy.data.objects.new('S', sd); scn.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    def shoot(tag):
        bpy.context.view_layer.update()
        for vn, ang, el in (('q', 35, 22), ('side', 90, 5)):
            a = math.radians(ang); e = math.radians(el)
            cam.location = (-math.sin(a) * 9 * math.cos(e), -math.cos(a) * 9 * math.cos(e), 0.8 + 9 * math.sin(e))
            cam.rotation_euler = (math.radians(90) - e, 0, -a)
            scn.render.filepath = os.path.join(test_dir, f'{tag}_{vn}.png'); bpy.ops.render.render(write_still=True)
    reset(); shoot('0rest')
    walk_pose(0.0); shoot('1walk0')
    walk_pose(0.25); shoot('2walk25')
    walk_pose(0.75); shoot('3walk75')
    death_pose(1.0); shoot('4dead')

# ---------------------------------------------------------------- actions
WALK_N = 24
new_action('walk')
for f in range(0, WALK_N + 1, 2):
    walk_pose(f / WALK_N); key(f)
rig['walk_stride_m'] = round(measure_stride(WALK_N), 4)
rig['walk_cycle_s'] = WALK_N / 30
print('WALK stride per cycle %.3f m, %.2f m/s at 1x' % (rig['walk_stride_m'], rig['walk_stride_m'] / rig['walk_cycle_s']))
new_action('idle')
for f in range(0, 61, 5):
    idle_pose(f / 60); key(f)
new_action('death')
for f in range(0, 19, 2):
    death_pose(f / 18); key(f)
reset(); rig.animation_data.action = None
bpy.context.scene.frame_set(0)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
                          export_force_sampling=True, export_extras=True, export_image_format='JPEG')
print('EXPORTED', out, os.path.getsize(out))
