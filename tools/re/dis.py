"""Static analysis helpers over the flat PASS.EXE image built by le_load.py.
  py -I tools/re/dis.py str TEXT             find string address + code refs
  py -I tools/re/dis.py refs ADDR            code that references ADDR (imm/disp)
  py -I tools/re/dis.py dis ADDR [N]         disassemble N instructions from ADDR
  py -I tools/re/dis.py func ADDR            disassemble the function containing ADDR (to ret)
"""
import pickle, struct, sys
from pathlib import Path
import capstone

LE = Path(__file__).resolve().parent / "_le"
img = (LE / "image.bin").read_bytes()
CODE = (0x10000, 0x10000 + 0x3AAE3)
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.skipdata = True


def sweep():
    cache = LE / "sweep.pkl"
    if cache.exists():
        return pickle.loads(cache.read_bytes())
    ins = []
    for i in md.disasm(img[CODE[0]:CODE[1]], CODE[0]):
        ins.append((i.address, i.size, i.mnemonic, i.op_str))
    cache.write_bytes(pickle.dumps(ins))
    return ins


def refs(addr):
    out = []
    h = f"{addr:#x}"
    for a, s, m, o in sweep():
        if h in o:
            out.append((a, m, o))
    return out


def dis(addr, n=40):
    for i in md.disasm(img[addr:addr + n * 15], addr):
        print(f"{i.address:08x}  {i.mnemonic:7} {i.op_str}")
        n -= 1
        if n <= 0:
            break


def cstr(addr):
    e = img.index(b"\0", addr)
    return img[addr:e].decode("latin1")


if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "str":
        t = a[0].encode()
        p = img.find(t)
        while p >= 0:
            print(f"string at {p:#x}: {cstr(p)!r}")
            for r in refs(p):
                print(f"   ref {r[0]:#x}: {r[1]} {r[2]}")
            p = img.find(t, p + 1)
    elif cmd == "refs":
        for r in refs(int(a[0], 0)):
            print(f"{r[0]:#x}: {r[1]} {r[2]}")
    elif cmd == "dis":
        dis(int(a[0], 0), int(a[1]) if len(a) > 1 else 40)
    elif cmd == "func":
        ins = sweep(); x = int(a[0], 0)
        idx = max(i for i, t in enumerate(ins) if t[0] <= x)
        s = idx
        while s > 0 and not (ins[s - 1][2] in ("ret", "jmp") and ins[s][2] == "push"):
            s -= 1
        e = idx
        while e < len(ins) - 1 and ins[e][2] != "ret":
            e += 1
        for t in ins[s:e + 1]:
            print(f"{t[0]:08x}  {t[2]:7} {t[3]}")
