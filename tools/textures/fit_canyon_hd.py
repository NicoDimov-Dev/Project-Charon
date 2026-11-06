"""Fit upgraded Desert Canyon textures (reference/art/textures_canyon_v1/*.webp) to the 1997 sheet
layouts the game reads, at a larger scale, and write prototype/web-test/data/CANYON_*_hd.png.

py tools/textures/fit_canyon_hd.py

- floor:   same 5x3 tile grid (plus the unused strip at the bottom): resized to 5x (1600x1000).
- walls:   25 tiles in a row, cropped out of the white padding, cut at their real seams (the generator's
           tiles vary in width), each made square at 128 px.
- sprites: objects on black; the background is cut out by flood fill from the border, and each
           object is fitted (same foot line, same width) into its original slot, at 4x.
- sky:     used whole; the game mirrors it around the horizon.
"""
import json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'reference', 'art', 'textures_canyon_v1')
DATA = os.path.join(ROOT, 'prototype', 'web-test', 'data')
load = lambda n: Image.open(os.path.join(SRC, n + '.webp')).convert('RGB')

# ---- floor
f = load('floor')
f.resize((1600, 1000), Image.LANCZOS).save(os.path.join(DATA, 'CANYON_floor_hd.png'))

# ---- walls: find the strip inside the white page, then its 25 tiles. The generator's tiles are not
# all the same width, so cut at the real seams (sharp vertical edges), searched near each even split.
w = np.array(load('walls')).astype(int)
rows = np.where((w.sum(2) < 700).mean(1) > 0.5)[0]
st = w[rows.min() + 3:rows.max() - 2].astype(float)            # trim the anti-aliased edges against the white page
prof = np.abs(np.diff(st, axis=1)).mean(axis=(0, 2))
SW = st.shape[1]; NT = 25; step = SW / NT
cands = [list(range(int(k * step - 38), int(k * step + 38))) for k in range(1, NT)]
best = {(0, x): (prof[x] - 0.002 * (x - step) ** 2, None) for x in cands[0]}
for k in range(1, NT - 1):
    for x in cands[k]:
        opts = [(best[(k - 1, q)][0], q) for q in cands[k - 1] if x - q >= 50 and (k - 1, q) in best]
        if opts:
            sc, q = max(opts); best[(k, x)] = (sc + prof[x] - 0.002 * (x - (k + 1) * step) ** 2, q)
k = NT - 2; x = max((v[0], xx) for (kk, xx), v in best.items() if kk == k)[1]; cuts = []
while x is not None: cuts.append(x); x = best[(k, x)][1]; k -= 1
bounds = [0] + [c + 1 for c in reversed(cuts)] + [SW]
print('wall tile widths in the new strip:', np.diff(bounds).tolist())
strip = Image.fromarray(st.astype(np.uint8))
T = 128
walls = Image.new('RGB', (NT * T, T))
for i in range(NT):
    walls.paste(strip.crop((bounds[i], 0, bounds[i + 1], strip.height)).resize((T, T), Image.LANCZOS), (i * T, 0))
walls.save(os.path.join(DATA, 'CANYON_walls_hd.png'))

# ---- sprites
K = 4
meta = json.load(open(os.path.join(DATA, 'CANYON.json')))['sprites']
orig = Image.open(os.path.join(DATA, 'CANYON_sprites.png')).convert('RGBA')
oa = np.array(orig)[:, :, 3]
s = np.array(load('sprites')).astype(int)
mx = s.max(2)
H, W = mx.shape
# find the objects with a firm threshold, then make each solid from its top to its bottom in every
# column: dark undersides sit right against the black page and no threshold alone separates them
seg = np.array(Image.fromarray(((mx > 22) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))) > 0
cols = seg.any(0)
spans, a0 = [], None
for x in range(W + 1):
    on = x < W and cols[x]
    if on and a0 is None: a0 = x
    if not on and a0 is not None:
        if x - a0 > 20: spans.append((a0, x))
        a0 = None
print('objects found in the new sheet:', len(spans), spans)
solid = np.zeros((H, W), bool)
for x in range(W):
    ys = np.where(seg[:, x])[0]
    if len(ys): solid[ys.min():ys.max() + 1, x] = True
solid |= mx > 8
alpha = np.array(Image.fromarray((solid * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)))
rgba = np.dstack([s.astype(np.uint8), alpha])
# slot i of the 1997 atlas -> which new objects fill it (slot 3 holds two rocks side by side)
groups = [[0], [1], [2], [3, 4], [5], [6]] if len(spans) == 7 else [[i] for i in range(len(spans))]
out = Image.new('RGBA', (orig.width * K, orig.height * K), (0, 0, 0, 0))
for slot, (sx, sy, sw, sh, *_), grp in zip(range(len(meta)), meta, groups):
    # the 1997 object's opaque box inside its slot (ignoring its 50% drop shadow)
    sub = oa[sy:sy + sh, sx:sx + sw]
    ys, xs = np.where(sub > 200)
    ox0, ox1, oy1 = xs.min(), xs.max() + 1, ys.max() + 1
    x0, x1 = spans[grp[0]][0], spans[grp[-1]][1]
    colsel = seg[:, x0:x1]
    yy = np.where(colsel.any(1))[0]
    obj = Image.fromarray(rgba[yy.min():yy.max() + 1, x0:x1])
    # fit inside the 1997 object's box (its width, and the height from the slot top to its foot line)
    k = min((ox1 - ox0) * K / obj.width, oy1 * K / obj.height)
    tw, th = round(obj.width * k), round(obj.height * k)
    obj = obj.resize((tw, th), Image.LANCZOS)
    px = (sx + (ox0 + ox1) / 2) * K - tw / 2                # centred on the old object, standing on its foot line
    py = (sy + oy1) * K - th
    out.alpha_composite(obj, (round(px), round(py)))
    print(f'slot {slot}: {sw}x{sh} -> object {tw}x{th}')
out.save(os.path.join(DATA, 'CANYON_sprites_hd.png'))

# ---- sky
load('sky').save(os.path.join(DATA, 'CANYON_sky_hd.png'))
print('wrote CANYON_{floor,walls,sprites,sky}_hd.png')
