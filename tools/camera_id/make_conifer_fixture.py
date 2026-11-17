# Build the conifer regression fixture used by test_camera_id.mjs.
#   python make_conifer_fixture.py <photo.png> <out_dir>
# The photo is the on-screen crop of a balsam fir / spruce branch that an earlier model called
# "Water hemlock" (field bug report, shot 8). Same preprocessing as embed_inat.py.
import sys, os, json
import numpy as np
from PIL import Image
import onnxruntime as ort
src, out = sys.argv[1], sys.argv[2]
sess = ort.InferenceSession("/workspace/yehsa-cam-data/models/dino_w8.onnx", providers=["CPUExecutionProvider"])
im = Image.open(src).convert("RGB"); w, h = im.size; s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((224, 224), Image.BILINEAR)
im.save(os.path.join(out, "shot8_conifer_224.png"))
mean = np.array((0.485, 0.456, 0.406), np.float32); std = np.array((0.229, 0.224, 0.225), np.float32)
def emb(img):
    a = ((np.asarray(img, np.float32) / 255 - mean) / std).transpose(2, 0, 1)[None]
    v = sess.run(None, {"pixel_values": a})[0][0, 0]; return v / np.linalg.norm(v)
v = emb(im) + emb(im.transpose(Image.FLIP_LEFT_RIGHT)); v = v / np.linalg.norm(v)
json.dump({"note": "Embedding of the shot-8 conifer photo (DINOv2-small weight-only int8, CLS, mean of photo and mirror).", "embedding": [round(float(x), 6) for x in v]},
          open(os.path.join(out, "shot8_conifer.json"), "w"))
