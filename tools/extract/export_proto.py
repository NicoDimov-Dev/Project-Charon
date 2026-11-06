"""Export one map + its locations into a compact bundle for the web prototype."""
import sys, os, json, struct, base64
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import iff, pcsprite

SRC = '/home/claude/orig/PA'; OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/proto/data'
MAP = sys.argv[1] if len(sys.argv) > 1 else 'CANYON'
os.makedirs(OUT, exist_ok=True)
D = os.path.join(SRC, 'DATA')
def cstr(b): return b.split(b'\0')[0].decode('latin1')
def pal6(p): return (np.frombuffer(open(p, 'rb').read()[:768], np.uint8).reshape(256, 3).astype(np.uint16) * 255 // 63).astype(np.uint8)
def names(table):
    p = '/home/claude/out/text/english/tables/%s.json' % table
    if not os.path.exists(p): return []
    return [x if isinstance(x, str) else x['name'] for x in json.load(open(p))['name_table']]

w = open(os.path.join(D, MAP + '.WLD'), 'rb').read(); h = w[:0x49B]
assets = {k: cstr(h[o:o + 16]) for k, o in dict(floor=4, forms=0x24, walls=0x34, sprites=0x44, pal=0x54, sky=0x64).items()}
pal = pal6(os.path.join(D, assets['pal'].upper()))
body = np.frombuffer(w, np.uint8, 49152, 0x49B)
planes = body.reshape(3, 64, 4, 64).transpose(0, 2, 1, 3).reshape(12, 64, 64)

# forms: 0..14 from map form LBM (5x3 tiles of 64), 15..26 StdCmap1, 27..38 StdCmap2 (4 per row of 256px, 3 rows)
forms = []
fi, _, _ = iff.load(open(os.path.join(D, assets['forms'].upper()), 'rb').read())
for k in range(15):
    t = fi[(k // 5) * 64:(k // 5) * 64 + 64, (k % 5) * 64:(k % 5) * 64 + 64]
    code = np.where(t == 0, 0, np.where(t == 255, 1, 2 + (t.astype(int) - 1)))  # 0 empty, 1 solid, 2+u edge
    forms.append(code)
for f in ('STDCMAP1', 'STDCMAP2'):
    si, _, _ = iff.load(open(os.path.join(D, f + '.LBM'), 'rb').read())
    for k in range(12):
        t = si[(k // 4) * 64:(k // 4) * 64 + 64, (k % 4) * 64:(k % 4) * 64 + 64]
        code = np.where(t == 0, 0, np.where(t == 2, 1, 2))
        forms.append(code)
forms = np.array(forms, np.uint8)

# floor tiles atlas (keep LBM layout), wall texture strip, sky, sprites
fl, flpal, _ = iff.load(open(os.path.join(D, assets['floor'].upper()), 'rb').read())
Image.fromarray(pal[fl]).save(os.path.join(OUT, MAP + '_floor.png'))
v2 = open(os.path.join(D, assets['walls'].upper()), 'rb').read()
_, nt, toff, ncol, doff = struct.unpack_from('<5H', v2, 0)
tbl = np.frombuffer(v2, np.uint16, nt * 64, toff); cols = np.frombuffer(v2, np.uint8, ncol * 64, doff).reshape(ncol, 64)
tex = cols[tbl].reshape(nt, 64, 64).transpose(0, 2, 1)
Image.fromarray(pal[np.concatenate(list(tex), 1)]).save(os.path.join(OUT, MAP + '_walls.png'))
sky = Image.open(os.path.join(D, assets['sky'].upper())); sky.convert('RGB').save(os.path.join(OUT, MAP + '_sky.png'))
nf, nd, spal, imgs = pcsprite.load(open(os.path.join(D, assets['sprites'].upper()), 'rb').read())
sp = []
x = 0; W = sum(i['w'] for i in imgs) + len(imgs); H = max(i['h'] for i in imgs)
sheet = np.zeros((H, W, 4), np.uint8)
for i in imgs:
    px = i['px']; rgba = np.zeros((i['h'], i['w'], 4), np.uint8); rgba[..., :3] = pal[px]; rgba[..., 3] = np.where(px == 0, 0, 255)
    rgba[px == 241] = (0, 0, 0, 110)
    sheet[:i['h'], x:x + i['w']] = rgba; sp.append([x, 0, i['w'], i['h'], i['x'], i['y']]); x += i['w'] + 1
Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, MAP + '_sprites.png'))

base = os.path.splitext(assets['walls'])[0].upper()
bundle = {
    'map': MAP, 'assets': assets,
    'planes': base64.b64encode(planes.tobytes()).decode(),
    'forms': base64.b64encode(forms.tobytes()).decode(), 'nforms': len(forms),
    'nwall': int(nt), 'sprites': sp,
    'names': {'walls': names(base), 'floor': names(os.path.splitext(assets['floor'])[0].upper()),
              'sprites': names(os.path.splitext(assets['sprites'])[0].upper())},
}
# locations on this map
locs = {}
for f in sorted(os.listdir(os.path.join(SRC, 'LOCS'))):
    if not f.endswith('.LOC'): continue
    d = open(os.path.join(SRC, 'LOCS', f), 'rb').read()
    i = d.find(b'MAPF') + 4
    if cstr(d[i:i + 13]).upper() != MAP + '.WLD': continue
    n = int(f[3:7])
    i = d.find(b'CAMR') + 4; cam = list(struct.unpack_from('<iiiiihh', d, i))
    i = d.find(b'CAMS') + 4; c = d[i]; z = struct.unpack_from('<40H', d, i + 1)
    zones = [list(z[k * 5:k * 5 + 5]) for k in range(c)]
    cams = [list(struct.unpack_from('<iiiiihhI', d, i + 1 + 0x50 + 28 * k)) for k in range(c)]
    i = d.find(b'LINK') + 4; nl = d[i]; links = []
    for k in range(nl):
        r = d[i + 1 + 32 * k:i + 33 + 32 * k]
        links.append({'cell': [r[0], r[1]], 'to': struct.unpack_from('<I', r, 6)[0], 'arrive': list(struct.unpack_from('<HH', r, 10)), 'raw': r.hex()})
    locs[n] = {'camera': cam, 'zones': zones, 'cams': cams, 'links': links}
bundle['locations'] = locs
lev = open(os.path.join(SRC, 'LOCS', 'LEV0001.BIN'), 'rb').read()
bundle['start'] = {'loc': struct.unpack_from('<I', lev, 4)[0], 'pos': list(struct.unpack_from('<HH', lev, 8))}
json.dump(bundle, open(os.path.join(OUT, MAP + '.json'), 'w'))
print(MAP, assets, 'forms', len(forms), 'locs', sorted(locs))

# ---- characters on this map: instances (CHARACTS.BIN third block, 84 bytes each), types (163-byte records),
#      conversation headers (greeting, count, topic-table offset) and topic tables (kind, topic, string)
C = open(os.path.join(D, 'ENGLISH', 'CHARACTS.BIN'), 'rb').read()
recB, instB = struct.unpack_from('<II', C, 0)
ntypes = (instB - recB) // 163
types = []
for i in range(ntypes):
    r = C[recB + 163 * i:recB + 163 * (i + 1)]
    types.append([r[0x55 + 13 * k:0x55 + 13 * (k + 1)].split(b'\0')[0].decode('latin1').upper() for k in range(6)])
npcs = []; convs = {}
def conv(off):
    g, n, tbl, _ = struct.unpack_from('<HBHH', C, off)
    rows = []; o = tbl
    while C[o:o + 4] != b'\xff\xff\xff\xff' and len(rows) < 200:
        k, t, s = struct.unpack_from('<BBH', C, o); rows.append([k >> 2, k & 3, t, s]); o += 5
    return {'greeting': g, 'count': n, 'table': rows}
for i in range((len(C) - instB) // 84):
    w = struct.unpack_from('<42H', C, instB + 84 * i)
    if w[0] == 0xffff or w[6] not in locs: continue
    inst = {'id': i, 'loc': w[6], 'type': w[7], 'x': w[2], 'y': w[3], 'hp': w[10], 'group': w[11], 'flags': w[0], 'conv': w[40],
            'sprites': types[w[7]]}
    if w[40]: convs[w[40]] = conv(w[40])
    npcs.append(inst)
bundle['npcs'] = npcs; bundle['convs'] = convs
# person defaults: byte 77 of every instance record is (u16 first string, u8 count), what anyone answers to
# "Who is <that person>" when their own table has no row (e.g. Dah'Mon Targ: 262-263)
bundle['whois'] = {i: list(struct.unpack_from('<HB', C, instB + 84 * i + 77)) for i in range((len(C) - instB) // 84)
                   if struct.unpack_from('<H', C, instB + 84 * i)[0] != 0xffff and C[instB + 84 * i + 79]}
# subject defaults (STOPICS.BIN): what anyone says about a LIST0004 subject when their own table has no row.
# 14-byte records from offset 66: u16 index, then Who / What / Where as (u16 first string, u8 count); the engine
# picks one of the `count` strings at random
S = open(os.path.join(D, 'ENGLISH', 'STOPICS.BIN'), 'rb').read()
bundle['stopics'] = [[list(struct.unpack_from('<HB', S, 66 + 14 * i + 2 + 3 * k)) for k in range(3)]
                     for i in range(struct.unpack_from('<I', S, 0)[0]) if 66 + 14 * i + 11 <= len(S)]
# text needed by the dialogue system: the whole PASSTEXT string table (ids are indices) and the list ranges
P = json.load(open('/home/claude/out/text/english/passtext.json'))
bundle['text'] = [s['raw'] for s in P['strings']]
bundle['lists'] = {k: v['start'] for k, v in P['lists'].items()}
# location CHAR masks: which character types appear per location
for n in locs:
    d = open(os.path.join(SRC, 'LOCS', 'LOC%04d.LOC' % n), 'rb').read(); i = d.find(b'CHAR') + 4
    mask = d[i:i + 16]; locs[n]['chars'] = [b * 8 + k for b in range(16) for k in range(8) if mask[b] & (0x80 >> k)]
json.dump(bundle, open(os.path.join(OUT, MAP + '.json'), 'w'))
print('npcs', [(n['id'], n['type'], n['sprites'][0], n['loc']) for n in npcs])
