#!/usr/bin/env python3
"""Fetch field photos for every camera-ID label from iNaturalist: research grade, photo license CC0 or CC BY only.
  inat_images.py fetch  OUTDIR      download, resize to WebP (long edge <= 1200, q75), write OUTDIR/picks.json
  inat_images.py sheet  OUTDIR      contact sheets for review
Several observations per label (different angles), plus the label's look-alikes listed on every record."""
import json, os, re, sys, time, io, datetime
import requests
from PIL import Image, ImageDraw

REPO = "/workspace/yehsa-r4-knowledge"
API = "https://api.inaturalist.org/v1"
UA = {"User-Agent": "YehsaFieldGuide/1.0 (offline field guide picture credits; github.com/dana6969/Yehsa)"}
OK = {"cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/"), "cc-by": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/")}

# Taxon names for labels whose classes.json entry has no Latin name. (name, evidence) evidence: 24 organism, 25 scat, 26 track.
TAXA = {
 "white_tailed_deer": ("Odocoileus virginianus", None), "moose": ("Alces alces", None), "elk": ("Cervus canadensis", None),
 "black_bear": ("Ursus americanus", None), "coyote": ("Canis latrans", None), "red_fox": ("Vulpes vulpes", None),
 "bobcat": ("Lynx rufus", None), "porcupine": ("Erethizon dorsatum", None), "raccoon": ("Procyon lotor", None),
 "striped_skunk": ("Mephitis mephitis", None), "beaver": ("Castor canadensis", None), "snowshoe_hare": ("Lepus americanus", None),
 "wild_turkey": ("Meleagris gallopavo", None), "ruffed_grouse": ("Bonasa umbellus", None), "bald_eagle": ("Haliaeetus leucocephalus", None),
 "great_horned_owl": ("Bubo virginianus", None), "canada_goose": ("Branta canadensis", None), "rattlesnake": ("Crotalus horridus", None),
 "copperhead": ("Agkistrodon contortrix", None), "cottonmouth": ("Agkistrodon piscivorus", None),
 "eastern_garter_snake": ("Thamnophis sirtalis", None), "northern_water_snake": ("Nerodia sipedon", None),
 "blacklegged_tick": ("Ixodes scapularis", None), "american_dog_tick": ("Dermacentor variabilis", None),
 "lone_star_tick": ("Amblyomma americanum", None), "black_widow": ("Latrodectus", None),
 "bald_faced_hornet": ("Dolichovespula maculata", None), "yellowjacket": ("Vespula", None), "wild_boar": ("Sus scrofa", None),
 "deer_track": ("Odocoileus virginianus", 26), "bear_track": ("Ursus americanus", 26), "canine_track": ("Canis latrans", 26),
 "raccoon_track": ("Procyon lotor", 26), "moose_track": ("Alces alces", 26), "turkey_track": ("Meleagris gallopavo", 26),
 "bobcat_track": ("Lynx rufus", 26), "rabbit_track": ("Leporidae", 26),
 "deer_scat": ("Odocoileus virginianus", 25), "bear_scat": ("Ursus americanus", 25), "coyote_scat": ("Canis latrans", 25),
 "moose_scat": ("Alces alces", 25), "raccoon_scat": ("Procyon lotor", 25), "rabbit_scat": ("Leporidae", 25),
 "lily_of_valley": ("Convallaria majalis", None), "iris_flag": ("Iris versicolor", None),
}
COUNT = {"plant": 4, "mushroom": 4, "tree": 3, "animal": 2, "track": 3, "scat": 3}
CATEGORY = {"plant": "plants", "mushroom": "mushrooms", "tree": "trees", "animal": "animals", "track": "tracks-scat", "scat": "tracks-scat"}

def get(path, **params):
    for i in range(5):
        r = requests.get(f"{API}{path}", params=params, headers=UA, timeout=40)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(5 + 5 * i); continue
        r.raise_for_status(); time.sleep(1.0); return r.json()
    raise RuntimeError(f"failed {path}")

