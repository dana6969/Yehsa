#!/usr/bin/env python3
"""Refill labels after review: drop the listed files, keep the rest, top up from curated taxon photos
(CC0 / CC BY only) and then recent research-grade observations, never reusing a dropped photo.
  inat_refill.py OUTDIR DROPS.txt"""
import json, os, sys, io, datetime, time, requests
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import inat_images as I

I.TAXA["water_hemlock"] = ("Cicuta maculata", None)

def strict_taxon(name):
    d = I.get("/taxa", q=name, per_page=10, is_active="true")
    for t in d["results"]:
        if t["name"].lower() == name.lower(): return t["id"], t["name"]
    raise SystemExit(f"no exact taxon for {name}")

def save(out, label, k, url, im):
    im.thumbnail((1200, 1200)); fname = f"{I.slug(label)}-{k}.webp"
    im.save(os.path.join(out, fname), "WEBP", quality=75, method=6); return fname

def load(url):
    raw = requests.get(url, headers=I.UA, timeout=60).content
    return Image.open(io.BytesIO(raw)).convert("RGB")

def main(out, drops_path):
    drops = {w for line in open(drops_path) if not line.startswith("#") for w in line.split()}
    picks = json.load(open(os.path.join(out, "picks.json")))
    classes = json.load(open(f"{I.REPO}/assets/camera_id/classes.json"))
    rejected = json.load(open(os.path.join(out, "rejected.json"))) if os.path.exists(os.path.join(out, "rejected.json")) else []
    for label, lst in picks.items():
        bad = [p for p in lst if p["file"][:-5] in drops]
        if not bad: continue
        g = classes[label]["group"]; want = I.COUNT[g]
        rejected += [p["photoId"] for p in bad]
        for p in bad: os.remove(os.path.join(out, p["file"]))
        keep = [p for p in lst if p not in bad]
        name, ev = I.TAXA.get(label, (classes[label].get("latin") or "", None))
        tid, tname = strict_taxon(name)
        if label == "water_hemlock": keep = []
        used = {p["photoId"] for p in keep} | set(rejected)
        used_obs = {p.get("observationId") for p in keep}
        cands = []
        if not ev:
            t = I.get(f"/taxa/{tid}")["results"][0]
            for tp in t.get("taxon_photos", []):
                ph = tp["photo"]
                if ph.get("license_code") in I.OK: cands.append(("taxon", ph, None))
        params = dict(taxon_id=tid, quality_grade="research", photo_license="cc0,cc-by", per_page=40, photos="true")
        if ev: params.update(term_id=22, term_value_id=ev, order_by="votes")
        else: params["without_term_value_id"] = "25,26,27"
        for o in I.get("/observations", **params)["results"]:
            ph = [p for p in o.get("photos", []) if p.get("license_code") in I.OK]
            if ph: cands.append(("obs", ph[0], o))
        # rename kept files to a clean 0..n sequence first
        for i, p in enumerate(keep):
            nf = f"{I.slug(label)}-{i}.webp"
            if p["file"] != nf: os.rename(os.path.join(out, p["file"]), os.path.join(out, nf + ".tmp")); p["file"] = nf + ".tmp"
        for p in keep:
            if p["file"].endswith(".tmp"): os.rename(os.path.join(out, p["file"]), os.path.join(out, p["file"][:-4])); p["file"] = p["file"][:-4]
        for kind, ph, o in cands:
            if len(keep) >= want: break
            if ph["id"] in used or (o and o["id"] in used_obs): continue
            url = ph["url"].replace("/square.", "/large.")
            try: im = load(url)
            except Exception as exc: print("skip", url, exc); continue
            if min(im.size) < 400: continue
            fname = save(out, label, len(keep), url, im)
            lic, licurl = I.OK[ph["license_code"]]
            if o:
                user = o.get("user", {}); author = user.get("name") or user.get("login") or ""
                src = f"https://www.inaturalist.org/observations/{o['id']}"
            else:
                author = (ph.get("attribution") or "").replace("(c) ", "").split(",")[0]
                src = f"https://www.inaturalist.org/photos/{ph['id']}"
            imr = Image.open(os.path.join(out, fname))
            keep.append(dict(label=label, file=fname, role="whole" if not keep else "detail", photoId=ph["id"],
                observationId=o["id"] if o else None, sourceUrl=src, fileUrl=url, author=author, license=lic, licenseUrl=licurl,
                attribution=ph.get("attribution", ""), taxon=tname, taxonId=tid, evidence={25: "scat", 26: "track"}.get(ev, "organism"),
                place=(o or {}).get("place_guess") or "", observed=(o or {}).get("observed_on") or "",
                retrieved=datetime.date.today().isoformat(), width=imr.size[0], height=imr.size[1],
                bytes=os.path.getsize(os.path.join(out, fname)), category=I.CATEGORY[g], refill=True))
            used.add(ph["id"]); used_obs.add(o["id"] if o else None); time.sleep(0.3)
        picks[label] = keep
        print(label, len(bad), "dropped ->", len(keep), flush=True)
        json.dump(picks, open(os.path.join(out, "picks.json"), "w"), indent=1)
        json.dump(rejected, open(os.path.join(out, "rejected.json"), "w"))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
