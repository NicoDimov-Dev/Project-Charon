"""Batch-convert Perfect Assassin CDV videos to MP4 (H.264 + AAC) with cue metadata.

Usage: python convert_cdv.py <CDV dir> <AUDIO dir> <out dir> [names...]
Palette-less clips (talking-head overlays) are written losslessly as indexed
PNG strips (frames stacked vertically, grayscale placeholder palette) because
their palette comes from game state not yet identified.
"""
import sys, os, io, json, struct, subprocess, wave, glob
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdv import CDV

RATE = 22050

def parse_cues(c, chunk):
    if chunk not in c.chunks: return None
    o, sz = c.chunks[chunk]; d = c.d
    tbl = o + struct.unpack_from('<I', d, o)[0]
    n = struct.unpack_from('<I', d, o + 4)[0]
    cues = []
    for k in range(n):
        fr, idx = struct.unpack_from('<HH', d, o + 8 + 4 * k)
        cues.append({'frame': fr & 0x7fff, 'first_loop_only': bool(fr & 0x8000), 'index': idx})
    return tbl, cues

def wav_to_float(b):
    w = wave.open(io.BytesIO(b)) if b[20:22] == b'\x01\x00' else None
    if w is None:  # non-PCM (e.g. MS ADPCM): let ffmpeg decode
        sr = struct.unpack_from('<I', b, 24)[0]
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', str(RATE), 'pipe:1'],
                             input=b, capture_output=True, check=True).stdout
        return np.frombuffer(pcm, np.float32).copy(), sr
    ch, sw, sr, nf = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(nf)
    a = (np.frombuffer(raw, np.uint8).astype(np.float32) - 128) / 128 if sw == 1 else np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if ch > 1: a = a.reshape(-1, ch).mean(1)
    if sr != RATE:
        t = np.arange(int(len(a) * RATE / sr)) * sr / RATE
        a = np.interp(t, np.arange(len(a)), a)
    return a.astype(np.float32), sr

def convert(path, audio_dir, out):
    name = os.path.splitext(os.path.basename(path))[0].upper()
    c = CDV(open(path, 'rb').read())
    meta = {'name': name, 'width': c.fw, 'height': c.fh, 'frames': c.nframes, 'ticks_per_frame_70hz': c.ticks,
            'fps': round(c.fps, 4), 'duration_s': round(c.nframes / c.fps, 3), 'loop': bool(c.flags & 1),
            'line_doubled': c.half, 'chunks': [t.decode() for t in c.chunks]}
    has_pal = any((e >> 24) & 2 for e in c.entries)
    meta['has_palette'] = has_pal
    # --- audio cues
    dur = c.nframes / c.fps
    mix = np.zeros(int(dur * RATE) + RATE * 30, np.float32); used = False
    samp = parse_cues(c, b'SAMP')
    if samp:
        tbl, cues = samp; offs = []
        nfirst = struct.unpack_from('<I', c.d, tbl)[0] // 4
        offs = [tbl + struct.unpack_from('<I', c.d, tbl + 4 * k)[0] for k in range(nfirst)]
        sounds = []
        for k, o in enumerate(offs):
            ln = struct.unpack_from('<I', c.d, o + 4)[0] + 8
            blob = c.d[o:o + ln]; sounds.append(blob)
            os.makedirs(os.path.join(out, 'audio'), exist_ok=True)
            open(os.path.join(out, 'audio', '%s_%02d.wav' % (name, k)), 'wb').write(blob)
        for q in cues:
            a, sr = wav_to_float(sounds[q['index']]); q['sample'] = '%s_%02d.wav' % (name, q['index']); q['source_rate'] = sr
            p = int(q['frame'] / c.fps * RATE); mix[p:p + len(a)] += a; used = True
        meta['embedded_sound_cues'] = cues
    efct = parse_cues(c, b'EFCT')
    if efct:
        tbl, cues = efct
        n = struct.unpack_from('<I', c.d, tbl)[0]; names = []
        for k in range(n):
            no = struct.unpack_from('<I', c.d, tbl + 4 + 8 * k)[0]
            s = c.d[tbl + no:c.d.index(b'\0', tbl + no)].decode('latin1'); names.append(s)
        for q in cues:
            q['effect'] = names[q['index']]
            f = os.path.join(audio_dir, q['effect'].upper() + '.WAV')
            if os.path.exists(f):
                a, sr = wav_to_float(open(f, 'rb').read())
                p = int(q['frame'] / c.fps * RATE); mix[p:p + len(a)] += a; used = True
            else: q['missing'] = True
        meta['effect_cues'] = cues
    if b'MIDI' in c.chunks:
        o, sz = c.chunks[b'MIDI']; open(os.path.join(out, name + '.midi.bin'), 'wb').write(c.d[o:o + sz])
    # --- video
    if not has_pal:
        frames = [f for _, f, _, _ in c.frames()]
        strip = np.concatenate(frames, 0)
        im = Image.fromarray(strip, 'P'); im.putpalette(list(np.repeat(np.arange(256, dtype=np.uint8), 3)))
        os.makedirs(os.path.join(out, 'indexed'), exist_ok=True)
        im.save(os.path.join(out, 'indexed', name + '.png'), optimize=True)
        meta['output'] = 'indexed/%s.png' % name
        meta['note'] = 'No palette in file; frames stacked vertically as raw palette indices (grayscale placeholder).'
    else:
        last = mix[:max(1, int(dur * RATE))] if used else None
        if used:
            nz = np.nonzero(np.abs(mix) > 1e-4)[0]; end = max(int(dur * RATE), (nz[-1] + 1) if len(nz) else 0)
            pcm = (np.clip(mix[:end], -1, 1) * 32767).astype('<i2')
            tmpw = os.path.join(out, '_%s.wav' % name)
            w = wave.open(tmpw, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes()); w.close()
        cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (c.fw, c.fh),
               '-framerate', '70/%d' % c.ticks, '-i', '-']
        if used: cmd += ['-i', tmpw, '-c:a', 'aac', '-b:a', '128k']
        cmd += ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(out, name + '.mp4')]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        first = None
        for i, f, pal, _ in c.frames():
            rgb = pal[f]
            if first is None or i == c.nframes // 2: 
                if first is None: first = rgb
                else: Image.fromarray(rgb).save(os.path.join(out, 'stills', name + '_mid.png'))
            p.stdin.write(rgb.tobytes())
        p.stdin.close(); p.wait()
        if used: os.remove(tmpw)
        meta['has_audio_track'] = used
        meta['output'] = name + '.mp4'
    json.dump(meta, open(os.path.join(out, 'meta', name + '.json'), 'w'), indent=1)
    return meta

if __name__ == '__main__':
    src, adir, out = sys.argv[1:4]
    for s in ('stills', 'meta'): os.makedirs(os.path.join(out, s), exist_ok=True)
    names = sys.argv[4:] or sorted(os.path.basename(f) for f in glob.glob(os.path.join(src, '*.CDV')))
    for n in names:
        if os.path.exists(os.path.join(out, 'meta', os.path.splitext(n)[0].upper() + '.json')): continue
        try:
            m = convert(os.path.join(src, n), adir, out); print('ok', n, m['frames'], flush=True)
        except Exception as e:
            print('FAIL', n, repr(e), flush=True)
