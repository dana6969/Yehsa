# Train the camera-ID head on DINOv2-small embeddings, measure it on held-out photos, pick the
# "I'm not sure" thresholds on a separate calibration split, and write the shipped assets.
#   python build_index2.py <datadir> <emb_dir> <outdir> [--write]
# Held-out numbers come from a head trained on the reference split only. The shipped head is
# retrained on all photos (reference + calibration + test), so the numbers are slightly
# conservative for what ships. Thresholds are fixed from the calibration split, never the test split.
import base64, json, os, sys, pickle, hashlib, datetime
import numpy as np
from sklearn.linear_model import LogisticRegression
sys.path.insert(0, os.path.dirname(__file__))
from classes_spec import rows

data, embdir, outdir = sys.argv[1:4]
WRITE = "--write" in sys.argv
C_REG = 10.0
spec = rows(); classes = [r["id"] for r in spec]; N = len(classes)
emb = pickle.load(open(os.path.join(embdir, "dino_w8.pkl"), "rb"))
embf = pickle.load(open(os.path.join(embdir, "dino_w8_flip.pkl"), "rb"))

def split_of(photo, other):
    h = int(hashlib.md5(str(photo).encode()).hexdigest(), 16) % 100
    if other: return "ref" if h < 50 else ("cal" if h < 75 else "test")
    return "ref" if h < 64 else ("cal" if h < 82 else "test")

def cls_vec(v): v = v[:384].astype(np.float32); return v / (np.linalg.norm(v) + 1e-9)

items = []
for cid in classes + ["_other", "_hard"]:
    mf = os.path.join(data, cid, "manifest.json")
    if not os.path.exists(mf): continue
    for it in json.load(open(mf))["items"]:
        f = os.path.join(data, cid, it["file"])
        if f not in emb or f not in embf: continue
        other = cid.startswith("_")
        items.append(dict(cls=N if other else classes.index(cid), name=it.get("group", cid), photo=it["photo"], obs=it["obs"], user=it.get("user", ""), lic=it["license"],
                          v=cls_vec(emb[f]), vf=cls_vec(embf[f]), split=split_of(it["photo"], other)))
print("photos", len(items), "other", sum(1 for i in items if i["cls"] == N))

def stack(sel, aug=False):
    X = [i["v"] for i in sel]; y = [i["cls"] for i in sel]
    if aug: X += [i["vf"] for i in sel]; y += y
    return np.stack(X), np.array(y)

def query(i):
    q = i["v"] + i["vf"]; return q / np.linalg.norm(q)

ref = [i for i in items if i["split"] == "ref"]
X, y = stack(ref, aug=True)
clf = LogisticRegression(C=C_REG, max_iter=400).fit(X, y)
cl = clf.classes_
def proba(sel):
    Q = np.stack([query(i) for i in sel]); P = clf.predict_proba(Q)
    full = np.zeros((len(sel), N + 1)); full[:, cl] = P; return full

cal = [i for i in items if i["split"] == "cal"]; test = [i for i in items if i["split"] == "test"]
def eval_set(sel, t_weak, t_poss):
    P = proba(sel); yt = np.array([i["cls"] for i in sel]); pos = yt < N
    top = P[:, :N].argmax(1); topp = P[np.arange(len(sel)), top]
    answered = (P.argmax(1) != N) & (topp >= t_weak)
    top3 = np.argsort(-P[:, :N], 1)[:, :3]
    res = {}
    res["n_pos"] = int(pos.sum()); res["n_neg"] = int((~pos).sum())
    res["top1_all"] = float(np.mean(top[pos] == yt[pos])); res["top3_all"] = float(np.mean([yt[k] in top3[k] for k in np.where(pos)[0]]))
    res["answered_pos"] = float(answered[pos].mean())
    res["top1_answered"] = float(np.mean(top[pos & answered] == yt[pos & answered])) if (pos & answered).any() else 0
    res["top3_answered"] = float(np.mean([yt[k] in top3[k] for k in np.where(pos & answered)[0]])) if (pos & answered).any() else 0
    poss = answered & (topp >= t_poss)
    res["possible_share"] = float(poss[pos].mean()); res["top1_possible"] = float(np.mean(top[pos & poss] == yt[pos & poss])) if (pos & poss).any() else 0
    res["neg_declined"] = float(1 - answered[~pos].mean()); res["neg_accept"] = float(answered[~pos].mean())
    dead = {i for i, r in enumerate(spec) if r["use"] == "deadly"}
    res["neg_deadly_top1_accepted"] = float(np.mean([answered[k] and top[k] in dead for k in np.where(~pos)[0]]))
    # a deadly look-alike must not be hidden: a held-out deadly photo should have a deadly class in the top 3
    dpos = [k for k in np.where(pos)[0] if yt[k] in dead]
    res["deadly_photos_with_deadly_top3"] = float(np.mean([any(t in dead for t in top3[k]) for k in dpos])) if dpos else 0
    res["deadly_top1_is_nondeadly_answered"] = float(np.mean([answered[k] and top[k] not in dead for k in dpos])) if dpos else 0
    return res, P, top, answered, yt

# thresholds from the calibration split
Pc = proba(cal); yc = np.array([i["cls"] for i in cal]); posc = yc < N
topc = Pc[:, :N].argmax(1); toppc = Pc[np.arange(len(cal)), topc]; accc = Pc.argmax(1) != N
t_weak = 1.0
for t in np.arange(0.02, 0.99, 0.01):
    neg_accept = float(np.mean((accc & (toppc >= t))[~posc]))
    if neg_accept <= 0.20: t_weak = float(round(t, 2)); break
