"""Perfect Assassin test harness + cheats. Drives DOSBox in the background (never touches your mouse/keyboard).

Game control
  launch [--screen DISPLAY3] [--play]  start the game on that monitor; focus is handed back to you
                               unless --play (what "Play Perfect Assassin.bat" uses)
  newgame                      skip the attract loop, start a new game, stop at first gameplay frame
  menu                         press Esc until the main menu is up
  keys K [K..]                 send keys: esc, f1, alt+i, ctrl+0, click:320,240, rclick:x,y, wait2 ...
  shot [FILE]                  screenshot of the game window (default Game/_shot.png)

Cheats (need the game running; use them during gameplay, not in dialogue/menus)
  status                       location, camera, story stage + objective, health, ammo, debug flag
  stage N                      warp to story stage N (1-23): the game finishes stage N-1 and starts N,
                               including its opening cut-scene / conversation.  `stages` lists them.
  heal                         health to full (160)
  ammo [N]                     both special ammo types to N (default 999)
  items                        list every pickable object: id, icon, where it is, carried?
  give ID [ID..] | give all    put objects into Charon's inventory (`give all` = every pickable item)
  take ID [ID..]               remove objects from the inventory (back to "nowhere")
  debug on|off                 the developers' debug mode (same as Alt+I in game, see README)

Low level
  peek ADDR LEN / poke ADDR HEX   emulated memory (linear addresses, <=4 KB per request)
"""
import ctypes, ctypes.wintypes as wt, json, subprocess, sys, time, urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8086/api/v1"
u32 = ctypes.windll.user32
u32.SetProcessDPIAware()

# PC/AT set-1 scancodes (as DOS sees them); ext=True for E0-prefixed keys
SC = {"esc": 1, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9, "9": 10, "0": 11,
      "minus": 12, "equals": 13, "backspace": 14, "tab": 15, "q": 16, "w": 17, "e": 18, "r": 19, "t": 20,
      "y": 21, "u": 22, "i": 23, "o": 24, "p": 25, "enter": 28, "ctrl": 29, "a": 30, "s": 31, "d": 32,
      "f": 33, "g": 34, "h": 35, "j": 36, "k": 37, "l": 38, "shift": 42, "z": 44, "x": 45, "c": 46,
      "v": 47, "b": 48, "n": 49, "m": 50, "alt": 56, "space": 57, "f1": 59, "f2": 60, "f3": 61, "f4": 62,
      "f5": 63, "f6": 64, "f7": 65, "f8": 66, "f9": 67, "f10": 68, "f11": 87, "f12": 88}
EXT = {"up": 72, "down": 80, "left": 75, "right": 77, "home": 71, "end": 79, "pgup": 73, "pgdn": 81,
       "ins": 82, "del": 83}
VK = {"esc": 0x1B, "enter": 0x0D, "space": 0x20, "tab": 0x09, "backspace": 0x08, "shift": 0x10,
      "ctrl": 0x11, "alt": 0x12, "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27, "home": 0x24,
      "end": 0x23, "pgup": 0x21, "pgdn": 0x22, "ins": 0x2D, "del": 0x2E, "minus": 0xBD, "equals": 0xBB}


def hwnd():
    out = subprocess.run(["powershell", "-NoProfile", "-Command",
                          "(Get-Process dosbox -ErrorAction SilentlyContinue | ? MainWindowHandle -ne 0 | select -First 1).MainWindowHandle"],
                         capture_output=True, text=True).stdout.strip()
    return int(out) if out else 0


def _msg(h, name, down):
    ext = name in EXT
    sc = EXT.get(name) or SC[name]
    vk = VK.get(name) or (ord(name.upper()) if len(name) == 1 else 0x70 + int(name[1:]) - 1)
    lp = 1 | (sc << 16) | ((1 << 24) if ext else 0) | (0 if down else (3 << 30))
    alt_held = getattr(_msg, "alt", False)
    if name == "alt" or alt_held:
        lp |= 1 << 29
        m = 0x104 if down else 0x105
    else:
        m = 0x100 if down else 0x101
    u32.PostMessageW(h, m, vk, lp)
    if name == "alt":
        _msg.alt = down


