"""Teleport Charon in the original game: py -I tools/tp.py X Y   (map units, 256 per cell).
`py -I tools/tp.py` prints where he is. Position lives at image 0x63564 (int16 x, int16 y)."""
import struct, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import pa
A = 0x63564 + pa.DELTA
if len(sys.argv) > 2:
    pa.poke(A, struct.pack('<hh', int(sys.argv[1]), int(sys.argv[2])))
print(struct.unpack('<hh', pa.peek(A, 4)))
