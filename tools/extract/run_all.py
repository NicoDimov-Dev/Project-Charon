"""Run every converter. Usage: python run_all.py "<path to Perfect Assassin Installer>" <out dir>
Requires Python 3.9+, numpy, Pillow, ffmpeg on PATH."""
import sys, os, subprocess
here = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
steps = [
    ['convert_images.py', src, out],
    ['convert_audio.py', src, out],
    ['convert_text.py', os.path.join(src, 'DATA'), out],
    ['convert_sprites.py', os.path.join(src, 'DATA'), out],
    ['convert_v2.py', src, out],
    ['convert_world.py', src, out],
    ['convert_cdv.py', os.path.join(src, 'CDV'), os.path.join(src, 'AUDIO'), os.path.join(out, 'cutscenes')],
]
for s in steps:
    print('==', s[0], flush=True)
    subprocess.run([sys.executable, os.path.join(here, s[0])] + s[1:], check=True)
