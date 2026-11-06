"""Scancode names and helpers for decoding PASS.EXE key bitmaps."""
NAMES = {1:'Esc',2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',12:'-',13:'=',14:'Bksp',15:'Tab',16:'Q',17:'W',18:'E',19:'R',20:'T',21:'Y',22:'U',23:'I',24:'O',25:'P',26:'[',27:']',28:'Enter',29:'Ctrl',30:'A',31:'S',32:'D',33:'F',34:'G',35:'H',36:'J',37:'K',38:'L',39:';',40:"'",41:'`',42:'LShift',43:'BSlash',44:'Z',45:'X',46:'C',47:'V',48:'B',49:'N',50:'M',51:',',52:'.',53:'/',54:'RShift',55:'KP*',56:'Alt',57:'Space',58:'Caps',59:'F1',60:'F2',61:'F3',62:'F4',63:'F5',64:'F6',65:'F7',66:'F8',67:'F9',68:'F10',69:'Num',70:'Scroll',71:'Home',72:'Up',73:'PgUp',74:'KP-',75:'Left',76:'KP5',77:'Right',78:'KP+',79:'End',80:'Down',81:'PgDn',82:'Ins',83:'Del',87:'F11',88:'F12'}
if __name__ == "__main__":
    import struct
    img = open('tools/re/_le/image.bin', 'rb').read()
    for sc in range(128):
        lo, hi = struct.unpack_from('<II', img, 0x50196 + sc * 8)
        if lo or hi:
            print(sc, NAMES.get(sc, '?'), hex(lo), hex(hi))
