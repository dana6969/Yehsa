# Embed the iNaturalist reference/test photos with a candidate model (incremental cache).
#   python embed_inat.py <datadir> <model> [--limit N]
# Models: dino_s (DINOv2-small int8 ONNX, CLS + mean patch), mclip_s0, mclip_s1.
# Preprocess matches the phone: centre square crop, bilinear resize, no extra augmentation.
import os, sys, glob, pickle, time
import numpy as np
from PIL import Image
import onnxruntime as ort

DATA = sys.argv[1]; MODEL = sys.argv[2]
MD = "/workspace/yehsa-cam-data/models"
CFG = {
    "dino_s": dict(file="dino_s_int8.onnx", size=224, mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    "dino_w8": dict(file="dino_w8.onnx", size=224, mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
    "mclip_s0": dict(file="mclip_s0_int8.onnx", size=256, mean=(0, 0, 0), std=(1, 1, 1)),
    "mclip_s1": dict(file="mclip_s1_int8.onnx", size=256, mean=(0, 0, 0), std=(1, 1, 1)),
}[MODEL]
sess = ort.InferenceSession(os.path.join(MD, CFG["file"]), providers=["CPUExecutionProvider"], sess_options=ort.SessionOptions())
inp = sess.get_inputs()[0].name
cache_path = f"/workspace/yehsa-cam-data/emb/{MODEL}.pkl"
cache = pickle.load(open(cache_path, "rb")) if os.path.exists(cache_path) else {}
FLIP = "--flip" in sys.argv
if FLIP: cache_path = cache_path.replace(".pkl", "_flip.pkl"); cache = pickle.load(open(cache_path, "rb")) if os.path.exists(cache_path) else {}
limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 10**9

def prep(path):
    im = Image.open(path).convert("RGB"); w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((CFG["size"],) * 2, Image.BILINEAR)
    if FLIP: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    a = (np.asarray(im, dtype=np.float32) / 255.0 - np.array(CFG["mean"], np.float32)) / np.array(CFG["std"], np.float32)
    return a.transpose(2, 0, 1)

def embed(batch):
    x = np.stack(batch)
    out = sess.run(None, {inp: x})[0]
    if MODEL in ("dino_s", "dino_w8"):
        out = np.concatenate([out[:, 0], out[:, 1:].mean(1)], axis=1)
    return out

files = sorted(glob.glob(os.path.join(DATA, "*", "*.jpg")))
todo = [f for f in files if f not in cache][:limit]
print(MODEL, "todo", len(todo), "cached", len(cache), flush=True)
t0 = time.time(); B = 8
for i in range(0, len(todo), B):
    chunk = todo[i:i + B]; ok = []; ims = []
    for f in chunk:
        try: ims.append(prep(f)); ok.append(f)
        except Exception as e: print("bad", f, e)
    if not ims: continue
    v = embed(ims)
    for f, e in zip(ok, v): cache[f] = e.astype(np.float16)
    if (i // B) % 50 == 0:
        print(i, len(todo), f"{(i + B) / (time.time() - t0):.1f}/s", flush=True)
        pickle.dump(cache, open(cache_path, "wb"))
pickle.dump(cache, open(cache_path, "wb")); print("done", len(cache))
