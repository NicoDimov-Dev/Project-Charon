"""Blender: reduce scanned props to game budgets and export single GLBs.
blender -b --factory-startup -P tools/models/decimate_props.py -- SRC_DIR OUT_DIR id[:tris] ...
SRC_DIR/<id>/<id>.gltf  ->  OUT_DIR/<id>.glb  (normal maps keep the surface detail)
"""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1]); os.makedirs(out, exist_ok=True)
for spec in argv[2:]:
    id_, _, t = spec.partition(':'); target = int(t or 4000)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, id_, id_ + '.gltf'))
    for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris > target:
            bpy.context.view_layer.objects.active = o
            d = o.modifiers.new('d', 'DECIMATE'); d.ratio = target / tris
            bpy.ops.object.modifier_apply(modifier='d')
        print(id_, tris, '->', sum(len(p.vertices) - 2 for p in o.data.polygons))
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, id_ + '.glb'), export_format='GLB', export_image_format='JPEG')
    print('EXPORTED', id_, os.path.getsize(os.path.join(out, id_ + '.glb')) // 1024, 'KB')
