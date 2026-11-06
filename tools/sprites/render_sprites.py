"""Render a rigged character into per-view, per-frame PNGs for pack_sprites.py.
Run inside Blender:  blender -b model.blend -P render_sprites.py -- --name CHARON --out build
See README.md in this folder for the model requirements and the view convention."""
import bpy, sys, os, json, math, argparse
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

# action name -> (frames, loops). Frame counts follow the 1997 sheets.
ANIMS = {'walk': (16, True), 'idle': (4, True), 'aim_high': (4, False), 'aim_level': (4, False), 'aim_low': (4, False),
         'hit': (4, False), 'grab': (9, False), 'death': (10, False)}


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--name', default='CHARON')
    p.add_argument('--out', default='build')
    p.add_argument('--cell', type=int, default=512)
    p.add_argument('--views', type=int, default=16)
    p.add_argument('--tilt', type=float, default=20.0)
    p.add_argument('--samples', type=int, default=48)
    p.add_argument('--anims', default='')
    p.add_argument('--engine', default='CYCLES')
    p.add_argument('--demo', action='store_true')
    return p.parse_args(a)


# ------------------------------------------------------------------ stand-in figure for testing the pipeline
def mat(name, rgb, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.35
    b.inputs['Metallic'].default_value = 0.3
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m


def build_demo():
    """A rough Charon-proportioned mannequin: navy limbs, olive torso, red-tipped arm cannon on the right forearm."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    navy, olive, metal, red = mat('navy', (0.05, 0.07, 0.16)), mat('olive', (0.18, 0.2, 0.05)), \
        mat('metal', (0.25, 0.25, 0.27)), mat('vent', (1.0, 0.08, 0.02), 8.0)
    arm = bpy.data.objects.new('Rig', bpy.data.armatures.new('Rig')); bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    def bone(n, h, t, parent=None):
        b = eb.new(n); b.head, b.tail = Vector(h), Vector(t)
        if parent: b.parent = eb[parent]
        return b
    # facing -Y: his right side is -X
    bone('hips', (0, 0, 1.0), (0, 0, 1.15))
    bone('chest', (0, 0, 1.15), (0, 0, 1.6), 'hips')
    bone('head', (0, 0, 1.68), (0, 0, 1.95), 'chest')
    for s, x in (('R', -1), ('L', 1)):
        bone('thigh.' + s, (0.13 * x, 0, 0.98), (0.14 * x, 0, 0.52), 'hips')
        bone('shin.' + s, (0.14 * x, 0, 0.52), (0.14 * x, 0, 0.08), 'thigh.' + s)
        bone('upper.' + s, (0.36 * x, 0, 1.55), (0.42 * x, 0, 1.2), 'chest')
        bone('fore.' + s, (0.42 * x, 0, 1.2), (0.45 * x, 0, 0.88), 'upper.' + s)
    bpy.ops.object.mode_set(mode='OBJECT')

    def part(kind, size, loc, bone_name, material):
        if kind == 'box': bpy.ops.mesh.primitive_cube_add(size=1)
        elif kind == 'ball': bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=24, ring_count=16)
        else: bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=20)
        o = bpy.context.object; o.scale = size; o.location = loc; o.data.materials.append(material)
        bpy.ops.object.shade_smooth()
        b = arm.data.bones[bone_name]
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = bone_name
        o.matrix_parent_inverse = (arm.matrix_world @ b.matrix_local @ Matrix.Translation((0, b.length, 0))).inverted()
        return o
    part('box', (0.62, 0.34, 0.5), (0, 0, 1.38), 'chest', olive)
    part('box', (0.46, 0.28, 0.22), (0, 0, 1.06), 'hips', navy)
    part('ball', (0.26, 0.28, 0.32), (0, 0, 1.8), 'head', navy)
    for x in (-0.14, 0.14): part('ball', (0.07, 0.04, 0.07), (x, 0, 1.82), 'head', metal)   # temple implants
    part('box', (0.12, 0.02, 0.05), (0, -0.17, 1.42), 'chest', red)                         # chest vent
    for s, x in (('R', -1), ('L', 1)):
        part('cyl', (0.17, 0.17, 0.48), (0.135 * x, 0, 0.75), 'thigh.' + s, navy)
        part('cyl', (0.14, 0.14, 0.46), (0.14 * x, 0, 0.3), 'shin.' + s, navy)
        part('box', (0.15, 0.3, 0.1), (0.14 * x, -0.06, 0.05), 'shin.' + s, navy)
        part('ball', (0.24, 0.24, 0.24), (0.33 * x, 0, 1.56), 'upper.' + s, navy)
        part('cyl', (0.15, 0.15, 0.38), (0.39 * x, 0, 1.37), 'upper.' + s, navy)
        if s == 'R':   # arm cannon
            part('box', (0.2, 0.22, 0.42), (0.44 * x, 0, 1.0), 'fore.' + s, metal)
            part('cyl', (0.07, 0.07, 0.04), (0.45 * x, 0, 0.78), 'fore.' + s, red)
        else:
            part('cyl', (0.12, 0.12, 0.32), (0.43 * x, 0, 1.04), 'fore.' + s, navy)
            part('ball', (0.12, 0.12, 0.13), (0.45 * x, 0, 0.84), 'fore.' + s, metal)

    pb = arm.pose.bones
    for p in pb: p.rotation_mode = 'XYZ'
    def key(name, n, fn):
        ad = arm.animation_data_create(); ad.action = None
        for f in range(n + 1):
            for bn, rot in fn(f / n).items():
                if bn.startswith('_'): continue
                pb[bn].rotation_euler = rot; pb[bn].keyframe_insert('rotation_euler', frame=f)
            hips = fn(f / n).get('_z')
            if hips is not None: pb['hips'].location = (0, hips, 0); pb['hips'].keyframe_insert('location', frame=f)
        act = ad.action; act.name = name; act.use_fake_user = True
        for p in pb: p.rotation_euler = (0, 0, 0); p.location = (0, 0, 0)
    def walk(t):
        s = math.sin(t * 2 * math.pi); c = math.cos(t * 2 * math.pi)
        r = math.radians
        return {'thigh.R': (r(32 * s), 0, 0), 'thigh.L': (r(-32 * s), 0, 0),
                'shin.R': (r(-max(0, -c) * 45), 0, 0), 'shin.L': (r(-max(0, c) * 45), 0, 0),
                'upper.R': (r(-14 * s), 0, 0), 'upper.L': (r(22 * s), 0, 0),
                'fore.R': (r(-12), 0, 0), 'fore.L': (r(-18 + 8 * s), 0, 0), 'chest': (0, 0, r(5 * s)),
                '_z': 0.03 * abs(c)}
    def idle(t):
        s = math.sin(t * 2 * math.pi); r = math.radians
        return {'chest': (r(2 * s), 0, 0), 'upper.R': (r(-4), 0, r(3 * s)), 'upper.L': (r(3 * s), 0, 0), 'fore.R': (r(-10), 0, 0)}
    def aim(pitch):
        def f(t):
            r = math.radians; k = min(1, t * 3) if t < 0.75 else 1 - (t - 0.75) * 2
            return {'upper.R': (r(-(90 + pitch) * k), 0, 0), 'fore.R': (r(-5 * k), 0, 0), 'chest': (0, 0, r(-12 * k))}
        return f
    key('walk', 16, walk); key('idle', 4, idle)
    for n, p in (('aim_high', 25), ('aim_level', 0), ('aim_low', -25)): key(n, 4, aim(p))
    arm.animation_data.action = None
    return arm


# ------------------------------------------------------------------ rig: turntable for the character, camera rig for camera + lights
def setup(o):
    sc = bpy.context.scene
    actors = [ob for ob in sc.objects if ob.type not in ('CAMERA', 'LIGHT')]
    roots = [ob for ob in actors if ob.parent is None]
    turn = bpy.data.objects.new('SpriteTurntable', None); sc.collection.objects.link(turn)
    for ob in roots: ob.parent = turn
    for ob in sc.objects:                             # the scene's own camera and lights would fight ours
        if ob.type in ('CAMERA', 'LIGHT'): ob.hide_render = True

    # model height from the rest pose
    deps = bpy.context.evaluated_depsgraph_get()
    zs = [(ob.matrix_world @ Vector(c)).z for ob in actors if ob.type == 'MESH' for c in ob.evaluated_get(deps).bound_box]
    height = max(zs) - min(0, min(zs)) if zs else 2.0

    rig = bpy.data.objects.new('SpriteCamRig', None); sc.collection.objects.link(rig)
    rig.rotation_euler = (math.radians(-o.tilt), 0, 0)
    cam = bpy.data.objects.new('SpriteCam', bpy.data.cameras.new('SpriteCam')); sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = height * 1.5
    cam.parent = rig; cam.location = (0, -20, height * 0.48); cam.rotation_euler = (math.radians(90), 0, 0)
    cam.data.clip_end = 100
    sc.camera = cam
    # lights ride on the camera rig (not the turntable) and aim at the chest, so shading stays put as views turn
    aim = bpy.data.objects.new('SpriteLightAim', None); sc.collection.objects.link(aim); aim.location = (0, 0, height * 0.55)
    def light(name, kind, energy, loc, color=(1, 1, 1), size=2.0, shadow=True):
        L = bpy.data.objects.new(name, bpy.data.lights.new(name, kind)); sc.collection.objects.link(L)
        L.data.energy = energy; L.data.color = color; L.parent = rig; L.location = loc
        if kind == 'AREA': L.data.size = size
        L.data.use_shadow = shadow
        c = L.constraints.new('TRACK_TO'); c.target = aim; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
        return L
    # Only the key casts shadows, and it sits high so the floor shadow stays a short pool under the feet,
    # like the original's drop shadow, instead of a long streak that would widen every cell.
    light('Key', 'AREA', 1100, (-2.5, -3.5, 9), (1.0, 0.96, 0.9), 3)
    light('Rim', 'AREA', 700, (4, 5, 4), (0.55, 0.7, 1.0), 2, shadow=False)
    light('Fill', 'AREA', 150, (5, -6, 2), (0.8, 0.85, 1.0), 4, shadow=False)
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.025, 0.035, 1)

    if o.engine == 'CYCLES':                          # contact shadow into the alpha, like the original's drop shadow
        bpy.ops.mesh.primitive_plane_add(size=4); fl = bpy.context.object; fl.name = 'SpriteShadow'
        fl.is_shadow_catcher = True

    r = sc.render
    r.engine = o.engine; r.film_transparent = True
    r.resolution_x = r.resolution_y = o.cell; r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.image_settings.color_depth = '8'
    if o.engine == 'CYCLES':
        sc.cycles.samples = o.samples; sc.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
                try: prefs.compute_device_type = t; prefs.get_devices(); break
                except Exception: continue
            if any(d.use for d in prefs.devices if d.type != 'CPU'): sc.cycles.device = 'GPU'
        except Exception: pass
    bpy.context.view_layer.update()
    return turn, cam, height


def find_action(name):
    for a in bpy.data.actions:
        n = a.name.lower()
        if n == name or n.endswith('|' + name) or n.endswith('_' + name): return a
    return None


def assign(rigs, act):
    for ob in rigs:
        ad = ob.animation_data_create(); ad.action = act
        if hasattr(ad, 'action_slot') and act and getattr(act, 'slots', None) and ad.action_slot is None:
            ad.action_slot = act.slots[0]


def main():
    o = args()
    if o.demo: build_demo()
    sc = bpy.context.scene
    turn, cam, height = setup(o)
    rigs = [ob for ob in sc.objects if ob.type == 'ARMATURE']
    want = [a.strip().lower() for a in o.anims.split(',') if a.strip()] or list(ANIMS)
    out = os.path.abspath(os.path.join(o.out, o.name))     # relative to the working directory
    os.makedirs(out, exist_ok=True)

    gx, gy, _ = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
    manifest = {'name': o.name, 'cell': o.cell, 'views': o.views, 'tilt': o.tilt, 'model_height_m': height,
                'px_per_m': o.cell / cam.data.ortho_scale, 'ground_px': [gx * o.cell, (1 - gy) * o.cell], 'anims': {}}
    for name in want:
        if name not in ANIMS: print('unknown animation', name); continue
        act = find_action(name)
        if not act: print('no action for', name, '- skipped'); continue
        n, loop = ANIMS[name]
        assign(rigs, act)
        f0, f1 = act.frame_range
        frames = [f0 + (f1 - f0) * i / (n if loop else max(1, n - 1)) for i in range(n)]
        d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        for v in range(o.views):
            turn.rotation_euler = (0, 0, math.radians(v * 360 / o.views))
            for i, f in enumerate(frames):
                sc.frame_set(int(f), subframe=f - int(f))
                sc.render.filepath = os.path.join(d, 'v%02d_f%02d.png' % (v, i))
                bpy.ops.render.render(write_still=True)
        manifest['anims'][name] = {'frames': n, 'loop': loop, 'action': act.name}
        print('rendered', name, n, 'frames x', o.views, 'views')
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
    print('done ->', out)


main()
