"""Teleport Charon to a point in each camera zone of the original and grab a frame per camera.
py -I tools/capture_cams.py OUTDIR "loc,cam,x,y" ["loc,cam,x,y" ...]
The location variable is written too, so cave zones (another location on the same map) can be reached."""
import struct, sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import pa
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
POS = 0x63564 + pa.DELTA
for spec in sys.argv[2:]:
    loc, cam, x, y = map(int, spec.split(','))
    if pa.rd('loc') != loc: pa.wr('loc', loc)
    pa.poke(POS, struct.pack('<hh', x, y))
    time.sleep(1.8)
    print(spec, 'now loc', pa.rd('loc'), struct.unpack('<hh', pa.peek(POS, 4)))
    pa.shot(os.path.join(out, f'L{loc}_C{cam}.png'))
