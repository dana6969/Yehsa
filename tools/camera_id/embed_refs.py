# Embed images with the camera-ID model: centre square crop, mirror, and 70% zoom views.
# Usage: python embed_refs.py model.tflite out.json "group=glob" ...
import json, os, sys, glob, numpy as np
from PIL import Image, ImageOps
from ai_edge_litert.interpreter import Interpreter
model, out = sys.argv[1], sys.argv[2]; groups=sys.argv[3:]
it = Interpreter(model_path=model); it.allocate_tensors()
inp = it.get_input_details()[0]["index"]; outi = it.get_output_details()[0]["index"]
def run(im):
    x=(np.asarray(im.resize((224,224),Image.BILINEAR),dtype=np.float32)/255.0)[None]
    it.set_tensor(inp,x); it.invoke(); v=it.get_tensor(outi)[0].astype(np.float64); return (v/np.linalg.norm(v)).tolist()
def views(path):
    im=Image.open(path).convert("RGB"); w,h=im.size; s=min(w,h)
    c=im.crop(((w-s)//2,(h-s)//2,(w-s)//2+s,(h-s)//2+s))
    t=int(s*0.7); o=(s-t)//2
    z=c.crop((o,o,o+t,o+t))
    return {"center":run(c),"flip":run(ImageOps.mirror(c)),"zoom":run(z)}
res=[]
for g in groups:
    name,pat=g.split("=",1)
    for p in sorted(glob.glob(pat)): res.append({"group":name,"file":os.path.basename(p),"views":views(p)})
json.dump(res,open(out,"w")); print(len(res))
