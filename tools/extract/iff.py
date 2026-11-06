"""IFF ILBM / PBM (Deluxe Paint .LBM/.BBM) loader -> (indices HxW uint8, palette 256x3 uint8, info)."""
import struct
import numpy as np

def _unpack_byterun1(body, expected):
    out = bytearray(); j = 0; n = len(body)
    while j < n and len(out) < expected:
        c = body[j]; j += 1
        if c < 128:
            out += body[j:j + c + 1]; j += c + 1
        elif c > 128:
            out += bytes([body[j]]) * (257 - c); j += 1
    return bytes(out)

def load(data):
    if data[:4] != b'FORM': raise ValueError('not IFF')
    kind = data[8:12]; i = 12; ch = {}
    while i + 8 <= len(data):
        cid = data[i:i + 4]; n = struct.unpack_from('>I', data, i + 4)[0]
        ch.setdefault(cid, data[i + 8:i + 8 + n]); i += 8 + n + (n & 1)
    w, h, x, y, npl, mask, comp, _pad, tcol = struct.unpack_from('>HHhhBBBBH', ch[b'BMHD'], 0)
    pal = np.zeros((256, 3), np.uint8)
    if b'CMAP' in ch:
        cm = np.frombuffer(ch[b'CMAP'], np.uint8)[:768]
        pal.reshape(-1)[:len(cm)] = cm
    body = ch.get(b'BODY', b'')
    if kind == b'PBM ':
        rw = w + (w & 1)
        raw = _unpack_byterun1(body, rw * h) if comp == 1 else body
        raw = raw.ljust(rw * h, b'\0')
        img = np.frombuffer(raw, np.uint8)[:rw * h].reshape(h, rw)[:, :w].copy()
    else:
        rb = ((w + 15) // 16) * 2
        planes = npl + (1 if mask == 1 else 0)
        raw = _unpack_byterun1(body, rb * planes * h) if comp == 1 else body
        raw = raw.ljust(rb * planes * h, b'\0')
        a = np.frombuffer(raw, np.uint8)[:rb * planes * h].reshape(h, planes, rb)
        bits = np.unpackbits(a, axis=2)[:, :, :w]  # h, planes, w
        img = np.zeros((h, w), np.uint16)
        for p in range(min(npl, 8)):
            img |= bits[:, p, :].astype(np.uint16) << p
        img = img.astype(np.uint8)
    info = dict(kind=kind.decode().strip(), width=w, height=h, planes=npl, masking=mask,
                compression=comp, transparent_color=tcol, has_cmap=b'CMAP' in ch,
                chunks=[c.decode('latin1') for c in ch])
    return img, pal, info
