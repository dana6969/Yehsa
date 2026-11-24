#!/usr/bin/env python3
"""Add the reviewed field photos (iNaturalist, CC0 / CC BY only) to the picture guide.
  python3 tools/knowledge/add_guide_images.py /workspace/r4-images
Copies WebP files into assets/pictures and public/pictures/files, appends manifest rows (credits and license per
image), adds look-alike rows for plants and mushrooms that reuse the look-alike's own photo (no extra bytes),
links foraging entries to example photos, writes assets/pictures/packs.json (bytes per category, for
Play Asset Delivery packs later) and symbolic/picture_guide_field.js (one guide entry per note with photos).
Running it again replaces the rows it added before."""
import json, os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = sys.argv[1]
PICS = os.path.join(ROOT, "assets/pictures")
WEB = os.path.join(ROOT, "public/pictures/files")
LICENSES = {"CC0", "CC BY 4.0"}
DOMAIN = {"plants": "plants", "mushrooms": "mushrooms", "trees": "trees", "animals": "animals", "tracks-scat": "tracks-scat"}
PLANTISH = {"plant", "mushroom", "tree"}
# Foraging entries that name camera-label species without being their note: show those species' first photo.
EXAMPLES = {
    "toxic_berries_new_england": ["baneberry", "pokeweed", "bittersweet_nightshade", "yew", "virginia_creeper", "moonseed"],
    "berries_edible_new_england": ["blueberry", "brambles", "wild_strawberry"],
    "acorns_leaching": ["white_oak", "red_oak"],
    "wild_nuts_new_england": ["black_walnut", "american_beech", "shagbark_hickory"],
    "poison_contact_eating_smoke": ["giant_hogweed", "wild_parsnip", "stinging_nettle", "poison_ivy"],
    "mushrooms_never_from_photo": ["death_cap", "destroying_angel", "jack_o_lantern", "false_morel"],
    "plant_safe_positive_id": ["poison_hemlock", "wild_carrot", "water_hemlock"],
}

