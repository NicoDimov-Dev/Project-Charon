"""Blender: key procedural idle / walk / aim actions on a rig from rig_humanoid.py,
render stress-pose checks, and export a game GLB.

blender -b --factory-startup RIG.blend -P tools/models/animate_humanoid.py -- OUT.glb [--test DIR] [--cannon R]

Rotations are given as world-frame Euler angles (degrees) applied at each bone's rest
orientation: X+ swings a hanging limb backward, Z+ turns toward his left. Character faces -Y.
"""
import bpy, sys, os, math
from mathutils import Euler, Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(argv[0])
test_dir = os.path.abspath(argv[argv.index('--test') + 1]) if '--test' in argv else None
cannon = argv[argv.index('--cannon') + 1] if '--cannon' in argv else 'R'
C = 'Right' if cannon == 'R' else 'Left'      # cannon side
O = 'Left' if cannon == 'R' else 'Right'      # free hand

rig = bpy.data.objects['CharonRig']
body = bpy.data.objects['Body']
P = rig.pose.bones
for pb in P:
    pb.rotation_mode = 'QUATERNION'

def rot(name, x=0, y=0, z=0):
    pb = P[name]
    R = Euler((math.radians(x), math.radians(y), math.radians(z)), 'XYZ').to_matrix()
    rest = pb.bone.matrix_local.to_3x3()
    pb.rotation_quaternion = (rest.inverted() @ R @ rest).to_quaternion()

def move(name, x=0, y=0, z=0):
    pb = P[name]
    pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector((x, y, z))

def reset():
    for pb in P:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)

def key(f):
    for pb in P:
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)

def new_action(name):
    rig.animation_data_create()
    a = bpy.data.actions.new(name); a.use_fake_user = True
    rig.animation_data.action = a
    return a

# ---------------------------------------------------------------- poses
# High-ready carry (1997 sprites; a rifle held muzzle-up). Bones are aimed at world directions
# rather than composed from angles, so the fold is exact: the upper arm hangs (a little out and
# forward), and the forearm comes back up along it, tipped toward the shoulder so it sinks into
# the bicep: a fully closed, pointed elbow with the cannon upright beside the face.
#   up_out / up_fwd: upper arm's sideways / forward lean per unit of drop
#   fore_in / fore_fwd: forearm's lean back toward the body's midline / forward per unit of rise
GUN = dict(up_out=0.20, up_fwd=0.40, fore_in=0.18, fore_fwd=0.08, shrug=18)

def aim_bone(name, d, twist=0.0):
    """Point a pose bone along world direction d (armature space), keeping its parent's pose."""
    bpy.context.view_layer.update()
    pb = P[name]; rest = pb.bone
    rd = (rest.tail_local - rest.head_local).normalized()
    Rw = rd.rotation_difference(d.normalized()).to_matrix()
    if twist:
        Rw = Matrix.Rotation(math.radians(twist), 3, d.normalized()) @ Rw
    m = (Rw @ rest.matrix_local.to_3x3()).to_4x4()
    m.translation = pb.head.copy()
    pb.matrix = m

def gun_up(bob=0.0, g=None):
    g = g or GUN
    out = 1 if C == 'Right' else -1                 # Y+ lifts the right shoulder; his right is -X
    rot(C + 'Shoulder', 0, out * g['shrug'], 0)
    lean = math.radians(bob)
    d_up = Vector((-out * g['up_out'], -g['up_fwd'] - lean, -1.0))
    d_fore = Vector((out * g['fore_in'], -g['fore_fwd'] + lean * 0.5, 1.0))
    aim_bone(C + 'Arm', d_up)
    aim_bone(C + 'ForeArm', d_fore)

def gun_down(c=0.0, idle_b=None):
    """Interaction mode: cannon arm hanging, swinging a little with the walk (c) or breathing (idle_b)."""
    if idle_b is not None:
        rot(C + 'Arm', 0, (1 if C == 'Left' else -1) * -1.0 * idle_b, 0)
        rot(C + 'ForeArm', -8, 0, 0)
    else:
        rot(C + 'Arm', 7 * c * (1 if C == 'Left' else -1) - 3, 0, 0)
        rot(C + 'ForeArm', -14, 0, 0)

