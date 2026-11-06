"""Perfect Assassin (1997) CDV video decoder.

Container: 'CDV\\0', u32 index_size, u32 file_size, u16 w, u16 h, then chunks
(tag, u32 size incl. header): FRME, SAMP, MIDI, EFCT, END. Frame data begins at
FRME.data_offset. FRME body: u32 nframes, u32 data_off, u32 flags (bit1 =
half-height/line-doubled, bit0 = loop), u16 w, u16 h, u8 ticks per frame (70 Hz),
3 pad, then nframes u32 entries: low 24 bits = frame size, high byte flags
(0x01 video, 0x02 palette, 0x04 audio, 0x80 bit-packed video codec).
Reverse-engineered from PASS.EXE (routine at VA 0x40b94).
"""
import struct
import numpy as np

class Bits:
    __slots__=('d','p','buf','n')
    def __init__(s,d,p):
        s.d=d; s.p=p
    def init(s):
        s.buf=struct.unpack_from('<I',s.d,s.p)[0]; s.p+=4; s.n=32
    def bit(s):
        b=(s.buf>>31)&1; s.buf=(s.buf<<1)&0xffffffff; s.n-=1
        if s.n==0:
            s.buf=struct.unpack_from('<I',s.d,s.p)[0]; s.p+=4; s.n=32
        return b
    def bits(s,k):
        v=0
        for _ in range(k): v=(v<<1)|s.bit()
        return v
    def byte(s):
        v=s.d[s.p]; s.p+=1; return v

def _count(r):
    if r.bit()==0: return r.bits(2)
    if r.bit(): return r.byte()
    return r.bits(4)

def decode_row(r,fb,pos,width):
    rem=width
    while rem>0:
        if r.bit()==0:
            n=_count(r); pos+=n; rem-=n; continue
        n=_count(r)
        if n<3:
            rem-=n
            for _ in range(n): fb[pos]=r.byte(); pos+=1
            continue
        rem-=n; cnt=n
        while cnt>0:
            if r.bit():
                fb[pos]=r.byte(); pos+=1; cnt-=1; continue
            if r.bit():
                ln=r.bits(2)+2; a=r.byte()-1
            elif r.bit():
                w=struct.unpack_from('<H',r.d,r.p)[0]; r.p+=2
                ln=(w&0xf)+2; a=(w>>4)-1
            else:
                v=r.d[r.p]|(r.d[r.p+1]<<8)|(r.d[r.p+2]<<16); r.p+=3
                ln=(v&0xfff)+2; a=(v>>12)-1
            if a<0:
                ln+=1; c=r.byte()
                fb[pos:pos+ln]=c; pos+=ln; cnt-=ln
            else:
                src=pos-(a+ln)
                for k in range(ln): fb[pos+k]=fb[src+k]
                pos+=ln; cnt-=ln
    return pos

def _lit(r,fb,pos,n):
    fb[pos:pos+n]=np.frombuffer(r.d,np.uint8,n,r.p); r.p+=n; return pos+n

def _packbits(r,fb,pos,total):
    while total>0:
        c=r.byte()
        if c<0x80:
            n=c+1; pos=_lit(r,fb,pos,n)
        else:
            n=(256-c)+1; fb[pos:pos+n]=r.byte(); pos+=n
        total-=n
    return pos

def legacy_row(op,r,fb,pos,width):
    """Older per-row codecs (entries without the 0x80 flag). PASS.EXE 0x41290-0x41410."""
    rem=width
    if op==1:
        _packbits(r,fb,pos,rem)
    elif op in (2,3):
        while True:
            k=r.byte(); pos+=k; rem-=k
            if rem<=0: return
            if k==0xff: continue
            while True:
                n=r.byte()
                if op==3 and n>=4: pos=_packbits(r,fb,pos,n)
                else: pos=_lit(r,fb,pos,n)
                rem-=n
                if rem<=0: return
                if n!=0xff: break
    elif op==5:
        while True:
            k=r.byte(); pos+=k
            if k!=0xff: break
        while True:
            n=r.byte()
            if n==0: return
            pos=_lit(r,fb,pos,n)
            if n!=0xff: return
    elif op==9:
        st={'dl':r.byte(),'dh':8}
        def bit():
            b=(st['dl']>>7)&1; st['dl']=(st['dl']<<1)&0xff; st['dh']-=1
            if st['dh']==0: st['dl']=r.byte(); st['dh']=8
            return b
        while rem>0:
            if bit()==0:
                fb[pos]=r.byte(); pos+=1; rem-=1; continue
            f=bit(); n=(bit()<<1)|bit()
            if f: n=(n<<2)|(bit()<<1)|bit()
            n+=2; rem-=n; fb[pos:pos+n]=r.byte(); pos+=n
    else:
        raise NotImplementedError('legacy row opcode %d'%op)

