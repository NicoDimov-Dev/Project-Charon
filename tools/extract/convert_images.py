"""Convert IFF (.LBM/.BBM) and PCX images to indexed PNG (palette preserved), plus .PAL palettes.
Usage: python convert_images.py <installer dir> <out dir>"""
import sys, os, glob, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iff

def save_indexed(path, idx, pal, transparent=None):
    im = Image.fromarray(idx, 'P'); im.putpalette(pal.reshape(-1).tolist())
    kw = {}
    if transparent is not None: kw['transparency'] = int(transparent)
    im.save(path, optimize=True, **kw)

def palette_png(path, pal):
    sw = np.repeat(np.repeat(pal.reshape(16, 16, 3), 16, 0), 16, 1)
    Image.fromarray(sw.astype(np.uint8)).save(path)

def main(src, out):
    manifest = {}
    groups = {'BGND': 'backgrounds', 'DATA': 'data', 'DATA/ENGLISH': 'data_english', 'DATA/FINNISH': 'data_finnish'}
    for sub, dst in groups.items():
        files = sorted(glob.glob(os.path.join(src, sub, '*')))
        for f in files:
            ext = os.path.splitext(f)[1].upper(); base = os.path.splitext(os.path.basename(f))[0].upper()
            od = os.path.join(out, 'images', dst); os.makedirs(od, exist_ok=True)
            try:
                if ext in ('.LBM', '.BBM'):
                    idx, pal, info = iff.load(open(f, 'rb').read())
                    tr = info['transparent_color'] if info['masking'] == 2 or ext == '.BBM' else None
                    save_indexed(os.path.join(od, base + '.png'), idx, pal, tr)
                    manifest['%s/%s%s' % (sub, base, ext)] = dict(out='images/%s/%s.png' % (dst, base), **info)
                elif ext == '.PCX':
                    im = Image.open(f); im.load()
                    im.save(os.path.join(od, base + '.png'), optimize=True)
                    manifest['%s/%s%s' % (sub, base, ext)] = dict(out='images/%s/%s.png' % (dst, base), width=im.width, height=im.height, mode=im.mode)
                elif ext == '.PAL':
                    raw = np.frombuffer(open(f, 'rb').read()[:768], np.uint8).reshape(256, 3)
                    pal = (raw.astype(np.uint16) * 255 // 63).astype(np.uint8)
                    pd = os.path.join(out, 'palettes'); os.makedirs(pd, exist_ok=True)
                    palette_png(os.path.join(pd, base + '.png'), pal)
                    json.dump({'source': '%s/%s%s' % (sub, base, ext), 'format': '256 x RGB, scaled from 6-bit VGA', 'colors': pal.tolist()}, open(os.path.join(pd, base + '.json'), 'w'))
                    manifest['%s/%s%s' % (sub, base, ext)] = {'out': 'palettes/%s.json' % base}
            except Exception as e:
                manifest['%s/%s%s' % (sub, base, ext)] = {'error': repr(e)}; print('FAIL', f, e)
    json.dump(manifest, open(os.path.join(out, 'images', '_manifest.json'), 'w'), indent=1)
    print('images:', sum(1 for v in manifest.values() if 'out' in v), 'errors:', sum(1 for v in manifest.values() if 'error' in v))

if __name__ == '__main__': main(*sys.argv[1:3])