# Stance width. The rig's rest stance is wide (A-pose legs), and swinging the legs straight from it gave a
# bow-legged, just-off-a-horse gait. Each thigh is angled in (about the forward axis) so the feet land under
# the hips; the foot is rolled back so its sole stays flat.  feet_at: foot spacing as a fraction of hip spacing.
def adduction(feet_at):
    bpy.context.view_layer.update()
    rest = rig.data.bones
    hx = abs(rest['LeftUpLeg'].head_local.x); fx = abs(rest['LeftFoot'].head_local.x)
    L = rest['LeftUpLeg'].head_local.z - rest['LeftFoot'].head_local.z
    return math.degrees(math.atan2(fx - hx * feet_at, L) - 0.0)
ADD_WALK = adduction(1.6)
ADD_RUN = adduction(1.35)
print('stance: walk adduction %.1f deg, run %.1f deg' % (ADD_WALK, ADD_RUN))
def leg(side, thigh, knee, foot, add):
    s = 1 if side == 'Left' else -1                  # Y+ brings the left (+X) foot in toward the midline
    rot(side + 'UpLeg', thigh, s * add, 0); rot(side + 'Leg', knee, 0, 0); rot(side + 'Foot', foot, -s * add, 0)

def walk_pose(t, ready=False):
    """t: 0..1 through one cycle (two steps). Left foot plants at t=0, right at 0.5.
    A heavy, deliberate stride: long steps, a clear drop onto each foot, chest leaning in."""
    p = t * 2 * math.pi
    c = math.cos(p)
    reset()
    for side, sgn, ph in (('Left', 1, p), ('Right', -1, p + math.pi)):
        swing = max(0.0, math.sin(ph - math.pi))                    # 0..1 while the leg swings forward
        thigh = -27 * math.cos(ph) - 16 * swing                     # forward at contact, leads the swing
        load = max(0.0, math.sin(ph * 2)) if math.sin(ph) > 0 else 0  # weight acceptance just after contact
        knee = 5 + 14 * load + 58 * swing ** 1.3
        lift = max(0.0, math.sin(ph - 0.75 * math.pi)) if math.sin(ph) < 0.3 else 0
        foot = -(thigh + knee) - 10 * max(0.0, math.cos(ph)) ** 3 + 20 * lift * (1 - swing)
        leg(side, thigh, knee, foot, ADD_WALK)
    drop = math.cos(2 * p)                                           # 1 at each contact, -1 at passing
    move('Hips', 0, 0, -0.022 * max(0.0, drop) ** 0.7 + 0.008 * max(0.0, -drop) - 0.02)
    rot('Hips', 0, 3.5 * math.sin(p), -7 * c)
    rot('Spine', 3, 0, 3 * c); rot('Spine1', 3 + 1.5 * drop, 0, 3 * c); rot('Spine2', 1, -2 * math.sin(p), 4 * c)
    rot('Neck', 0, 0, -2 * c); rot('Head', -4 - 1.5 * drop, 0, -1 * c)
    rot(O + 'Arm', 16 * c * (1 if O == 'Left' else -1) - 2, 0, 0)
    rot(O + 'ForeArm', -18 - 12 * max(0.0, -c if O == 'Left' else c), 0, 0)
    if ready: gun_up(bob=2.5 * drop)
    else: gun_down(c=c)

def idle_pose(t, ready=False):
    b = math.sin(t * 2 * math.pi)
    reset()
    rot('Spine1', -1.2 * b, 0, 0); rot('Spine2', -0.8 * b, 0, 0)
    move('Hips', 0, 0, -0.004 * (1 + b) / 2)
    rot('Head', 1.0 * b, 0, 0)
    rot(O + 'Arm', 0, (1 if O == 'Left' else -1) * -1.0 * b, 0)
    rot(O + 'ForeArm', -8, 0, 0)
    if ready: gun_up(bob=0.8 * b)
    else: gun_down(idle_b=b)