def camera_notes():
    text = open(os.path.join(ROOT, "symbolic/camera_notes.js")).read()
    block = text[text.index("CAMERA_NOTES"):text.index("CAMERA_NOTE_NAMES")]
    return dict(re.findall(r'"([a-z0-9_]+)":\s*"([a-z0-9_]+)"', block))

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def main():
    picks = json.load(open(os.path.join(SRC, "picks.json")))
    classes = json.load(open(os.path.join(ROOT, "assets/camera_id/classes.json")))
    notes = camera_notes()
    manifest = json.load(open(os.path.join(PICS, "manifest.json")))
    for row in [r for r in manifest["images"] if r.get("source") == "iNaturalist"]:
        for d in (PICS, WEB):
            f = os.path.join(d, row["file"])
            if os.path.exists(f) and row["file"].startswith("field-"): os.remove(f)
    base = [r for r in manifest["images"] if r.get("source") != "iNaturalist"]
    rows, first_photo = [], {}
    for label, lst in picks.items():
        meta = classes[label]; note = notes[label]
        for k, p in enumerate(lst):
            assert p["license"] in LICENSES, (label, p["license"])
            assert p["author"] and p["sourceUrl"] and p["attribution"], label
            fname = f"field-{slug(label)}-{k}.webp"
            for d in (PICS, WEB): shutil.copyfile(os.path.join(SRC, p["file"]), os.path.join(d, fname))
            caution = meta.get("caution") or ""
            row = dict(id=f"field-{slug(label)}-{k}", file=fname, symbol=note, domain=DOMAIN[p["category"]],
                role=p["role"] if p["evidence"] == "organism" else p["evidence"], warning=caution if meta.get("use") in ("deadly", "toxic", "caution") else "",
                caption=f"{meta['title']} ({p['taxon']})", label=label, taxon=p["taxon"], category=p["category"],
                sourceUrl=p["sourceUrl"], fileUrl=p["fileUrl"], author=p["author"], license=p["license"], licenseUrl=p["licenseUrl"],
                attribution=p["attribution"], source="iNaturalist", place=p.get("place", ""), observed=p.get("observed", ""),
                retrieved=p["retrieved"], width=p["width"], height=p["height"], bytes=os.path.getsize(os.path.join(PICS, fname)))
            rows.append(row)
            first_photo.setdefault(label, row)
    # Look-alikes: a plant or mushroom note also shows its look-alikes' photos, with a warning.
    extra = []
    for label, meta in classes.items():
        if meta.get("group") not in PLANTISH or label not in first_photo: continue
        for other in (meta.get("lookalikes") or [])[:3]:
            src = first_photo.get(other)
            if not src or notes.get(other) == notes[label]: continue
            om = classes[other]
            warn = f"Look-alike: {om['title']}, not {meta['title']}. " + (om.get("caution") or om.get("look") or "")
            extra.append({**src, "id": f"{src['id']}-as-lookalike-of-{slug(label)}", "symbol": notes[label], "role": "lookalike",
                          "warning": warn.strip(), "lookalikeOf": label, "domain": first_photo[label]["domain"]})
    for entry_id, labels in EXAMPLES.items():
        for other in labels:
            src = first_photo.get(other)
            if not src or notes.get(other) == entry_id: continue
            extra.append({**src, "id": f"{src['id']}-in-{slug(entry_id)}", "symbol": entry_id, "role": "example",
                          "warning": src["warning"], "domain": "foraging"})
    manifest["images"] = base + rows + extra
    for path in (os.path.join(PICS, "manifest.json"), os.path.join(ROOT, "public/pictures/manifest.json")):
        with open(path, "w") as fh: json.dump(manifest, fh, indent=1, ensure_ascii=False); fh.write("\n")
    # Bytes per category, counting each file once.
    packs, seen = {}, set()
    for r in manifest["images"]:
        if r["file"] in seen: continue
        seen.add(r["file"])
        cat = r.get("category") or "core-guide"
        size = os.path.getsize(os.path.join(PICS, r["file"]))
        p = packs.setdefault(cat, {"files": 0, "bytes": 0})
        p["files"] += 1; p["bytes"] += size
    for p in packs.values(): p["mb"] = round(p["bytes"] / 1e6, 2)
    total = sum(p["bytes"] for p in packs.values())
    out = {"note": "Picture bytes per category. Each category can become a Play Asset Delivery pack (install-time or on-demand) if the app is published on Play. Generated by tools/knowledge/add_guide_images.py.",
           "total": {"files": len(seen), "bytes": total, "mb": round(total / 1e6, 2)}, "categories": packs}
    with open(os.path.join(PICS, "packs.json"), "w") as fh: json.dump(out, fh, indent=1); fh.write("\n")
    # One guide entry per note that has photos.
    entries, order = {}, []
    for r in rows:
        s = r["symbol"]
        if s not in entries:
            entries[s] = {"symbol": s, "titles": [], "domain": r["domain"], "plant": r["category"] in ("plants", "trees"), "mushroom": r["category"] == "mushrooms"}
            order.append(s)
        t = classes[r["label"]]["title"]
        if t not in entries[s]["titles"]: entries[s]["titles"].append(t)
    titles = {e["id"]: e["title"] for e in json.load(open(os.path.join(ROOT, "data/knowledge/foraging_1.json")))}
    for entry_id in EXAMPLES:
        if entry_id not in entries and any(r["symbol"] == entry_id for r in extra):
            entries[entry_id] = {"symbol": entry_id, "titles": [titles[entry_id]], "domain": "foraging", "plant": True, "mushroom": "mushroom" in entry_id}
            order.append(entry_id)
    lines = []
    for s in order:
        e = entries[s]
        lines.append("  " + json.dumps({"symbol": s, "title": " / ".join(e["titles"]), "domain": e["domain"], "plant": e["plant"], **({"mushroom": True} if e["mushroom"] else {})}))
    js = ("// Generated by tools/knowledge/add_guide_images.py. Do not edit by hand.\n"
          "// One picture-guide entry per camera-label note that has field photos.\n"
          "export const FIELD_GUIDE_ENTRIES = [\n" + ",\n".join(lines) + "\n];\n")
    open(os.path.join(ROOT, "symbolic/picture_guide_field.js"), "w").write(js)
    added = sum(r["bytes"] for r in rows)
    print(f"field photos: {len(rows)} files, {added / 1e6:.1f} MB; look-alike/example rows: {len(extra)}; guide entries: {len(order)}; all pictures {total / 1e6:.1f} MB")

main()