def combo(h, names, hold=0.25):
    """Press keys together, e.g. combo(h, ["alt", "i"]): held long enough for the game's per-frame poll."""
    for n in names:
        _msg(h, n, True); time.sleep(0.03)
    time.sleep(hold)
    for n in reversed(names):
        _msg(h, n, False); time.sleep(0.03)
    time.sleep(0.1)


def key(h, name, hold=0.06):
    name = name.lower()
    if "+" in name:
        return combo(h, name.split("+"))
    ext = name in EXT
    sc = EXT.get(name) or SC[name]
    vk = VK.get(name) or (ord(name.upper()) if len(name) == 1 else 0x70 + int(name[1:]) - 1)
    lp = 1 | (sc << 16) | ((1 << 24) if ext else 0)
    msg_dn, msg_up = (0x104, 0x105) if name == "alt" else (0x100, 0x101)
    u32.PostMessageW(h, msg_dn, vk, lp)
    time.sleep(hold)
    u32.PostMessageW(h, msg_up, vk, lp | (1 << 30) | (1 << 31))
    time.sleep(0.05)


def shot(path):
    """Grab the DOSBox window's pixels straight off its monitor (no focus change, nothing hidden)."""
    from PIL import Image
    g32 = ctypes.windll.gdi32
    h = hwnd()
    r = wt.RECT(); u32.GetClientRect(h, ctypes.byref(r))
    w, ht = r.right, r.bottom
    hdc = u32.GetDC(h); mdc = g32.CreateCompatibleDC(hdc)
    bmp = g32.CreateCompatibleBitmap(hdc, w, ht); g32.SelectObject(mdc, bmp)
    u32.PrintWindow(h, mdc, 1 | 2)  # client area, PW_RENDERFULLCONTENT (works for OpenGL windows)
    buf = ctypes.create_string_buffer(w * ht * 4)
    bi = (ctypes.c_uint32 * 10)(40, w, (-ht) & 0xFFFFFFFF, 1 | (32 << 16), 0, 0, 0, 0, 0, 0)
    g32.GetDIBits(mdc, bmp, 0, ht, buf, bi, 0)
    g32.DeleteObject(bmp); g32.DeleteDC(mdc); u32.ReleaseDC(h, hdc)
    img = Image.frombuffer("RGBA", (w, ht), buf, "raw", "BGRA", 0, 1).convert("RGB")
    img = img.crop(img.getbbox() or (0, 0, w, ht)) if w and ht else img
    img.thumbnail((960, 720))
    if path:
        img.save(path); print(path)
    return img


MENU_REF = GAME.parent / "Extracted" / "images" / "data" / "MAINMENU.png"


def at_menu():
    """True when the main menu (F1-F6 panel) is on screen."""
    from PIL import Image, ImageChops, ImageStat
    img = shot(None)
    if img is None or img.width < 100:
        return False
    ref = Image.open(MENU_REF).convert("L").resize((160, 120))
    cur = img.convert("L").resize((160, 120))
    return ImageStat.Stat(ImageChops.difference(ref, cur)).mean[0] < 25


def in_game(img=None):
    """True when the gold gameplay frame/panel is on screen."""
    img = img or shot(None)
    if img is None or img.width < 100:
        return False
    w, h = img.size
    r, g, b = img.resize((64, 48)).crop((0, 40, 64, 48)).convert("RGB").resize((1, 1)).getpixel((0, 0))
    return r > 30 and g > 18 and b < g * 0.4  # golden (dark-gold) bottom panel


def new_game(timeout=120):
    if not goto_menu():
        return False
    h = hwnd(); time.sleep(1.0); key(h, "f1"); time.sleep(3)
    t = time.time()
    while time.time() - t < timeout:
        img = shot(None)
        if in_game(img):
            print("in game"); return True
        if at_menu():  # an Esc landed in gameplay and opened the menu
            key(h, "f4"); time.sleep(2); continue
        key(h, "esc"); time.sleep(2.5)
    print("gameplay not reached"); return False


def goto_menu(timeout=150):
    h = hwnd(); t = time.time()
    while time.time() - t < timeout:
        if at_menu():
            print("at main menu"); return True
        key(h, "esc"); time.sleep(0.8)
    print("menu not reached"); return False