# The run (double-click). A compact, grounded jog in the manner of game agents (Agent 47's jog): upright,
# short quick steps landing close under the body, low knees, a small bounce and only a brief float.
# Built the way game locomotion is: a set ground speed RUN_V, and each foot LOCKED to the ground while it is
# down (two-bone IK from the hip to the ankle), so the speed in the game matches the legs exactly.
# Key poses per step: contact (leg near straight) -> down (lowest, knee bent) -> push (heel rolls up) -> peak.
RUN_V = 4.0          # m/s: a strong run (reference: MGSV's run, side on)
RUN_DUTY = 0.32      # fraction of a leg's cycle on the ground (two stances = 0.64, so two clear floats)
RUN_N = 20           # frames per cycle at 30 fps: 0.67 s, 180 steps a minute
RUN_BACK = 0.62      # share of the stance sweep spent behind the hips: lands under the body, pushes off far behind
RUN_SINK = 0.10      # m the hips sit below standing height: low and powerful
RUN_BOB = 0.030      # m of bounce: lowest in each 'down', highest in each float
RUN_WIDTH = 1.25     # foot spacing relative to the hip joints
RUN_REACH = [0.0]    # largest hip-to-ankle distance asked of the legs, as a fraction of their length (reported)
RUN_WIDTH = 1.35     # foot spacing relative to the hip joints (as the walk's stance)
def _rest(n): return rig.data.bones[n]
L1 = (_rest('LeftLeg').head_local - _rest('LeftUpLeg').head_local).length
L2 = (_rest('LeftFoot').head_local - _rest('LeftLeg').head_local).length
ANKLE_Z = _rest('LeftFoot').head_local.z
FOOT_DIR = (_rest('LeftFoot').tail_local - _rest('LeftFoot').head_local).normalized()
def ik_leg(side, A, pitch):
    """Point thigh and shin so the ankle reaches A (armature space), knee bending forward; foot pitched (+ = toes down)."""
    bpy.context.view_layer.update()
    H = P[side + 'UpLeg'].head.copy(); D = A - H; d = D.length
    RUN_REACH[0] = max(RUN_REACH[0], d / (L1 + L2)); d = min(d, (L1 + L2) * 0.999); u = D.normalized()
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d); h = math.sqrt(max(0.0, L1 * L1 - a * a))
    fwd = Vector((0, -1, 0)); n = (fwd - u * fwd.dot(u)).normalized()
    K = H + u * a + n * h
    aim_bone(side + 'UpLeg', K - H)
    bpy.context.view_layer.update(); aim_bone(side + 'Leg', (H + u * d) - P[side + 'Leg'].head)
    s = 1 if side == 'Left' else -1
    fd = Matrix.Rotation(math.radians(pitch), 3, 'X') @ FOOT_DIR
    bpy.context.view_layer.update(); aim_bone(side + 'Foot', Vector((fd.x * s, fd.y, fd.z)))
# swing path of the ankle relative to the hips (y: + behind, z: up from standing ankle height), from toe-off to
# contact, after the reference: the heel folds up toward the backside, the knee drives high and forward with the
# shin hanging, then the foot reaches out and comes down under the body.
RUN_SWING = [(0.00, None, 0.00),     # toe-off (y filled in from the stance)
             (0.22, 0.30, 0.38),     # heel folding up behind
             (0.45, 0.02, 0.52),     # passing under the hips, heel tucked high
             (0.68, -0.34, 0.40),    # knee driven high in front, shin hanging
             (0.86, -0.42, 0.14),    # foot reaching out
             (1.00, None, 0.00)]     # contact (y filled in)
def _path(keys, k):
    for i in range(len(keys) - 1):
        a, b = keys[i], keys[i + 1]
        if a[0] <= k <= b[0]:
            u = (k - a[0]) / (b[0] - a[0]); u = u * u * (3 - 2 * u)
            return a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u
    return keys[-1][1], keys[-1][2]
