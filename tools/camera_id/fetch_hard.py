# Hard negatives: things that look like Yehsa's classes but are not in the set (other conifers,
# other umbels, other mushrooms, other tracks and scat...). Used to calibrate "I'm not sure" and
# trained as part of the "other" class. Same licenses as the references.
#   python fetch_hard.py <datadir>
import json, os, sys, glob
sys.path.insert(0, os.path.dirname(__file__))
from fetch_inat import candidates, taxon_id, download
data = sys.argv[1]
class_ids = set()
for m in glob.glob(os.path.join(data, "*", "manifest.json")):
    if "_other" in m or "_hard" in m: continue
    class_ids |= set(json.load(open(m)).get("taxon_ids", []))
GROUPS = {  # label -> (taxon name, extra params, count)
    "pinaceae": ("Pinaceae", {}, 70),
    "cupressaceae": ("Cupressaceae", {}, 30),
    "apiaceae": ("Apiaceae", {}, 60),
    "amaryllidaceae": ("Amaryllidaceae", {}, 25),
    "poaceae": ("Poaceae", {}, 30),
    "fagaceae_leaves": ("Fagaceae", {}, 30),
    "asteraceae": ("Asteraceae", {}, 40),
    "rosaceae": ("Rosaceae", {}, 30),
    "ericaceae": ("Ericaceae", {}, 25),
    "ferns": ("Polypodiopsida", {}, 30),
    "agaricomycetes": ("Agaricomycetes", {}, 80),
    "mammalia_wild": ("Mammalia", {}, 40),
    "reptiles": ("Reptilia", {}, 25),
    "arachnids_ticks": ("Arachnida", {}, 25),
    "hymenoptera": ("Hymenoptera", {}, 25),
    "tracks_other": ("Mammalia", {"term_id": 22, "term_value_id": 26}, 50),
    "scat_other": ("Mammalia", {"term_id": 22, "term_value_id": 25}, 40),
    "birds": ("Aves", {}, 30),
}
odir = os.path.join(data, "_hard"); os.makedirs(odir, exist_ok=True)
items = []
for label, (name, extra, n) in GROUPS.items():
    tid = taxon_id(name)
    if not tid: print("no taxon", name); continue
    got = candidates(dict({"taxon_id": tid, "place_id": 97394}, **extra), int(n * 1.8))
    got = [g for g in got if not (set(g["ancestors"]) | {g.get("taxon_id", 0)}) & class_ids]
    for g in got[:n]:
        g["group"] = label
        fn = f"{g['photo']}.jpg"
        if download(g["url"], os.path.join(odir, fn)):
            g["file"] = fn; items.append(g)
    print(label, len([i for i in items if i["group"] == label]), flush=True)
json.dump({"id": "_hard", "items": items}, open(os.path.join(odir, "manifest.json"), "w"))
print("done", len(items))
