"""Apply test patches to the INSTALLED copy of PASS.EXE (Game/C/AS). The CD copy in Original/ is never touched.
  py -I Game/tools/patch_exe.py          apply all patches (backup kept as PASS.ORG)
  py -I Game/tools/patch_exe.py --god    also apply god mode (no damage); run without --god to remove it
  py -I Game/tools/patch_exe.py --undo   restore the original executable
Addresses are linear addresses of the LE image (code object at 0x10000); file offset = 0x25E00 + (addr - 0x10000).
"""
import shutil, sys
from pathlib import Path

EXE = Path(__file__).resolve().parents[1] / "C" / "AS" / "PASS.EXE"
ORG = EXE.with_suffix(".ORG")

PATCHES = [
    # Alt+I debug toggle is gated by an easter-egg timer window ([0x73ab4] > tick count). Remove the gate.
    ("debug toggle always allowed", 0x1E7E4, "7e18", "9090"),
    # Starting a conversation computes 300 / frame_ticks ([0x5017a], 100 Hz timer). On a fast emulated CPU a frame can
    # finish inside one tick -> 0 -> divide-by-zero crash (CW.ERR exception 00 at 0x25D89). Clamp the divisor to >= 1:
    # mov edx,0x12c / sar edx,0x1f  ->  test ebx,ebx / jnz +1 / inc ebx / cdq / nop / nop
    ("conversation divide-by-zero fix", 0x25D81, "ba2c010000c1fa1f", "85db75014399" "9090"),
]
# --god: damage routine (0x20b2x) loads the hit amount from [ebp+0x10] twice (shield, then health); make it 0.
GOD = [
    ("god: no shield damage", 0x20B32, "8b4510", "31c090"),
    ("god: no health damage", 0x20B6E, "8b4510", "31c090"),
]


def foff(addr):
    return 0x25E00 + (addr - 0x10000)


def main():
    if "--undo" in sys.argv:
        if ORG.exists():
            shutil.copyfile(ORG, EXE); print("restored original PASS.EXE")
        return
    if not ORG.exists():
        shutil.copyfile(EXE, ORG)
    d = bytearray(ORG.read_bytes())  # always rebuild from the original so options can be toggled
    for name, addr, old, new in PATCHES + (GOD if "--god" in sys.argv else []):
        o, n, f = bytes.fromhex(old), bytes.fromhex(new), foff(addr)
        cur = bytes(d[f:f + len(o)])
        if cur == o:
            d[f:f + len(o)] = n; print("patched:", name)
        else:
            sys.exit(f"unexpected bytes for {name}: {cur.hex()}")
    EXE.write_bytes(d)


if __name__ == "__main__":
    main()
