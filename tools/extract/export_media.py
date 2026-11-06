"""Copy the character and effect sprite sheets the web prototype uses from Extracted/sprites into
prototype/web-test/media, keeping only the playback fields of the JSON (no palette or per-cell table).
Run convert_sprites.py first. Usage: python export_media.py [<Extracted dir> <media dir>]"""
import sys, os, json, shutil

SHEETS = ['C00WALK', 'C00SHOT', 'DOOLWLK', 'DOOLDEAD', 'KMNDOWLK', 'KMNDODED', 'KOMMWALK', 'KOMMSDED',
          'JKWOUND', 'JKWNDED', 'SPLAT', 'EXP1', 'EXP3', 'EXP5', 'FIREBALL']
KEEP = ['source', 'compressed_cwc', 'frames', 'views', 'mirrored', 'cell_w', 'cell_h', 'anchor_in_cell', 'layout',
        'shadow_index', 'gap']

def main(ext, media):
    for n in SHEETS:
        meta = json.load(open(os.path.join(ext, 'sprites', n + '.json')))
        json.dump({k: meta[k] for k in KEEP}, open(os.path.join(media, n + '.json'), 'w'), separators=(', ', ': '))
        shutil.copyfile(os.path.join(ext, 'sprites', n + '.png'), os.path.join(media, n + '.png'))
    print('media sheets:', len(SHEETS))

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    a = sys.argv[1:3] or [os.path.join(root, 'Extracted'), os.path.join(root, 'prototype', 'web-test', 'media')]
    main(*a)