def click(h, x, y, button="left"):
    """Click at (x, y) in 640x480 game coordinates, sent as window messages (no real mouse)."""
    r = wt.RECT(); u32.GetClientRect(h, ctypes.byref(r))
    # game picture is letterboxed 4:3 inside the client area
    sw = min(r.right, r.bottom * 4 / 3); sh = sw * 3 / 4
    ox, oy = (r.right - sw) / 2, (r.bottom - sh) / 2
    cx, cy = int(ox + x * sw / 640), int(oy + y * sh / 480)
    lp = (cy << 16) | (cx & 0xFFFF)
    dn, up, mk = (0x201, 0x202, 1) if button == "left" else (0x204, 0x205, 2)
    u32.PostMessageW(h, 0x200, 0, lp); time.sleep(0.08)
    u32.PostMessageW(h, dn, mk, lp); time.sleep(0.08)
    u32.PostMessageW(h, up, 0, lp); time.sleep(0.05)


def api(path, data=None, method=None):
    """DOSBox 0.83's API server is fragile: Python's http.client and requests over 4 KB crash it,
    plain curl with small requests is stable. So every call goes through curl."""
    cmd = ["curl", "-s", "-f", "-m", "10", "http://localhost:8086/api/v1" + path]
    if data is not None:
        cmd[1:1] = ["-X", method or "PUT", "-H", "Content-Type: application/octet-stream", "--data-binary", "@-"]
    r = subprocess.run(cmd, input=data, capture_output=True)
    if r.returncode:
        raise RuntimeError(f"curl failed ({r.returncode}) for {path}")
    return r.stdout


def peek(addr, n):
    out = b""
    while n > 0:
        c = min(n, 0x1000)  # >4 KB per request crashes DOSBox 0.83 (mutex deadlock)
        out += api(f"/memory/{addr:#x}/{c:#x}")
        addr += c; n -= c
    return out


def poke(addr, b):
    api(f"/memory/{addr:#x}", b, "PUT")


# ---- game variables (addresses from the LE image of PASS.EXE; runtime = image + DELTA) ----
DELTA = 0x421000          # where DOSBox/CauseWay loads the program; verified at runtime
V = dict(loc=0x73718, stage=0x7371C, maxstage=0x73720, health=0x73728, hv_ammo=0x73734,
         ex_ammo=0x73738, debug=0x73768, objs=0x74974, nobj=0x74978)
PROBE = (0x63468, b"Location #")
TEXT = None


def _check():
    if peek(PROBE[0] + DELTA, len(PROBE[1])) != PROBE[1]:
        sys.exit("game memory layout not recognised (is PASS.EXE running and in game?)")


def rd(name, n=4):
    return int.from_bytes(peek(V[name] + DELTA, n), "little", signed=True)


def wr(name, val, n=4):
    poke(V[name] + DELTA, int(val).to_bytes(n, "little", signed=True))


def text(i):
    global TEXT
    if TEXT is None:
        TEXT = {}
        f = GAME.parent / "Extracted" / "text" / "english" / "passtext.txt"
        if f.exists():
            for line in f.read_text(encoding="utf8", errors="replace").splitlines():
                if line.startswith("[") and line[5:6] == "]":
                    TEXT[int(line[1:5])] = line[7:]
    import re
    return re.sub(r"<[^>]*>", "", TEXT.get(i, "")).strip()


def objects():
    base, n = rd("objs"), rd("nobj")
    raw = peek(base, n * 32)
    out = []
    for i in range(n):
        r = raw[i * 32:(i + 1) * 32]
        out.append(dict(id=i, flags=int.from_bytes(r[0:2], "little"), icon=int.from_bytes(r[12:14], "little"),
                        where=int.from_bytes(r[14:16], "little", signed=True), addr=base + i * 32))
    return out


def status():
    _check()
    st = rd("stage")
    print(f"location {rd('loc')}  story stage {st}: {text(900 + st)}")
    print(f"health {rd('health')}/160   high-velocity rounds {rd('hv_ammo')}   explosive shells {rd('ex_ammo')}"
          f"   debug {'on' if rd('debug', 1) & 1 else 'off'}")
    inv = [o for o in objects() if o["where"] == -1]
    print("inventory:", ", ".join(f"#{o['id']}(icon {o['icon']})" for o in inv) or "empty")


