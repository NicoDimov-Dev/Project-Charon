"""Extract game text.
PASSTEXT.BIN: NUL-separated strings; a string's ID is its index. 'LISTnnnn' markers open
lists, a leading 0xFF byte marks the last element of a list. Inline markup kept in 'raw';
'plain' strips it. Other DATA/<lang>/*.BIN files share a container (u32 data offset, then
offset tables / records referencing NUL-terminated strings); dumped generically with offsets.
Usage: python convert_text.py <DATA dir> <out dir>"""
import sys, os, glob, json, re, struct

TAG = re.compile(r'<[^<>]*>')
def plain(s):
    s = s.replace('<n>', '\n')
    s = TAG.sub('', s)
    return s.replace('%', '').replace('`', "'").strip()

def dec(b): return b.decode('cp850')  # DOS codepage: covers Finnish ä/ö

def passtext(path):
    parts = open(path, 'rb').read().split(b'\0')
    out = []; lists = {}; cur = None
    for i, p in enumerate(parts):
        end_of_list = p[:1] == b'\xff'
        if end_of_list: p = p[1:]
        s = dec(p); e = {'id': i, 'raw': s}
        if s.startswith('LIST') and s[4:].strip().isalnum():
            cur = s; lists[s] = {'start': i + 1}; e['marker'] = True
        else:
            if plain(s) != s: e['plain'] = plain(s)
            if cur: e['list'] = cur
            if end_of_list:
                e['list_end'] = True
                if cur: lists[cur]['end'] = i; cur = None
        out.append(e)
    return {'source': os.path.basename(path), 'count': len(out), 'lists': lists, 'strings': out}

def generic(path):
    d = open(path, 'rb').read()
    strings = [{'offset': m.start(), 'text': dec(m.group(1))} for m in re.finditer(rb'(?<=[\x00\xff])([\x20-\x7e\x80-\xfe]{2,})\x00', d)]
    hdr = struct.unpack_from('<I', d, 0)[0] if len(d) >= 4 else 0
    words = list(struct.unpack_from('<%dI' % ((len(d) - hdr) // 4), d, hdr)) if 0 < hdr < len(d) else []
    def cstr(o):
        e = d.find(b'\0', o)
        if e < 0: return None
        b = d[o:e]
        return dec(b) if b and all(0x20 <= c < 0xff for c in b) else None
    table = []
    for w in words:
        if w == 0: continue  # paired records (offset, 0)
        if w >= len(d) or w < hdr: break
        s = cstr(w)
        if s is None and w + 2 < len(d):  # records with a 2-byte prefix before the name
            s2 = cstr(w + 2)
            if s2 is not None: s = {'prefix': d[w:w + 2].hex(), 'name': s2}
        if s is None: break
        table.append(s)
    return {'source': os.path.basename(path), 'size': len(d), 'data_offset': hdr,
            'name_table': table, 'strings': strings}

def main(src, out):
    for lang in ('ENGLISH', 'FINNISH'):
        od = os.path.join(out, 'text', lang.lower()); os.makedirs(os.path.join(od, 'tables'), exist_ok=True)
        pt = passtext(os.path.join(src, lang, 'PASSTEXT.BIN'))
        json.dump(pt, open(os.path.join(od, 'passtext.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        with open(os.path.join(od, 'passtext.txt'), 'w', encoding='utf-8') as f:
            for e in pt['strings']:
                f.write('[%04d]%s %s\n' % (e['id'], ' (' + e['list'] + ')' if 'list' in e else '', e['raw'].replace('\n', ' ')))
        n = 0
        for b in sorted(glob.glob(os.path.join(src, lang, '*.BIN'))):
            if os.path.basename(b).upper() == 'PASSTEXT.BIN': continue
            g = generic(b)
            json.dump(g, open(os.path.join(od, 'tables', os.path.splitext(os.path.basename(b))[0].upper() + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            n += 1
        print(lang, 'strings', pt['count'], 'tables', n)

if __name__ == '__main__': main(*sys.argv[1:3])
