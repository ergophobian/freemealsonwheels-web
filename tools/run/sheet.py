import sys
from PIL import Image
d=sys.argv[1]; views=sys.argv[2].split(','); frames=sys.argv[3].split(','); out=sys.argv[4]
ims=[[Image.open(f'{d}/cmp-{v}-{int(f):02d}.png') for f in frames] for v in views]
W,H=ims[0][0].size; s=Image.new('RGB',(W*len(frames),H*len(views)))
for r,row in enumerate(ims):
  for c,im in enumerate(row): s.paste(im,(c*W,r*H))
sc=min(1,1800/s.width); s.resize((int(s.width*sc),int(s.height*sc))).save(out)
