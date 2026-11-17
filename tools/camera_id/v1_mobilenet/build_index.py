# Build the shipped camera-ID reference index and the eval query file.
#   python tools/camera_id/build_index.py <aug_embeddings.json> <commons_sources.json>
# aug_embeddings.json comes from embed_refs.py (center, flip, zoom views per image).
# Groups: ref = Commons reference photos, guide = Yehsa picture-guide plant photos,
#         neg / gneg = photos of things Yehsa has no camera notes for (eval only, never shipped).
import base64, json, re, sys
import numpy as np

CLASSES = ["yarrow", "plantain", "willow", "wild_carrot", "poison_hemlock", "water_hemlock", "wild_onion", "death_camas"]
GUIDE_CLASS = {"yarrow": "yarrow", "plantain": "plantain", "willow": "willow"}
REF_VIEWS = ["center", "flip", "zoom"]

def q8(vec):
    v = np.asarray(vec, dtype=np.float64)
    v = v / (np.linalg.norm(v) + 1e-12)
    scale = float(np.abs(v).max()) or 1.0
    q = np.clip(np.round(v / scale * 127), -127, 127).astype(np.int8)
    return round(scale / 127, 9), base64.b64encode(q.tobytes()).decode()

def main(emb_path, sources_path):
    emb = json.load(open(emb_path))
    commons = {s["file"]: s for s in json.load(open(sources_path))}
    manifest = {m["file"]: m for m in json.load(open("assets/pictures/manifest.json"))["images"]}
    sources, refs, positives, negatives = [], [], [], []
    for e in emb:
        if e["group"] in ("ref", "guide"):
            if e["group"] == "ref":
                cls = re.sub(r"-\d+\.jpg$", "", e["file"])
                s = commons[e["file"]]
                src = {"title": s["title"], "sourceUrl": s["sourceUrl"], "author": s["author"], "license": s["license"], "licenseUrl": s.get("licenseUrl", "")}
            else:
                cls = GUIDE_CLASS[e["file"].split("-")[0]]
                m = manifest[e["file"]]
                src = {"title": "Yehsa picture guide: " + m["id"], "sourceUrl": m["sourceUrl"], "author": m["author"], "license": m["license"], "licenseUrl": m.get("licenseUrl", "")}
            c = CLASSES.index(cls)
            si = len(sources)
            sources.append(src)
            for view in REF_VIEWS:
                s8, b = q8(e["views"][view])
                refs.append({"c": c, "src": si, "s": s8, "q": b})
            qv = (np.asarray(e["views"]["center"]) + np.asarray(e["views"]["flip"])) / 2
            s8, b = q8(qv)
            positives.append({"c": c, "src": si, "s": s8, "q": b})
        else:
            qv = (np.asarray(e["views"]["center"]) + np.asarray(e["views"]["flip"])) / 2
            s8, b = q8(qv)
            negatives.append({"label": e["file"].rsplit("-", 1)[0] if e["group"] == "neg" else "guide:" + e["file"], "s": s8, "q": b})
    index = {
        "version": 1,
        "model": {
            "name": "MediaPipe Image Embedder, MobileNetV3-Small (float32)",
            "file": "mobilenet_v3_small_embedder.tflite",
            "sourceUrl": "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/latest/mobilenet_v3_small.tflite",
            "license": "Apache-2.0",
            "input": [1, 224, 224, 3],
            "inputRange": [0, 1],
            "dim": 1024,
            "preprocess": "center square crop, 224x224 bilinear, RGB / 255; query = mean of the image and its mirror"
        },
        "classes": CLASSES,
        "refViews": REF_VIEWS,
        "refs": refs,
        "sources": sources
    }
    json.dump(index, open("assets/camera_id/index.json", "w"), separators=(",", ":"))
    json.dump({"note": "Eval-only query embeddings. Not shipped in the app.", "positives": positives, "negatives": negatives},
              open("eval/camera_id/queries.json", "w"), separators=(",", ":"))
    print(len(sources), "sources,", len(refs), "refs,", len(positives), "positives,", len(negatives), "negatives")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