def taxon_id(name):
    d = get("/taxa", q=name, per_page=5, is_active="true")
    for t in d["results"]:
        if t["name"].lower() == name.lower(): return t["id"], t["name"]
    return (d["results"][0]["id"], d["results"][0]["name"]) if d["results"] else (None, None)

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def fetch(out):
    os.makedirs(out, exist_ok=True)
    classes = json.load(open(f"{REPO}/assets/camera_id/classes.json"))
    picks_path = os.path.join(out, "picks.json")
    picks = json.load(open(picks_path)) if os.path.exists(picks_path) else {}
    for label, meta in classes.items():
        g = meta.get("group")
        if g == "everyday" or label in picks: continue
        name, ev = TAXA.get(label, (meta.get("latin") or "", None))
        if not name: print("no taxon", label); continue
        tid, tname = taxon_id(name)
        if not tid: print("taxon not found", label, name); continue
        params = dict(taxon_id=tid, quality_grade="research", photo_license="cc0,cc-by", per_page=30, order_by="votes", photos="true")
        if ev: params.update(term_id=22, term_value_id=ev)
        elif g in ("animal", "plant", "mushroom", "tree"): params["without_term_value_id"] = "25,26,27"  # no scat/track/bone plates for the organism
        obs = get("/observations", **params)["results"]
        want = COUNT[g]; chosen = []; used_obs = set()
        # first pass: one photo from each observation; second pass: a second angle from the same observations
        for photo_index in (0, 1):
            for o in obs:
                if len(chosen) >= want: break
                if photo_index == 0 and o["id"] in used_obs: continue
                if photo_index == 1 and o["id"] not in used_obs: continue
                photos = [p for p in o.get("photos", []) if p.get("license_code") in OK]
                if len(photos) <= photo_index: continue
                p = photos[photo_index]
                url = p["url"].replace("/square.", "/large.")
                try:
                    raw = requests.get(url, headers=UA, timeout=60).content
                    im = Image.open(io.BytesIO(raw)).convert("RGB")
                except Exception as exc:
                    print("skip", url, exc); continue
                if min(im.size) < 400: continue
                im.thumbnail((1200, 1200))
                k = len(chosen)
                fname = f"{slug(label)}-{k}.webp"
                im.save(os.path.join(out, fname), "WEBP", quality=75, method=6)
                lic, licurl = OK[p["license_code"]]
                user = o.get("user", {})
                author = user.get("name") or user.get("login") or ""
                chosen.append(dict(label=label, file=fname, role="whole" if photo_index == 0 else "detail",
                    photoId=p["id"], observationId=o["id"], sourceUrl=f"https://www.inaturalist.org/observations/{o['id']}",
                    fileUrl=url, author=author, license=lic, licenseUrl=licurl, attribution=p.get("attribution", ""),
                    taxon=tname, taxonId=tid, evidence={25: "scat", 26: "track"}.get(ev, "organism"),
                    place=o.get("place_guess") or "", observed=o.get("observed_on") or "",
                    retrieved=datetime.date.today().isoformat(), width=im.size[0], height=im.size[1],
                    bytes=os.path.getsize(os.path.join(out, fname)), category=CATEGORY[g]))
                used_obs.add(o["id"])
                time.sleep(0.3)
        picks[label] = chosen
        print(label, len(chosen), flush=True)
        json.dump(picks, open(picks_path, "w"), indent=1)

def sheet(out, per=24, cols=6, size=260):
    picks = json.load(open(os.path.join(out, "picks.json")))
    rows = [(lab, p) for lab, lst in picks.items() for p in lst]
    os.makedirs(os.path.join(out, "sheets"), exist_ok=True)
    for s in range(0, len(rows), per):
        chunk = rows[s:s + per]
        im = Image.new("RGB", (cols * size, ((len(chunk) + cols - 1) // cols) * (size + 22)), "white")
        d = ImageDraw.Draw(im)
        for i, (lab, p) in enumerate(chunk):
            t = Image.open(os.path.join(out, p["file"])); t.thumbnail((size, size))
            x, y = (i % cols) * size, (i // cols) * (size + 22)
            im.paste(t, (x, y + 22)); d.text((x + 3, y + 4), p["file"][:40], fill="black")
        im.save(os.path.join(out, "sheets", f"sheet-{s // per:03d}.jpg"), quality=70)

if __name__ == "__main__":
    {"fetch": fetch, "sheet": sheet}[sys.argv[1]](sys.argv[2])