def run_foot(ph):
    """Ankle (y offset from the hips, height above its standing height, foot pitch) at phase ph of this leg (0 = contact)."""
    T = RUN_N / 30; sweep = RUN_V * RUN_DUTY * T          # metres the planted foot travels back under the hips
    y_on, y_off = -sweep * (1 - RUN_BACK), sweep * RUN_BACK
    ph %= 1.0
    if ph < RUN_DUTY:                                     # planted: moves back at exactly the ground speed
        k = ph / RUN_DUTY; y = y_on + sweep * k
        heel = max(0.0, (k - 0.55) / 0.45)                # push: the heel rolls up, the leg straightens behind
        return y, 0.11 * heel * heel, 40 * heel * heel
    k = (ph - RUN_DUTY) / (1 - RUN_DUTY)
    keys = [(a, (y_off if y is None and a == 0 else y_on if y is None else y), z) for a, y, z in RUN_SWING]
    keys[0] = (0.0, y_off, 0.11)
    y, z = _path(keys, k)
    pitch = 40 * (1 - k) ** 2 + 25 * math.sin(math.pi * min(1.0, k * 1.3)) * (k < 0.77) - 12 * max(0.0, (k - 0.75) / 0.25)
    return y, z, pitch
def jog_pose(t):
    p = t * 2 * math.pi
    reset()
    # hips: down over each stance's middle (t = DUTY/2 and 0.5 + DUTY/2), up in the floats
    bob = math.cos(4 * math.pi * (t - RUN_DUTY / 2))
    move('Hips', 0, 0, -RUN_SINK - RUN_BOB * bob)
    # torso: a firm forward lean; the pelvis turns with the leading leg and the shoulders counter-turn against it
    # (Z+ turns his left side back); the chest compresses onto each landing and lifts off the push; a little
    # sideways sway over the stance foot. The neck and head take the twist and lean back out: eyes stay level.
    c, sn = math.cos(p), math.sin(p)
    rot('Hips', 24, 3 * sn, -10 * c)                          # the pelvis tips forward: the whole body leans in
    rot('Spine', 8, 2 * sn, 7 * c); rot('Spine1', 5 + 3.5 * bob, 1.5 * sn, 7 * c); rot('Spine2', 2 + 1.5 * bob, 0, 6 * c)
    rot('Neck', -7, -2 * sn, -6 * c); rot('Head', -7 - 3 * bob, -1 * sn, -4 * c)    # head carried forward, eyes ahead
    bpy.context.view_layer.update()
    hy = P['Hips'].head.y
    for side, off in (('Left', 0.0), ('Right', 0.5)):
        y, z, pitch = run_foot(t + off)
        s = 1 if side == 'Left' else -1
        x = s * abs(_rest(side + 'UpLeg').head_local.x) * RUN_WIDTH
        ik_leg(side, Vector((x, hy + y, ANKLE_Z + z)), pitch)
    # arms, after the reference: driven forward and across in front of the chest, forearm reaching ahead; the back
    # arm swings back with the elbow high. Opposite the legs: the left arm forward as the right foot lands.
    sw = math.cos(p - 0.3)
    for side, fwd, back, elbow_f, elbow_b, cross, tuck in ((O, 60, 72, -58, -104, 16, 10), (C, 48, 50, -55, -94, 10, 8)):
        k = sw if side == 'Left' else -sw                  # +1: this arm back
        s = 1 if side == 'Left' else -1
        f, b = max(0.0, -k), max(0.0, k)
        rot(side + 'Arm', back * b - fwd * f - 8, s * tuck, -s * cross * f)
        rot(side + 'ForeArm', elbow_f * f + elbow_b * b + -88 * (1 - f - b), 0, 0)

