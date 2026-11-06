"""Blender script: import a model, print stats, render a 4-view preview.

blender -b --factory-startup -P tools/models/inspect_model.py -- MODEL.glb OUT_DIR
"""
import bpy, bmesh, sys, os, math, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext in ('.glb', '.gltf'):
    bpy.ops.import_scene.gltf(filepath=src)
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=src)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
info = {'objects': [], 'materials': [], 'images': []}
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new(); bm.from_object(o, dg)
    nonman = sum(1 for e in bm.edges if not e.is_manifold)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    bm.free()
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    info['objects'].append({'name': o.name, 'verts': len(o.data.vertices), 'faces': len(o.data.polygons),
                            'tris': tris, 'quads': quads, 'non_manifold_edges': nonman, 'loose_verts': loose,
                            'uv_layers': len(o.data.uv_layers), 'materials': [m.name for m in o.data.materials if m],
                            'parent': o.parent.name if o.parent else None})
others = [(o.name, o.type) for o in bpy.context.scene.objects if o.type != 'MESH']
info['other_objects'] = others
info['bbox_min'] = list(lo); info['bbox_max'] = list(hi); info['size'] = list(hi - lo)
for m in bpy.data.materials:
    nodes = [n.type for n in m.node_tree.nodes] if m.use_nodes else []
    info['materials'].append({'name': m.name, 'nodes': nodes})
for im in bpy.data.images:
    info['images'].append({'name': im.name, 'size': list(im.size)})
info['actions'] = [a.name for a in bpy.data.actions]
print('INFO_JSON', json.dumps(info, indent=1))
with open(os.path.join(out, 'info.json'), 'w') as f:
    json.dump(info, f, indent=1)

# --- preview: four views, Eevee, neutral light, upright on Z
centre = (lo + hi) / 2; size = hi - lo
H = max(size)
scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
scn.render.resolution_x = 512; scn.render.resolution_y = 768
scn.render.film_transparent = False
world = bpy.data.worlds.new('W'); scn.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6
cam_d = bpy.data.cameras.new('C'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = H * 1.15
cam = bpy.data.objects.new('C', cam_d); scn.collection.objects.link(cam); scn.camera = cam
sun_d = bpy.data.lights.new('S', 'SUN'); sun_d.energy = 3
sun = bpy.data.objects.new('S', sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
for name, ang in [('front', 0), ('right', 90), ('back', 180), ('left', 270)]:
    # camera orbits; "front" looks from -Y toward +Y; 'right' sees the figure's right side (from -X)
    a = math.radians(ang)
    d = H * 3
    pos = Vector((-math.sin(a) * d, -math.cos(a) * d, 0)) + centre
    cam.location = pos
    cam.rotation_euler = (math.radians(90), 0, -a)
    scn.render.filepath = os.path.join(out, f'view_{name}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