t_poss = t_weak
for t in np.arange(t_weak, 0.99, 0.01):
    m = accc & (toppc >= t) & posc
    if m.sum() >= 20 and np.mean(topc[m] == yc[m]) >= 0.90: t_poss = float(round(t, 2)); break
else: t_poss = min(0.9, t_weak + 0.2)
print("thresholds from calibration: weak", t_weak, "possible", t_poss)
res, P, top, answered, yt = eval_set(test, t_weak, t_poss)
print(json.dumps(res, indent=1))

# per-group held-out numbers
groups = {}
for r_i, r in enumerate(spec): groups.setdefault(r["group"], []).append(r_i)
per_group = {}
for g, ids in groups.items():
    k = [j for j in range(len(test)) if yt[j] in ids]
    t3 = np.argsort(-P[:, :N], 1)[:, :3]
    per_group[g] = dict(n=len(k), top1=float(np.mean([top[j] == yt[j] for j in k])), top3=float(np.mean([yt[j] in t3[j] for j in k])), answered=float(np.mean([answered[j] for j in k])))
print(json.dumps(per_group))
per_class = {}
t3 = np.argsort(-P[:, :N], 1)[:, :3]
for ci, r in enumerate(spec):
    k = [j for j in range(len(test)) if yt[j] == ci]
    if k: per_class[r["id"]] = dict(n=len(k), top1=round(float(np.mean([top[j] == ci for j in k])), 2), top3=round(float(np.mean([ci in t3[j] for j in k])), 2))
worst = sorted(per_class.items(), key=lambda kv: kv[1]["top1"])[:12]
print("weakest classes", worst)
conf = {}
for j in range(len(test)):
    if yt[j] < N and top[j] != yt[j]: conf[(spec[yt[j]]["id"], spec[top[j]]["id"] if top[j] < N else "other")] = conf.get((spec[yt[j]]["id"], spec[top[j]]["id"] if top[j] < N else "other"), 0) + 1
print("top confusions", sorted(conf.items(), key=lambda kv: -kv[1])[:12])

report = dict(date=datetime.date.today().isoformat(), model="DINOv2-small weight-only int8 ONNX, CLS token, 384-d, mean of photo and mirror", head="multinomial logistic regression C=%s" % C_REG,
              classes=N, photos=len(items), split={k: sum(1 for i in items if i["split"] == k) for k in ("ref", "cal", "test")},
              thresholds=dict(weak=t_weak, possible=t_poss), heldout=res, per_group=per_group, per_class=per_class, weakest=worst,
              top_confusions=[[a, b, n] for (a, b), n in sorted(conf.items(), key=lambda kv: -kv[1])[:20]])
json.dump(report, open(os.path.join(embdir, "report.json"), "w"), indent=1)
if not WRITE: sys.exit(0)

# ---- final head on all photos ----
Xa, ya = stack(items, aug=True)
final = LogisticRegression(C=C_REG, max_iter=600).fit(Xa, ya)
W = np.zeros((N + 1, 384), np.float32); b = np.zeros(N + 1, np.float32)
W[final.classes_] = final.coef_; b[final.classes_] = final.intercept_
scale = np.abs(W).max(1) / 127.0; scale[scale == 0] = 1.0
Wq = np.clip(np.round(W / scale[:, None]), -127, 127).astype(np.int8)
# check quantisation does not change decisions
Wd = Wq.astype(np.float32) * scale[:, None]
Q = np.stack([query(i) for i in test])
l1 = Q @ W.T + b; l2 = Q @ Wd.T + b
print("quantised head keeps top-1 on", float(np.mean(l1.argmax(1) == l2.argmax(1))))
os.makedirs(outdir, exist_ok=True)
index = {
    "version": 2,
    "model": {"name": "DINOv2-small (weights int8, float compute), CLS token", "file": "dinov2_small_w8.onnx", "sourceUrl": "https://huggingface.co/onnx-community/dinov2-small",
              "license": "Apache-2.0", "input": [1, 3, 224, 224], "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225], "dim": 384,
              "preprocess": "centre square crop, 224x224 bilinear, RGB/255 then ImageNet mean/std; query = mean of the photo and its mirror, L2-normalised"},
    "classes": classes,
    "head": {"scale": [round(float(x), 8) for x in scale], "w": base64.b64encode(Wq.tobytes()).decode(), "b": [round(float(x), 5) for x in b]},
    "thresholds": {"weak": t_weak, "possible": t_poss},
    "stats": {"heldout": res, "per_group": per_group}
}
json.dump(index, open(os.path.join(outdir, "index.json"), "w"), separators=(",", ":"))
meta = {}
for r in spec:
    meta[r["id"]] = dict(title=r["title"], latin=r["taxa"][0] if r["group"] in ("plant", "tree", "mushroom") else "", group=r["group"], use=r["use"], look=r["look"], lookalikes=r["lookalikes"], caution=r["caution"])
json.dump(meta, open(os.path.join(outdir, "classes.json"), "w"), indent=0, ensure_ascii=False)
credits = {}
for i in items:
    if i["cls"] < N: credits.setdefault(classes[i["cls"]], []).append([i["obs"], i["user"], i["lic"]])
json.dump({"source": "iNaturalist research-grade observations, photos licensed CC0, CC BY or CC BY-SA. Photos are not shipped; only numeric embeddings are. Entries: observation id (inaturalist.org/observations/ID), observer, license.", "classes": credits}, open(os.path.join(outdir, "credits.json"), "w"), separators=(",", ":"))
print("wrote", outdir)