def measure_stride_of(pose, n):
    """Metres travelled per cycle: two steps, each the heel-to-heel gap at a landing."""
    gaps = []
    for k in (0.0, 0.5):
        pose(k); bpy.context.view_layer.update()
        gaps.append(abs((P['LeftFoot'].head - P['RightFoot'].head).y))
    return sum(gaps)

def measure_planted(pose, t0, t1):
    """Metres per cycle for a gait with a float: how fast the planted foot moves back under the hips during
    stance (t0..t1, the left foot down), so the game's pace keeps it fixed to the ground."""
    pose(t0); bpy.context.view_layer.update(); a = P['LeftFoot'].head.y
    pose(t1); bpy.context.view_layer.update(); b = P['LeftFoot'].head.y
    return abs(b - a) / (t1 - t0)

def measure_stride():
    """Metres the body travels per walk cycle: two steps, each the heel-to-heel gap at contact."""
    sc = bpy.context.scene
    gaps = []
    for f in (0, 16):
        sc.frame_set(f)
        gaps.append(abs((P['LeftFoot'].head - P['RightFoot'].head).y))
    return sum(gaps)

def aim_pose():
    reset()
    sgnC = -1 if C == 'Right' else 1
    rot('Spine2', 0, 0, 12 * -sgnC)           # cannon shoulder forward
    rot(C + 'Shoulder', 0, 0, 0)
    rot(C + 'Arm', -84, 0, 14 * -sgnC)
    rot(C + 'ForeArm', 0, 0, 0)
    rot(O + 'Arm', 6, 0, 0); rot(O + 'ForeArm', -20, 0, 0)
    rot('Head', 0, 0, 8 * -sgnC)
    rot('LeftUpLeg', -4, 0, 0); rot('RightUpLeg', 6, 0, 0)
    rot('LeftLeg', 6, 0, 0); rot('RightLeg', 4, 0, 0)
    rot('LeftFoot', -2, 0, 0); rot('RightFoot', -10, 0, 0)

# ---------------------------------------------------------------- stress test renders
if test_dir:
    os.makedirs(test_dir, exist_ok=True)
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.resolution_x = 360; scn.render.resolution_y = 540
    w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.7
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = 2.5
    cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
    sd = bpy.data.lights.new('S', 'SUN'); sd.energy = 3
    sun = bpy.data.objects.new('S', sd); scn.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    def shoot(tag):
        bpy.context.view_layer.update()
        for vn, ang in (('front', 0), ('side', 90), ('q', 35), ('bq', 150)):
            a = math.radians(ang)
            cam.location = (-math.sin(a) * 8, -math.cos(a) * 8, 1.05)
            cam.rotation_euler = (math.radians(90), 0, -a)
            scn.render.filepath = os.path.join(test_dir, f'{tag}_{vn}.png')
            bpy.ops.render.render(write_still=True)
    if '--strip' in argv:                          # filmstrips of the walk and jog cycles, front and side
        scn.render.resolution_x = 220; scn.render.resolution_y = 400; cd.ortho_scale = 2.4
        for name, pose in (('walk', walk_pose), ('jog', jog_pose)):
            for k in range(8):
                pose(k / 8); bpy.context.view_layer.update()
                for vn, ang in (('front', 0), ('side', 90)):
                    a = math.radians(ang); cam.location = (-math.sin(a) * 8, -math.cos(a) * 8, 1.0); cam.rotation_euler = (math.radians(90), 0, -a)
                    scn.render.filepath = os.path.join(test_dir, f'strip_{name}_{vn}_{k}.png'); bpy.ops.render.render(write_still=True)
        # travel check: the rig moved forward at the run's ground speed, side view from a fixed camera; overlaid,
        # a planted foot must stay on one spot
        scn.render.resolution_x = 900; scn.render.resolution_y = 420; cd.ortho_scale = 4.2
        scn.render.film_transparent = True
        cam.location = (-8, -1.2, 1.0); cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
        T = RUN_N / 30
        for k in range(12):
            t = k / 12; jog_pose(t); rig.location.y = -RUN_V * t * T; bpy.context.view_layer.update()
            scn.render.filepath = os.path.join(test_dir, f'travel_{k:02d}.png'); bpy.ops.render.render(write_still=True)
        rig.location.y = 0
        bpy.ops.wm.quit_blender()
    if '--gun-test' in argv:
        variants = {'M': dict(up_out=0.16, up_fwd=0.22, fore_in=0.10, fore_fwd=0.05, shrug=14),
                    'N': dict(up_out=0.12, up_fwd=0.30, fore_in=0.14, fore_fwd=0.00, shrug=16),
                    'O': dict(up_out=0.20, up_fwd=0.40, fore_in=0.18, fore_fwd=0.08, shrug=18)}
        for k, g in variants.items():
            idle_pose(0.0, True); gun_up(0, g); shoot('gun' + k)
        bpy.ops.wm.quit_blender()
    reset(); shoot('0rest')
    reset(); rot('LeftArm', 0, 0, 0); rot('LeftArm', 0, -75, 0); rot('RightArm', 0, 75, 0)
    rot('LeftForeArm', 0, 0, 0); shoot('1arms_up')
    reset(); move('Hips', 0, 0.05, -0.38); rot('Hips', 15, 0, 0)
    for s in ('Left', 'Right'):
        rot(s + 'UpLeg', -85, 0, 0); rot(s + 'Leg', 120, 0, 0); rot(s + 'Foot', -35, 0, 0)
    rot('Spine1', 15, 0, 0); shoot('2crouch')
    walk_pose(0.0, True); shoot('3stride')
    walk_pose(0.75, True); shoot('4passing')
    walk_pose(0.0); shoot('7stride_down')
    jog_pose(0.0); shoot('9jog_land')
    jog_pose(0.25); shoot('9jog_float')
    aim_pose(); shoot('5aim')
    idle_pose(0.25, True); shoot('6idle')
    idle_pose(0.25); shoot('8idle_down')