def warp(n):
    _check()
    if not 1 <= n <= rd("maxstage"):
        sys.exit("stage must be 1..23 (stage 0 = `newgame`)")
    was = rd("debug", 1)
    wr("debug", was | 1, 1)
    wr("stage", n - 1)
    key(hwnd(), "ctrl+0")  # debug key: finish current stage -> game advances to stage n
    time.sleep(1.5)
    wr("debug", was, 1)
    print(f"warping to stage {n}: {text(900 + n)}  (click through the cut-scene)")


def launch(screen="DISPLAY3", extra=(), keep_focus=False):
    fg = u32.GetForegroundWindow()
    subprocess.Popen([str(GAME / "dosbox" / "dosbox.exe"), "--noprimaryconf", "--conf", "pass.conf",
                      "--conf", "play.conf", "--set", "webserver_enabled=on", *extra],
                     cwd=GAME, stdout=open(GAME / "dosbox_log.txt", "w"), stderr=subprocess.STDOUT)
    h = 0
    for _ in range(50):
        time.sleep(0.2)
        h = hwnd()
        if h:
            break
    time.sleep(0.5)
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                    str(GAME / "tools" / "winpos.ps1"), "-Move", "-Screen", screen], capture_output=True)
    if keep_focus and h:  # launched to play: the game window gets focus
        u32.SetForegroundWindow(h)
    elif fg:  # give focus back to whatever the user was doing
        u32.SetForegroundWindow(fg)
    print("dosbox hwnd", h)


if __name__ == "__main__":
    cmd, *a = sys.argv[1:] or ["help"]
    if cmd == "launch":
        launch(a[a.index("--screen") + 1] if "--screen" in a else "DISPLAY3", keep_focus="--play" in a)
    elif cmd == "keys":
        h = hwnd()
        for k in a:
            if k.startswith("wait"):
                time.sleep(float(k[4:] or 1)); continue
            if k.startswith("click") or k.startswith("rclick"):
                x, y = map(int, k.split(":")[1].split(","))
                click(h, x, y, "right" if k[0] == "r" else "left"); continue
            key(h, k)
    elif cmd == "status":
        status()
    elif cmd == "stages":
        for i in range(24):
            print(f"{i:2}  {text(900 + i) if i else 'New game: the desert canyon'}")
    elif cmd == "stage":
        warp(int(a[0]))
    elif cmd == "heal":
        _check(); wr("health", 160); print("health 160")
    elif cmd == "ammo":
        _check(); n = int(a[0]) if a else 999
        wr("hv_ammo", n); wr("ex_ammo", n); print("ammo", n)
    elif cmd == "debug":
        _check(); wr("debug", 1 if a and a[0] == "on" else 0, 1); print("debug", a[0] if a else "off")
    elif cmd == "items":
        _check()
        for o in objects():
            if o["flags"] & 1 and not o["flags"] & 2 and o["icon"] < 62:
                w = "CARRIED" if o["where"] == -1 else ("nowhere" if o["where"] == 0 else f"location {o['where']}")
                print(f"#{o['id']:3}  icon {o['icon']:3}  {w}")
    elif cmd in ("give", "take"):
        _check()
        obs = objects()
        real = lambda o: o["flags"] & 1 and not o["flags"] & 2 and o["icon"] < 62  # skip scenery/hotspots
        ids = [o["id"] for o in obs if real(o) and o["where"] != -1] if a == ["all"] else [int(x) for x in a]
        for i in ids:
            o = obs[i]
            if cmd == "give" and not o["flags"] & 1:
                print(f"#{i} is not a pickable object, skipped"); continue
            poke(o["addr"] + 14, (0xFFFF if cmd == "give" else 0).to_bytes(2, "little"))
        print(cmd, "done:", ids, "(open the inventory again to refresh it)")
    elif cmd == "newgame":
        new_game()
    elif cmd == "menu":
        goto_menu()
    elif cmd == "shot":
        shot(a[0] if a else str(GAME / "_shot.png"))
    elif cmd == "peek":
        print(peek(int(a[0], 0), int(a[1], 0)).hex(" "))
    elif cmd == "poke":
        poke(int(a[0], 0), bytes.fromhex(a[1]))
    elif cmd == "dump":
        start = int(a[1], 0) if len(a) > 1 else 0
        n = int(a[2], 0) if len(a) > 2 else 0x2000000
        Path(a[0]).write_bytes(peek(start, n)); print("ok")
    else:
        print(__doc__)
