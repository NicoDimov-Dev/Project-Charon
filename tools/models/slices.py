"""Blender: print horizontal cross-section runs of a normalised model (2.1 m, feet on Z=0).
blender -b --factory-startup -P slices.py -- MODEL.glb
"""
import bpy, sys, os
import numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(argv[0]))
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
M = np.array(o.matrix_world)
v = np.array([M @ np.array([*p.co, 1]) for p in o.data.vertices])[:, :3]
s = float(sys.argv[sys.argv.index('--height') + 1] if '--height' in sys.argv else 2.1) / (v[:, 2].max() - v[:, 2].min())
v[:, 2] -= v[:, 2].min(); v *= s
v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2
v[:, 1] -= (v[:, 1].max() + v[:, 1].min()) / 2
print('scale', s)
for z in np.arange(2.1, 0, -0.05):
    sl = v[np.abs(v[:, 2] - z) < 0.012]
    if not len(sl): continue
    xs = np.sort(sl[:, 0]); runs = []; a = xs[0]; p = xs[0]
    for x in xs[1:]:
        if x - p > 0.03: runs.append((a, p)); a = x
        p = x
    runs.append((a, p))
    txt = '  '.join(f'[{a:+.2f},{b:+.2f} y{sl[(sl[:,0]>=a)&(sl[:,0]<=b)][:,1].mean():+.2f}]' for a, b in runs)
    print(f'z={z:.2f}  {txt}')
