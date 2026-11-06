"""Blender: close-up renders of the cannon elbow, at rest and in the carry pose, with the forearm-rigid
vertices tinted, to see what forms the elbow's silhouette.
blender -b --factory-startup RIG.blend -P tools/models/elbow_closeup.py -- OUT_DIR
"""
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(argv[0]); os.makedirs(out, exist_ok=True); OUTDIR = out; WEIGHTS = '--weights' in argv
sys.argv = [sys.argv[0], '--', os.path.join(out, 'unused.glb')]   # reuse pose helpers without exporting
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'animate_humanoid.py'), encoding='utf-8').read()
src = src[:src.index('# ---------------------------------------------------------------- stress test renders')]
exec(src)

scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'
scn.render.resolution_x = 640; scn.render.resolution_y = 640
w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.5, 0.52, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = 0.75
cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
sd = bpy.data.lights.new('S', 'SUN'); sd.energy = 3
sun = bpy.data.objects.new('S', sd); scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))

def shot(tag, centre):
    bpy.context.view_layer.update()
    for vn, ang in (('side', 90), ('front', 0), ('back', 150)):
        a = math.radians(ang)
        cam.location = centre + Vector((-math.sin(a) * 5, -math.cos(a) * 5, 0))
        cam.rotation_euler = (math.radians(90), 0, -a)
        scn.render.filepath = os.path.join(OUTDIR, f'{tag}_{vn}.png')
        bpy.ops.render.render(write_still=True)

if WEIGHTS:
    import numpy as np
    me = body.data
    fa = body.vertex_groups[C + 'ForeArm'].index; ua = body.vertex_groups[C + 'Arm'].index
    col = me.color_attributes.new('W', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        f = u = 0.0
        for g in v.groups:
            if g.group == fa: f = g.weight
            if g.group == ua: u = g.weight
        col.data[v.index].color = (f, 0.15, u, 1)
    mat = bpy.data.materials.new('Wmat'); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'W'
    e = nt.nodes.new('ShaderNodeEmission'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(a.outputs['Color'], e.inputs['Color']); nt.links.new(e.outputs[0], o.inputs[0])
    me.materials[0] = mat
    OUTDIR = os.path.join(OUTDIR, 'w'); os.makedirs(OUTDIR, exist_ok=True)

el = P[C + 'ForeArm']
reset(); bpy.context.view_layer.update()
shot('rest', rig.matrix_world @ el.head + Vector((0, 0, -0.12)))
idle_pose(0); bpy.context.view_layer.update()
shot('carry', rig.matrix_world @ el.head + Vector((0, 0, 0.12)))
bpy.ops.wm.quit_blender()
