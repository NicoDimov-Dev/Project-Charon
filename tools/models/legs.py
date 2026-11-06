"""Blender: find the legs of a many-legged model. Below a cut height the legs are separate pieces:
group the vertices under it into connected clusters on a 2D grid (top view) and report each one.
Also renders a bottom view.
blender -b --factory-startup -P tools/models/legs.py -- MODEL.glb OUT_DIR [--height 0.9]
"""
import bpy, sys, os, math
import numpy as np
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1]); os.makedirs(out, exist_ok=True)
H = float(argv[argv.index('--height') + 1]) if '--height' in argv else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
M = np.array(o.matrix_world)
co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
v = (np.c_[co, np.ones(len(co))] @ M.T)[:, :3]
v[:, 2] -= v[:, 2].min()
if H: v *= H / v[:, 2].max()
v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2; v[:, 1] -= (v[:, 1].max() + v[:, 1].min()) / 2
top = v[:, 2].max()
print('size', np.round(v.max(0) - v.min(0), 3))

def clusters(zcut, cell=0.03):
    p = v[v[:, 2] < zcut]
    if not len(p): return []
    ij = np.floor(p[:, :2] / cell).astype(int); ij -= ij.min(0)
    occ = {}
    for k, (a, b) in enumerate(map(tuple, ij)): occ.setdefault((a, b), []).append(k)
    seen, res = set(), []
    for c in occ:
        if c in seen: continue
        stack, members = [c], []
        seen.add(c)
        while stack:
            a, b = stack.pop(); members += occ[(a, b)]
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    n = (a + da, b + db)
                    if n in occ and n not in seen: seen.add(n); stack.append(n)
        q = p[members]
        res.append((len(q), q.mean(0), q.min(0), q.max(0)))
    return sorted(res, key=lambda r: -r[0])

for f in (0.08, 0.15, 0.25, 0.35, 0.45):
    cs = [c for c in clusters(top * f) if c[0] > 30]
    print(f'z<{top*f:.2f}: {len(cs)} clusters')
    for n, m, lo, hi in cs:
        print(f'   n={n:6d} centre=({m[0]:+.2f},{m[1]:+.2f},{m[2]:.2f}) x[{lo[0]:+.2f},{hi[0]:+.2f}] y[{lo[1]:+.2f},{hi[1]:+.2f}] z[{lo[2]:.2f},{hi[2]:.2f}]')

# bottom view render
scn = bpy.context.scene; scn.render.engine = 'BLENDER_EEVEE'
scn.render.resolution_x = scn.render.resolution_y = 768
w = bpy.data.worlds.new('W'); scn.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cd.ortho_scale = 2.2
cam = bpy.data.objects.new('C', cd); scn.collection.objects.link(cam); scn.camera = cam
c0 = Vector(((M @ np.r_[co.mean(0), 1])[:3]).tolist())
cam.location = c0 + Vector((0, 0, -5)); cam.rotation_euler = (math.pi, 0, 0)
scn.render.filepath = os.path.join(out, 'bottom.png'); bpy.ops.render.render(write_still=True)
cam.location = c0 + Vector((0, 0, 5)); cam.rotation_euler = (0, 0, 0)
scn.render.filepath = os.path.join(out, 'top.png'); bpy.ops.render.render(write_still=True)
