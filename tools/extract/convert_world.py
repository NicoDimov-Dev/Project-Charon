"""Partial decode of level maps (.WLD) and location scripts (LOCS/*.LOC).

WLD (confirmed from PASS.EXE loader at VA 0x380f8): 0x49B-byte header + 64000-byte map body.
 Header: +0x00 'RWLD', +0x04 floor tiles LBM, +0x14 map name, +0x24 wall-form LBM,
 +0x34 wall texture bank (.V2), +0x44 sprite bank (.PC), +0x54 palette (.PAL),
 +0x64 sky/background PCX, +0x15B overlay LBM; other header bytes not yet identified.
 Body: first 49152 bytes = 12 planes of 64x64 bytes, stored as 3 groups of [64 rows][4 planes][64 cols].
 Plane meaning not yet identified. Remaining 14848 bytes kept raw.
LOC (fixed 814 bytes, chunks located by tag as the game does at VA 0x11518):
 MAPF (13-byte .WLD name), CAMR (24-byte camera), DATA, NAME, LINK (u8 count + records),
 CHAR, CAMS (u8 count + camera table), SNDS. Unidentified fields kept as hex.
Usage: python convert_world.py <installer dir> <out dir>"""
import sys, os, glob, json, struct, base64
import numpy as np
from PIL import Image

def cstr(b): return b.split(b'\0')[0].decode('latin1')

HDR = {'floor_tiles': 0x04, 'map_name': 0x14, 'wall_forms': 0x24, 'wall_textures': 0x34, 'sprites': 0x44,
       'palette': 0x54, 'sky': 0x64, 'overlay': 0x15B}

def wld(path, od):
    d = open(path, 'rb').read(); name = os.path.splitext(os.path.basename(path))[0].upper()
    assert len(d) == 0x49B + 64000
    h = d[:0x49B]
    meta = {'source': 'DATA/' + os.path.basename(path), 'assets': {k: cstr(h[o:o + 16]) for k, o in HDR.items()}}
    body = np.frombuffer(d, np.uint8, 64000, 0x49B)
    planes = body[:49152].reshape(3, 64, 4, 64).transpose(0, 2, 1, 3).reshape(12, 64, 64)
    meta['planes'] = [p.tolist() for p in planes]
    meta['header_unidentified_hex'] = h[0x74:0x15B].hex() + '|' + h[0x16B:].hex()
    meta['body_tail_base64'] = base64.b64encode(body[49152:].tobytes()).decode()
    json.dump(meta, open(os.path.join(od, name + '.json'), 'w'))
    # preview: 12 planes, each value-rank normalised
    s = Image.new('L', (64 * 4 * 4 + 12, 64 * 3 * 4 + 8), 40)
    for k, p in enumerate(planes):
        u = np.unique(p); m = (np.searchsorted(u, p) / max(1, len(u) - 1) * 255).astype(np.uint8)
        s.paste(Image.fromarray(m).resize((256, 256), Image.NEAREST), ((k % 4) * 260, (k // 4) * 260))
    s.save(os.path.join(od, name + '_planes.png'))
    return name

def loc(path):
    d = open(path, 'rb').read(); r = {'source': 'LOCS/' + os.path.basename(path), 'size': len(d)}
    def find(tag):
        i = d.find(tag); return None if i < 0 else i + 4
    i = find(b'MAPF'); r['map'] = cstr(d[i:i + 13]) if i is not None else None
    i = find(b'CAMR')
    if i is not None:
        x, y, z, a, b, c, e = struct.unpack_from('<iiiiiHH', d, i)
        r['camera'] = {'x': x, 'y': y, 'z': z, 'p3': a, 'p4': b, 'p5': c, 'p6': e}
    i = find(b'DATA')
    if i is not None:
        r['data'] = {'b0': d[i], 'u32_2': struct.unpack_from('<I', d, i + 2)[0], 'u32_6': struct.unpack_from('<I', d, i + 6)[0],
                     'b10': d[i + 10], 'b11': d[i + 11], 'u16_12': struct.unpack_from('<H', d, i + 12)[0], 'b14': d[i + 14],
                     'rest_hex': d[i + 15:d.find(b'NAME')].hex()}
    i = find(b'NAME'); j = d.find(b'LINK')
    if i is not None: r['name_raw'] = d[i:j].rstrip(b'\0').decode('latin1')
    i = find(b'LINK'); j = d.find(b'CHAR')
    if i is not None:
        n = d[i]; recs = d[i + 1:j]
        r['links'] = [recs[k * 32:(k + 1) * 32].hex() for k in range(n)]
    i = find(b'CHAR'); j = d.find(b'CAMS')
    if i is not None: r['chars_hex'] = d[i:j].hex()
    i = find(b'CAMS'); j = d.find(b'SNDS')
    if i is not None:
        n = d[i]; r['cams_count'] = n; r['cams_hex'] = d[i + 1:j].hex()
    i = find(b'SNDS')
    if i is not None: r['snds_hex'] = d[i:].hex()
    return r

def main(src, out):
    od = os.path.join(out, 'world', 'maps'); os.makedirs(od, exist_ok=True)
    names = [wld(f, od) for f in sorted(glob.glob(os.path.join(src, 'DATA', '*.WLD')))]
    locs = {}
    for f in sorted(glob.glob(os.path.join(src, 'LOCS', '*.LOC'))):
        locs[os.path.splitext(os.path.basename(f))[0].upper()] = loc(f)
    json.dump(locs, open(os.path.join(out, 'world', 'locations.json'), 'w'), indent=1)
    levs = {}
    for f in sorted(glob.glob(os.path.join(src, 'LOCS', 'LEV*.BIN'))):
        levs[os.path.splitext(os.path.basename(f))[0].upper()] = open(f, 'rb').read().hex()
    json.dump(levs, open(os.path.join(out, 'world', 'levels_raw.json'), 'w'), indent=1)
    print('maps', len(names), 'locations', len(locs), 'levels', len(levs))

if __name__ == '__main__': main(*sys.argv[1:3])