# ---------------------------------------------------------------- actions
WALK_N = 32
a = new_action('walk')
for f in range(0, WALK_N + 1, 2):
    walk_pose(f / WALK_N); key(f)
stride = measure_stride()
rig['walk_stride_m'] = round(stride, 4)          # exported as glTF extras; the game derives its walking pace from it
rig['walk_cycle_s'] = WALK_N / 30
print('WALK stride per cycle %.3f m, %.2f m/s at 1x' % (stride, stride / (WALK_N / 30)))
JOG_N = RUN_N
jog_stride = RUN_V * RUN_N / 30                  # the feet are locked to this ground speed
a = new_action('jog')
for f in range(0, JOG_N + 1, 2):
    jog_pose(f / JOG_N); key(f)
rig['jog_stride_m'] = round(jog_stride, 4); rig['jog_cycle_s'] = JOG_N / 30
print('RUN legs reach %.3f of their length' % RUN_REACH[0])
print('JOG stride per cycle %.3f m, %.2f m/s at 1x' % (jog_stride, jog_stride / (JOG_N / 30)))
a = new_action('walk_ready')                     # combat mode: cannon held up (high-ready)
for f in range(0, WALK_N + 1, 2):
    walk_pose(f / WALK_N, True); key(f)
a = new_action('idle')                           # interaction mode: cannon arm down
for f in range(0, 61, 6):
    idle_pose(f / 60); key(f)
a = new_action('idle_ready')
for f in range(0, 61, 6):
    idle_pose(f / 60, True); key(f)
a = new_action('aim')
aim_pose(); key(0); key(10)
reset(); rig.animation_data.action = None
bpy.context.scene.frame_set(0)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True); body.select_set(True)
bpy.context.view_layer.objects.active = rig
kw = dict(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
          export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
          export_force_sampling=True, export_extras=True, export_frame_step=1, export_anim_single_armature=True)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:
    print('retry export without some options:', e)
    for k in ('export_anim_single_armature',):
        kw.pop(k, None)
    bpy.ops.export_scene.gltf(**kw)
print('EXPORTED', out, os.path.getsize(out))
