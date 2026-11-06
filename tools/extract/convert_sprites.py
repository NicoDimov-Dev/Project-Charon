"""Convert .PC sprite banks to RGBA sprite sheets + JSON metadata.
Rows = animation frames, columns = views (directions). Cells share one size and anchor
so frames can be played back without jitter; original per-image offsets kept in JSON.

The bank header's two bytes are (directions, frames) and images are stored frame-major:
image k = frame * directions + direction. (Square banks such as C00WALK, 16 x 16, hide the
order; banks like C00SHOT, 8 x 9, or KMNDOWLK, 5 x 8, show it.) 9 or 5 directions are a
16- or 8-direction turn stored front to back with the other side mirrored: 'mirrored' in the JSON.
'gap'[frame][view] is the empty space under each image inside its cell: the engine stands every
image on its own bottom edge, so a player drops the image by that much.
Usage: python convert_sprites.py <DATA dir> <out dir>"""
import sys, os, glob, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pcsprite

def main(src, out):
    od = os.path.join(out, 'sprites'); os.makedirs(od, exist_ok=True)
    index = {}
    for f in sorted(glob.glob(os.path.join(src, '*.PC'))):
        name = os.path.splitext(os.path.basename(f))[0].upper()
        raw = open(f, 'rb').read()
        nd, nf, pal, imgs = pcsprite.load(raw)          # header order is (directions, frames); see the docstring
        shadow = 241 if pal[241].tolist() == [64, 0, 64] else None
        x0 = min(i['x'] for i in imgs); y0 = min(i['y'] for i in imgs)
        x1 = max(i['x'] + i['w'] for i in imgs); y1 = max(i['y'] + i['h'] for i in imgs)
        cw, ch = max(1, x1 - x0), max(1, y1 - y0)
        sheet = np.zeros((ch * nf, cw * nd, 4), np.uint8)
        cells = []
        gap = [[0] * nd for _ in range(nf)]
        for k, im in enumerate(imgs):
            fr, dr = divmod(k, nd)
            gap[fr][dr] = ch - (im['y'] - y0 + im['h'])
            px = im['px']; rgba = np.zeros((im['h'], im['w'], 4), np.uint8)
            rgba[..., :3] = pal[px]; rgba[..., 3] = np.where(px == 0, 0, 255)
            if shadow is not None:  # magenta marker index = drop shadow, rendered translucent by the engine
                m = px == shadow; rgba[m] = (0, 0, 0, 128)
            ox, oy = dr * cw + im['x'] - x0, fr * ch + im['y'] - y0
            sheet[oy:oy + im['h'], ox:ox + im['w']] = rgba
            cells.append({'frame': fr, 'view': dr, 'x_off': im['x'], 'y_off': im['y'], 'w': im['w'], 'h': im['h'],
                          'flags': [im['u1'], im['u2']]})
        Image.fromarray(sheet, 'RGBA').save(os.path.join(od, name + '.png'), optimize=True)
        meta = {'source': 'DATA/' + os.path.basename(f), 'compressed_cwc': raw[:3] == b'CWC', 'frames': nf, 'views': nd,
                'mirrored': nd in (5, 9), 'cell_w': cw, 'cell_h': ch, 'anchor_in_cell': [-x0, -y0],
                'layout': 'rows = frames, columns = views; index 0 transparent', 'shadow_index': shadow, 'gap': gap,
                'palette': pal.tolist(), 'cells': cells}
        json.dump(meta, open(os.path.join(od, name + '.json'), 'w'))
        index[name] = {'frames': nf, 'views': nd, 'mirrored': nd in (5, 9), 'cell': [cw, ch]}
    json.dump(index, open(os.path.join(od, '_index.json'), 'w'), indent=1)
    print('sprites:', len(index))

if __name__ == '__main__': main(*sys.argv[1:3])
