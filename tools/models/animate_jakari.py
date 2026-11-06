"""Blender: Jakari clips on a rig from rig_humanoid.py (--name JakariRig), checks, and a game GLB.

blender -b --factory-startup RIG.blend -P tools/models/animate_jakari.py -- OUT.glb [--test DIR]

The canyon's Jakari lie wounded after the ambush (1997 JKWOUND / JKWNDED), so besides a standing
`idle` there are `wounded` (face down, chest and head propped on the forearms, laboured breathing)
and `dying` (the chest and head sink, the arms give way; its last frame is the dead pose).
Rotations are world-frame Euler angles at each bone's rest orientation: X+ swings a hanging limb
backward, Z+ turns toward its left. The creature faces -Y.
"""
import bpy, sys, os, math
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(argv[0])
test_dir = os.path.abspath(argv[argv.index('--test') + 1]) if '--test' in argv else None
rig = bpy.data.objects['JakariRig']; body = bpy.data.objects['Body']
P = rig.pose.bones
for pb in P: pb.rotation_mode = 'QUATERNION'

def rot(name, x=0, y=0, z=0):
    pb = P[name]; R = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()
    rest = pb.bone.matrix_local.to_3x3(); pb.rotation_quaternion = (rest.inverted() @ R @ rest).to_quaternion()
def move(name, x=0, y=0, z=0):
    P[name].location = P[name].bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))
def reset():
    for pb in P: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
def key(f):
    for pb in P: pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
def new_action(name):
    rig.animation_data_create(); a = bpy.data.actions.new(name); a.use_fake_user = True
    rig.animation_data.action = a; return a
mix = lambda a, b, k: a + (b - a) * k
from mathutils import Matrix
def aim(name, d):
    """Point a bone along world direction d (keeps its parent's pose)."""
    bpy.context.view_layer.update()
    pb = P[name]; rest = pb.bone
    rd = (rest.tail_local - rest.head_local).normalized()
    m = (rd.rotation_difference(d.normalized()).to_matrix() @ rest.matrix_local.to_3x3()).to_4x4()
    m.translation = pb.head.copy(); pb.matrix = m

HIP_Z = rig.data.bones['Hips'].head_local.z

def idle_pose(t):
    b = math.sin(t * 2 * math.pi); reset()
    rot('Spine1', -1.5 * b); rot('Spine2', -1 * b); rot('Head', 2 * b)
    for s in ('Left', 'Right'): rot(s + 'ForeArm', -6 - 2 * b)

def wounded_pose(t, k=0.0):
    """Face down, propped on the forearms; k 0 -> 1 collapses it (dying)."""
    reset()
    b = math.sin(t * 2 * math.pi)                               # laboured breath
    gasp = max(0.0, math.sin(t * 2 * math.pi)) ** 3
    move('Hips', 0, mix(-0.55, -0.62, k), -(HIP_Z - mix(0.36, 0.27, k)))
    rot('Hips', mix(86, 90, k), 0, mix(-6, -10, k))               # fallen forward, a little twisted
    rot('Spine', mix(-14, -4, k) - 1.5 * b * (1 - k))
    rot('Spine1', mix(-20, -4, k) - 2.5 * b * (1 - k))
    rot('Spine2', mix(-16, 0, k) - 2 * gasp * (1 - k))
    rot('Neck', mix(-25, 5, k))
    rot('Head', mix(-30, 20, k) + 4 * gasp * (1 - k), 0, mix(10, 25, k))
    for s, sg in (('Left', 1), ('Right', -1)):
        rot(s + 'UpLeg', mix(-8, -4, k), sg * -6, 0)
        rot(s + 'Leg', mix(25, 10, k) if s == 'Left' else mix(8, 4, k))
        rot(s + 'Foot', 35)
    for s, sg in (('Left', 1), ('Right', -1)):
        # propped: upper arms down to the ground, forearms flat and forward, claws dug in.
        # dying: the elbows slide out and the arms lie flat beside the head.
        aim(s + 'Arm', Vector((sg * mix(0.35, 0.9, k), mix(-0.25, -0.6, k), mix(-1.0, -0.25, k))))
        aim(s + 'ForeArm', Vector((sg * mix(-0.15, 0.25, k), -1.0, mix(-0.08, -0.05, k))))
        twitch = 0.35 * max(0.0, math.sin(t * 6 * math.pi)) ** 4 * (1 - k) if s == 'Right' else 0.0
        aim(s + 'Hand', Vector((sg * mix(-0.1, 0.15, k), -1.0, mix(-0.22, -0.12, k) + twitch)))

def dying_pose(k):
    wounded_pose(0.25 + 0.5 * k, min(1.0, k * 1.15))

if test_dir:
    os.makedirs(test_dir, exist_ok=True)
    scn = bpy.context.scene; scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 520; scn.render.resolution_y = 380
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = 3.6
    cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
    sd = bpy.data.lights.new('S', 'SUN'); sd.energy = 3
    sun = bpy.data.objects.new('S', sd); scn.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    ground = bpy.data.meshes.new('G'); ground.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new('G', ground); scn.collection.objects.link(g)
    def shoot(tag, cz=1.0):
        bpy.context.view_layer.update()
        for vn, ang, el in (('q', 35, 25), ('side', 90, 4)):
            a = math.radians(ang); e = math.radians(el)
            cam.location = (-math.sin(a) * 9 * math.cos(e), -0.5 - math.cos(a) * 9 * math.cos(e), cz + 9 * math.sin(e))
            cam.rotation_euler = (math.radians(90) - e, 0, -a)
            scn.render.filepath = os.path.join(test_dir, f'{tag}_{vn}.png'); bpy.ops.render.render(write_still=True)
    reset(); shoot('0rest', 1.0)
    wounded_pose(0.0); shoot('1wounded', 0.5)
    wounded_pose(0.25); shoot('2breath', 0.5)
    dying_pose(1.0); shoot('3dead', 0.5)

new_action('idle')
for f in range(0, 61, 6): idle_pose(f / 60); key(f)
new_action('wounded')
for f in range(0, 91, 3): wounded_pose(f / 90); key(f)
new_action('dying')
for f in range(0, 31, 2): dying_pose(f / 30); key(f)
reset(); rig.animation_data.action = None; bpy.context.scene.frame_set(0)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
                          export_force_sampling=True, export_extras=True, export_image_format='JPEG')
print('EXPORTED', out, os.path.getsize(out))
