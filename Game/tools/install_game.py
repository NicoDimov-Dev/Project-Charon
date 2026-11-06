"""Install Perfect Assassin (1997) from the CD folder into the DOSBox C: drive.

Replicates a FULL install of the original INSTALL.EXE (verified against an installed copy):
  - C:\\AS gets PASS.EXE, AUDIO, BGND, CDV (all clips, so no CD streaming), DATA, LOCS, SAVE, SND
  - DATA\\ENGLISH\\* is copied over DATA\\* (the installer does this per language)
  - PASS.INI points at Sound Blaster 16 (digital) + General MIDI / MPU-401 (music)
The untouched original PASS.EXE is used; DOSBox mounts the CD folder as D: so its CD check passes.

Usage: py -I Game/tools/install_game.py [--lang ENGLISH|FINNISH] [--force]
"""
import argparse, shutil, stat, sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
CD = GAME.parent / "Original" / "Perfect Assassin Installer"
DEST = GAME / "C" / "AS"

PASS_INI = """[control]
Datapath=D:

[midi]
port=816
driver=C:\\AS\\AUDIO\\GM.MDV

[digital]
DMA=1
HDMA=5
IRQ=5
port=544
driver=C:\\AS\\AUDIO\\SB16.SDV
"""


def copytree(src: Path, dst: Path):
    for p in src.rglob("*"):
        rel = p.relative_to(src)
        if p.is_dir():
            continue
        if rel.parts[0] in ("ENGLISH", "FINNISH") and src.name == "DATA":
            continue
        out = dst / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="ENGLISH", choices=["ENGLISH", "FINNISH"])
    ap.add_argument("--force", action="store_true", help="wipe C:\\AS first (keeps nothing, incl. saves)")
    a = ap.parse_args()
    if not (CD / "PASS.EXE").exists():
        sys.exit(f"CD folder not found: {CD}")
    if DEST.exists() and a.force:
        shutil.rmtree(DEST, onerror=lambda f, p, e: (Path(p).chmod(stat.S_IWRITE), f(p)))
    saves = DEST / "SAVE"
    keep_saves = saves.exists() and any(saves.iterdir())
    DEST.mkdir(parents=True, exist_ok=True)
    for d in ["AUDIO", "BGND", "CDV", "DATA", "LOCS", "SND"] + ([] if keep_saves else ["SAVE"]):
        print("copy", d)
        copytree(CD / d, DEST / d)
    for f in (CD / "DATA" / a.lang).iterdir():
        shutil.copyfile(f, DEST / "DATA" / f.name)
    for f in ["PASS.EXE", "PASS.ICO"]:
        shutil.copyfile(CD / f, DEST / f)
    (DEST / "PASS.INI").write_text(PASS_INI.replace("\n", "\r\n"), newline="")
    # Same config the installed game ships with (byte 1 = CD drive number: 3 = D:)
    (DEST / "PASS.CFG").write_bytes(bytes([0, 3, 1, 1]) + bytes(46))
    for p in DEST.rglob("*"):
        if p.is_file():
            p.chmod(stat.S_IWRITE | stat.S_IREAD)
    print("installed to", DEST)


if __name__ == "__main__":
    main()