class CDV:
    def __init__(s,data):
        s.d=d=data
        assert d[:4]==b'CDV\x00', 'not a CDV'
        isz,fsz,s.w,s.h=struct.unpack_from('<IIHH',d,4)
        s.chunks={}
        i=0x10
        while i<0x10+isz:
            tag=d[i:i+4]; sz=struct.unpack_from('<I',d,i+4)[0]
            if tag==b'END ': break
            s.chunks[tag]=(i+8,sz-8); i+=sz
        o,_=s.chunks[b'FRME']
        s.nframes,s.data_off,s.flags,s.fw,s.fh=struct.unpack_from('<IIIHH',d,o)
        s.ticks=d[o+16] or 1
        s.entries=list(struct.unpack_from('<%dI'%s.nframes,d,o+20))
        s.efct=s._efct()
        s.half=bool(s.flags&2)
        s.bh=s.fh//2 if s.half else s.fh
    def _efct(s):
        if b'EFCT' not in s.chunks: return []
        o,_=s.chunks[b'EFCT']; n=struct.unpack_from('<I',s.d,o)[0]
        out=[]; base=o
        # table: u32 count, then count x (u32 name_off rel. to chunk body, u32 runtime handle)
        for k in range(struct.unpack_from('<I',s.d,o+4)[0] if False else 0): pass
        return out
    @property
    def fps(s): return 70.0/s.ticks
    def frames(s):
        """Yield (index, frame_u8[h,w] full-height, palette_rgb[256,3] u8, audio bytes|None)."""
        fb=np.zeros(s.fw*(s.bh+8),np.uint8)  # margin: some streams overrun by a few pixels
        pal=np.zeros((256,3),np.uint8)
        p=s.data_off
        for idx,e in enumerate(s.entries):
            size=e&0xffffff; fl=e>>24; base=p; p+=size
            audio=None
            if size==0:
                yield idx,s._out(fb),pal.copy(),None; continue
            q=base
            if fl&1:
                vx,vy,vw,vh,vsz=struct.unpack_from('<HHHHI',s.d,q)
                s._video(q,fl,vx,vy,vw,vh,fb); q+=vsz
            if fl&2:
                psz=struct.unpack_from('<I',s.d,q)[0]; r=q+4
                nr=s.d[r]+1; r+=1
                for _ in range(nr):
                    st=s.d[r]; cnt=s.d[r+1]+1; r+=2
                    v=np.frombuffer(s.d,np.uint8,cnt*3,r).reshape(cnt,3); r+=cnt*3
                    pal[st:st+cnt]=(v.astype(np.uint16)*255//63).astype(np.uint8)
                q+=psz
            if fl&4:
                asz=struct.unpack_from('<I',s.d,q)[0]
                audio=bytes(s.d[q+4:q+asz]); q+=asz
            yield idx,s._out(fb),pal.copy(),audio
    def _out(s,fb):
        f=fb[:s.fw*s.bh].reshape(s.bh,s.fw)
        return np.repeat(f,2,axis=0) if s.half else f.copy()
    def _video(s,q,fl,vx,vy,vw,vh,fb):
        if vw==0 or vh==0: return
        rows=vh//2 if s.half else vh
        y0=vy//2 if s.half else vy
        r=Bits(s.d,q+12)
        if fl&0x80:
            r.init()
            for y in range(rows):
                decode_row(r,fb,(y0+y)*s.fw+vx,vw)
        else:
            # legacy per-row opcode stream (only skip opcodes observed)
            y=0
            while y<rows:
                op=r.byte()
                if op==4: y+=r.byte(); continue
                if op!=0: legacy_row(op,r,fb,(y0+y)*s.fw+vx,vw)
                y+=1
