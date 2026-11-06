"""Join the filmstrip renders from animate_humanoid.py --strip into one sheet per clip (rows: front, side).
py tools/models/strip_sheet.py DIR [walk jog ...]"""
import sys, os
from PIL import Image
d = sys.argv[1]
for name in sys.argv[2:] or ['walk', 'jog']:
    rows = [[Image.open(os.path.join(d, f'strip_{name}_{v}_{k}.png')) for k in range(8)] for v in ('front', 'side')]
    W, H = rows[0][0].size; out = Image.new('RGB', (W * 8, H * 2))
    for r, row in enumerate(rows):
        for c, im in enumerate(row): out.paste(im, (c * W, r * H))
    out.save(os.path.join(d, f'sheet_{name}.png')); print(os.path.join(d, f'sheet_{name}.png'))
