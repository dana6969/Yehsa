# Build the grocery-oranges regression fixture used by test_camera_id.mjs.
#   python make_oranges_fixture.py <screenshot.png> <out_dir>
# The screenshot is Dana's phone test (round 4, shot 9): a bag of supermarket oranges in a red mesh
# bag, a cream-cheese tub in the corner, that an earlier build called "Jack-o'-lantern (Omphalotus)".
# The crop is the photo area of the screen minus the status bar. Same preprocessing as embed_inat.py.
import sys, os, json
import numpy as np
from PIL import Image
import onnxruntime as ort
src, out = sys.argv[1], sys.argv[2]
sess = ort.InferenceSession(os.environ.get("YEHSA_DINO", "/workspace/yehsa-cam-data/models/dino_w8.onnx"), providers=["CPUExecutionProvider"])
full = Image.open(src).convert("RGB"); s = full.size[0] / 460
im = full.crop((int(22 * s), int(40 * s), int(438 * s), int(382 * s)))
im.save(os.path.join(out, "shot9_oranges.png"))
w, h = im.size; m = min(w, h)
sq = im.crop(((w - m) // 2, (h - m) // 2, (w - m) // 2 + m, (h - m) // 2 + m)).resize((224, 224), Image.BILINEAR)
sq.save(os.path.join(out, "shot9_oranges_224.png"))
mean = np.array((0.485, 0.456, 0.406), np.float32); std = np.array((0.229, 0.224, 0.225), np.float32)
def emb(img):
    a = ((np.asarray(img, np.float32) / 255 - mean) / std).transpose(2, 0, 1)[None]
    v = sess.run(None, {"pixel_values": a})[0][0, 0]; return v / np.linalg.norm(v)
v = emb(sq) + emb(sq.transpose(Image.FLIP_LEFT_RIGHT)); v = v / np.linalg.norm(v)
json.dump({"note": "Embedding of the shot-9 grocery oranges crop (DINOv2-small weight-only int8, CLS, mean of photo and mirror).", "embedding": [round(float(x), 6) for x in v]},
          open(os.path.join(out, "shot9_oranges.json"), "w"))
