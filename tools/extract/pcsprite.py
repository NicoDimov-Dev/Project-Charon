"""Perfect Assassin .PC sprite banks (optionally CauseWay CWC-compressed).
Layout (after decompression): u8 directions, u8 frames, u16 0, 256x3 6-bit VGA palette,
frames*directions u32 offsets; each image: i16 x_off, i16 y_off, u32 ?, u32 ?, u32 w, u32 h, w*h bytes (index 0 = transparent).
Images are stored frame-major: index = frame*directions + direction. load() returns the two header bytes in file order."""
import struct
import numpy as np
import cwc

def load(data):
    if cwc.is_cwc(data): data = cwc.decompress(data)
    nf, nd = data[0], data[1]
    pal = (np.frombuffer(data, np.uint8, 768, 4).reshape(256, 3).astype(np.uint16) * 255 // 63).astype(np.uint8)
    n = nf * nd
    offs = struct.unpack_from('<%dI' % n, data, 772)
    imgs = []
    for o in offs:
        x, y, a, b, w, h = struct.unpack_from('<hhIIII', data, o)
        px = np.frombuffer(data, np.uint8, w * h, o + 20).reshape(h, w)
        imgs.append({'x': x, 'y': y, 'u1': a, 'u2': b, 'w': w, 'h': h, 'px': px})
    return nf, nd, pal, imgs
