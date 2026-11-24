# Small regression fixtures for test_camera_id.mjs, built from cached embeddings of held-out (test split) photos.
#   python make_eval_fixtures.py <datadir> <emb_dir> <out_json>
# everyday: photos of food, packaging, household things, hands and pets. None may ever get a species name.
# lookalikes: New England look-alike pairs (poison vs edible). They must stay in domain, and their
#   true class must stay in the top three (or the phone says "I'm not sure").
# The shipped head is trained on every photo, so these are regression checks, not an accuracy estimate.
import hashlib, json, os, pickle, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from classes_spec import rows
from everyday_spec import rows as everyday_rows
data, embdir, out = sys.argv[1:4]
emb = pickle.load(open(os.path.join(embdir, "dino_w8.pkl"), "rb")); embf = pickle.load(open(os.path.join(embdir, "dino_w8_flip.pkl"), "rb"))
def split_of(photo):
    h = int(hashlib.md5(str(photo).encode()).hexdigest(), 16) % 100
    return "ref" if h < 64 else ("cal" if h < 82 else "test")
def q(f):
    a = emb[f][:384].astype(np.float32); a /= np.linalg.norm(a) + 1e-9
    b = embf[f][:384].astype(np.float32); b /= np.linalg.norm(b) + 1e-9
    v = a + b; return v / np.linalg.norm(v)
def pick(cid, n):
    items = json.load(open(os.path.join(data, cid, "manifest.json")))["items"]
    got = []
    for it in items:
        f = os.path.join(data, cid, it["file"])
        if split_of(it["photo"]) == "test" and f in emb and f in embf:
            got.append(dict(id=cid, photo=it["photo"], embedding=[round(float(x), 4) for x in q(f)]))
        if len(got) >= n: break
    return got
everyday = [c for r in everyday_rows() for c in pick(r["id"], 2)]
pairs = [("wild_carrot", "poison_hemlock"), ("poison_hemlock", "water_hemlock"), ("balsam_fir", "white_spruce"), ("ramps", "false_hellebore"),
         ("foxglove", "comfrey"), ("elderberry", "pokeweed"), ("staghorn_sumac", "poison_sumac"), ("wild_onion", "death_camas"), ("chanterelle", "jack_o_lantern")]
wild = {r["id"] for r in rows()}
look = [c for a, b in pairs for cid in (a, b) if cid in wild for c in pick(cid, 2)]
json.dump({"note": "Embeddings (DINOv2-small w8, CLS, mean of photo and mirror) of held-out photos. everyday: Wikimedia Commons food/object/pet photos. lookalikes: iNaturalist New England look-alike pairs.", "everyday": everyday, "lookalikes": look}, open(out, "w"), separators=(",", ":"))
print(len(everyday), len(look))
