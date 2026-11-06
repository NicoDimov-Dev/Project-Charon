"""Low-power copies of the rigged character models, for tablets and phones (game.js loads them in low-power mode).

The image-to-3D meshes are far denser than a game character needs (the jakhari body is ~190k triangles). This
decimates every skinned mesh to about --tris triangles (collapse, so vertex groups/weights carry over and the rig
and its actions are untouched), shrinks the textures to --tex px, and writes NAME_lo.glb next to the source.

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/models/make_lowpoly.py -- \
      prototype/web-test/media/JAKARI.glb --tris 30000 --tex 1024
"""
import bpy, sys, os, argparse

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('--tris', type=int, default=30000); ap.add_argument('--tex', type=int, default=1024)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src))

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
total = sum(len(o.data.polygons) for o in meshes) or 1
for o in meshes:
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    share = a.tris * tris / sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
    ratio = min(1.0, share / max(1, tris))
    if ratio >= 0.98: continue
    bpy.context.view_layer.objects.active = o
    for s in bpy.context.selected_objects: s.select_set(False)
    o.select_set(True)
    mod = o.modifiers.new('lowpoly', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio
    mod.use_collapse_triangulate = True
    while o.modifiers.find('lowpoly') > 0: bpy.ops.object.modifier_move_up(modifier='lowpoly')   # before the armature
    bpy.ops.object.modifier_apply(modifier='lowpoly')
    print(f'{o.name}: {tris} -> {sum(len(p.vertices) - 2 for p in o.data.polygons)} triangles')

for im in bpy.data.images:
    w, h = im.size
    if max(w, h) > a.tex:
        s = a.tex / max(w, h); im.scale(max(1, int(w * s)), max(1, int(h * s))); print(f'{im.name}: {w}x{h} -> {im.size[0]}x{im.size[1]}')
        im.pack()

out = os.path.splitext(os.path.abspath(a.src))[0] + '_lo.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_image_format='JPEG',
                          export_jpeg_quality=85)
print('wrote', out, round(os.path.getsize(out) / 1e6, 1), 'MB')
