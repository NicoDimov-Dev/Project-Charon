"""Copy/normalise audio: WAV -> 16-bit PCM WAV (original sample rate), MIDI copied as-is.
Usage: python convert_audio.py <installer dir> <out dir>"""
import sys, os, glob, json, subprocess, shutil, struct

def main(src, out):
    man = {}
    for sub, dst in [('AUDIO', 'audio/speech_and_fx'), ('AUDIO/16BIT', 'audio/speech_and_fx_16bit'), ('SND', 'audio/sfx'),
                     ('SND/FM', 'music/fm')]:
        od = os.path.join(out, dst); os.makedirs(od, exist_ok=True)
        for f in sorted(glob.glob(os.path.join(src, sub, '*'))):
            if not os.path.isfile(f): continue
            base, ext = os.path.splitext(os.path.basename(f)); ext = ext.upper()
            if ext == '.WAV':
                h = open(f, 'rb').read(36)
                fmt, ch, sr = struct.unpack_from('<HHI', h, 20); bits = struct.unpack_from('<H', h, 34)[0]
                o = os.path.join(od, base.upper() + '.wav')
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-c:a', 'pcm_s16le', o], check=True)
                man[sub + '/' + os.path.basename(f)] = {'out': os.path.relpath(o, out).replace(os.sep, '/'), 'rate': sr, 'channels': ch, 'source_bits': bits}
            elif ext in ('.MID', '.FM'):
                d = os.path.join(out, 'music') if sub == 'SND' else od
                os.makedirs(d, exist_ok=True); o = os.path.join(d, base.upper() + ext.lower())
                shutil.copyfile(f, o); man[sub + '/' + os.path.basename(f)] = {'out': os.path.relpath(o, out).replace(os.sep, '/')}
    json.dump(man, open(os.path.join(out, 'audio', '_manifest.json'), 'w'), indent=1)
    print('audio files:', len(man))

if __name__ == '__main__': main(*sys.argv[1:3])
