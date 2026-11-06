"""Load the LE executable inside PASS.EXE into a flat image (objects at their preferred bases,
fixups applied) for static analysis.  Usage: py -I tools/re/le_load.py PASS.EXE out_dir
Writes image.bin (from base 0), objects.json."""
import json, struct, sys
from pathlib import Path


def load(path):
    d = open(path, "rb").read()
    le = d.find(b"LE\0\0", 0x40)
    while le >= 0:  # LE header is at the offset pointed by the stub's MZ chain; find the real one
        if struct.unpack_from("<I", d, le + 0x28)[0] == 0x1000:
            break
        le = d.find(b"LE\0\0", le + 1)
    H = lambda off, fmt="<I": struct.unpack_from(fmt, d, le + off)[0]
    page_size = H(0x28); last_page = H(0x2C)
    n_pages = H(0x14)
    obj_tab, n_obj = H(0x40), H(0x44)
    page_tab = H(0x48)
    fix_page_tab, fix_rec_tab = H(0x68), H(0x6C)
    data_pages = H(0x80)
    eip_obj, eip = H(0x18), H(0x1C)
    objs = []
    for i in range(n_obj):
        vsize, base, flags, pidx, pcount, _ = struct.unpack_from("<6I", d, le + obj_tab + i * 24)
        objs.append(dict(vsize=vsize, base=base, flags=flags, pidx=pidx, pcount=pcount))
    top = max(o["base"] + o["vsize"] for o in objs)
    img = bytearray(top + 0x1000)
    # page table: LE entries are 4 bytes (hi 3 bytes page number big-endian-ish, flags)
    def page_file_off(p):  # p is 1-based
        e = d[le + page_tab + (p - 1) * 4: le + page_tab + p * 4]
        num = (e[0] << 16) | (e[1] << 8) | e[2]
        return data_pages + (num - 1) * page_size
    page_owner = {}
    for oi, o in enumerate(objs):
        for k in range(o["pcount"]):
            p = o["pidx"] + k
            sz = last_page if p == n_pages else page_size
            off = page_file_off(p)
            img[o["base"] + k * page_size: o["base"] + k * page_size + sz] = d[off:off + sz]
            page_owner[p] = (oi, o["base"] + k * page_size)
    # fixups
    nfix = 0
    for p in range(1, n_pages + 1):
        a = H(fix_page_tab + (p - 1) * 4); b = H(fix_page_tab + p * 4)
        pos = le + fix_rec_tab + a; end = le + fix_rec_tab + b
        page_base = page_owner[p][1]
        while pos < end:
            src, flg = d[pos], d[pos + 1]; pos += 2
            if src & 0x20:
                cnt = d[pos]; pos += 1
            else:
                cnt = 0
            if not cnt:
                srcoff = struct.unpack_from("<h", d, pos)[0]; pos += 2
            if (flg & 3) == 1:  # import by ordinal (extender-provided): skip, keep record sync
                pos += 2 if flg & 0x40 else 1
                pos += 1 if flg & 0x80 else (4 if flg & 0x10 else 2)
                if cnt:
                    pos += 2 * cnt
                continue
            if (flg & 3) != 0:
                raise ValueError(f"unsupported fixup target type {flg:#x} page {p}")
            if flg & 0x40:
                tobj = struct.unpack_from("<H", d, pos)[0]; pos += 2
            else:
                tobj = d[pos]; pos += 1
            stype = src & 0xF
            if stype == 2:  # 16-bit selector: no offset
                toff = 0
            elif flg & 0x10:
                toff = struct.unpack_from("<I", d, pos)[0]; pos += 4
            else:
                toff = struct.unpack_from("<H", d, pos)[0]; pos += 2
            offs = [srcoff] if not cnt else [struct.unpack_from("<h", d, pos + 2 * i)[0] for i in range(cnt)]
            if cnt:
                pos += 2 * cnt
            target = objs[tobj - 1]["base"] + toff
            for so in offs:
                at = page_base + so
                if at < 0:
                    continue
                if stype == 7:  # 32-bit offset
                    img[at:at + 4] = struct.pack("<I", target & 0xFFFFFFFF)
                elif stype == 8:  # 32-bit self-relative
                    img[at:at + 4] = struct.pack("<i", target - (at + 4))
                elif stype == 5:  # 16-bit offset
                    img[at:at + 2] = struct.pack("<H", target & 0xFFFF)
                nfix += 1
    return img, objs, objs[eip_obj - 1]["base"] + eip, nfix


if __name__ == "__main__":
    img, objs, entry, nfix = load(sys.argv[1])
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    (out / "image.bin").write_bytes(img)
    (out / "objects.json").write_text(json.dumps(dict(objects=objs, entry=entry), indent=1))
    for o in objs:
        print(f"obj base={o['base']:#x} size={o['vsize']:#x} flags={o['flags']:#x}")
    print(f"entry={entry:#x} fixups={nfix}")
