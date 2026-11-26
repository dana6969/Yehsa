#!/usr/bin/env python3
"""Build round-4 field entries for every camera-ID label, plus the label -> note map.
Writes data/knowledge/{plants,trees,fungi,animals,sign}_camera.json and symbolic/camera_notes.js."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from camera_defs_plants import PLANTS
from camera_defs_more import TREES, FUNGI, FUNGI_LOOK
from camera_defs_animals import ANIMALS
from camera_defs_sign import SIGN

REPO = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
classes = json.load(open(f"{REPO}/assets/camera_id/classes.json"))
wild = {k: v for k, v in classes.items() if v.get("group") != "everyday"}

# Labels already answered by a round-4 entry or an older approved note.
EXISTING = {
    "wild_carrot": "wild_carrot_lookalike", "poison_hemlock": "poison_hemlock", "water_hemlock": "water_hemlock",
    "poison_ivy": "poison_ivy_id", "poison_sumac": "poison_sumac", "jack_o_lantern": "jack_o_lantern_mushroom",
    "chanterelle": "chanterelle_vs_lookalikes", "death_cap": "amanita_death_cap", "destroying_angel": "amanita_death_cap",
    "morel": "morel_true_vs_false", "false_morel": "morel_true_vs_false", "ostrich_fern": "fiddleheads_ostrich_fern",
    "cattail": "cattail_lookalikes", "dandelion": "dandelion_greens",
    "yarrow": "yarrow_achillea", "plantain": "plantain_plantago", "willow": "willow_bark",
    "wild_onion": "camas_onion_lookalike", "death_camas": "camas_onion_lookalike",
}
POISON = "If someone may have eaten it, call Poison Control at 1-800-222-1222, or 911 for trouble breathing, seizures, or collapse."

def clean_title(t):
    return re.sub(r"\s*\([^)]*\)", "", t).strip()

def looks(meta, extra):
    parts = [p.strip().rstrip(".") for p in re.split(r";\s*|\.\s+", meta.get("look", "")) if p.strip()]
    out = []
    for p in parts + list(extra):
        p = p[0].lower() + p[1:] if p and not p[:2].isupper() else p
        if p and p not in out: out.append(p)
    return out[:5]

def alike_lines(meta):
    out = []
    for other in meta.get("lookalikes", []):
        m = classes.get(other)
        if not m: continue
        line = f"{m['title']}: {m['look'].rstrip('.')}"
        if m.get("caution"): line += f". {m['caution'].rstrip('.')}"
        out.append(line)
    return out

def plant_entry(label, meta, d):
    definition, also, extra = d
    use_kind = meta["use"]
    caution = meta.get("caution", "").strip()
    e = dict(id=label, title=meta["title"], domain="plants", also=also + ([meta["latin"]] if meta.get("latin") and meta["latin"] not in also else []),
             def_=definition, look=looks(meta, extra))
    if use_kind == "edible":
        e["use"] = "Learn it as an identification first. Eat it only after you have matched every feature in person, ideally with someone who knows the plant, from ground that was not sprayed or beside a busy road, and start with a small amount." + (f" {caution}" if caution else "")
        e["not_"] = "Do not eat it on a photo match or a single feature, and do not eat it if you cannot rule out its look-alikes."
    elif use_kind == "medicinal":
        e["use"] = "Older manuals and folk use mention it, but Yehsa does not give doses or treatments with wild plants. Use it as an identification lesson, and use tested first-aid supplies for care." + (f" {caution}" if caution else "")
        e["not_"] = "Do not swallow, brew, or put it on a wound on a photo match; identify it in person first, and ask a clinician before using any plant as medicine."
    elif use_kind == "deadly":
        e["use"] = "Learn it so you can avoid it and warn others. " + (caution or "It is deadly.")
        e["not_"] = "Never eat, brew, chew, or burn any part of it, and wash your hands after touching it. Do not trust a photo or a taste test."
        e["call"] = POISON
    else:  # toxic
        e["use"] = "Learn it so you can avoid it and warn others. " + (caution or "It is poisonous.")
        e["not_"] = "Do not eat, brew, or chew any part of it, and wash skin and tools that touched the sap."
        e["call"] = POISON
    e["src"] = ["usda-nrcs", "usfs", "atp3-50-21"] + (["poison-control"] if use_kind in ("deadly", "toxic") else [])
    return e

def tree_entry(label, meta, d):
    definition, also, extra, use = d
    caution = meta.get("caution", "").strip()
    deadly = meta["use"] == "deadly"
    e = dict(id=label, title=meta["title"], domain="trees", also=also + ([meta["latin"]] if meta.get("latin") and meta["latin"] not in also else []),
             def_=definition, look=looks(meta, extra))
    e["use"] = (use or "Knowing the tree helps you pick firewood, shelter sites, and landmarks.") + (f" {caution}" if caution else "")
    e["not_"] = ("Never eat or brew any part of it; it is deadly, and children are drawn to the red berries." if deadly
                 else "Do not eat or brew any part of a tree you have not identified in person; some trees, like yew and wilted cherry leaves, are deadly.")
    if deadly or "cyanide" in caution: e["call"] = POISON
    e["src"] = ["usfs", "usda-nrcs"] + (["poison-control"] if deadly or "cyanide" in caution else [])
    return e

def fungus_entry(label, meta, d):
    definition, also = d
    caution = meta.get("caution", "").strip()
    e = dict(id=label, title=meta["title"], domain="fungi", also=also + ([meta["latin"]] if meta.get("latin") and meta["latin"] not in also else []),
             def_=definition, look=looks(meta, FUNGI_LOOK.get(label, [])))
    if meta["use"] in ("deadly", "toxic"):
        e["use"] = "Learn it as a warning. " + (caution or "It is poisonous.")
    elif meta["use"] == "medicinal" or label in ("tinder_fungus", "birch_polypore", "chaga"):
        e["use"] = "Use it as an identification lesson. Yehsa does not give doses or remedies with wild fungi." + (f" {caution}" if caution else "")
    else:
        e["use"] = "Use it as an identification and look-alike lesson; only an expert who sees it in person can confirm it." + (f" {caution}" if caution else "")
    e["not_"] = "Never eat a wild mushroom from a photo, an app, or this note. Spore prints, cutting it open, and an expert in person come first, and even then some look-alikes kill."
    e["call"] = POISON
    e["src"] = ["poison-control", "usfs", "nih-medline"]
    return e

def animal_entry(label, meta, d):
    definition, also, extra, use, not_, src = d
    caution = meta.get("caution", "").strip()
    e = dict(id=label, title=meta["title"], domain="animals", also=also, def_=definition, look=looks(meta, extra))
    e["use"] = use
    e["not_"] = not_ + (f" {caution}" if caution and caution.split('.')[0] not in not_ else "")
    if any(w in label for w in ("snake", "rattle", "copper", "cotton", "widow", "hornet", "yellowjacket", "tick")):
        e["call"] = "Call 911 for trouble breathing, swelling of the face or throat, or a venomous bite; see a clinician for fever or rash after a tick bite."
    e["src"] = src
    return e

entries = {"plants": [], "trees": [], "fungi": [], "animals": [], "sign": []}
note_map = {}
missing = []
for label, meta in wild.items():
    if label in EXISTING:
        note_map[label] = EXISTING[label]; continue
    g = meta["group"]
    if g == "plant" and label in PLANTS: entries["plants"].append(plant_entry(label, meta, PLANTS[label]))
    elif g == "tree" and label in TREES: entries["trees"].append(tree_entry(label, meta, TREES[label]))
    elif g == "mushroom" and label in FUNGI: entries["fungi"].append(fungus_entry(label, meta, FUNGI[label]))
    elif g == "animal" and label in ANIMALS: entries["animals"].append(animal_entry(label, meta, ANIMALS[label]))
    elif g in ("track", "scat"): pass
    else: missing.append(label); continue
    note_map[label] = label
for s in SIGN:
    e = dict(s)
    entries["hunting" if e["domain"] == "hunting" else "sign"] = entries.get("hunting" if e["domain"] == "hunting" else "sign", [])
    entries["hunting" if e["domain"] == "hunting" else "sign"].append(e)
    if e["id"] in wild: note_map[e["id"]] = e["id"]
for label in wild:
    if label not in note_map: missing.append(label)
if missing: sys.exit(f"no note for: {sorted(set(missing))}")

# Related links: look-alikes that have entries, else nothing.
ids = {e["id"] for group in entries.values() for e in group}
for group in entries.values():
    for e in group:
        lab = e["id"]
        if lab in wild:
            al = alike_lines(wild[lab])
            if al and "alike" not in e: e["alike"] = al
            rel = [note_map[o] for o in wild[lab].get("lookalikes", []) if o in note_map]
            if rel and "rel" not in e: e["rel"] = list(dict.fromkeys(rel))[:3]
        e.setdefault("ask", f"Tell me about {clean_title(e['title']).lower()}")

def finalize(e):
    out = {}
    for k in ("id", "title", "domain", "also", "def_", "look", "use", "not_", "steps", "alike", "region", "call", "rel", "src", "ask"):
        if k in e and e[k]:
            out[k.rstrip("_")] = e[k]
    return out

for name, group in entries.items():
    if not group: continue
    path = f"{REPO}/data/knowledge/{name}_camera.json"
    json.dump([finalize(e) for e in group], open(path, "w"), indent=0, ensure_ascii=False)
    open(path, "a").write("\n")
    print(name, len(group))

names = {}
for label, note in note_map.items():
    t = wild[label]["title"]
    found = [clean_title(t)] + re.findall(r"\(([^)]*)\)", t)
    lst = names.setdefault(note, [])
    for n in found:
        n = n.strip()
        if n and n not in lst: lst.append(n)
js = ["// Generated from assets/camera_id/classes.json by the round-4 entry builder. One text note per camera label,",
      "// so a label the camera shows can also be asked about in Ask. Everyday (out-of-domain) classes have no note.",
      "// Values are a field-entry id (symbolic/entries_data.js) or an older approved note symbol.",
      "export const CAMERA_NOTES = " + json.dumps(note_map, indent=1) + ";", "",
      "// The names the camera shows for each note, so typing that name in Ask finds the same note.",
      "export const CAMERA_NOTE_NAMES = " + json.dumps(names, indent=1, ensure_ascii=False) + ";", ""]
open(f"{REPO}/symbolic/camera_notes.js", "w").write("\n".join(js))
print("labels", len(note_map), "existing", len(EXISTING))
