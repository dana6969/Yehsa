# Held-out evaluation for the camera-ID reference set.
#   python eval_split.py <datadir> <emb.pkl> [--feat cls|clsmean|all] [--k 1|2|3]
# Split is by photo id hash, fixed: ~64% reference, ~18% calibration (thresholds), ~18% test.
# Test photos are never in the shipped index and never used to choose a threshold.
import json, os, sys, pickle, hashlib, glob
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from classes_spec import rows

def split_of(photo, other=False):
    h = int(hashlib.md5(str(photo).encode()).hexdigest(), 16) % 100
    if other:
        return "ref" if h < 50 else ("cal" if h < 75 else "test")
    return "ref" if h < 64 else ("cal" if h < 82 else "test")

def load(data, emb_path, feat="clsmean"):
    emb = pickle.load(open(emb_path, "rb"))
    spec = {r["id"]: r for r in rows()}
    classes = [r["id"] for r in rows()]
    items = []
    for cid in classes + ["_other"]:
        mf = os.path.join(data, cid, "manifest.json")
        if not os.path.exists(mf): continue
        for it in json.load(open(mf))["items"]:
            f = os.path.join(data, cid, it["file"])
            if f not in emb: continue
            v = emb[f].astype(np.float32)
            if feat == "cls": v = v[:384]
            elif feat == "clsmean" and len(v) == 768:
                v = np.concatenate([v[:384] / np.linalg.norm(v[:384]), v[384:] / np.linalg.norm(v[384:])])
            v = v / (np.linalg.norm(v) + 1e-9)
            items.append(dict(cls=cid, photo=it["photo"], vec=v, split=split_of(it["photo"], cid == "_other"), user=it.get("user", ""), obs=it["obs"], license=it["license"]))
    return classes, spec, items

def class_scores(refs, refcls, classes_all, q, k=1):
    """per-class score = mean of the top-k cosine similarities to that class's reference photos."""
    sims = refs @ q
    out = np.full(len(classes_all), -1.0, dtype=np.float32)
    for ci in range(len(classes_all)):
        s = sims[refcls == ci]
        if len(s): out[ci] = np.sort(s)[::-1][:k].mean()
    return out

if __name__ == "__main__":
    data, embp = sys.argv[1], sys.argv[2]
    feat = sys.argv[sys.argv.index("--feat") + 1] if "--feat" in sys.argv else "clsmean"
    k = int(sys.argv[sys.argv.index("--k") + 1]) if "--k" in sys.argv else 1
    classes, spec, items = load(data, embp, feat)
    allc = classes + ["_other"]
    idx = {c: i for i, c in enumerate(allc)}
    ref = [i for i in items if i["split"] == "ref"]
    R = np.stack([i["vec"] for i in ref]); RC = np.array([idx[i["cls"]] for i in ref])
    test = [i for i in items if i["split"] == "test" and i["cls"] != "_other"]
    t1 = t3 = 0
    for i in test:
        sc = class_scores(R, RC, allc, i["vec"], k)[:len(classes)]
        order = np.argsort(-sc)
        t1 += order[0] == idx[i["cls"]]; t3 += idx[i["cls"]] in order[:3]
    print(f"feat={feat} k={k} refs={len(ref)} test={len(test)} top1={t1/len(test):.3f} top3={t3/len(test):.3f}")
