"""CauseWay 'CWC' decompressor (format from Open Watcom v2 bld/causeway/asm/decode_c.asm).
Header: 'CWC', u8 bits, u32 unpacked_len, u32 packed_len. MSB-first 32-bit bit-flag words
interleaved with byte data."""
import struct

def is_cwc(d): return d[:3] == b'CWC'

def decompress(d):
    bits = d[3]; ln, sz = struct.unpack_from('<II', d, 4)
    mask = (1 << bits) - 1
    out = bytearray(); p = 12
    buf = struct.unpack_from('<I', d, p)[0]; p += 4; n = 32
    def bit():
        nonlocal buf, n, p
        b = buf >> 31; buf = (buf << 1) & 0xffffffff; n -= 1
        if n == 0:
            buf = struct.unpack_from('<I', d, p)[0]; p += 4; n = 32
        return b
    def copy(dist, cnt):
        s = len(out) - dist
        if dist >= cnt: out.extend(out[s:s + cnt])
        else:
            for k in range(cnt): out.append(out[s + k])
    while True:
        if bit():
            out.append(d[p]); p += 1
        elif bit():
            c = ((bit() << 1) | bit()) + 2
            a = d[p] - 1; p += 1
            if a < 0: out.extend(bytes([d[p]]) * (c + 1)); p += 1
            else: copy(a + c, c)
        elif bit():
            v = d[p] | (d[p + 1] << 8); p += 2
            c = (v & 15) + 2; a = (v >> 4) - 1
            if a < 0: out.extend(bytes([d[p]]) * (c + 1)); p += 1
            else: copy(a + c, c)
        else:
            v = d[p] | (d[p + 1] << 8) | (d[p + 2] << 16); p += 3
            c = (v & mask) + 2; a = (v >> bits) - 1
            if a >= 0: copy(a + c, c)
            elif c >= 18: out.extend(bytes([d[p]]) * (c + 1)); p += 1
            elif c == 4 or c == 3: pass
            elif c == 5:
                k = d[p]; p += 1; out.extend(d[p:p + k]); p += k
            elif c == 2: break
            else: raise ValueError('bad CWC code')
        if len(out) > ln: break
    if len(out) != ln: raise ValueError('CWC length mismatch %d != %d' % (len(out), ln))
    return bytes(out)
