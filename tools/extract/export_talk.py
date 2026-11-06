# Build talking-head atlases for the web prototype: rest pose (TALK/CHARONT LBM) + A/E/I/O/S/U viseme clips,
# coloured with the LBM's own palette (the CDV clips carry none).
import sys, json, numpy as np
from PIL import Image
sys.path.insert(0, 'tools'); import iff
D = 'orig/PA/DATA/'; C = 'out/cutscenes/indexed/'; OUT = 'proto/media/talk/'
HEADS = {'h01': ('TALK0001', 'T{v}0001'), 'h02': ('TALK0002', 'T{v}0002'), 'h06': ('TALK0006', 'T{v}0006'),
         'charon0': ('CHARONT0', 'CHARONT{v}'), 'charon1': ('CHARONT1', 'CHARON{v}1'), 'charon2': ('CHARONT2', 'CHARON{v}2')}
COLS, W, H = 10, 254, 287
for key, (lbm, pat) in HEADS.items():
    rest, pal, _ = iff.load(open(D + lbm + '.LBM', 'rb').read())
    frames = [rest[:H, :W]]; vis = {}
    for v in 'AEIOSU':
        strip = np.array(Image.open(C + pat.format(v=v) + '.png'))
        n = strip.shape[0] // H
        vis[v] = [len(frames), n]
        frames += [strip[i * H:(i + 1) * H] for i in range(n)]
    rows = (len(frames) + COLS - 1) // COLS
    atlas = np.zeros((rows * H, COLS * W), np.uint8)
    for i, f in enumerate(frames): atlas[(i // COLS) * H:(i // COLS + 1) * H, (i % COLS) * W:(i % COLS + 1) * W] = f
    Image.fromarray(pal[atlas]).save(OUT + key + '.jpg', quality=84, optimize=True)
    json.dump({'w': W, 'h': H, 'cols': COLS, 'frames': len(frames), 'vis': vis}, open(OUT + key + '.json', 'w'))
    print(key, len(frames), atlas.shape)
