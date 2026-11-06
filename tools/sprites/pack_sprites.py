"""Pack render_sprites.py output into game sheets: one PNG + JSON per animation, rows = frames, columns = views,
in the format prototype/web-test reads (see tools/extract/export_media.py for the 1997 sheets).
Usage: py pack_sprites.py <build/NAME dir> <out dir> [--height 190]"""
import sys, os, json, argparse
import numpy as np
from PIL import Image


def main():
    p = argparse.ArgumentParser()
    p.add_argument('src'); p.add_argument('out')
    p.add_argument('--height', type=float, default=190.0, help='character height in game world units')
    p.add_argument('--pad', type=int, default=2)
    o = p.parse_args()
    man = json.load(open(os.path.join(o.src, 'manifest.json')))
    os.makedirs(o.out, exist_ok=True)
    V, gx, gy = man['views'], *man['ground_px']
    # world units per rendered pixel: the model's height in pixels maps to --height world units
    world_scale = o.height / (man['model_height_m'] * man['px_per_m'])
    for anim, info in man['anims'].items():
        F = info['frames']
        imgs = [[np.asarray(Image.open(os.path.join(o.src, anim, 'v%02d_f%02d.png' % (v, f))).convert('RGBA'))
                 for v in range(V)] for f in range(F)]
        # one crop for the whole animation, so the ground line sits at the same place in every cell
        a = np.zeros(imgs[0][0].shape[:2], bool)
        for row in imgs:
            for im in row: a |= im[..., 3] > 24      # ignore the shadow catcher's faint noise
        ys, xs = np.nonzero(a)
        x0, x1 = int(max(0, xs.min() - o.pad)), int(min(a.shape[1], xs.max() + 1 + o.pad))
        y0, y1 = int(max(0, ys.min() - o.pad)), int(min(a.shape[0], int(np.ceil(gy)) + o.pad))
        y1 = int(max(y1, ys.max() + 1))
        cw, ch = x1 - x0, y1 - y0
        sheet = np.zeros((ch * F, cw * V, 4), np.uint8)
        for f, row in enumerate(imgs):
            for v, im in enumerate(row):
                sheet[f * ch:(f + 1) * ch, v * cw:(v + 1) * cw] = im[y0:y1, x0:x1]
        name = '%s_%s' % (man['name'], anim.upper())
        Image.fromarray(sheet, 'RGBA').save(os.path.join(o.out, name + '.png'), optimize=True)
        gap = round(ch - (gy - y0))           # ground line to cell bottom, the same in every cell
        meta = {'source': 'render:' + info['action'], 'frames': F, 'views': V, 'mirrored': False, 'cell_w': cw, 'cell_h': ch,
                'anchor_in_cell': [round(gx - x0), round(gy - y0)], 'layout': 'rows = frames, columns = views; rendered',
                'shadow_index': None, 'gap': [[gap] * V for _ in range(F)], 'world_scale': round(world_scale, 5),
                'loop': info['loop'], 'tilt': man['tilt']}
        json.dump(meta, open(os.path.join(o.out, name + '.json'), 'w'), separators=(', ', ': '))
        print(name, '%dx%d cells of %dx%d' % (V, F, cw, ch), 'world_scale', meta['world_scale'])


if __name__ == '__main__':
    main()
