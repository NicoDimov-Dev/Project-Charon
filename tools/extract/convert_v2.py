"""Wall texture banks (.V2): u16 0, u16 n_textures, u16 column_table_offset, u16 n_unique_columns,
u16 pixel_data_offset; column table = n_textures*64 u16 indices into deduplicated 64-byte columns
(each column = 64 pixels top->bottom). No palette inside: the palette comes from the .WLD that
references the bank. Output: one strip per bank (textures left->right, 64x64 each), index 0 opaque.
Usage: python convert_v2.py <installer dir> <out dir>"""
import sys, os, glob, json, struct
import numpy as np
from PIL import Image

def load_pal(path):
    raw = np.frombuffer(open(path, 'rb').read()[:768], np.uint8).reshape(256, 3)
    return (raw.astype(np.uint16) * 255 // 63).astype(np.uint8)

def main(src, out):
    data = os.path.join(src, 'DATA')
    users = {}
    for w in sorted(glob.glob(os.path.join(data, '*.WLD'))):
        h = open(w, 'rb').read(0x80)
        v2 = h[0x34:0x44].split(b'\0')[0].decode('latin1').upper(); pal = h[0x54:0x64].split(b'\0')[0].decode('latin1').upper()
        users.setdefault(v2, []).append((os.path.basename(w).upper(), pal))
    od = os.path.join(out, 'world', 'wall_textures'); os.makedirs(od, exist_ok=True)
    idx = {}
    for f in sorted(glob.glob(os.path.join(data, '*.V2'))):
        name = os.path.basename(f).upper(); d = open(f, 'rb').read()
        _, nt, toff, ncol, doff = struct.unpack_from('<5H', d, 0)
        tbl = np.frombuffer(d, np.uint16, nt * 64, toff)
        cols = np.frombuffer(d, np.uint8, ncol * 64, doff).reshape(ncol, 64)
        tex = cols[tbl].reshape(nt, 64, 64).transpose(0, 2, 1)  # (tex, y, x)
        strip = np.concatenate(list(tex), 1)
        u = users.get(name, [])
        palname = u[0][1] if u else 'BROWN.PAL'
        pal = load_pal(os.path.join(data, palname)) if os.path.exists(os.path.join(data, palname)) else load_pal(os.path.join(data, 'BROWN.PAL'))
        im = Image.fromarray(strip, 'P'); im.putpalette(pal.reshape(-1).tolist())
        base = os.path.splitext(name)[0]
        im.save(os.path.join(od, base + '.png'), optimize=True)
        idx[base] = {'textures': nt, 'size': [64, 64], 'unique_columns': ncol, 'palette': palname,
                     'palette_guessed': not u, 'used_by': [x[0] for x in u]}
    json.dump(idx, open(os.path.join(od, '_index.json'), 'w'), indent=1)
    print('v2 banks', len(idx), 'without map reference', sum(1 for v in idx.values() if v['palette_guessed']))

if __name__ == '__main__': main(*sys.argv[1:3])
