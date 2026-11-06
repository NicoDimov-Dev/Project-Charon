"""Point and click in the original game with the real mouse (SendInput relative moves).

The game reads mouse *motion*, not the host pointer position, so its green crosshair drifts away from the
Windows pointer. This finds the crosshair in a frame grab, nudges it onto the target with relative moves,
then clicks. DOSBox is brought to the front first (this does move your mouse and take focus).

  py -I tools/aim.py X Y [left|right|none]     X, Y in 640x480 game coordinates
  py -I tools/aim.py where                     print where the crosshair is
"""
import ctypes, sys, time
from ctypes import wintypes as wt
import numpy as np
sys.path.insert(0, __import__('os').path.dirname(__file__))
import pa

u32 = ctypes.windll.user32


class MI(ctypes.Structure):
    _fields_ = [("dx", ctypes.c_long), ("dy", ctypes.c_long), ("data", wt.DWORD), ("flags", wt.DWORD),
                ("time", wt.DWORD), ("extra", ctypes.c_size_t)]


class INP(ctypes.Structure):
    _fields_ = [("type", wt.DWORD), ("mi", MI), ("pad", ctypes.c_byte * 8)]


def send(flags, dx=0, dy=0):
    i = INP(0, MI(dx, dy, 0, flags, 0, 0))
    u32.SendInput(1, ctypes.byref(i), ctypes.sizeof(INP))


def front():
    h = pa.hwnd()
    if u32.GetForegroundWindow() != h:
        u32.keybd_event(0x12, 0, 0, 0); u32.SetForegroundWindow(h); u32.keybd_event(0x12, 0, 2, 0)
        time.sleep(0.3)
    return h


def where():
    """Crosshair centre in game coordinates (None if not found). Only the 3D view (y < 470) is searched."""
    a = np.asarray(pa.shot(None)).astype(int)
    s = a.shape[1] / 640
    g = (a[..., 1] > 150) & (a[..., 0] < 120) & (a[..., 2] < 120)
    g[int(318 * s):] = False; g[:, :int(62 * s)] = False; g[:, int(576 * s):] = False   # the 3D view only
    ys, xs = np.nonzero(g)
    if len(xs) < 6: return None
    return float(np.median(xs)) / s, float(np.median(ys)) / s


def aim(x, y, button="left"):
    front()
    gain = 1.76                                  # game px per host mickey (measured)
    for _ in range(12):
        p = where()
        if p is None:                            # lost: push it into the view's top-left, then search again
            send(1, -400, -400); time.sleep(0.15); send(1, 60, 60); time.sleep(0.25); continue
        dx, dy = x - p[0], y - p[1]
        if abs(dx) < 3 and abs(dy) < 3: break
        send(1, int(round(dx / gain)), int(round(dy / gain))); time.sleep(0.25)
    if button == "left": send(2); time.sleep(0.06); send(4)
    elif button == "right": send(8); time.sleep(0.06); send(16)
    return where()


if __name__ == "__main__":
    if sys.argv[1] == "where":
        print(where())
    elif sys.argv[1] == "delta":                 # host-pointer move (in 1456-wide screenshot px) to reach X, Y
        p = where(); x, y = float(sys.argv[2]), float(sys.argv[3])
        print(None if p is None else (round((x - p[0]) / 1.76), round((y - p[1]) / 1.76)), p)
    else:
        print(aim(float(sys.argv[1]), float(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "left"))
